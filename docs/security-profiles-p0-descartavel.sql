-- SECURITY.PROFILES.P0 — banco descartável
-- NÃO RODAR no Supabase de produção. Aborta se public.perfis já existe.
-- Reproduz o furo confirmado, aplica docs/security-profiles-p0.sql e o rollback,
-- e confere privilégio real (GRANT + RLS + trigger). O orquestrador psql inclui
-- os outros arquivos entre as partes. Este arquivo é a parte 1 (setup + furo)
-- e a parte 3/5 são os blocos marcados abaixo; o runner chama os três arquivos.

DO $recusa$
BEGIN
  IF to_regclass('public.perfis') IS NOT NULL THEN
    RAISE EXCEPTION 'Recusado: public.perfis ja existe. Use um banco vazio.';
  END IF;
END
$recusa$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.sessao (
  id int PRIMARY KEY,
  uid uuid
);
INSERT INTO auth.sessao (id, uid) VALUES (1, NULL);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT uid FROM auth.sessao WHERE id = 1
$$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$roles$;

CREATE TABLE public.perfis (
  id uuid PRIMARY KEY,
  email text,
  ativo boolean,
  vencimento date,
  status text,
  data_criacao timestamptz,
  nome_empresa text,
  telefone text,
  valor_plano numeric,
  ultimo_pagamento date,
  status_pagamento text,
  sistema_cliente text,
  observacoes text,
  empresa_id uuid,
  nome text,
  created_at timestamptz,
  plano_tier text
);

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY perfis_select ON public.perfis
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY perfis_self_update ON public.perfis
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.criar_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfis (id, email, ativo, status, vencimento)
  VALUES (
    NEW.id,
    NULLIF(lower(btrim(COALESCE(NEW.email, ''))), ''),
    true,
    'teste',
    (CURRENT_DATE + 7)
  )
  ON CONFLICT (id) DO UPDATE
  SET ativo = EXCLUDED.ativo,
      status = EXCLUDED.status,
      vencimento = EXCLUDED.vencimento;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.criar_perfil() OWNER TO postgres;

CREATE TRIGGER on_user_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.criar_perfil();

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.perfis TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.perfis TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.perfis TO service_role;
GRANT INSERT ON TABLE auth.users TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.criar_perfil() TO PUBLIC;

-- Furo 1: o cliente altera o vencimento da propria linha.
INSERT INTO auth.users (id, email) VALUES ('11111111-1111-4111-8111-111111111111', 'cliente@exemplo.test');
UPDATE auth.sessao SET uid = '11111111-1111-4111-8111-111111111111';

DO $furo_update$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.perfis
     SET vencimento = DATE '2099-12-31', status = 'ativo', ativo = true, plano_tier = 'empresa'
   WHERE id = '11111111-1111-4111-8111-111111111111';
END
$furo_update$;

DO $confirma_furo$
DECLARE
  venc date;
BEGIN
  SELECT vencimento INTO venc
  FROM public.perfis
  WHERE id = '11111111-1111-4111-8111-111111111111';
  IF venc IS DISTINCT FROM DATE '2099-12-31' THEN
    RAISE EXCEPTION 'setup invalido: authenticated nao conseguiu regravar vencimento (obteve %)', venc;
  END IF;
END
$confirma_furo$;

-- Furo 2: conflito no cadastro redefine assinatura ja paga.
INSERT INTO public.perfis (id, email, ativo, status, vencimento, plano_tier)
VALUES ('22222222-2222-4222-8222-222222222222', 'pago@exemplo.test', true, 'ativo', DATE '2030-01-01', 'starter');

SET ROLE supabase_auth_admin;
INSERT INTO auth.users (id, email) VALUES ('22222222-2222-4222-8222-222222222222', 'pago@exemplo.test');
RESET ROLE;

DO $confirma_reset$
DECLARE
  st text;
  venc date;
BEGIN
  SELECT status, vencimento INTO st, venc
  FROM public.perfis
  WHERE id = '22222222-2222-4222-8222-222222222222';
  IF st IS DISTINCT FROM 'teste' OR venc IS DISTINCT FROM (CURRENT_DATE + 7) THEN
    RAISE EXCEPTION 'setup invalido: ON CONFLICT nao redefiniu a assinatura (status=%, vencimento=%)', st, venc;
  END IF;
END
$confirma_reset$;
