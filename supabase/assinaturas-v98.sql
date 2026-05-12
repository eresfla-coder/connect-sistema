-- Connect Sistema V98 — Sistema de Assinatura e Cobrança

create extension if not exists pgcrypto;

-- ============================================
-- TABELA DE ASSINATURAS
-- ============================================
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- Plano
  plano text not null default 'trial', -- trial, mensal, anual, lifetime
  status text not null default 'ativa', -- ativa, trial, vencida, cancelada, suspensa
  
  -- Período
  data_inicio timestamptz not null default now(),
  data_fim timestamptz,
  data_trial_fim timestamptz,
  
  -- Pagamento
  valor_mensal numeric(12,2) not null default 99.00,
  valor_anual numeric(12,2) not null default 999.00,
  desconto_percentual integer not null default 0,
  
  -- Gateway
  gateway text not null default 'mercado_pago', -- mercado_pago, stripe, pix_manual
  gateway_assinatura_id text not null default '', -- ID da assinatura no gateway
  gateway_cliente_id text not null default '', -- ID do cliente no gateway
  
  -- Controle
  trial_dias integer not null default 7,
  dias_aviso_antes integer not null default 3,
  renovacao_automatica boolean not null default true,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_assinaturas_user_id on public.assinaturas(user_id);

-- RLS
alter table public.assinaturas enable row level security;

create policy "assinaturas_select_own" on public.assinaturas for select to authenticated using (auth.uid() = user_id);
create policy "assinaturas_insert_own" on public.assinaturas for insert to authenticated with check (auth.uid() = user_id);
create policy "assinaturas_update_own" on public.assinaturas for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Política para admin ver todas (para painel administrativo)
create policy "assinaturas_select_admin" on public.assinaturas for select to authenticated using (
  auth.uid() in (select user_id from public.profiles where role = 'admin')
);

-- Trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assinaturas_updated_at on public.assinaturas;
create trigger trg_assinaturas_updated_at before update on public.assinaturas for each row execute function public.set_updated_at();

-- ============================================
-- TABELA DE PAGAMENTOS (histórico)
-- ============================================
create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assinatura_id uuid references public.assinaturas(id),
  
  -- Dados do pagamento
  valor numeric(12,2) not null,
  status text not null default 'pendente', -- pendente, pago, falhou, reembolsado
  metodo text not null default 'pix', -- pix, cartao, boleto
  
  -- Gateway
  gateway text not null default 'mercado_pago',
  gateway_pagamento_id text not null default '',
  gateway_url text not null default '', -- URL para pagar
  
  -- Datas
  data_vencimento timestamptz,
  data_pagamento timestamptz,
  
  -- Detalhes
  descricao text not null default '',
  
  created_at timestamptz not null default now()
);

create index if not exists idx_pagamentos_user_id on public.pagamentos(user_id);
create index if not exists idx_pagamentos_status on public.pagamentos(status);

-- RLS
alter table public.pagamentos enable row level security;

create policy "pagamentos_select_own" on public.pagamentos for select to authenticated using (auth.uid() = user_id);
create policy "pagamentos_insert_own" on public.pagamentos for insert to authenticated with check (auth.uid() = user_id);

-- ============================================
-- FUNÇÃO: VERIFICAR SE USUÁRIO TEM ACESSO
-- ============================================
create or replace function public.user_tem_acesso(p_user_id uuid)
returns boolean as $$
declare
  v_assinatura public.assinaturas%rowtype;
begin
  select * into v_assinatura
  from public.assinaturas
  where user_id = p_user_id
  order by created_at desc
  limit 1;
  
  -- Se não tem assinatura, permite (novo usuário = trial)
  if not found then
    return true;
  end if;
  
  -- Se está ativa ou em trial
  if v_assinatura.status in ('ativa', 'trial') then
    -- Verifica se não venceu
    if v_assinatura.data_fim is not null and v_assinatura.data_fim < now() then
      return false;
    end if;
    return true;
  end if;
  
  return false;
end;
$$ language plpgsql security definer;

-- ============================================
-- FUNÇÃO: CRIAR ASSINATURA TRIAL AUTOMÁTICA
-- ============================================
create or replace function public.criar_trial_automatico()
returns trigger as $$
begin
  insert into public.assinaturas (
    user_id,
    plano,
    status,
    data_trial_fim,
    trial_dias
  ) values (
    new.id,
    'trial',
    'trial',
    now() + interval '7 days',
    7
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger para criar trial quando usuário se registra
drop trigger if exists trg_criar_trial on auth.users;
create trigger trg_criar_trial
  after insert on auth.users
  for each row execute function public.criar_trial_automatico();

-- ============================================
-- PERMISSÕES
-- ============================================
grant usage on schema public to authenticated;
grant select, insert, update on public.assinaturas to authenticated;
grant select, insert on public.pagamentos to authenticated;
grant execute on function public.user_tem_acesso(uuid) to authenticated;
