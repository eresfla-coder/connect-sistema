-- CRIAR TABELAS QUE FALTAM (se não existirem)

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  data text not null,
  cliente_nome text not null default '',
  cliente_telefone text not null default '',
  itens jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  forma_pagamento text not null default 'PIX',
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recibos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  data text not null,
  pagador_nome text not null,
  pagador_documento text not null default '',
  valor numeric(12,2) not null default 0,
  valor_extenso text not null default '',
  referente text not null default '',
  forma_pagamento text not null default 'PIX',
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  data text not null,
  validade text not null default '',
  cliente_id uuid references public.clientes(id),
  cliente_nome text not null default '',
  descricao_servico text not null default '',
  descricao_servico_itens jsonb not null default '[]'::jsonb,
  clausulas_extras text not null default '',
  valor_total numeric(12,2) not null default 0,
  parcelas integer not null default 1,
  valor_parcela numeric(12,2) not null default 0,
  forma_pagamento text not null default 'PIX',
  prazo_execucao text not null default '',
  garantia text not null default '',
  cidade_contrato text not null default '',
  status text not null default 'Rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_vendas_user_id on public.vendas(user_id);
create index if not exists idx_recibos_user_id on public.recibos(user_id);
create index if not exists idx_contratos_user_id on public.contratos(user_id);

-- Triggers
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_vendas_updated_at on public.vendas;
create trigger trg_vendas_updated_at before update on public.vendas for each row execute function public.set_updated_at();

drop trigger if exists trg_recibos_updated_at on public.recibos;
create trigger trg_recibos_updated_at before update on public.recibos for each row execute function public.set_updated_at();

drop trigger if exists trg_contratos_updated_at on public.contratos;
create trigger trg_contratos_updated_at before update on public.contratos for each row execute function public.set_updated_at();

-- RLS
alter table public.vendas enable row level security;
alter table public.recibos enable row level security;
alter table public.contratos enable row level security;

create policy "vendas_select_own" on public.vendas for select to authenticated using (auth.uid() = user_id);
create policy "vendas_insert_own" on public.vendas for insert to authenticated with check (auth.uid() = user_id);
create policy "vendas_update_own" on public.vendas for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vendas_delete_own" on public.vendas for delete to authenticated using (auth.uid() = user_id);

create policy "recibos_select_own" on public.recibos for select to authenticated using (auth.uid() = user_id);
create policy "recibos_insert_own" on public.recibos for insert to authenticated with check (auth.uid() = user_id);
create policy "recibos_update_own" on public.recibos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recibos_delete_own" on public.recibos for delete to authenticated using (auth.uid() = user_id);

create policy "contratos_select_own" on public.contratos for select to authenticated using (auth.uid() = user_id);
create policy "contratos_insert_own" on public.contratos for insert to authenticated with check (auth.uid() = user_id);
create policy "contratos_update_own" on public.contratos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contratos_delete_own" on public.contratos for delete to authenticated using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.vendas, public.recibos, public.contratos to authenticated;
