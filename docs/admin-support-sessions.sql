-- ADMIN.4.2 / 4.2.2 — Modo Suporte Connect (fundação hardened)
-- SOMENTE estrutura nova. NÃO altera auth.users, perfis, sessoes_ativas,
-- admin_clientes / admin_sistemas / admin_cliente_sistemas (exceto FKs RESTRICT).
-- Idempotente quando razoável. SEM DROP CASCADE.
-- NÃO executar automaticamente — aplicar manualmente após revisão.
--
-- 4.2.2:
--   * context_token_hash (SHA-256 hex) — NUNCA token bruto no DB
--   * unique parcial: no máx. 1 sessão não-encerrada/não-revogada por admin
--   * RPC atômica com pg_advisory_xact_lock + expiração antes do INSERT

-- ---------------------------------------------------------------------------
-- admin_support_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.admin_support_sessions (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 hex (64 chars) do token opaco do cookie. Nunca o token bruto.
  context_token_hash text not null,
  admin_user_id uuid not null,
  admin_email text not null,
  admin_cliente_id uuid not null
    references public.admin_clientes(id) on delete restrict,
  admin_cliente_sistema_id uuid not null
    references public.admin_cliente_sistemas(id) on delete restrict,
  target_auth_user_id uuid not null,
  target_perfil_id uuid not null,
  target_empresa_id uuid null,
  modo text not null,
  motivo text not null,
  iniciado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  encerrado_em timestamptz null,
  revogado_em timestamptz null,
  user_agent text null,
  ip_address text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_support_sessions_token_hash_unique unique (context_token_hash),
  constraint admin_support_sessions_token_hash_chk
    check (context_token_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_support_sessions_modo_chk
    check (modo in ('read_only')),
  constraint admin_support_sessions_motivo_chk
    check (length(trim(motivo)) >= 10 and length(motivo) <= 500),
  constraint admin_support_sessions_admin_email_chk
    check (admin_email = lower(trim(admin_email)) and length(trim(admin_email)) > 0),
  constraint admin_support_sessions_expira_depois_inicio_chk
    check (expira_em > iniciado_em)
);

comment on table public.admin_support_sessions is
  'ADMIN.4.2.2 — sessões Modo Suporte. Token bruto só no cookie; DB guarda SHA-256. Sem impersonation Auth.';

comment on column public.admin_support_sessions.context_token_hash is
  'SHA-256 hex do token do cookie httpOnly. Nunca JWT do cliente nem service role nem token bruto.';

comment on column public.admin_support_sessions.modo is
  'ADMIN.4.2: somente read_only. full support fica para fase posterior.';

comment on column public.admin_support_sessions.ip_address is
  'IP best-effort (Vercel x-forwarded-for / x-real-ip). NÃO é fator de autenticação.';

comment on column public.admin_support_sessions.revogado_em is
  'Reservado. Revogação operacional ainda NÃO implementada nesta fase.';

-- No máximo UMA linha “aberta” (não encerrada/revogada) por admin.
-- Sessões expiradas são marcadas encerrado_em DENTRO da RPC antes do INSERT,
-- liberando este slot. Predicado NÃO usa now() (imutável / válido no PG).
create unique index if not exists admin_support_sessions_uma_aberta_por_admin_uidx
  on public.admin_support_sessions (admin_user_id)
  where encerrado_em is null and revogado_em is null;

create index if not exists admin_support_sessions_admin_expira_idx
  on public.admin_support_sessions (admin_user_id, expira_em desc);

create index if not exists admin_support_sessions_target_idx
  on public.admin_support_sessions (target_auth_user_id);

create index if not exists admin_support_sessions_cliente_idx
  on public.admin_support_sessions (admin_cliente_id);

create index if not exists admin_support_sessions_vinculo_idx
  on public.admin_support_sessions (admin_cliente_sistema_id);

do $$
begin
  if to_regprocedure('public.admin_set_updated_at()') is not null then
    drop trigger if exists admin_support_sessions_updated_at on public.admin_support_sessions;
    create trigger admin_support_sessions_updated_at
      before update on public.admin_support_sessions
      for each row execute function public.admin_set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- admin_support_events
-- ---------------------------------------------------------------------------
create table if not exists public.admin_support_events (
  id uuid primary key default gen_random_uuid(),
  support_session_id uuid null
    references public.admin_support_sessions(id) on delete restrict,
  evento text not null,
  admin_user_id uuid null,
  admin_email text null,
  detalhes jsonb null,
  created_at timestamptz not null default now(),
  constraint admin_support_events_evento_chk
    check (evento in (
      'iniciado',
      'encerrado',
      'expirada',
      'tentativa_bloqueada',
      'revogada'
    ))
);

comment on table public.admin_support_events is
  'ADMIN.4.2.2 — auditoria Modo Suporte. Fonte própria (não logs_sistema).';

create index if not exists admin_support_events_session_idx
  on public.admin_support_events (support_session_id, created_at desc);

create index if not exists admin_support_events_evento_idx
  on public.admin_support_events (evento, created_at desc);

create unique index if not exists admin_support_events_expirada_unica_uidx
  on public.admin_support_events (support_session_id)
  where evento = 'expirada' and support_session_id is not null;

-- ---------------------------------------------------------------------------
-- Marcar expiradas do admin (idempotente no evento)
-- ---------------------------------------------------------------------------
create or replace function public.admin_support_marcar_expiradas_admin(
  p_admin_user_id uuid,
  p_admin_email text default null,
  p_fonte text default 'sistema'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnt integer := 0;
  v_row record;
  v_email text;
begin
  v_email := case
    when p_admin_email is null or length(trim(p_admin_email)) = 0 then null
    else lower(trim(p_admin_email))
  end;

  for v_row in
    select s.id
    from public.admin_support_sessions s
    where s.admin_user_id = p_admin_user_id
      and s.encerrado_em is null
      and s.revogado_em is null
      and s.expira_em <= now()
    for update
  loop
    update public.admin_support_sessions
      set encerrado_em = now()
      where id = v_row.id
        and encerrado_em is null;

    if found then
      v_cnt := v_cnt + 1;
      insert into public.admin_support_events (
        support_session_id, evento, admin_user_id, admin_email, detalhes
      )
      select
        v_row.id,
        'expirada',
        p_admin_user_id,
        v_email,
        jsonb_build_object('fonte', coalesce(nullif(trim(p_fonte), ''), 'sistema'))
      where not exists (
        select 1
        from public.admin_support_events e
        where e.support_session_id = v_row.id
          and e.evento = 'expirada'
      );
    end if;
  end loop;

  return v_cnt;
end;
$$;

comment on function public.admin_support_marcar_expiradas_admin(uuid, text, text) is
  'ADMIN.4.2.2 — marca sessões expiradas do admin e registra evento expirada (idempotente).';

-- ---------------------------------------------------------------------------
-- RPC atômica: iniciar sessão
-- Server-only após requireMasterAdminFromRequest.
-- p_admin_user_id = JWT user.id do Master (nunca do body do browser).
-- ---------------------------------------------------------------------------
create or replace function public.admin_support_iniciar_sessao(
  p_admin_user_id uuid,
  p_admin_email text,
  p_admin_cliente_id uuid,
  p_admin_cliente_sistema_id uuid,
  p_target_auth_user_id uuid,
  p_target_perfil_id uuid,
  p_target_empresa_id uuid,
  p_modo text,
  p_motivo text,
  p_duracao_minutos integer,
  p_context_token_hash text,
  p_user_agent text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_key bigint;
  v_ativa public.admin_support_sessions%rowtype;
  v_inicio timestamptz;
  v_expira timestamptz;
  v_session public.admin_support_sessions%rowtype;
  v_email text;
  v_motivo text;
begin
  if p_admin_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_PAYLOAD', 'error', 'admin_user_id obrigatório.');
  end if;

  v_email := lower(trim(coalesce(p_admin_email, '')));
  if length(v_email) = 0 then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_PAYLOAD', 'error', 'admin_email obrigatório.');
  end if;

  if p_modo is distinct from 'read_only' then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_MODO', 'error', 'Modo inválido nesta fase.');
  end if;

  if p_duracao_minutos is null or p_duracao_minutos not in (15, 30, 60) then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_DURACAO_INVALIDA', 'error', 'Duração inválida.');
  end if;

  v_motivo := trim(coalesce(p_motivo, ''));
  if length(v_motivo) < 10 or length(v_motivo) > 500 then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_MOTIVO_INVALIDO', 'error', 'Motivo inválido.');
  end if;

  if p_context_token_hash is null or p_context_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_TOKEN', 'error', 'Hash de contexto inválido.');
  end if;

  -- Lock por admin entre instâncias serverless
  v_lock_key := hashtextextended(p_admin_user_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  -- Liberar slot UNIQUE: expiradas não bloqueiam nova sessão
  perform public.admin_support_marcar_expiradas_admin(p_admin_user_id, v_email, 'iniciar');

  select * into v_ativa
  from public.admin_support_sessions s
  where s.admin_user_id = p_admin_user_id
    and s.encerrado_em is null
    and s.revogado_em is null
    and s.expira_em > now()
  order by s.iniciado_em desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'ok', false,
      'code', 'ADMIN_SUPPORT_SESSAO_ATIVA',
      'error', 'Já existe uma sessão de suporte ativa. Encerre-a antes de iniciar outra.',
      'support_session_id', v_ativa.id
    );
  end if;

  v_inicio := now();
  v_expira := v_inicio + make_interval(mins => p_duracao_minutos);

  insert into public.admin_support_sessions (
    context_token_hash,
    admin_user_id,
    admin_email,
    admin_cliente_id,
    admin_cliente_sistema_id,
    target_auth_user_id,
    target_perfil_id,
    target_empresa_id,
    modo,
    motivo,
    iniciado_em,
    expira_em,
    user_agent,
    ip_address
  ) values (
    p_context_token_hash,
    p_admin_user_id,
    v_email,
    p_admin_cliente_id,
    p_admin_cliente_sistema_id,
    p_target_auth_user_id,
    p_target_perfil_id,
    p_target_empresa_id,
    'read_only',
    v_motivo,
    v_inicio,
    v_expira,
    nullif(left(coalesce(p_user_agent, ''), 500), ''),
    nullif(left(coalesce(p_ip_address, ''), 80), '')
  )
  returning * into v_session;

  insert into public.admin_support_events (
    support_session_id, evento, admin_user_id, admin_email, detalhes
  ) values (
    v_session.id,
    'iniciado',
    p_admin_user_id,
    v_email,
    jsonb_build_object(
      'modo', 'read_only',
      'duracao_minutos', p_duracao_minutos,
      'admin_cliente_id', p_admin_cliente_id,
      'vinculo_id', p_admin_cliente_sistema_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_session.id,
      'admin_user_id', v_session.admin_user_id,
      'admin_email', v_session.admin_email,
      'admin_cliente_id', v_session.admin_cliente_id,
      'admin_cliente_sistema_id', v_session.admin_cliente_sistema_id,
      'modo', v_session.modo,
      'motivo', v_session.motivo,
      'iniciado_em', v_session.iniciado_em,
      'expira_em', v_session.expira_em
    )
  );
end;
$$;

comment on function public.admin_support_iniciar_sessao(
  uuid, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, text, text, text
) is
  'ADMIN.4.2.2 — inicia suporte atomicamente (advisory lock + expirar + unique). Server-only após Master guard.';

-- ---------------------------------------------------------------------------
-- Expirar sessão específica (idempotente) — /status
-- ---------------------------------------------------------------------------
create or replace function public.admin_support_marcar_sessao_expirada(
  p_session_id uuid,
  p_admin_user_id uuid,
  p_admin_email text default null,
  p_fonte text default 'status'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_support_sessions%rowtype;
  v_email text;
begin
  if p_session_id is null or p_admin_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_PAYLOAD', 'error', 'Parâmetros inválidos.');
  end if;

  select * into v_row
  from public.admin_support_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'altered', false, 'reason', 'not_found');
  end if;

  if v_row.admin_user_id is distinct from p_admin_user_id then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_SUPPORT_CONTEXTO_INVALIDO', 'error', 'Ownership inválido.');
  end if;

  if v_row.revogado_em is not null then
    return jsonb_build_object('ok', true, 'altered', false, 'reason', 'revogada');
  end if;

  if v_row.encerrado_em is not null then
    return jsonb_build_object('ok', true, 'altered', false, 'reason', 'ja_encerrada');
  end if;

  if v_row.expira_em > now() then
    return jsonb_build_object('ok', true, 'altered', false, 'reason', 'ainda_ativa');
  end if;

  update public.admin_support_sessions
    set encerrado_em = now()
    where id = p_session_id
      and encerrado_em is null;

  v_email := case
    when p_admin_email is null or length(trim(p_admin_email)) = 0 then lower(trim(v_row.admin_email))
    else lower(trim(p_admin_email))
  end;

  insert into public.admin_support_events (
    support_session_id, evento, admin_user_id, admin_email, detalhes
  )
  select
    p_session_id,
    'expirada',
    p_admin_user_id,
    v_email,
    jsonb_build_object('fonte', coalesce(nullif(trim(p_fonte), ''), 'status'), 'expira_em', v_row.expira_em)
  where not exists (
    select 1 from public.admin_support_events e
    where e.support_session_id = p_session_id and e.evento = 'expirada'
  );

  return jsonb_build_object('ok', true, 'altered', true, 'reason', 'expirada');
end;
$$;

comment on function public.admin_support_marcar_sessao_expirada(uuid, uuid, text, text) is
  'ADMIN.4.2.2 — expira sessão específica com evento idempotente (status).';

-- ---------------------------------------------------------------------------
-- Privilegios funções
-- ---------------------------------------------------------------------------
revoke all on function public.admin_support_marcar_expiradas_admin(uuid, text, text) from public;
revoke all on function public.admin_support_marcar_expiradas_admin(uuid, text, text) from anon, authenticated;
revoke all on function public.admin_support_iniciar_sessao(uuid, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, text, text, text) from public;
revoke all on function public.admin_support_iniciar_sessao(uuid, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, text, text, text) from anon, authenticated;
revoke all on function public.admin_support_marcar_sessao_expirada(uuid, uuid, text, text) from public;
revoke all on function public.admin_support_marcar_sessao_expirada(uuid, uuid, text, text) from anon, authenticated;

grant execute on function public.admin_support_marcar_expiradas_admin(uuid, text, text) to service_role;
grant execute on function public.admin_support_iniciar_sessao(uuid, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, text, text, text) to service_role;
grant execute on function public.admin_support_marcar_sessao_expirada(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS tabelas
-- ---------------------------------------------------------------------------
alter table public.admin_support_sessions enable row level security;
alter table public.admin_support_sessions force row level security;
alter table public.admin_support_events enable row level security;
alter table public.admin_support_events force row level security;

revoke all on table public.admin_support_sessions from anon, authenticated;
revoke all on table public.admin_support_events from anon, authenticated;
