-- ============================================
-- CONNECT SISTEMA — Ordens de Serviço sync (ALTER only)
-- Caminho: supabase/migracao-ordens-servico-sync-alter.sql
-- Chave local: connect_ordens_servico_salvas
-- NÃO apaga tabela nem dados existentes
-- ============================================

-- 1) Garantir tabela base (se ambiente novo, sem v97 aplicada)
CREATE TABLE IF NOT EXISTS public.ordens_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero text NOT NULL DEFAULT '',
  equipamento text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Aberta',
  valor numeric(12,2) NOT NULL DEFAULT 0,
  entrada numeric(12,2) NOT NULL DEFAULT 0,
  saldo numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Colunas novas para sync (idempotente)
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS local_id text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS cliente text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'Média';
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS aprovado boolean NOT NULL DEFAULT false;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Backfill a partir das colunas legadas v97
UPDATE public.ordens_servico
SET cliente = COALESCE(NULLIF(TRIM(cliente), ''), cliente_nome, '')
WHERE COALESCE(NULLIF(TRIM(cliente), ''), '') = '';

UPDATE public.ordens_servico
SET telefone = COALESCE(NULLIF(TRIM(telefone), ''), cliente_telefone, '')
WHERE COALESCE(NULLIF(TRIM(telefone), ''), '') = '';

UPDATE public.ordens_servico
SET aprovado = true
WHERE aprovado = false
  AND LOWER(COALESCE(status, '')) IN ('aprovada', 'concluída', 'concluida', 'finalizada');

-- 4) Índices
CREATE INDEX IF NOT EXISTS idx_os_user_id ON public.ordens_servico(user_id);
CREATE INDEX IF NOT EXISTS idx_os_numero ON public.ordens_servico(numero);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ordens_servico_user_local_id
  ON public.ordens_servico(user_id, local_id)
  WHERE local_id IS NOT NULL;

-- 5) Trigger updated_at (reutiliza função v97 se existir)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_os_updated_at ON public.ordens_servico;
CREATE TRIGGER trg_os_updated_at
  BEFORE UPDATE ON public.ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6) RLS por user_id (idempotente)
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'os_select_own'
  ) THEN
    CREATE POLICY "os_select_own" ON public.ordens_servico
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'os_insert_own'
  ) THEN
    CREATE POLICY "os_insert_own" ON public.ordens_servico
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'os_update_own'
  ) THEN
    CREATE POLICY "os_update_own" ON public.ordens_servico
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'os_delete_own'
  ) THEN
    CREATE POLICY "os_delete_own" ON public.ordens_servico
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
