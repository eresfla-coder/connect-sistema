-- CONNECT SISTEMA — RELEASE ESTÁVEL PRODUÇÃO V42
-- Execute uma vez no Supabase SQL Editor antes de testar links públicos curtos.
create table if not exists public.public_documents (
  token text primary key,
  tipo text not null,
  documento_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_documents enable row level security;

drop policy if exists "public_documents_read_public" on public.public_documents;
create policy "public_documents_read_public"
on public.public_documents
for select
using (true);

-- Inserts/updates são feitos pelo service_role através da API interna do app.
