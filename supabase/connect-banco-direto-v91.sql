-- Connect Sistema V91 - Financeiro direto no Supabase + cliente vinculado
-- Execute no SQL Editor do Supabase antes de testar a V91.

create table if not exists public.connect_storage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  payload jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, storage_key)
);

create index if not exists connect_storage_user_key_idx
  on public.connect_storage(user_id, storage_key);

alter table public.connect_storage enable row level security;

drop policy if exists "connect_storage_select_own" on public.connect_storage;
drop policy if exists "connect_storage_insert_own" on public.connect_storage;
drop policy if exists "connect_storage_update_own" on public.connect_storage;
drop policy if exists "connect_storage_delete_own" on public.connect_storage;

create policy "connect_storage_select_own"
  on public.connect_storage for select
  using (auth.uid() = user_id);

create policy "connect_storage_insert_own"
  on public.connect_storage for insert
  with check (auth.uid() = user_id);

create policy "connect_storage_update_own"
  on public.connect_storage for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "connect_storage_delete_own"
  on public.connect_storage for delete
  using (auth.uid() = user_id);

create or replace function public.set_connect_storage_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_connect_storage_updated_at on public.connect_storage;
create trigger trg_connect_storage_updated_at
before update on public.connect_storage
for each row execute function public.set_connect_storage_updated_at();

-- Tabela de clientes usada pelo módulo Clientes.
-- Se ela já existir, estes comandos apenas garantem colunas principais.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  "cpfCnpj" text,
  endereco text,
  bairro text,
  cidade text,
  cep text,
  email text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clientes add column if not exists telefone text;
alter table public.clientes add column if not exists "cpfCnpj" text;
alter table public.clientes add column if not exists endereco text;
alter table public.clientes add column if not exists bairro text;
alter table public.clientes add column if not exists cidade text;
alter table public.clientes add column if not exists cep text;
alter table public.clientes add column if not exists email text;
alter table public.clientes add column if not exists ativo boolean default true;
alter table public.clientes add column if not exists created_at timestamptz default now();
alter table public.clientes add column if not exists updated_at timestamptz default now();

alter table public.clientes enable row level security;

-- Atenção: clientes antigos podem estar sem user_id. Esta versão mantém política aberta para usuários logados,
-- compatível com sua base atual. Depois podemos travar por empresa/user_id quando o multiempresa estiver pronto.
drop policy if exists "clientes_select_authenticated" on public.clientes;
drop policy if exists "clientes_insert_authenticated" on public.clientes;
drop policy if exists "clientes_update_authenticated" on public.clientes;
drop policy if exists "clientes_delete_authenticated" on public.clientes;

create policy "clientes_select_authenticated"
  on public.clientes for select
  using (auth.role() = 'authenticated');

create policy "clientes_insert_authenticated"
  on public.clientes for insert
  with check (auth.role() = 'authenticated');

create policy "clientes_update_authenticated"
  on public.clientes for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "clientes_delete_authenticated"
  on public.clientes for delete
  using (auth.role() = 'authenticated');
