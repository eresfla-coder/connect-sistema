-- ADMIN.2.1 — Carteira administrativa (Opção B) — patch adversarial
-- ADITIVA. Escopo ESTRITO: somente admin_*.
-- NÃO altera connect_updated_at, pgcrypto, perfis, auth.users, CRM, assinaturas, etc.
-- NÃO EXECUTAR automaticamente — aplicar no SQL Editor somente após aprovação.

-- ---------------------------------------------------------------------------
-- Função EXCLUSIVA ADMIN.2 (não tocar public.connect_updated_at)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.admin_set_updated_at() is
  'ADMIN.2 — updated_at exclusivo das tabelas admin_*. Não substitui connect_updated_at.';

-- ---------------------------------------------------------------------------
-- admin_clientes
-- ---------------------------------------------------------------------------
create table if not exists public.admin_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text,
  nome_empresa text,
  email text,
  telefone text,
  documento text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_clientes_email_lower_chk
    check (email is null or email = lower(email))
);

comment on table public.admin_clientes is
  'ADMIN.2 — carteira comercial do admin da plataforma. Independente de auth.users e de public.clientes (CRM tenant).';

-- UNIQUE email quando preenchido (carteira SaaS: 1 cadastro comercial por e-mail)
create unique index if not exists admin_clientes_email_unique_idx
  on public.admin_clientes (email)
  where email is not null and length(btrim(email)) > 0;

create index if not exists admin_clientes_ativo_idx
  on public.admin_clientes (ativo);

create index if not exists admin_clientes_nome_empresa_idx
  on public.admin_clientes (nome_empresa);

-- ---------------------------------------------------------------------------
-- admin_sistemas
-- ---------------------------------------------------------------------------
create table if not exists public.admin_sistemas (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  nome text not null,
  origem text not null,
  descricao text,
  url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_sistemas_slug_unique unique (slug),
  constraint admin_sistemas_origem_chk
    check (origem in ('connect', 'terceiro')),
  constraint admin_sistemas_nome_chk
    check (length(trim(nome)) > 0),
  constraint admin_sistemas_slug_chk
    check (slug = lower(slug) and length(trim(slug)) > 0)
);

comment on table public.admin_sistemas is
  'ADMIN.2 — catálogo de sistemas (Connect ou terceiro). origem restrita por check.';

create index if not exists admin_sistemas_origem_idx
  on public.admin_sistemas (origem);

create index if not exists admin_sistemas_ativo_idx
  on public.admin_sistemas (ativo);

-- ---------------------------------------------------------------------------
-- admin_cliente_sistemas
-- ---------------------------------------------------------------------------
create table if not exists public.admin_cliente_sistemas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null
    references public.admin_clientes(id) on delete cascade,
  sistema_id uuid not null
    references public.admin_sistemas(id) on delete restrict,
  status text not null default 'trial',
  valor numeric(14,2)
    check (valor is null or valor >= 0),
  dia_vencimento integer
    check (dia_vencimento is null or (dia_vencimento between 1 and 28)),
  data_vencimento date,
  inicio date,
  fim_trial date,
  observacoes text,
  status_pagamento text,
  ultimo_pagamento date,
  acesso_connect boolean not null default false,
  auth_user_id uuid
    references auth.users(id) on delete set null,
  perfil_id uuid
    references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_cs_cliente_sistema_unique unique (cliente_id, sistema_id),
  constraint admin_cs_status_chk
    check (status in ('trial', 'ativo', 'bloqueado', 'cancelado', 'inadimplente')),
  -- Invariante completa de acesso Connect
  constraint admin_cs_acesso_ids_chk check (
    (
      acesso_connect = false
      and auth_user_id is null
      and perfil_id is null
    )
    or (
      acesso_connect = true
      and auth_user_id is not null
      and perfil_id is not null
      and auth_user_id = perfil_id
    )
  )
);

comment on table public.admin_cliente_sistemas is
  'ADMIN.2 — vínculo N:N. ON DELETE cliente CASCADE; sistema RESTRICT. acesso_connect=true exige auth_user_id=perfil_id.';

comment on column public.admin_cliente_sistemas.acesso_connect is
  'true = vínculo Connect com login (IDs obrigatórios e iguais). false = sem Auth (IDs null). Terceiro sempre false.';

create index if not exists admin_cs_cliente_idx
  on public.admin_cliente_sistemas (cliente_id);

create index if not exists admin_cs_sistema_idx
  on public.admin_cliente_sistemas (sistema_id);

create index if not exists admin_cs_status_idx
  on public.admin_cliente_sistemas (status);

create index if not exists admin_cs_auth_user_idx
  on public.admin_cliente_sistemas (auth_user_id)
  where auth_user_id is not null;

create index if not exists admin_cs_perfil_idx
  on public.admin_cliente_sistemas (perfil_id)
  where perfil_id is not null;

create index if not exists admin_cs_vencimento_idx
  on public.admin_cliente_sistemas (data_vencimento);

-- ---------------------------------------------------------------------------
-- Validação de schema existente (idempotência sem mascarar divergência)
-- ---------------------------------------------------------------------------
do $$
begin
  -- admin_clientes
  if to_regclass('public.admin_clientes') is null then
    raise exception 'ADMIN.2 FAIL: admin_clientes ausente após CREATE';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_clientes' and column_name = 'email'
  ) then
    raise exception 'ADMIN.2 FAIL: admin_clientes.email ausente (schema divergente)';
  end if;

  -- admin_sistemas.origem
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_sistemas' and column_name = 'origem'
  ) then
    raise exception 'ADMIN.2 FAIL: admin_sistemas.origem ausente (schema divergente)';
  end if;

  -- admin_cliente_sistemas.acesso_connect + IDs
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_cliente_sistemas' and column_name = 'acesso_connect'
  ) then
    raise exception 'ADMIN.2 FAIL: admin_cliente_sistemas.acesso_connect ausente (schema divergente)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_cliente_sistemas' and column_name = 'auth_user_id'
  ) then
    raise exception 'ADMIN.2 FAIL: admin_cliente_sistemas.auth_user_id ausente (schema divergente)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_cliente_sistemas' and column_name = 'perfil_id'
  ) then
    raise exception 'ADMIN.2 FAIL: admin_cliente_sistemas.perfil_id ausente (schema divergente)';
  end if;

  -- Constraint de acesso completa
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'admin_cliente_sistemas'
      and constraint_name = 'admin_cs_acesso_ids_chk'
  ) then
    -- Tabela pode ter sido criada por migration antiga sem o check novo: tenta adicionar
    begin
      alter table public.admin_cliente_sistemas
        drop constraint if exists admin_cs_auth_implica_acesso_chk;
      alter table public.admin_cliente_sistemas
        add constraint admin_cs_acesso_ids_chk check (
          (
            acesso_connect = false
            and auth_user_id is null
            and perfil_id is null
          )
          or (
            acesso_connect = true
            and auth_user_id is not null
            and perfil_id is not null
            and auth_user_id = perfil_id
          )
        );
    exception
      when others then
        raise exception 'ADMIN.2 FAIL: não foi possível garantir admin_cs_acesso_ids_chk (%). Schema divergente ou dados incompatíveis.', SQLERRM;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers updated_at (função exclusiva ADMIN.2)
-- ---------------------------------------------------------------------------
drop trigger if exists admin_clientes_updated_at on public.admin_clientes;
create trigger admin_clientes_updated_at
  before update on public.admin_clientes
  for each row execute function public.admin_set_updated_at();

drop trigger if exists admin_sistemas_updated_at on public.admin_sistemas;
create trigger admin_sistemas_updated_at
  before update on public.admin_sistemas
  for each row execute function public.admin_set_updated_at();

drop trigger if exists admin_cs_updated_at on public.admin_cliente_sistemas;
create trigger admin_cs_updated_at
  before update on public.admin_cliente_sistemas
  for each row execute function public.admin_set_updated_at();

-- ---------------------------------------------------------------------------
-- Integridade: origem do sistema vs acesso no vínculo
-- ---------------------------------------------------------------------------
create or replace function public.admin_cs_validar_acesso_connect()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_origem text;
begin
  select s.origem into v_origem
  from public.admin_sistemas s
  where s.id = new.sistema_id;

  if v_origem is null then
    raise exception 'admin_cliente_sistemas: sistema_id inválido';
  end if;

  if v_origem = 'terceiro' then
    if new.acesso_connect = true
       or new.auth_user_id is not null
       or new.perfil_id is not null then
      raise exception 'admin_cliente_sistemas: origem=terceiro exige acesso_connect=false e IDs null';
    end if;
  end if;

  if new.acesso_connect = true and v_origem is distinct from 'connect' then
    raise exception 'admin_cliente_sistemas: acesso_connect=true só é permitido para origem=connect';
  end if;

  return new;
end;
$$;

drop trigger if exists admin_cs_validar_acesso_connect on public.admin_cliente_sistemas;
create trigger admin_cs_validar_acesso_connect
  before insert or update on public.admin_cliente_sistemas
  for each row execute function public.admin_cs_validar_acesso_connect();

-- ---------------------------------------------------------------------------
-- Impede Connect → Terceiro com vínculos de acesso Auth
-- ---------------------------------------------------------------------------
create or replace function public.admin_sistemas_bloquear_origem_connect_terceiro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bloqueados integer;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.origem is not distinct from new.origem then
    return new;
  end if;

  if old.origem = 'connect' and new.origem = 'terceiro' then
    select count(*)::integer into v_bloqueados
    from public.admin_cliente_sistemas cs
    where cs.sistema_id = new.id
      and (
        cs.acesso_connect = true
        or cs.auth_user_id is not null
        or cs.perfil_id is not null
      );

    if coalesce(v_bloqueados, 0) > 0 then
      raise exception
        'admin_sistemas: não é permitido alterar origem connect→terceiro enquanto houver vínculos com acesso Connect (acesso_connect ou auth/perfil).';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists admin_sistemas_bloquear_origem_connect_terceiro on public.admin_sistemas;
create trigger admin_sistemas_bloquear_origem_connect_terceiro
  before update of origem on public.admin_sistemas
  for each row execute function public.admin_sistemas_bloquear_origem_connect_terceiro();

-- ---------------------------------------------------------------------------
-- RLS — deny-by-default (service role bypassa)
-- ---------------------------------------------------------------------------
alter table public.admin_clientes enable row level security;
alter table public.admin_sistemas enable row level security;
alter table public.admin_cliente_sistemas enable row level security;

revoke all on table public.admin_clientes from anon, authenticated;
revoke all on table public.admin_sistemas from anon, authenticated;
revoke all on table public.admin_cliente_sistemas from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed mínimo
-- ---------------------------------------------------------------------------
insert into public.admin_sistemas (slug, nome, origem, descricao, ativo)
values (
  'connect-sistema',
  'Connect Sistema',
  'connect',
  'Produto Connect Orçamento / painel SaaS atual.',
  true
)
on conflict (slug) do nothing;
