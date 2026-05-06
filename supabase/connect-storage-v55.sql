-- Connect Sistema V55 - correção de sincronização Supabase/PWA
-- Execute no Supabase > SQL Editor antes do deploy.

create extension if not exists pgcrypto;

create table if not exists public.connect_storage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  payload jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint connect_storage_user_key_unique unique (user_id, storage_key)
);

create index if not exists connect_storage_user_id_idx on public.connect_storage(user_id);
create index if not exists connect_storage_key_idx on public.connect_storage(storage_key);

alter table public.connect_storage enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.connect_storage to authenticated;

drop policy if exists "connect_storage_select_owner" on public.connect_storage;
drop policy if exists "connect_storage_insert_owner" on public.connect_storage;
drop policy if exists "connect_storage_update_owner" on public.connect_storage;
drop policy if exists "connect_storage_delete_owner" on public.connect_storage;

create policy "connect_storage_select_owner"
on public.connect_storage
for select
to authenticated
using (auth.uid() = user_id);

create policy "connect_storage_insert_owner"
on public.connect_storage
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "connect_storage_update_owner"
on public.connect_storage
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "connect_storage_delete_owner"
on public.connect_storage
for delete
to authenticated
using (auth.uid() = user_id);

-- Garante que registros antigos, se existirem, fiquem com timestamps válidos.
update public.connect_storage
set updated_at = coalesce(updated_at, now()), created_at = coalesce(created_at, now())
where updated_at is null or created_at is null;
