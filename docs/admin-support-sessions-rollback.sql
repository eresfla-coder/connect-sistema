-- ADMIN.4.2.2 — ROLLBACK (somente objetos 4.2 / 4.2.2)
-- SEM CASCADE. Se dependência externa existir, o DROP falha (desejado).
-- NÃO altera auth.users, perfis, sessoes_ativas, admin_*, nem admin_set_updated_at().

drop function if exists public.admin_support_iniciar_sessao(uuid, text, uuid, uuid, uuid, uuid, uuid, text, text, integer, text, text, text);
drop function if exists public.admin_support_marcar_sessao_expirada(uuid, uuid, text, text);
drop function if exists public.admin_support_marcar_expiradas_admin(uuid, text, text);

drop trigger if exists admin_support_sessions_updated_at on public.admin_support_sessions;

-- Ordem: eventos → sessões. SEM CASCADE.
drop table if exists public.admin_support_events;
drop table if exists public.admin_support_sessions;
