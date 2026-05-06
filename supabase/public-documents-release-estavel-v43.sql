-- CONNECT SISTEMA — RELEASE ESTÁVEL PRODUÇÃO V43
-- Execute no Supabase SQL Editor para links públicos curtos de OS/orçamento funcionarem em qualquer celular.

create table if not exists public.public_documents (
  token text primary key,
  tipo text not null,
  documento_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_public_documents_tipo_documento_updated
on public.public_documents (tipo, documento_id, updated_at desc);

alter table public.public_documents enable row level security;

drop policy if exists "public_documents_read_public" on public.public_documents;
create policy "public_documents_read_public"
on public.public_documents
for select
using (true);

-- Inserts/updates são feitos pela API interna do app usando service_role.
