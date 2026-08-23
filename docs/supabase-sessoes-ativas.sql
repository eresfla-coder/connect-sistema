-- Connect Orçamento — sessões ativas / uso real
-- Idempotente. Rodar no SQL Editor do Supabase se a tabela estiver incompleta.
-- NÃO executa sozinho pelo app.
--
-- O código já usa public.sessoes_ativas (1 linha por user_id = 1 sessão simultânea).
-- Este script cria a tabela se não existir e adiciona colunas novas sem apagar dados.

create table if not exists public.sessoes_ativas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  session_token text,
  device_label text,
  user_agent text,
  ip_address text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  ativo boolean not null default true,
  encerrada_em timestamptz,
  motivo_encerramento text,
  navegador text,
  sistema_operacional text,
  dispositivo text
);

alter table public.sessoes_ativas add column if not exists email text;
alter table public.sessoes_ativas add column if not exists session_token text;
alter table public.sessoes_ativas add column if not exists device_label text;
alter table public.sessoes_ativas add column if not exists user_agent text;
alter table public.sessoes_ativas add column if not exists ip_address text;
alter table public.sessoes_ativas add column if not exists last_seen_at timestamptz;
alter table public.sessoes_ativas add column if not exists updated_at timestamptz;
alter table public.sessoes_ativas add column if not exists created_at timestamptz;
alter table public.sessoes_ativas add column if not exists ativo boolean;
alter table public.sessoes_ativas add column if not exists encerrada_em timestamptz;
alter table public.sessoes_ativas add column if not exists motivo_encerramento text;
alter table public.sessoes_ativas add column if not exists navegador text;
alter table public.sessoes_ativas add column if not exists sistema_operacional text;
alter table public.sessoes_ativas add column if not exists dispositivo text;

create index if not exists sessoes_ativas_last_seen_idx on public.sessoes_ativas (last_seen_at desc);
create index if not exists sessoes_ativas_ativo_idx on public.sessoes_ativas (ativo);

alter table public.sessoes_ativas enable row level security;

drop policy if exists "sessoes_ativas_select_own" on public.sessoes_ativas;
create policy "sessoes_ativas_select_own"
  on public.sessoes_ativas
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Cliente não grava direto na tabela (registrar/verificar/encerrar usam service_role no server).
drop policy if exists "sessoes_ativas_insert_own" on public.sessoes_ativas;
drop policy if exists "sessoes_ativas_update_own" on public.sessoes_ativas;
drop policy if exists "sessoes_ativas_delete_own" on public.sessoes_ativas;

comment on table public.sessoes_ativas is 'Última sessão por usuário. Admin lista via API service_role.';
