-- CONNECT SISTEMA — RELEASE ESTÁVEL PRODUÇÃO V44
-- Execute no Supabase SQL Editor.
-- Objetivo: manter links públicos curtos e estáveis para OS/orçamento, sem link gigante no WhatsApp.

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

-- V44: evita duplicar vários tokens para o mesmo documento.
-- Se já houver duplicados antigos, mantemos o mais recente e removemos os repetidos antes do índice único.
with ranked as (
  select
    token,
    row_number() over (partition by tipo, documento_id order by updated_at desc, created_at desc, token desc) as rn
  from public.public_documents
)
delete from public.public_documents pd
using ranked r
where pd.token = r.token
  and r.rn > 1;

create unique index if not exists uq_public_documents_tipo_documento
on public.public_documents (tipo, documento_id);

alter table public.public_documents enable row level security;

drop policy if exists "public_documents_read_public" on public.public_documents;
create policy "public_documents_read_public"
on public.public_documents
for select
using (true);

-- Inserts/updates continuam sendo feitos pela API interna usando SUPABASE_SERVICE_ROLE_KEY.
