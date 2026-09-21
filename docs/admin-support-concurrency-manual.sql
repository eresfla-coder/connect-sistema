-- ADMIN.4.2.2 — Procedimento MANUAL de concorrência (NÃO executar automaticamente)
-- Pré-requisito: docs/admin-support-sessions.sql já aplicado + verify OK.
-- Usar service_role / SQL editor com cuidado. Não usar em produção com dados reais
-- sem janela controlada.
--
-- Substituir placeholders:
--   :admin_id   uuid do Master
--   :email      e-mail do Master
--   :cliente_id / :vinculo_id / :auth_id / :perfil_id  de um Connect elegível
--   :hash_a / :hash_b  dois SHA-256 hex distintos (64 chars)

-- A) Duas chamadas “quase” paralelas (rodar em duas abas/sessões SQL):
-- select public.admin_support_iniciar_sessao(
--   :admin_id, :email, :cliente_id, :vinculo_id, :auth_id, :perfil_id, null,
--   'read_only', 'Teste concorrência Axxxxxxxxxxx', 15, :hash_a, null, null
-- );
-- select public.admin_support_iniciar_sessao(
--   :admin_id, :email, :cliente_id, :vinculo_id, :auth_id, :perfil_id, null,
--   'read_only', 'Teste concorrência Bxxxxxxxxxxx', 15, :hash_b, null, null
-- );
-- Esperado: uma retorna ok=true; a outra code=ADMIN_SUPPORT_SESSAO_ATIVA.

-- B) Contagem: no máximo 1 aberta por admin
-- select count(*) from public.admin_support_sessions
-- where admin_user_id = :admin_id and encerrado_em is null and revogado_em is null
--   and expira_em > now();
-- Esperado: 1

-- C) Expirada não bloqueia
-- update public.admin_support_sessions
--   set expira_em = now() - interval '1 minute', encerrado_em = null
-- where id = :session_id_existente;
-- Depois chamar iniciar_sessao de novo com novo hash.
-- Esperado: ok=true; evento expirada idempotente (1 linha).

-- D) Limpeza de teste: encerrar sessões de teste e NÃO deixar lixo em prod.
