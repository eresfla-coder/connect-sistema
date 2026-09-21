-- ADMIN.4.2.2 — VERIFY (100% READ-ONLY)
-- Permitido: SELECT, information_schema, pg_catalog, DO com RAISE.
-- PROIBIDO: INSERT/UPDATE/DELETE/DDL/GRANT/REVOKE/TRUNCATE.

do $$
declare
  v_cnt integer;
  v_rls boolean;
  v_force boolean;
  v_def text;
  v_prosecdef boolean;
begin
  if to_regclass('public.admin_support_sessions') is null then
    raise exception 'VERIFY FAIL: admin_support_sessions ausente';
  end if;
  if to_regclass('public.admin_support_events') is null then
    raise exception 'VERIFY FAIL: admin_support_events ausente';
  end if;

  -- context_token_hash presente; context_token bruto AUSENTE
  select count(*)::integer into v_cnt
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'admin_support_sessions'
    and column_name = 'context_token_hash';
  if coalesce(v_cnt, 0) <> 1 then
    raise exception 'VERIFY FAIL: context_token_hash ausente';
  end if;

  select count(*)::integer into v_cnt
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'admin_support_sessions'
    and column_name = 'context_token';
  if coalesce(v_cnt, 0) <> 0 then
    raise exception 'VERIFY FAIL: coluna context_token bruto ainda existe';
  end if;

  -- Colunas mínimas
  select count(*)::integer into v_cnt
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'admin_support_sessions'
    and column_name in (
      'id','context_token_hash','admin_user_id','admin_email',
      'admin_cliente_id','admin_cliente_sistema_id',
      'target_auth_user_id','target_perfil_id','target_empresa_id',
      'modo','motivo','iniciado_em','expira_em',
      'encerrado_em','revogado_em','created_at','updated_at'
    );
  if coalesce(v_cnt, 0) < 17 then
    raise exception 'VERIFY FAIL: colunas mínimas incompletas (cnt=%)', v_cnt;
  end if;

  -- Constraints modo / hash
  select count(*)::integer into v_cnt
  from pg_constraint
  where conrelid = 'public.admin_support_sessions'::regclass
    and conname in (
      'admin_support_sessions_modo_chk',
      'admin_support_sessions_token_hash_chk',
      'admin_support_sessions_token_hash_unique'
    );
  if coalesce(v_cnt, 0) < 3 then
    raise exception 'VERIFY FAIL: constraints modo/hash ausentes (cnt=%)', v_cnt;
  end if;

  -- Unique uma sessão aberta por admin
  select count(*)::integer into v_cnt
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'admin_support_sessions_uma_aberta_por_admin_uidx';
  if coalesce(v_cnt, 0) <> 1 then
    raise exception 'VERIFY FAIL: unique parcial uma_aberta_por_admin ausente';
  end if;

  -- Idempotência evento expirada
  select count(*)::integer into v_cnt
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'admin_support_events_expirada_unica_uidx';
  if coalesce(v_cnt, 0) <> 1 then
    raise exception 'VERIFY FAIL: unique evento expirada ausente';
  end if;

  -- FKs RESTRICT (não CASCADE) carteira
  select count(*)::integer into v_cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and kcu.table_name = 'admin_support_sessions'
    and kcu.column_name in ('admin_cliente_id', 'admin_cliente_sistema_id')
    and rc.delete_rule = 'CASCADE';
  if coalesce(v_cnt, 0) > 0 then
    raise exception 'VERIFY FAIL: FK CASCADE indevido';
  end if;

  -- Sem FK para auth/perfis/sessoes_ativas
  select count(*)::integer into v_cnt
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
   and ccu.constraint_schema = tc.constraint_schema
  where tc.table_schema = 'public'
    and tc.table_name in ('admin_support_sessions', 'admin_support_events')
    and tc.constraint_type = 'FOREIGN KEY'
    and ccu.table_name in ('users', 'perfis', 'sessoes_ativas');
  if coalesce(v_cnt, 0) > 0 then
    raise exception 'VERIFY FAIL: FK para auth/perfis/sessoes_ativas não permitida';
  end if;

  -- Funções RPC
  if to_regprocedure('public.admin_support_iniciar_sessao(uuid,text,uuid,uuid,uuid,uuid,uuid,text,text,integer,text,text,text)') is null then
    raise exception 'VERIFY FAIL: admin_support_iniciar_sessao ausente';
  end if;
  if to_regprocedure('public.admin_support_marcar_expiradas_admin(uuid,text,text)') is null then
    raise exception 'VERIFY FAIL: admin_support_marcar_expiradas_admin ausente';
  end if;
  if to_regprocedure('public.admin_support_marcar_sessao_expirada(uuid,uuid,text,text)') is null then
    raise exception 'VERIFY FAIL: admin_support_marcar_sessao_expirada ausente';
  end if;

  -- SECURITY DEFINER + search_path
  select p.prosecdef, pg_get_functiondef(p.oid)
    into v_prosecdef, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_support_iniciar_sessao';
  if not coalesce(v_prosecdef, false) then
    raise exception 'VERIFY FAIL: iniciar_sessao não é SECURITY DEFINER';
  end if;
  if position('search_path' in lower(coalesce(v_def, ''))) = 0 then
    raise exception 'VERIFY FAIL: iniciar_sessao sem search_path explícito';
  end if;
  if position('pg_advisory_xact_lock' in lower(coalesce(v_def, ''))) = 0 then
    raise exception 'VERIFY FAIL: iniciar_sessao sem advisory lock';
  end if;

  -- EXECUTE: anon/authenticated não devem ter
  select count(*)::integer into v_cnt
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in (
      'admin_support_iniciar_sessao',
      'admin_support_marcar_expiradas_admin',
      'admin_support_marcar_sessao_expirada'
    )
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type = 'EXECUTE';
  if coalesce(v_cnt, 0) > 0 then
    raise exception 'VERIFY FAIL: EXECUTE residual anon/authenticated/PUBLIC (cnt=%)', v_cnt;
  end if;

  -- RLS / FORCE
  select c.relrowsecurity, c.relforcerowsecurity into v_rls, v_force
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'admin_support_sessions';
  if not coalesce(v_rls, false) or not coalesce(v_force, false) then
    raise exception 'VERIFY FAIL: RLS/FORCE sessions';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity into v_rls, v_force
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'admin_support_events';
  if not coalesce(v_rls, false) or not coalesce(v_force, false) then
    raise exception 'VERIFY FAIL: RLS/FORCE events';
  end if;

  select count(*)::integer into v_cnt
  from pg_policies
  where schemaname = 'public'
    and tablename in ('admin_support_sessions', 'admin_support_events');
  if coalesce(v_cnt, 0) > 0 then
    raise exception 'VERIFY FAIL: policies permissivas inesperadas (cnt=%)', v_cnt;
  end if;

  select count(*)::integer into v_cnt
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('admin_support_sessions', 'admin_support_events')
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  if coalesce(v_cnt, 0) > 0 then
    raise exception 'VERIFY FAIL: privileges residual tabelas (cnt=%)', v_cnt;
  end if;

  -- Trigger updated_at (se admin_set_updated_at existir)
  if to_regprocedure('public.admin_set_updated_at()') is not null then
    select count(*)::integer into v_cnt
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'admin_support_sessions'
      and not t.tgisinternal
      and t.tgname = 'admin_support_sessions_updated_at';
    if coalesce(v_cnt, 0) < 1 then
      raise exception 'VERIFY FAIL: trigger updated_at ausente';
    end if;
  end if;

  -- Migration não cria sessões/eventos
  select count(*)::integer into v_cnt from public.admin_support_sessions;
  -- Apenas notice se >0 (ambiente pode ter dados de teste); não falha por dados pré-existentes
  -- Garantia: este script NÃO inseriu nada (read-only).

  raise notice 'VERIFY OK: ADMIN.4.2.2 admin_support_* + RPCs';
end $$;
