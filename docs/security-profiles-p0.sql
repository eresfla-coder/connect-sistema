-- SECURITY.PROFILES.P0 — correção de privilégios
-- NÃO EXECUTAR no Supabase de produção sem autorização explícita.
-- Não altera linhas de clientes, assinaturas, pagamentos nem auth.users.
-- Não remove policies. service_role conserva SELECT, INSERT, UPDATE e DELETE.
--
-- Ordem: publicar antes o código que tira a escrita do cliente em perfis
-- (login, /api/painel/acesso, lib/empresa.ts). Este script sozinho faz o
-- UPSERT antigo do cadastro falhar na tela.
--
-- A função nova só insere quando a linha não existe:
--   id, email, ativo=true, status='teste', vencimento=current_date+7
--   plano_tier fica no default (nulo). ON CONFLICT (id) DO NOTHING.
-- status='teste' é o valor armazenado nas contas sem plano nas 30 linhas lidas.
-- O script não executa UPDATE/DELETE em linhas existentes.
-- Se o pg_get_functiondef da leitura preencher outras colunas, não aplique
-- este arquivo até copiar essas colunas para o INSERT. O script aborta se
-- encontrar nome, empresa_id, plano_tier ou colunas comerciais.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $pre$
DECLARE
  src text;
  definicao text;
  args text;
  dono text;
  definer boolean;
  retorno regtype;
  trig text;
BEGIN
  IF to_regclass('public.perfis') IS NULL THEN
    RAISE EXCEPTION 'public.perfis ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'service_role ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    RAISE EXCEPTION 'supabase_auth_admin ausente; o trigger de cadastro perderia EXECUTE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) THEN
    RAISE EXCEPTION 'anon ou authenticated ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'perfis'
      AND pol.polcmd IN ('r', '*')
  ) THEN
    RAISE EXCEPTION 'nao ha policy de SELECT em public.perfis; o painel deixaria de ler a propria linha';
  END IF;

  SELECT p.prosrc, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner),
         p.prosecdef, p.prorettype, pg_get_functiondef(p.oid)
    INTO src, args, dono, definer, retorno, definicao
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'criar_perfil';

  IF src IS NULL THEN
    RAISE EXCEPTION 'public.criar_perfil ausente';
  END IF;
  IF args <> '' THEN
    RAISE EXCEPTION 'assinatura inesperada de criar_perfil(%). Nao substituir.', args;
  END IF;
  IF retorno IS DISTINCT FROM 'trigger'::regtype THEN
    RAISE EXCEPTION 'criar_perfil nao retorna trigger';
  END IF;
  IF dono IS DISTINCT FROM 'postgres' OR definer IS NOT TRUE THEN
    RAISE EXCEPTION 'criar_perfil precisa ser SECURITY DEFINER de postgres (owner=%, definer=%)', dono, definer;
  END IF;
  IF src ~* '\m(nome_empresa|telefone|valor_plano|status_pagamento|ultimo_pagamento|empresa_id|sistema_cliente|observacoes|plano_tier|nome)\M' THEN
    RAISE EXCEPTION 'criar_perfil referencia colunas alem de id, email, ativo, status e vencimento. Guardar a definicao e revisar o INSERT antes de aplicar.';
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO trig
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND n.nspname = 'auth'
    AND c.relname = 'users'
    AND t.tgname = 'on_user_create'
    AND p.proname = 'criar_perfil';

  IF trig IS NULL THEN
    RAISE EXCEPTION 'trigger auth.users.on_user_create -> public.criar_perfil nao encontrado';
  END IF;
  IF trig NOT ILIKE '%AFTER INSERT%' OR trig ILIKE '%UPDATE%' OR trig ILIKE '%DELETE%' OR trig ILIKE '%TRUNCATE%' THEN
    RAISE EXCEPTION 'on_user_create nao e somente AFTER INSERT: %', trig;
  END IF;

  RAISE NOTICE 'DEFINICAO_ATUAL_CRIAR_PERFIL_COPIAR_PARA_O_ROLLBACK %', definicao;
END
$pre$;

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
      ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.perfis FROM PUBLIC, anon, authenticated;

DO $cols$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT a.attname
    FROM pg_attribute a
    WHERE a.attrelid = 'public.perfis'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE SELECT, INSERT, UPDATE, REFERENCES (%I) ON TABLE public.perfis FROM PUBLIC, anon, authenticated',
      col
    );
  END LOOP;
END
$cols$;

GRANT SELECT ON TABLE public.perfis TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.perfis TO service_role;

DO $fn$
DECLARE
  src text;
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'criar_perfil'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO supabase_auth_admin', fn);
  END LOOP;

  IF has_function_privilege('anon', 'public.criar_perfil()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.criar_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ou authenticated ainda executa criar_perfil';
  END IF;
  IF NOT has_function_privilege('supabase_auth_admin', 'public.criar_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'supabase_auth_admin perdeu EXECUTE em criar_perfil';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'criar_perfil';
  IF src ~* 'do update' OR src !~* 'do nothing' THEN
    RAISE EXCEPTION 'criar_perfil ainda regrava linha existente';
  END IF;
END
$fn$;

DO $check$
DECLARE
  col text;
BEGIN
  IF has_table_privilege('anon', 'public.perfis', 'SELECT')
     OR has_table_privilege('anon', 'public.perfis', 'INSERT')
     OR has_table_privilege('anon', 'public.perfis', 'UPDATE')
     OR has_table_privilege('anon', 'public.perfis', 'DELETE')
     OR has_table_privilege('anon', 'public.perfis', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.perfis', 'TRIGGER') THEN
    RAISE EXCEPTION 'anon ainda tem privilegio em public.perfis';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.perfis', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated perdeu SELECT';
  END IF;

  IF has_table_privilege('authenticated', 'public.perfis', 'INSERT')
     OR has_table_privilege('authenticated', 'public.perfis', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.perfis', 'DELETE')
     OR has_table_privilege('authenticated', 'public.perfis', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.perfis', 'TRIGGER') THEN
    RAISE EXCEPTION 'authenticated ainda escreve em public.perfis (tabela, coluna ou heranca)';
  END IF;

  FOREACH col IN ARRAY ARRAY[
    'id', 'empresa_id', 'email', 'ativo', 'status', 'vencimento', 'plano_tier',
    'valor_plano', 'status_pagamento', 'ultimo_pagamento', 'data_criacao', 'created_at',
    'nome', 'nome_empresa', 'telefone', 'sistema_cliente', 'observacoes'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.perfis'::regclass AND attname = col AND NOT attisdropped
    ) AND (
      has_column_privilege('authenticated', 'public.perfis', col, 'UPDATE')
      OR has_column_privilege('authenticated', 'public.perfis', col, 'INSERT')
    ) THEN
      RAISE EXCEPTION 'authenticated ainda escreve na coluna %', col;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.perfis', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.perfis', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.perfis', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.perfis', 'DELETE') THEN
    RAISE EXCEPTION 'service_role perdeu DML em public.perfis';
  END IF;
END
$check$;

NOTIFY pgrst, 'reload schema';
COMMIT;
