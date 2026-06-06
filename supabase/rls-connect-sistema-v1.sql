-- Connect Sistema V1.1 — RLS multi-tenant (execute no Supabase SQL Editor)
-- Idempotente quando possível. Requer coluna user_id uuid REFERENCES auth.users(id) nas tabelas.

-- ============================================================
-- clientes.user_id
-- ============================================================
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes (user_id);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_owner_all ON public.clientes;
CREATE POLICY clientes_owner_all ON public.clientes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- orcamentos
-- ============================================================
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orcamentos_owner_all ON public.orcamentos;
CREATE POLICY orcamentos_owner_all ON public.orcamentos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ordens_servico
-- ============================================================
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ordens_servico_owner_all ON public.ordens_servico;
CREATE POLICY ordens_servico_owner_all ON public.ordens_servico
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- connect_storage
-- ============================================================
ALTER TABLE public.connect_storage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connect_storage_owner_all ON public.connect_storage;
CREATE POLICY connect_storage_owner_all ON public.connect_storage
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- configuracoes_empresa
-- ============================================================
ALTER TABLE public.configuracoes_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS configuracoes_empresa_owner_all ON public.configuracoes_empresa;
CREATE POLICY configuracoes_empresa_owner_all ON public.configuracoes_empresa
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- contratos
-- ============================================================
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratos_owner_all ON public.contratos;
CREATE POLICY contratos_owner_all ON public.contratos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- public_documents — leitura pública via service_role nas APIs; dono pode ler os seus
-- ============================================================
ALTER TABLE public.public_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_documents_owner_select ON public.public_documents;
CREATE POLICY public_documents_owner_select ON public.public_documents
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS public_documents_owner_write ON public.public_documents;
CREATE POLICY public_documents_owner_write ON public.public_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS public_documents_owner_update ON public.public_documents;
CREATE POLICY public_documents_owner_update ON public.public_documents
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- perfis — usuário só lê/atualiza o próprio perfil (campos sensíveis via API admin)
-- ============================================================
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfis_self_select ON public.perfis;
CREATE POLICY perfis_self_select ON public.perfis
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS perfis_self_update ON public.perfis;
CREATE POLICY perfis_self_update ON public.perfis
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- assinaturas / pagamentos
-- ============================================================
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assinaturas_owner_all ON public.assinaturas;
CREATE POLICY assinaturas_owner_all ON public.assinaturas
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagamentos_owner_select ON public.pagamentos;
CREATE POLICY pagamentos_owner_select ON public.pagamentos
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pagamentos_owner_insert ON public.pagamentos;
CREATE POLICY pagamentos_owner_insert ON public.pagamentos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- APIs com service_role ignoram RLS (admin, webhooks, public-docs server-side).
