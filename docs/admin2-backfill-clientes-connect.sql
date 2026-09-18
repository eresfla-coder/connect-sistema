-- ADMIN.2.5 — BACKFILL CONTROLADO (NÃO EXECUTAR automaticamente)
-- Somente os 3 UUIDs aprovados após auditoria ADMIN.2.4.
-- NÃO altera public.perfis, auth.users, assinaturas, pagamentos.
-- Idempotente. Aborta se qualquer pré-condição falhar.
--
-- UUIDs aprovados (public.perfis.id = auth.users.id):
--   BIRA MOVEIS     dd1f6a30-73a4-459f-9335-96dc56523089
--   GUEDES MOVEIS   eda88f6d-1417-4ade-9d79-4ea50ea4c6b6
--   SAMYR GOIANINHA 3ec1947d-2ec0-4d96-8d15-2a11da10ea70
--
-- Mapeamento de status AUDITADO (não silencioso):
--   BIRA:    perfis.status='teste' + ativo=true + status_pagamento='em_dia'
--            → admin_cliente_sistemas.status = 'ativo'
--            (auditoria: cliente real; 'teste' no legado NÃO implica trial comercial)
--   GUEDES:  perfis.status='bloqueado' + ativo=false → status='bloqueado', admin_clientes.ativo=false
--   SAMYR:   perfis.status='bloqueado' + ativo=false → status='bloqueado', admin_clientes.ativo=false
--
-- Sistema destino: admin_sistemas.slug = 'connect-sistema'
-- acesso_connect=true, auth_user_id=perfil_id=perfis.id (Auth V1 preservado; sem createUser)

begin;

do $$
declare
  v_sistema_id uuid;
  v_bira uuid := 'dd1f6a30-73a4-459f-9335-96dc56523089';
  v_guedes uuid := 'eda88f6d-1417-4ade-9d79-4ea50ea4c6b6';
  v_samyr uuid := '3ec1947d-2ec0-4d96-8d15-2a11da10ea70';
  r record;
  v_admin_id uuid;
  v_status text;
  v_ativo boolean;
  v_email text;
begin
  -- Pré-condições de schema
  if to_regclass('public.admin_clientes') is null
     or to_regclass('public.admin_sistemas') is null
     or to_regclass('public.admin_cliente_sistemas') is null then
    raise exception 'BACKFILL FAIL: tabelas admin_* ausentes';
  end if;

  select s.id into v_sistema_id
  from public.admin_sistemas s
  where s.slug = 'connect-sistema' and s.origem = 'connect'
  limit 1;

  if v_sistema_id is null then
    raise exception 'BACKFILL FAIL: seed connect-sistema (origem=connect) ausente';
  end if;

  -- Cada UUID aprovado deve existir em perfis E auth.users
  for r in
    select unnest(array[v_bira, v_guedes, v_samyr]) as perfil_id
  loop
    if not exists (select 1 from public.perfis p where p.id = r.perfil_id) then
      raise exception 'BACKFILL FAIL: perfil % ausente em public.perfis', r.perfil_id;
    end if;
    if not exists (select 1 from auth.users u where u.id = r.perfil_id) then
      raise exception 'BACKFILL FAIL: user % ausente em auth.users', r.perfil_id;
    end if;
  end loop;

  -- ---------- BIRA MOVEIS ----------
  select lower(email), true, 'ativo'
  into v_email, v_ativo, v_status
  from public.perfis where id = v_bira;

  if v_email is null or length(btrim(v_email)) = 0 then
    raise exception 'BACKFILL FAIL: BIRA sem email';
  end if;

  select c.id into v_admin_id
  from public.admin_clientes c
  where c.email = v_email
  limit 1;

  if v_admin_id is null then
    insert into public.admin_clientes (
      nome, nome_empresa, email, telefone, observacoes, ativo
    )
    select
      p.nome,
      p.nome_empresa,
      lower(p.email),
      p.telefone,
      coalesce(p.observacoes, '') ||
        case when coalesce(p.observacoes, '') = '' then '' else E'\n' end ||
        'Backfill ADMIN.2.5 a partir de perfis.id=' || p.id::text ||
        ' (status legado=' || coalesce(p.status, 'null') || ').',
      true
    from public.perfis p
    where p.id = v_bira
    returning id into v_admin_id;
  end if;

  if not exists (
    select 1 from public.admin_cliente_sistemas cs
    where cs.cliente_id = v_admin_id and cs.sistema_id = v_sistema_id
  ) then
    insert into public.admin_cliente_sistemas (
      cliente_id, sistema_id, status, valor, data_vencimento,
      status_pagamento, ultimo_pagamento,
      acesso_connect, auth_user_id, perfil_id
    )
    select
      v_admin_id,
      v_sistema_id,
      'ativo',
      p.valor_plano,
      p.vencimento,
      p.status_pagamento,
      p.ultimo_pagamento,
      true,
      p.id,
      p.id
    from public.perfis p
    where p.id = v_bira;
  end if;

  -- ---------- GUEDES MOVEIS ----------
  select lower(email), false, 'bloqueado'
  into v_email, v_ativo, v_status
  from public.perfis where id = v_guedes;

  if v_email is null or length(btrim(v_email)) = 0 then
    raise exception 'BACKFILL FAIL: GUEDES sem email';
  end if;

  select c.id into v_admin_id
  from public.admin_clientes c
  where c.email = v_email
  limit 1;

  if v_admin_id is null then
    insert into public.admin_clientes (
      nome, nome_empresa, email, telefone, observacoes, ativo
    )
    select
      p.nome,
      p.nome_empresa,
      lower(p.email),
      p.telefone,
      coalesce(p.observacoes, '') ||
        case when coalesce(p.observacoes, '') = '' then '' else E'\n' end ||
        'Backfill ADMIN.2.5 a partir de perfis.id=' || p.id::text ||
        ' (status legado=bloqueado).',
      false
    from public.perfis p
    where p.id = v_guedes
    returning id into v_admin_id;
  else
    update public.admin_clientes
      set ativo = false
    where id = v_admin_id and ativo is distinct from false;
  end if;

  if not exists (
    select 1 from public.admin_cliente_sistemas cs
    where cs.cliente_id = v_admin_id and cs.sistema_id = v_sistema_id
  ) then
    insert into public.admin_cliente_sistemas (
      cliente_id, sistema_id, status, valor, data_vencimento,
      status_pagamento, ultimo_pagamento,
      acesso_connect, auth_user_id, perfil_id
    )
    select
      v_admin_id,
      v_sistema_id,
      'bloqueado',
      p.valor_plano,
      p.vencimento,
      p.status_pagamento,
      p.ultimo_pagamento,
      true,
      p.id,
      p.id
    from public.perfis p
    where p.id = v_guedes;
  end if;

  -- ---------- SAMYR GOIANINHA ----------
  select lower(email), false, 'bloqueado'
  into v_email, v_ativo, v_status
  from public.perfis where id = v_samyr;

  if v_email is null or length(btrim(v_email)) = 0 then
    raise exception 'BACKFILL FAIL: SAMYR sem email';
  end if;

  select c.id into v_admin_id
  from public.admin_clientes c
  where c.email = v_email
  limit 1;

  if v_admin_id is null then
    insert into public.admin_clientes (
      nome, nome_empresa, email, telefone, observacoes, ativo
    )
    select
      p.nome,
      p.nome_empresa,
      lower(p.email),
      p.telefone,
      coalesce(p.observacoes, '') ||
        case when coalesce(p.observacoes, '') = '' then '' else E'\n' end ||
        'Backfill ADMIN.2.5 a partir de perfis.id=' || p.id::text ||
        ' (status legado=bloqueado).',
      false
    from public.perfis p
    where p.id = v_samyr
    returning id into v_admin_id;
  else
    update public.admin_clientes
      set ativo = false
    where id = v_admin_id and ativo is distinct from false;
  end if;

  if not exists (
    select 1 from public.admin_cliente_sistemas cs
    where cs.cliente_id = v_admin_id and cs.sistema_id = v_sistema_id
  ) then
    insert into public.admin_cliente_sistemas (
      cliente_id, sistema_id, status, valor, data_vencimento,
      status_pagamento, ultimo_pagamento,
      acesso_connect, auth_user_id, perfil_id
    )
    select
      v_admin_id,
      v_sistema_id,
      'bloqueado',
      p.valor_plano,
      p.vencimento,
      p.status_pagamento,
      p.ultimo_pagamento,
      true,
      p.id,
      p.id
    from public.perfis p
    where p.id = v_samyr;
  end if;

  -- Pós-checagem estrita: exatamente 3 vínculos Connect com esses perfil_id
  if (
    select count(*) from public.admin_cliente_sistemas cs
    where cs.perfil_id in (v_bira, v_guedes, v_samyr)
      and cs.acesso_connect = true
      and cs.auth_user_id = cs.perfil_id
  ) is distinct from 3 then
    raise exception 'BACKFILL FAIL: esperados exatamente 3 vínculos Connect pós-insert';
  end if;

  raise notice 'BACKFILL OK: 3 clientes Connect vinculados a connect-sistema (idempotente).';
end $$;

commit;
