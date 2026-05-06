-- Connect Sistema V89 - Banco leve e estável
-- Execute uma vez no SQL Editor do Supabase.

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
