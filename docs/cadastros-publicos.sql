-- CADASTROS PÚBLICOS — migração aditiva
-- Não altera public.perfis, public.criar_perfil, auth.users.on_user_create,
-- pagamentos, assinaturas, admin_* nem docs/security-profiles-p0.sql.
-- Não faz backfill. Contas já existentes não entram.
--
-- O Auth administrativo grava app_metadata depois do INSERT, na mesma transação.
-- O INSERT registra a classificação provisória. O UPDATE só a remove se
-- origem_conta = 'admin' e a linha nasceu nesta mesma transação (txid_current()).

CREATE TABLE IF NOT EXISTS public.cadastros_publicos (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  txid_origem bigint NOT NULL
);

COMMENT ON TABLE public.cadastros_publicos IS
  'Cadastros nascidos fora do createUser administrativo. Sem backfill.';

ALTER TABLE public.cadastros_publicos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cadastros_publicos FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.cadastros_publicos FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.cadastros_publicos FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.cadastros_publicos FROM service_role';
    EXECUTE 'GRANT SELECT ON TABLE public.cadastros_publicos TO service_role';
  END IF;
END
$grants$;

CREATE OR REPLACE FUNCTION public.registrar_cadastro_publico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF coalesce(NEW.raw_app_meta_data ->> 'origem_conta', '') IS DISTINCT FROM 'admin' THEN
    INSERT INTO public.cadastros_publicos (user_id, txid_origem)
    VALUES (NEW.id, pg_catalog.txid_current())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.retirar_cadastro_publico_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF coalesce(NEW.raw_app_meta_data ->> 'origem_conta', '') = 'admin' THEN
    DELETE FROM public.cadastros_publicos
    WHERE user_id = NEW.id
      AND txid_origem = pg_catalog.txid_current();
  END IF;
  RETURN NEW;
END
$fn$;

ALTER FUNCTION public.registrar_cadastro_publico() OWNER TO postgres;
ALTER FUNCTION public.retirar_cadastro_publico_admin() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registrar_cadastro_publico() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retirar_cadastro_publico_admin() FROM PUBLIC;

DO $exec$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.registrar_cadastro_publico() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.retirar_cadastro_publico_admin() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.registrar_cadastro_publico() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.retirar_cadastro_publico_admin() FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.registrar_cadastro_publico() FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.retirar_cadastro_publico_admin() FROM service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.registrar_cadastro_publico() TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.retirar_cadastro_publico_admin() TO supabase_auth_admin';
  END IF;
END
$exec$;

DROP TRIGGER IF EXISTS registrar_cadastro_publico ON auth.users;
CREATE TRIGGER registrar_cadastro_publico
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_cadastro_publico();

DROP TRIGGER IF EXISTS retirar_cadastro_publico_admin ON auth.users;
CREATE TRIGGER retirar_cadastro_publico_admin
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.retirar_cadastro_publico_admin();
