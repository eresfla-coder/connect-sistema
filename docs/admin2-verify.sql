-- ADMIN.2.1 — VERIFY (100% READ-ONLY)
-- Permitido: SELECT, information_schema, pg_catalog, DO com RAISE.
-- PROIBIDO: INSERT/UPDATE/DELETE/DDL/GRANT/REVOKE.

do $$
declare
  v_cnt integer;
  v_def text;
begin
  -- Tabelas
  if to_regclass('public.admin_clientes') is null then
    raise exception 'VERIFY FAIL: admin_clientes ausente';
  end if;
  if to_regclass('public.admin_sistemas') is null then
    raise exception 'VERIFY FAIL: admin_sistemas ausente';
  end if;
  if to_regclass('public.admin_cliente_sistemas') is null then
    raise exception 'VERIFY FAIL: admin_cliente_sistemas ausente';
  end if;

  -- Função dedicada (não connect_updated_at)
  if to_regprocedure('public.admin_set_updated_at()') is null then
    raise exception 'VERIFY FAIL: admin_set_updated_at() ausente';
  end if;
  if to_regprocedure('public.admin_cs_validar_acesso_connect()') is null then
    raise exception 'VERIFY FAIL: admin_cs_validar_acesso_connect() ausente';
  end if;
  if to_regprocedure('public.admin_sistemas_bloquear_origem_connect_terceiro()') is null then
    raise exception 'VERIFY FAIL: admin_sistemas_bloquear_origem_connect_terceiro() ausente';
  end if;

  -- Triggers updated_at usam admin_set_updated_at
  select count(*)::integer into v_cnt
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('admin_clientes', 'admin_sistemas', 'admin_cliente_sistemas')
    and not t.tgisinternal
    and t.tgname like '%updated_at%'
    and p.proname = 'admin_set_updated_at';
  if coalesce(v_cnt, 0) < 3 then
    raise exception 'VERIFY FAIL: triggers updated_at admin_* não usam admin_set_updated_at (cnt=%)', v_cnt;
  end if;

  -- Nenhuma trigger admin_* deve apontar para connect_updated_at
  select count(*)::integer into v_cnt
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('admin_clientes', 'admin_sistemas', 'admin_cliente_sistemas')
    and not t.tgisinternal
    and p.proname = 'connect_updated_at';
  if coalesce(v_cnt, 0) > 0 then
    raise exception 'VERIFY FAIL: trigger admin_* ainda referencia connect_updated_at';
  end if;

  -- Check acesso completo
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'admin_cliente_sistemas'
      and constraint_name = 'admin_cs_acesso_ids_chk'
  ) then
    raise exception 'VERIFY FAIL: admin_cs_acesso_ids_chk ausente';
  end if;

  -- UNIQUE cliente+sistema
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'admin_cliente_sistemas'
      and constraint_name = 'admin_cs_cliente_sistema_unique'
      and constraint_type = 'UNIQUE'
  ) then
    raise exception 'VERIFY FAIL: UNIQUE cliente+sistema ausente';
  end if;

  -- UNIQUE email (índice parcial)
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'admin_clientes'
      and indexname = 'admin_clientes_email_unique_idx'
  ) then
    raise exception 'VERIFY FAIL: admin_clientes_email_unique_idx ausente';
  end if;

  -- origem check
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'admin_sistemas'
      and constraint_name = 'admin_sistemas_origem_chk'
  ) then
    raise exception 'VERIFY FAIL: admin_sistemas_origem_chk ausente';
  end if;

  -- status check
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'admin_cliente_sistemas'
      and constraint_name = 'admin_cs_status_chk'
  ) then
    raise exception 'VERIFY FAIL: admin_cs_status_chk ausente';
  end if;

  -- FKs
  if not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.table_schema = 'public'
      and tc.table_name = 'admin_cliente_sistemas'
      and tc.constraint_type = 'FOREIGN KEY'
      and tc.constraint_name like '%cliente_id%'
  ) and not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'admin_cliente_sistemas'
      and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%admin_clientes%'
  ) then
    raise exception 'VERIFY FAIL: FK cliente_id → admin_clientes ausente';
  end if;

  -- FK auth.users e perfis via pg_constraint
  select count(*)::integer into v_cnt
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'admin_cliente_sistemas'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%auth.users%';
  if coalesce(v_cnt, 0) < 1 then
    raise exception 'VERIFY FAIL: FK auth_user_id → auth.users ausente';
  end if;

  select count(*)::integer into v_cnt
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'admin_cliente_sistemas'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%perfis%';
  if coalesce(v_cnt, 0) < 1 then
    raise exception 'VERIFY FAIL: FK perfil_id → public.perfis ausente';
  end if;

  -- ON DELETE SET NULL nas FKs Auth/perfis
  select count(*)::integer into v_cnt
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'admin_cliente_sistemas'
    and con.contype = 'f'
    and con.confdeltype = 'n' -- SET NULL
    and (
      pg_get_constraintdef(con.oid) ilike '%auth.users%'
      or pg_get_constraintdef(con.oid) ilike '%perfis%'
    );
  if coalesce(v_cnt, 0) < 2 then
    raise exception 'VERIFY FAIL: ON DELETE SET NULL esperado em FKs auth/perfis (cnt=%)', v_cnt;
  end if;

  -- Triggers de validação presentes
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'admin_cliente_sistemas'
      and t.tgname = 'admin_cs_validar_acesso_connect'
      and not t.tgisinternal
  ) then
    raise exception 'VERIFY FAIL: trigger admin_cs_validar_acesso_connect ausente';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'admin_sistemas'
      and t.tgname = 'admin_sistemas_bloquear_origem_connect_terceiro'
      and not t.tgisinternal
  ) then
    raise exception 'VERIFY FAIL: trigger admin_sistemas_bloquear_origem_connect_terceiro ausente';
  end if;

  -- RLS
  select count(*)::integer into v_cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('admin_clientes', 'admin_sistemas', 'admin_cliente_sistemas')
    and c.relrowsecurity = true;
  if coalesce(v_cnt, 0) < 3 then
    raise exception 'VERIFY FAIL: RLS não habilitado em todas as admin_*';
  end if;

  -- Policies permissivas: esperado 0
  select count(*)::integer into v_cnt
  from pg_policies
  where schemaname = 'public'
    and tablename in ('admin_clientes', 'admin_sistemas', 'admin_cliente_sistemas');
  if coalesce(v_cnt, 0) > 0 then
    raise exception 'VERIFY FAIL: policies inesperadas em admin_* (cnt=%)', v_cnt;
  end if;

  -- Seed
  select count(*)::integer into v_cnt
  from public.admin_sistemas
  where slug = 'connect-sistema' and origem = 'connect';
  if coalesce(v_cnt, 0) < 1 then
    raise exception 'VERIFY FAIL: seed connect-sistema ausente';
  end if;

  -- Legados essenciais existem
  if to_regclass('public.perfis') is null then
    raise exception 'VERIFY FAIL: public.perfis desapareceu';
  end if;
  if to_regclass('public.clientes') is null then
    raise exception 'VERIFY FAIL: public.clientes desapareceu';
  end if;

  raise notice 'ADMIN.2 VERIFY PASS';
end $$;

-- Relatórios auxiliares (somente leitura)
select c.table_name, c.column_name, c.data_type, c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('admin_clientes', 'admin_sistemas', 'admin_cliente_sistemas')
order by c.table_name, c.ordinal_position;

select con.conname, pg_get_constraintdef(con.oid) as def
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and rel.relname in ('admin_clientes', 'admin_sistemas', 'admin_cliente_sistemas')
order by rel.relname, con.conname;

select t.tgname, c.relname, p.proname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('admin_clientes', 'admin_sistemas', 'admin_cliente_sistemas')
  and not t.tgisinternal
order by c.relname, t.tgname;
