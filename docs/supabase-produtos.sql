-- Tabela de produtos/serviços por usuário (sync celular + PC)
-- Executar no SQL Editor do Supabase

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  nome text not null default '',
  ativo boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create index if not exists produtos_user_id_idx on public.produtos(user_id);
create index if not exists produtos_user_id_updated_idx on public.produtos(user_id, updated_at desc);

alter table public.produtos enable row level security;

drop policy if exists "produtos_select_own" on public.produtos;
drop policy if exists "produtos_insert_own" on public.produtos;
drop policy if exists "produtos_update_own" on public.produtos;
drop policy if exists "produtos_delete_own" on public.produtos;

create policy "produtos_select_own" on public.produtos for select using (auth.uid() = user_id);
create policy "produtos_insert_own" on public.produtos for insert with check (auth.uid() = user_id);
create policy "produtos_update_own" on public.produtos for update using (auth.uid() = user_id);
create policy "produtos_delete_own" on public.produtos for delete using (auth.uid() = user_id);
