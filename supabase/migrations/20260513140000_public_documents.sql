-- Documentos publicos (orcamento e ordem de servico) para links compartilhados.
-- A API /api/public-docs usa SUPABASE_SERVICE_ROLE_KEY no servidor.

create extension if not exists pgcrypto;

create table if not exists public.public_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  document_id text not null,
  token text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_documents_type_check check (
    document_type in ('orcamento', 'ordem_servico')
  )
);

alter table public.public_documents add column if not exists id uuid default gen_random_uuid();
alter table public.public_documents add column if not exists document_type text;
alter table public.public_documents add column if not exists document_id text;
alter table public.public_documents add column if not exists token text;
alter table public.public_documents add column if not exists payload jsonb;
alter table public.public_documents add column if not exists created_at timestamptz default now();
alter table public.public_documents add column if not exists updated_at timestamptz default now();

create unique index if not exists public_documents_lookup_idx
  on public.public_documents (document_type, document_id, token);

create index if not exists public_documents_document_idx
  on public.public_documents (document_type, document_id);

alter table public.public_documents enable row level security;
