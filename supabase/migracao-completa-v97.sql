-- Connect Sistema V97 — MIGRAÇÃO COMPLETA PARA SUPABASE
-- Execute no Supabase > SQL Editor

create extension if not exists pgcrypto;

-- ============================================
-- 1. CLIENTES
-- ============================================
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null default '',
  email text not null default '',
  endereco text not null default '',
  bairro text not null default '',
  cidade text not null default '',
  tipo_pessoa text not null default 'PF',
  cpf text not null default '',
  cnpj text not null default '',
  ie text not null default '',
  data_nascimento text not null default '',
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clientes_user_id on public.clientes(user_id);
create index if not exists idx_clientes_nome on public.clientes(nome);

alter table public.clientes enable row level security;

create policy "clientes_select_own" on public.clientes for select to authenticated using (auth.uid() = user_id);
create policy "clientes_insert_own" on public.clientes for insert to authenticated with check (auth.uid() = user_id);
create policy "clientes_update_own" on public.clientes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clientes_delete_own" on public.clientes for delete to authenticated using (auth.uid() = user_id);

-- ============================================
-- 2. PRODUTOS
-- ============================================
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  codigo text not null default '',
  categoria text not null default 'GERAL',
  preco_custo numeric(12,2) not null default 0,
  preco_venda numeric(12,2) not null default 0,
  quantidade integer not null default 0,
  unidade text not null default 'UN',
  descricao text not null default '',
  fornecedor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_produtos_user_id on public.produtos(user_id);
create index if not exists idx_produtos_nome on public.produtos(nome);

alter table public.produtos enable row level security;

create policy "produtos_select_own" on public.produtos for select to authenticated using (auth.uid() = user_id);
create policy "produtos_insert_own" on public.produtos for insert to authenticated with check (auth.uid() = user_id);
create policy "produtos_update_own" on public.produtos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "produtos_delete_own" on public.produtos for delete to authenticated using (auth.uid() = user_id);

-- ============================================
-- 3. ORÇAMENTOS
-- ============================================
create table if not exists public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  data text not null,
  validade text not null default '',
  prazo_entrega text not null default '',
  cliente_id uuid references public.clientes(id),
  cliente_nome text not null default '',
  cliente_telefone text not null default '',
  cliente_email text not null default '',
  cliente_endereco text not null default '',
  itens jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  forma_pagamento text not null default 'PIX',
  observacoes text not null default '',
  status text not null default 'Aberto',
  assinatura_cliente text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orcamentos_user_id on public.orcamentos(user_id);
create index if not exists idx_orcamentos_numero on public.orcamentos(numero);

alter table public.orcamentos enable row level security;

create policy "orcamentos_select_own" on public.orcamentos for select to authenticated using (auth.uid() = user_id);
create policy "orcamentos_insert_own" on public.orcamentos for insert to authenticated with check (auth.uid() = user_id);
create policy "orcamentos_update_own" on public.orcamentos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "orcamentos_delete_own" on public.orcamentos for delete to authenticated using (auth.uid() = user_id);

-- ============================================
-- 4. ORDENS DE SERVIÇO
-- ============================================
create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  data text not null,
  cliente_id uuid references public.clientes(id),
  cliente_nome text not null default '',
  cliente_telefone text not null default '',
  equipamento text not null default '',
  defeito text not null default '',
  laudo text not null default '',
  solucao text not null default '',
  pecas jsonb not null default '[]'::jsonb,
  mao_de_obra numeric(12,2) not null default 0,
  valor numeric(12,2) not null default 0,
  entrada numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  forma_pagamento text not null default 'PIX',
  prazo text not null default '',
  garantia text not null default '',
  status text not null default 'Aberta',
  assinatura_cliente text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_os_user_id on public.ordens_servico(user_id);
create index if not exists idx_os_numero on public.ordens_servico(numero);

alter table public.ordens_servico enable row level security;

create policy "os_select_own" on public.ordens_servico for select to authenticated using (auth.uid() = user_id);
create policy "os_insert_own" on public.ordens_servico for insert to authenticated with check (auth.uid() = user_id);
create policy "os_update_own" on public.ordens_servico for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "os_delete_own" on public.ordens_servico for delete to authenticated using (auth.uid() = user_id);

-- ============================================
-- 5. VENDAS
-- ============================================
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

create index if not exists idx_vendas_user_id on public.vendas(user_id);

alter table public.vendas enable row level security;

create policy "vendas_select_own" on public.vendas for select to authenticated using (auth.uid() = user_id);
create policy "vendas_insert_own" on public.vendas for insert to authenticated with check (auth.uid() = user_id);
create policy "vendas_update_own" on public.vendas for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vendas_delete_own" on public.vendas for delete to authenticated using (auth.uid() = user_id);

-- ============================================
-- 6. RECIBOS
-- ============================================
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

create index if not exists idx_recibos_user_id on public.recibos(user_id);

alter table public.recibos enable row level security;

create policy "recibos_select_own" on public.recibos for select to authenticated using (auth.uid() = user_id);
create policy "recibos_insert_own" on public.recibos for insert to authenticated with check (auth.uid() = user_id);
create policy "recibos_update_own" on public.recibos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recibos_delete_own" on public.recibos for delete to authenticated using (auth.uid() = user_id);

-- ============================================
-- 7. CONTRATOS
-- ============================================
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

create index if not exists idx_contratos_user_id on public.contratos(user_id);

alter table public.contratos enable row level security;

create policy "contratos_select_own" on public.contratos for select to authenticated using (auth.uid() = user_id);
create policy "contratos_insert_own" on public.contratos for insert to authenticated with check (auth.uid() = user_id);
create policy "contratos_update_own" on public.contratos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contratos_delete_own" on public.contratos for delete to authenticated using (auth.uid() = user_id);

-- ============================================
-- 8. TRIGGER updated_at universal
-- ============================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Aplicar em todas as tabelas
drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at before update on public.clientes for each row execute function public.set_updated_at();

drop trigger if exists trg_produtos_updated_at on public.produtos;
create trigger trg_produtos_updated_at before update on public.produtos for each row execute function public.set_updated_at();

drop trigger if exists trg_orcamentos_updated_at on public.orcamentos;
create trigger trg_orcamentos_updated_at before update on public.orcamentos for each row execute function public.set_updated_at();

drop trigger if exists trg_os_updated_at on public.ordens_servico;
create trigger trg_os_updated_at before update on public.ordens_servico for each row execute function public.set_updated_at();

drop trigger if exists trg_vendas_updated_at on public.vendas;
create trigger trg_vendas_updated_at before update on public.vendas for each row execute function public.set_updated_at();

drop trigger if exists trg_recibos_updated_at on public.recibos;
create trigger trg_recibos_updated_at before update on public.recibos for each row execute function public.set_updated_at();

drop trigger if exists trg_contratos_updated_at on public.contratos;
create trigger trg_contratos_updated_at before update on public.contratos for each row execute function public.set_updated_at();

drop trigger if exists trg_configuracoes_updated_at on public.configuracoes_empresa;
create trigger trg_configuracoes_updated_at before update on public.configuracoes_empresa for each row execute function public.set_updated_at();

-- ============================================
-- 9. PERMISSÕES
-- ============================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Política pública para config (leitura por token)
drop policy if exists "configuracoes_select_public" on public.configuracoes_empresa;
create policy "configuracoes_select_public"
  on public.configuracoes_empresa for select
  to anon
  using (true);
