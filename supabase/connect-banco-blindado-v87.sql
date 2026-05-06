-- CONNECT SISTEMA V87 — BANCO BLINDADO
-- Execute no Supabase > SQL Editor antes de subir esta versão na Vercel.

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

create policy "connect_storage_select_owner" on public.connect_storage for select to authenticated using (auth.uid() = user_id);
create policy "connect_storage_insert_owner" on public.connect_storage for insert to authenticated with check (auth.uid() = user_id);
create policy "connect_storage_update_owner" on public.connect_storage for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "connect_storage_delete_owner" on public.connect_storage for delete to authenticated using (auth.uid() = user_id);

update public.connect_storage
set updated_at = coalesce(updated_at, now()), created_at = coalesce(created_at, now())
where updated_at is null or created_at is null;

create table if not exists public.public_documents (
  token text primary key,
  tipo text not null,
  documento_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_public_documents_tipo_documento_updated on public.public_documents (tipo, documento_id, updated_at desc);

with ranked as (
  select token, row_number() over (partition by tipo, documento_id order by updated_at desc, created_at desc, token desc) as rn
  from public.public_documents
)
delete from public.public_documents pd using ranked r where pd.token = r.token and r.rn > 1;

create unique index if not exists uq_public_documents_tipo_documento on public.public_documents (tipo, documento_id);

alter table public.public_documents enable row level security;

drop policy if exists "public_documents_read_public" on public.public_documents;
create policy "public_documents_read_public" on public.public_documents for select using (true);

-- Configure na Vercel:
-- NEXT_PUBLIC_SUPABASE_URL
-- NEXT_PUBLIC_SUPABASE_ANON_KEY
-- SUPABASE_SERVICE_ROLE_KEY
-- NEXT_PUBLIC_SITE_URL=https://painel.appconnectpro.com.br
