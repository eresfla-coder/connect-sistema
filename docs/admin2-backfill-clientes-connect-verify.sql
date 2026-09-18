-- ADMIN.2.5 — VERIFY do backfill dos 3 clientes Connect (SOMENTE LEITURA)
-- Não INSERT/UPDATE/DELETE/ALTER.
-- Esperado após execução aprovada de docs/admin2-backfill-clientes-connect.sql

do $$
declare
  v_bira uuid := 'dd1f6a30-73a4-459f-9335-96dc56523089';
  v_guedes uuid := 'eda88f6d-1417-4ade-9d79-4ea50ea4c6b6';
  v_samyr uuid := '3ec1947d-2ec0-4d96-8d15-2a11da10ea70';
  v_sistema_id uuid;
  v_cnt integer;
  v_admin uuid;
  v_status text;
  v_acesso boolean;
  v_auth uuid;
  v_perfil uuid;
begin
  select s.id into v_sistema_id
  from public.admin_sistemas s
  where s.slug = 'connect-sistema' and s.origem = 'connect'
  limit 1;

  if v_sistema_id is null then
    raise exception 'VERIFY BACKFILL FAIL: connect-sistema ausente';
  end if;

  -- Perfis e Auth intactos
  foreach v_perfil in array array[v_bira, v_guedes, v_samyr]
  loop
    if not exists (select 1 from public.perfis p where p.id = v_perfil) then
      raise exception 'VERIFY BACKFILL FAIL: perfil % sumiu', v_perfil;
    end if;
    if not exists (select 1 from auth.users u where u.id = v_perfil) then
      raise exception 'VERIFY BACKFILL FAIL: auth.users % sumiu', v_perfil;
    end if;
  end loop;

  -- Exatamente 1 vínculo Connect por UUID aprovado
  select count(*)::integer into v_cnt
  from public.admin_cliente_sistemas cs
  where cs.perfil_id in (v_bira, v_guedes, v_samyr)
    and cs.sistema_id = v_sistema_id
    and cs.acesso_connect = true
    and cs.auth_user_id = cs.perfil_id;

  if v_cnt <> 3 then
    raise exception 'VERIFY BACKFILL FAIL: esperados 3 vínculos, obtidos %', v_cnt;
  end if;

  -- BIRA ativo
  select c.id, cs.status, cs.acesso_connect, cs.auth_user_id, cs.perfil_id
  into v_admin, v_status, v_acesso, v_auth, v_perfil
  from public.admin_cliente_sistemas cs
  join public.admin_clientes c on c.id = cs.cliente_id
  where cs.perfil_id = v_bira and cs.sistema_id = v_sistema_id
  limit 1;

  if v_admin is null or v_status is distinct from 'ativo' or v_acesso is not true or v_auth is distinct from v_bira then
    raise exception 'VERIFY BACKFILL FAIL: BIRA vínculo inválido (status=%, acesso=%)', v_status, v_acesso;
  end if;

  -- GUEDES bloqueado
  select c.id, cs.status, c.ativo
  into v_admin, v_status, v_acesso
  from public.admin_cliente_sistemas cs
  join public.admin_clientes c on c.id = cs.cliente_id
  where cs.perfil_id = v_guedes and cs.sistema_id = v_sistema_id
  limit 1;

  if v_admin is null or v_status is distinct from 'bloqueado' or v_acesso is not false then
    raise exception 'VERIFY BACKFILL FAIL: GUEDES esperado bloqueado/ativo=false';
  end if;

  -- SAMYR bloqueado
  select c.id, cs.status, c.ativo
  into v_admin, v_status, v_acesso
  from public.admin_cliente_sistemas cs
  join public.admin_clientes c on c.id = cs.cliente_id
  where cs.perfil_id = v_samyr and cs.sistema_id = v_sistema_id
  limit 1;

  if v_admin is null or v_status is distinct from 'bloqueado' or v_acesso is not false then
    raise exception 'VERIFY BACKFILL FAIL: SAMYR esperado bloqueado/ativo=false';
  end if;

  -- Sem backfill em massa: vínculos Connect de carteira não devem explodir para os 29
  select count(*)::integer into v_cnt from public.admin_cliente_sistemas;
  if v_cnt > 3 then
    raise notice 'VERIFY NOTICE: admin_cliente_sistemas count=% (>3). Confirme que extras não vieram deste backfill.', v_cnt;
  end if;

  -- Contagens legado intactas (amostra)
  select count(*)::integer into v_cnt from public.perfis;
  if v_cnt <> 29 then
    raise exception 'VERIFY BACKFILL FAIL: perfis count mudou (esperados 29, obtidos %)', v_cnt;
  end if;

  raise notice 'VERIFY BACKFILL OK';
end $$;
