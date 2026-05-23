-- Perfis de acesso SaaS (trial, vencimento, bloqueio).

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  ativo boolean not null default true,
  status text not null default 'teste',
  vencimento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.perfis add column if not exists email text;
alter table public.perfis add column if not exists ativo boolean default true;
alter table public.perfis add column if not exists status text default 'teste';
alter table public.perfis add column if not exists vencimento date;
alter table public.perfis add column if not exists created_at timestamptz default now();
alter table public.perfis add column if not exists updated_at timestamptz default now();

alter table public.perfis enable row level security;

drop policy if exists "Perfis visiveis pelo proprio usuario" on public.perfis;
create policy "Perfis visiveis pelo proprio usuario"
on public.perfis
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Perfis criados pelo proprio usuario" on public.perfis;
create policy "Perfis criados pelo proprio usuario"
on public.perfis
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Perfis atualizados pelo proprio usuario" on public.perfis;
create policy "Perfis atualizados pelo proprio usuario"
on public.perfis
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
