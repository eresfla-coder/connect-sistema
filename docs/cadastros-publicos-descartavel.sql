-- Homologação descartável da Alternativa A.
-- Recusa qualquer banco cujo nome não seja cadastros_descartavel.
-- Não contém dados de clientes e não deve ser aplicado em produção.

\set ON_ERROR_STOP on

DO $recusa$
BEGIN
  IF current_database() IS DISTINCT FROM 'cadastros_descartavel' THEN
    RAISE EXCEPTION 'Recusado: banco % nao e o descartavel.', current_database();
  END IF;
END
$recusa$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb
);

CREATE TABLE public.perfis (
  id uuid PRIMARY KEY,
  email text,
  ativo boolean,
  vencimento date,
  status text
);

CREATE OR REPLACE FUNCTION public.criar_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfis (id, email, ativo, status, vencimento)
  VALUES (NEW.id, NEW.email, true, 'teste', CURRENT_DATE + 7)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.criar_perfil() OWNER TO postgres;

CREATE TRIGGER on_user_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.criar_perfil();

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

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role, supabase_auth_admin;
GRANT INSERT ON TABLE auth.users TO supabase_auth_admin;

CREATE TABLE public._preservacao (
  nome text PRIMARY KEY,
  definicao text NOT NULL
);

INSERT INTO public._preservacao (nome, definicao)
VALUES
  ('criar_perfil', pg_get_functiondef('public.criar_perfil()'::regprocedure)),
  (
    'on_user_create',
    (
      SELECT pg_get_triggerdef(t.oid, true)
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_user_create' AND NOT t.tgisinternal
    )
  );

\ir cadastros-publicos.sql

CREATE OR REPLACE FUNCTION public._exigir(condicao boolean, mensagem text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT condicao THEN
    RAISE EXCEPTION '%', mensagem;
  END IF;
END;
$$;

SELECT public._exigir(
  pg_get_functiondef('public.criar_perfil()'::regprocedure)
    IS NOT DISTINCT FROM (SELECT definicao FROM public._preservacao WHERE nome = 'criar_perfil'),
  'criar_perfil mudou apos a migracao'
);

SELECT public._exigir(
  (
    SELECT pg_get_triggerdef(t.oid, true)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_user_create' AND NOT t.tgisinternal
  ) IS NOT DISTINCT FROM (SELECT definicao FROM public._preservacao WHERE nome = 'on_user_create'),
  'on_user_create mudou apos a migracao'
);

SELECT public._exigir(
  (
    SELECT count(*)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
      AND t.tgname IN ('on_user_create', 'registrar_cadastro_publico', 'retirar_cadastro_publico_admin')
  ) = 3,
  'faltou trigger esperado em auth.users'
);

SELECT public._exigir(
  (
    SELECT count(*) = 2 AND bool_and(
      p.prosecdef
      AND array_length(p.proconfig, 1) = 1
      AND p.proconfig[1] IN ('search_path=', 'search_path=""')
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('registrar_cadastro_publico', 'retirar_cadastro_publico_admin')
  ) IS TRUE,
  'funcao sem SECURITY DEFINER ou search_path vazio'
);

SELECT public._exigir(
  (
    SELECT count(*) = 2 AND bool_and(
      position('select' in lower(p.prosrc)) = 0
      AND position('perform' in lower(p.prosrc)) = 0
      AND position('dblink' in lower(p.prosrc)) = 0
      AND position('pg_net' in lower(p.prosrc)) = 0
      AND position('http' in lower(p.prosrc)) = 0
      AND position('perfis' in lower(p.prosrc)) = 0
      AND position('pagamentos' in lower(p.prosrc)) = 0
      AND position('lock ' in lower(p.prosrc)) = 0
      AND position('for update' in lower(p.prosrc)) = 0
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('registrar_cadastro_publico', 'retirar_cadastro_publico_admin')
  ) IS TRUE,
  'funcao de registro contem consulta, bloqueio ou dependencia externa'
);

SELECT public._exigir(NOT has_table_privilege('anon', 'public.cadastros_publicos', 'SELECT'), 'anon pode ler');
SELECT public._exigir(NOT has_table_privilege('authenticated', 'public.cadastros_publicos', 'SELECT'), 'authenticated pode ler');
SELECT public._exigir(NOT has_table_privilege('public', 'public.cadastros_publicos', 'SELECT'), 'PUBLIC pode ler');
SELECT public._exigir(has_table_privilege('service_role', 'public.cadastros_publicos', 'SELECT'), 'service_role nao pode ler');
SELECT public._exigir(NOT has_table_privilege('service_role', 'public.cadastros_publicos', 'INSERT'), 'service_role pode inserir');
SELECT public._exigir(NOT has_table_privilege('service_role', 'public.cadastros_publicos', 'UPDATE'), 'service_role pode alterar');
SELECT public._exigir(NOT has_table_privilege('service_role', 'public.cadastros_publicos', 'DELETE'), 'service_role pode apagar');
SELECT public._exigir(NOT has_function_privilege('anon', 'public.registrar_cadastro_publico()', 'EXECUTE'), 'anon executa o registro');
SELECT public._exigir(NOT has_function_privilege('authenticated', 'public.registrar_cadastro_publico()', 'EXECUTE'), 'authenticated executa o registro');
SELECT public._exigir(NOT has_function_privilege('service_role', 'public.registrar_cadastro_publico()', 'EXECUTE'), 'service_role executa o registro');
SELECT public._exigir(NOT has_function_privilege('public', 'public.registrar_cadastro_publico()', 'EXECUTE'), 'PUBLIC executa o registro');
SELECT public._exigir(has_function_privilege('supabase_auth_admin', 'public.registrar_cadastro_publico()', 'EXECUTE'), 'auth admin nao executa o registro');
SELECT public._exigir(has_function_privilege('supabase_auth_admin', 'public.retirar_cadastro_publico_admin()', 'EXECUTE'), 'auth admin nao executa a retirada');
SELECT public._exigir(
  (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid = 'public.cadastros_publicos'::regclass),
  'RLS ausente ou forcado sobre o dono'
);

-- 1. Cadastro público normal.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'publico@exemplo.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
);

SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000001') = 1,
  'cadastro publico nao foi registrado'
);
SELECT public._exigir(
  (SELECT count(*) FROM public.perfis WHERE id = '10000000-0000-4000-8000-000000000001' AND status = 'teste') = 1,
  'criar_perfil nao acompanhou o cadastro publico'
);

-- 2. Administrativo: INSERT e UPDATE na mesma transação.
BEGIN;
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000002',
  'admin-ok@exemplo.test',
  '{"provider":"email","providers":["email"]}'::jsonb
);
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000002') = 1,
  'classificacao provisoria nao nasceu no INSERT'
);
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"origem_conta":"admin"}'::jsonb
WHERE id = '10000000-0000-4000-8000-000000000002';
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000002') = 0,
  'UPDATE administrativo da mesma transacao nao retirou a classificacao'
);
COMMIT;
SELECT public._exigir(
  (SELECT count(*) FROM auth.users WHERE id = '10000000-0000-4000-8000-000000000002') = 1
  AND (SELECT count(*) FROM public.perfis WHERE id = '10000000-0000-4000-8000-000000000002') = 1
  AND (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000002') = 0,
  'commit administrativo alterou perfil ou manteve cadastro publico'
);

-- 3. UPDATE administrativo falha e a transação inteira desaparece.
\set ON_ERROR_STOP off
BEGIN;
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000003',
  'admin-falha@exemplo.test',
  '{"provider":"email","providers":["email"]}'::jsonb
);
DO $dentro$
BEGIN
  IF (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000003') <> 1 THEN
    RAISE EXCEPTION 'classificacao provisoria ausente antes da falha';
  END IF;
  IF (SELECT count(*) FROM public.perfis WHERE id = '10000000-0000-4000-8000-000000000003') <> 1 THEN
    RAISE EXCEPTION 'perfil ausente antes da falha';
  END IF;
  RAISE NOTICE 'PROVISORIO_OK';
END
$dentro$;
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('origem_conta', (1/0)::text)
WHERE id = '10000000-0000-4000-8000-000000000003';
ROLLBACK;
\set ON_ERROR_STOP on

SELECT public._exigir(
  (SELECT count(*) FROM auth.users WHERE id = '10000000-0000-4000-8000-000000000003') = 0
  AND (SELECT count(*) FROM public.perfis WHERE id = '10000000-0000-4000-8000-000000000003') = 0
  AND (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000003') = 0,
  'rollback da falha administrativa deixou resquicio'
);

-- 4. user_metadata forjado não evita o registro.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000004',
  'forjado@exemplo.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"origem_conta":"admin"}'::jsonb
);
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000004') = 1,
  'user_metadata forjado impediu o cadastro publico'
);

-- 5. Outra transação não apaga um cadastro público já confirmado.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"origem_conta":"admin"}'::jsonb
WHERE id = '10000000-0000-4000-8000-000000000001';
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000001') = 1,
  'metadata posterior apagou cadastro publico'
);
UPDATE auth.users
SET email = 'publico-renomeado@exemplo.test'
WHERE id = '10000000-0000-4000-8000-000000000001';
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000001') = 1,
  'alteracao de email apagou cadastro publico'
);

-- 6. Duplicidade não cria segunda classificação nem derruba a conta existente.
DO $dup$
BEGIN
  BEGIN
    INSERT INTO auth.users (id, email)
    VALUES ('10000000-0000-4000-8000-000000000001', 'duplicado@exemplo.test');
    RAISE EXCEPTION 'insert duplicado foi aceito';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END
$dup$;
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000001') = 1,
  'duplicidade alterou a classificacao'
);

-- 7. Privilégios efetivos.
DO $anon$
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM 1 FROM public.cadastros_publicos LIMIT 1;
    RAISE EXCEPTION 'anon leu cadastros_publicos';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$anon$;

DO $authn$
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM 1 FROM public.cadastros_publicos LIMIT 1;
    RAISE EXCEPTION 'authenticated leu cadastros_publicos';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$authn$;

DO $svc_insert$
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    INSERT INTO public.cadastros_publicos (user_id, txid_origem)
    VALUES ('10000000-0000-4000-8000-000000000001', 1);
    RAISE EXCEPTION 'service_role inseriu cadastro';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$svc_insert$;

SET ROLE service_role;
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos) = 2,
  'service_role nao conseguiu ler as duas linhas publicas'
);
RESET ROLE;

SET ROLE supabase_auth_admin;
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000005',
  'via-auth-admin@exemplo.test',
  '{"provider":"email","providers":["email"]}'::jsonb
);
RESET ROLE;
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000005') = 1
  AND (SELECT count(*) FROM public.perfis WHERE id = '10000000-0000-4000-8000-000000000005') = 1,
  'supabase_auth_admin nao disparou os dois gatilhos de insert'
);

-- 8. Rollback e reaplicação preservam criar_perfil.
\ir cadastros-publicos-rollback.sql

SELECT public._exigir(to_regclass('public.cadastros_publicos') IS NULL, 'rollback deixou a tabela');
SELECT public._exigir(
  (
    SELECT count(*)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal AND t.tgname <> 'on_user_create'
  ) = 0,
  'rollback deixou trigger novo'
);
SELECT public._exigir(
  pg_get_functiondef('public.criar_perfil()'::regprocedure)
    IS NOT DISTINCT FROM (SELECT definicao FROM public._preservacao WHERE nome = 'criar_perfil')
  AND (
    SELECT pg_get_triggerdef(t.oid, true)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_user_create' AND NOT t.tgisinternal
  ) IS NOT DISTINCT FROM (SELECT definicao FROM public._preservacao WHERE nome = 'on_user_create'),
  'rollback alterou criar_perfil ou on_user_create'
);
SELECT public._exigir(
  (SELECT count(*) FROM public.perfis WHERE id = '10000000-0000-4000-8000-000000000001') = 1,
  'rollback apagou perfil existente'
);

\ir cadastros-publicos.sql

INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-4000-8000-000000000006', 'reaplicado@exemplo.test');
SELECT public._exigir(
  (SELECT count(*) FROM public.cadastros_publicos WHERE user_id = '10000000-0000-4000-8000-000000000006') = 1
  AND (SELECT count(*) FROM public.perfis WHERE id = '10000000-0000-4000-8000-000000000006') = 1,
  'reaplicacao nao registrou novo cadastro'
);

SELECT public._exigir(
  pg_get_functiondef('public.criar_perfil()'::regprocedure)
    IS NOT DISTINCT FROM (SELECT definicao FROM public._preservacao WHERE nome = 'criar_perfil'),
  'reaplicacao mudou criar_perfil'
);

DO $fim$
BEGIN
  RAISE NOTICE 'HOMOLOGACAO_OK';
END
$fim$;
