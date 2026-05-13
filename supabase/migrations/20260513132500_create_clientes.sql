-- Cria a tabela de clientes para sincronizacao entre navegadores/dispositivos.
-- O codigo do modulo Clientes deve ser ligado a esta tabela somente apos
-- esta migration ser aplicada e confirmada no projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  local_id text,
  nome text not null,
  telefone text not null,
  whatsapp text,
  email text,
  cpf_cnpj text,
  cpf text,
  cnpj text,
  endereco text,
  cep text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clientes_nome_minimo check (length(trim(nome)) > 0),
  constraint clientes_telefone_minimo check (length(trim(telefone)) > 0),
  constraint clientes_local_id_unique unique (user_id, local_id)
);

create index if not exists clientes_user_id_idx
  on public.clientes (user_id);

create index if not exists clientes_user_ativo_nome_idx
  on public.clientes (user_id, ativo, lower(nome));

create index if not exists clientes_user_telefone_idx
  on public.clientes (user_id, telefone);

create index if not exists clientes_user_email_idx
  on public.clientes (user_id, lower(email));

create index if not exists clientes_user_cpf_cnpj_idx
  on public.clientes (user_id, cpf_cnpj);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clientes_set_updated_at on public.clientes;

create trigger clientes_set_updated_at
before update on public.clientes
for each row
execute function public.set_updated_at();

alter table public.clientes enable row level security;

drop policy if exists "Clientes visiveis pelo proprio usuario" on public.clientes;
create policy "Clientes visiveis pelo proprio usuario"
on public.clientes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clientes criados pelo proprio usuario" on public.clientes;
create policy "Clientes criados pelo proprio usuario"
on public.clientes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Clientes atualizados pelo proprio usuario" on public.clientes;
create policy "Clientes atualizados pelo proprio usuario"
on public.clientes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Clientes excluidos pelo proprio usuario" on public.clientes;
create policy "Clientes excluidos pelo proprio usuario"
on public.clientes
for delete
to authenticated
using (auth.uid() = user_id);
