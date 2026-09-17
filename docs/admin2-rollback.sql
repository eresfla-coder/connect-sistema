-- ADMIN.2.1 — ROLLBACK (somente objetos ADMIN.2)
-- SEM CASCADE. Se dependência externa existir, o DROP falha (desejado).
-- NÃO dropa connect_updated_at nem extensões compartilhadas.

drop trigger if exists admin_sistemas_bloquear_origem_connect_terceiro on public.admin_sistemas;
drop trigger if exists admin_cs_validar_acesso_connect on public.admin_cliente_sistemas;
drop trigger if exists admin_cs_updated_at on public.admin_cliente_sistemas;
drop trigger if exists admin_sistemas_updated_at on public.admin_sistemas;
drop trigger if exists admin_clientes_updated_at on public.admin_clientes;

drop function if exists public.admin_sistemas_bloquear_origem_connect_terceiro();
drop function if exists public.admin_cs_validar_acesso_connect();
drop function if exists public.admin_set_updated_at();

-- Ordem: filho → pais. SEM CASCADE.
drop table if exists public.admin_cliente_sistemas;
drop table if exists public.admin_sistemas;
drop table if exists public.admin_clientes;
