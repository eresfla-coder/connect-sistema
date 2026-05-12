-- Connect Sistema V96 — Migração Configurações da Empresa para Supabase
-- Execute no Supabase > SQL Editor

create extension if not exists pgcrypto;

-- Tabela de configurações da empresa (multiempresa por usuário)
create table if not exists public.configuracoes_empresa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_empresa text not null default 'LOJA CONNECT',
  telefone text not null default '',
  celular_empresa text not null default '',
  whatsapp_empresa text not null default '',
  email text not null default '',
  endereco text not null default '',
  cidade_uf text not null default '',
  responsavel text not null default '',
  logo_url text not null default '/logo-connect.png',
  cor_primaria text not null default '#16a34a',
  cor_secundaria text not null default '#dcfce7',
  titulo_pdf text not null default 'Orçamento Comercial',
  rodape_pdf text not null default 'Obrigado pela preferência.',
  validade_padrao text not null default '7 dias',
  prazo_entrega_padrao text not null default '3 dias',
  forma_pagamento_padrao text not null default 'PIX',
  mostrar_quantidade boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- Índices
create index if not exists idx_configuracoes_user_id
  on public.configuracoes_empresa(user_id);

create index if not exists idx_configuracoes_updated_at
  on public.configuracoes_empresa(updated_at desc);

-- Adicionar user_id em public_documents para buscar config atualizada
create index if not exists idx_public_documents_user_id
  on public.public_documents(user_id) where user_id is not null;

-- RLS
alter table public.configuracoes_empresa enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.configuracoes_empresa to authenticated;

-- Políticas RLS

-- Usuário vê SÓ sua própria config
create policy "configuracoes_select_own"
  on public.configuracoes_empresa for select
  to authenticated
  using (auth.uid() = user_id);

-- Usuário insere SÓ sua própria config
create policy "configuracoes_insert_own"
  on public.configuracoes_empresa for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Usuário atualiza SÓ sua própria config
create policy "configuracoes_update_own"
  on public.configuracoes_empresa for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Usuário deleta SÓ sua própria config
create policy "configuracoes_delete_own"
  on public.configuracoes_empresa for delete
  to authenticated
  using (auth.uid() = user_id);

-- Política pública para documentos (permitir leitura pública por token)
create policy "configuracoes_select_public"
  on public.configuracoes_empresa for select
  to anon
  using (true);

-- Trigger para updated_at automático
create or replace function public.set_updated_at_config()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_configuracoes_updated_at on public.configuracoes_empresa;
create trigger trg_configuracoes_updated_at
  before update on public.configuracoes_empresa
  for each row execute function public.set_updated_at_config();
