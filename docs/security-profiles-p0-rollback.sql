-- SECURITY.PROFILES.P0 — rollback
-- Restaura o snapshot confirmado em 12/10/2026:
--   anon e authenticated tinham SELECT, INSERT, UPDATE, DELETE, TRUNCATE e TRIGGER
--   em public.perfis.
--   criar_perfil() e SECURITY DEFINER, owner postgres, e no conflito redefinia
--   ativo, status e vencimento.
--   trigger auth.users.on_user_create AFTER INSERT (nao e recriado: a correcao
--   nao remove o trigger).
--   policy perfis_self_update nao e alterada pela correcao, entao nao entra aqui.
--
-- Isto reabre a escrita do cliente na propria linha e o reset de trial em conflito.
-- Se a leitura (docs/security-profiles-p0-leitura.sql) mostrou outro
-- pg_get_functiondef, use aquele texto no lugar da funcao abaixo.
-- Nao apaga linhas de perfis.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.perfis TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.perfis TO authenticated;

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

REVOKE ALL ON FUNCTION public.criar_perfil() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_perfil() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_perfil() TO anon, authenticated;
DO $auth$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.criar_perfil() TO supabase_auth_admin;
  END IF;
END
$auth$;

NOTIFY pgrst, 'reload schema';
COMMIT;
