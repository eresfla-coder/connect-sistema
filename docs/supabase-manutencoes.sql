-- Connect Emissor de Orçamento — módulo Manutenções
-- Executar no SQL Editor do Supabase.
-- O tenant operacional atual do projeto é auth.users.id (user_id).

create extension if not exists pgcrypto;

create table if not exists public.equipamentos_cliente (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  categoria text,
  marca text,
  modelo text,
  numero_serie text,
  capacidade text,
  patrimonio text,
  local_instalacao text,
  descricao text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.manutencoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_id bigint not null references public.clientes(id) on delete restrict,
  equipamento_id uuid,
  manutencao_origem_id uuid references public.manutencoes(id) on delete set null,
  titulo text not null check (length(trim(titulo)) > 0),
  tipo_servico text,
  descricao_servico text,
  data_realizacao date not null,
  periodicidade_tipo text not null default 'sem_recorrencia'
    check (periodicidade_tipo in ('sem_recorrencia', 'dias', 'meses', 'anos', 'manual')),
  periodicidade_valor integer
    check (periodicidade_valor is null or periodicidade_valor > 0),
  proxima_manutencao date,
  dias_antecedencia_aviso integer not null default 30
    check (dias_antecedencia_aviso between 0 and 3650),
  data_inicio_aviso date,
  responsavel text,
  valor_servico numeric(14,2)
    check (valor_servico is null or valor_servico >= 0),
  observacoes text,
  recorrencia_ativa boolean not null default true,
  cancelada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manutencoes_equipamento_mesmo_usuario
    foreign key (user_id, equipamento_id)
    references public.equipamentos_cliente(user_id, id)
    on delete restrict
);

create or replace function public.connect_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.calcular_datas_manutencao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.periodicidade_tipo = 'sem_recorrencia' then
    new.proxima_manutencao = null;
    new.data_inicio_aviso = null;
  elsif new.periodicidade_tipo = 'dias' then
    new.proxima_manutencao = new.data_realizacao + new.periodicidade_valor;
  elsif new.periodicidade_tipo = 'meses' then
    new.proxima_manutencao =
      (date_trunc('month', new.data_realizacao)
        + make_interval(months => new.periodicidade_valor)
        + (least(
            extract(day from new.data_realizacao)::int,
            extract(day from (
              date_trunc('month', new.data_realizacao)
              + make_interval(months => new.periodicidade_valor + 1)
              - interval '1 day'
            ))::int
          ) - 1) * interval '1 day')::date;
  elsif new.periodicidade_tipo = 'anos' then
    new.proxima_manutencao =
      (date_trunc('month', new.data_realizacao)
        + make_interval(months => new.periodicidade_valor * 12)
        + (least(
            extract(day from new.data_realizacao)::int,
            extract(day from (
              date_trunc('month', new.data_realizacao)
              + make_interval(months => new.periodicidade_valor * 12 + 1)
              - interval '1 day'
            ))::int
          ) - 1) * interval '1 day')::date;
  elsif new.periodicidade_tipo = 'manual' and new.proxima_manutencao is null then
    raise exception 'Informe a próxima manutenção para periodicidade manual.';
  end if;

  if new.proxima_manutencao is not null then
    new.data_inicio_aviso = new.proxima_manutencao - new.dias_antecedencia_aviso;
  end if;

  return new;
end;
$$;

drop trigger if exists equipamentos_cliente_updated_at on public.equipamentos_cliente;
create trigger equipamentos_cliente_updated_at
before update on public.equipamentos_cliente
for each row execute function public.connect_updated_at();

drop trigger if exists manutencoes_updated_at on public.manutencoes;
create trigger manutencoes_updated_at
before update on public.manutencoes
for each row execute function public.connect_updated_at();

drop trigger if exists manutencoes_calcular_datas on public.manutencoes;
create trigger manutencoes_calcular_datas
before insert or update of data_realizacao, periodicidade_tipo, periodicidade_valor,
  proxima_manutencao, dias_antecedencia_aviso
on public.manutencoes
for each row execute function public.calcular_datas_manutencao();

create index if not exists equipamentos_cliente_user_idx
  on public.equipamentos_cliente(user_id);
create index if not exists equipamentos_cliente_cliente_idx
  on public.equipamentos_cliente(user_id, cliente_id);
create index if not exists manutencoes_user_idx
  on public.manutencoes(user_id);
create index if not exists manutencoes_cliente_idx
  on public.manutencoes(user_id, cliente_id);
create index if not exists manutencoes_equipamento_idx
  on public.manutencoes(user_id, equipamento_id);
create index if not exists manutencoes_proxima_idx
  on public.manutencoes(user_id, proxima_manutencao)
  where recorrencia_ativa = true and cancelada_em is null;
create index if not exists manutencoes_realizacao_idx
  on public.manutencoes(user_id, data_realizacao desc);
create index if not exists manutencoes_origem_idx
  on public.manutencoes(user_id, manutencao_origem_id);

alter table public.equipamentos_cliente enable row level security;
alter table public.manutencoes enable row level security;

drop policy if exists "equipamentos_select_own" on public.equipamentos_cliente;
drop policy if exists "equipamentos_insert_own" on public.equipamentos_cliente;
drop policy if exists "equipamentos_update_own" on public.equipamentos_cliente;
drop policy if exists "equipamentos_delete_own" on public.equipamentos_cliente;
create policy "equipamentos_select_own" on public.equipamentos_cliente
  for select using (auth.uid() = user_id);
create policy "equipamentos_insert_own" on public.equipamentos_cliente
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.clientes c
      where c.id = cliente_id and c.user_id = auth.uid()
    )
  );
create policy "equipamentos_update_own" on public.equipamentos_cliente
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.clientes c
      where c.id = cliente_id and c.user_id = auth.uid()
    )
  );
create policy "equipamentos_delete_own" on public.equipamentos_cliente
  for delete using (auth.uid() = user_id);

drop policy if exists "manutencoes_select_own" on public.manutencoes;
drop policy if exists "manutencoes_insert_own" on public.manutencoes;
drop policy if exists "manutencoes_update_own" on public.manutencoes;
drop policy if exists "manutencoes_delete_own" on public.manutencoes;
create policy "manutencoes_select_own" on public.manutencoes
  for select using (auth.uid() = user_id);
create policy "manutencoes_insert_own" on public.manutencoes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.clientes c
      where c.id = cliente_id and c.user_id = auth.uid()
    )
    and (
      equipamento_id is null
      or exists (
        select 1 from public.equipamentos_cliente e
        where e.id = equipamento_id
          and e.cliente_id = cliente_id
          and e.user_id = auth.uid()
      )
    )
  );
create policy "manutencoes_update_own" on public.manutencoes
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.clientes c
      where c.id = cliente_id and c.user_id = auth.uid()
    )
    and (
      equipamento_id is null
      or exists (
        select 1 from public.equipamentos_cliente e
        where e.id = equipamento_id
          and e.cliente_id = cliente_id
          and e.user_id = auth.uid()
      )
    )
  );
create policy "manutencoes_delete_own" on public.manutencoes
  for delete using (auth.uid() = user_id);
