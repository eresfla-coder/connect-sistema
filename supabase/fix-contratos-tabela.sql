-- CORREÇÃO: remover foreign key de contratos para clientes (tipos incompatíveis)

-- Dropar a tabela contratos se existir com estrutura errada
drop table if exists public.contratos;

-- Recriar sem foreign key
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  data text not null,
  validade text not null default '',
  cliente_id text not null default '',
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

create index idx_contratos_user_id on public.contratos(user_id);

-- Trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_contratos_updated_at before update on public.contratos for each row execute function public.set_updated_at();

-- RLS
alter table public.contratos enable row level security;

create policy "contratos_select_own" on public.contratos for select to authenticated using (auth.uid() = user_id);
create policy "contratos_insert_own" on public.contratos for insert to authenticated with check (auth.uid() = user_id);
create policy "contratos_update_own" on public.contratos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contratos_delete_own" on public.contratos for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.contratos to authenticated;
