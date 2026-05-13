-- Cria a tabela de produtos para sincronizacao entre navegadores/dispositivos.
-- O codigo do modulo Produtos deve ser ligado a esta tabela somente apos
-- esta migration ser aplicada e confirmada no projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  local_id text,
  nome text not null,
  categoria text not null,
  preco numeric(12, 2) not null default 0,
  custo numeric(12, 2) not null default 0,
  estoque numeric(12, 3) not null default 0,
  descricao text,
  ativo boolean not null default true,
  tipo_calculo text not null default 'unidade',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint produtos_nome_minimo check (length(trim(nome)) > 0),
  constraint produtos_categoria_minima check (length(trim(categoria)) > 0),
  constraint produtos_preco_nao_negativo check (preco >= 0),
  constraint produtos_custo_nao_negativo check (custo >= 0),
  constraint produtos_estoque_nao_negativo check (estoque >= 0),
  constraint produtos_tipo_calculo_valido check (tipo_calculo in ('unidade', 'm2')),
  constraint produtos_local_id_unique unique (user_id, local_id)
);

create index if not exists produtos_user_id_idx
  on public.produtos (user_id);

create index if not exists produtos_user_ativo_nome_idx
  on public.produtos (user_id, ativo, lower(nome));

create index if not exists produtos_user_categoria_idx
  on public.produtos (user_id, lower(categoria));

create index if not exists produtos_user_tipo_calculo_idx
  on public.produtos (user_id, tipo_calculo);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists produtos_set_updated_at on public.produtos;

create trigger produtos_set_updated_at
before update on public.produtos
for each row
execute function public.set_updated_at();

alter table public.produtos enable row level security;

drop policy if exists "Produtos visiveis pelo proprio usuario" on public.produtos;
create policy "Produtos visiveis pelo proprio usuario"
on public.produtos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Produtos criados pelo proprio usuario" on public.produtos;
create policy "Produtos criados pelo proprio usuario"
on public.produtos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Produtos atualizados pelo proprio usuario" on public.produtos;
create policy "Produtos atualizados pelo proprio usuario"
on public.produtos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Produtos excluidos pelo proprio usuario" on public.produtos;
create policy "Produtos excluidos pelo proprio usuario"
on public.produtos
for delete
to authenticated
using (auth.uid() = user_id);
