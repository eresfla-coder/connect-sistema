-- LIMPAR TODAS AS POLICIES EXISTENTES (forçado)
do $$
declare
  pol record;
begin
  for pol in 
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    begin
      execute format('drop policy %I on public.%I;', pol.policyname, pol.tablename);
    exception when others then
      null; -- ignora erro se já não existir
    end;
  end loop;
end;
$$;

-- RECRIAR TODAS AS POLICIES

-- CLIENTES
alter table if exists public.clientes enable row level security;
create policy "clientes_select_own" on public.clientes for select to authenticated using (auth.uid() = user_id);
create policy "clientes_insert_own" on public.clientes for insert to authenticated with check (auth.uid() = user_id);
create policy "clientes_update_own" on public.clientes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clientes_delete_own" on public.clientes for delete to authenticated using (auth.uid() = user_id);

-- PRODUTOS
alter table if exists public.produtos enable row level security;
create policy "produtos_select_own" on public.produtos for select to authenticated using (auth.uid() = user_id);
create policy "produtos_insert_own" on public.produtos for insert to authenticated with check (auth.uid() = user_id);
create policy "produtos_update_own" on public.produtos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "produtos_delete_own" on public.produtos for delete to authenticated using (auth.uid() = user_id);

-- ORÇAMENTOS
alter table if exists public.orcamentos enable row level security;
create policy "orcamentos_select_own" on public.orcamentos for select to authenticated using (auth.uid() = user_id);
create policy "orcamentos_insert_own" on public.orcamentos for insert to authenticated with check (auth.uid() = user_id);
create policy "orcamentos_update_own" on public.orcamentos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "orcamentos_delete_own" on public.orcamentos for delete to authenticated using (auth.uid() = user_id);

-- OS
alter table if exists public.ordens_servico enable row level security;
create policy "os_select_own" on public.ordens_servico for select to authenticated using (auth.uid() = user_id);
create policy "os_insert_own" on public.ordens_servico for insert to authenticated with check (auth.uid() = user_id);
create policy "os_update_own" on public.ordens_servico for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "os_delete_own" on public.ordens_servico for delete to authenticated using (auth.uid() = user_id);

-- VENDAS
alter table if exists public.vendas enable row level security;
create policy "vendas_select_own" on public.vendas for select to authenticated using (auth.uid() = user_id);
create policy "vendas_insert_own" on public.vendas for insert to authenticated with check (auth.uid() = user_id);
create policy "vendas_update_own" on public.vendas for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vendas_delete_own" on public.vendas for delete to authenticated using (auth.uid() = user_id);

-- RECIBOS
alter table if exists public.recibos enable row level security;
create policy "recibos_select_own" on public.recibos for select to authenticated using (auth.uid() = user_id);
create policy "recibos_insert_own" on public.recibos for insert to authenticated with check (auth.uid() = user_id);
create policy "recibos_update_own" on public.recibos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recibos_delete_own" on public.recibos for delete to authenticated using (auth.uid() = user_id);

-- CONTRATOS
alter table if exists public.contratos enable row level security;
create policy "contratos_select_own" on public.contratos for select to authenticated using (auth.uid() = user_id);
create policy "contratos_insert_own" on public.contratos for insert to authenticated with check (auth.uid() = user_id);
create policy "contratos_update_own" on public.contratos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contratos_delete_own" on public.contratos for delete to authenticated using (auth.uid() = user_id);

-- CONFIGURAÇÕES
alter table if exists public.configuracoes_empresa enable row level security;
create policy "configuracoes_select_own" on public.configuracoes_empresa for select to authenticated using (auth.uid() = user_id);
create policy "configuracoes_insert_own" on public.configuracoes_empresa for insert to authenticated with check (auth.uid() = user_id);
create policy "configuracoes_update_own" on public.configuracoes_empresa for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "configuracoes_delete_own" on public.configuracoes_empresa for delete to authenticated using (auth.uid() = user_id);
create policy "configuracoes_select_public" on public.configuracoes_empresa for select to anon using (true);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
