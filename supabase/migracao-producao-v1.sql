-- Connect Sistema V1.0 — Backup, logs e RLS
-- Execute no SQL Editor do Supabase (idempotente quando possível)

-- ============================================================
-- backups_usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS public.backups_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  versao text NOT NULL DEFAULT '1.0',
  origem text NOT NULL DEFAULT 'manual',
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backups_usuario_user_created
  ON public.backups_usuario (user_id, created_at DESC);

ALTER TABLE public.backups_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backups_usuario_owner_select ON public.backups_usuario;
CREATE POLICY backups_usuario_owner_select ON public.backups_usuario
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS backups_usuario_owner_insert ON public.backups_usuario;
CREATE POLICY backups_usuario_owner_insert ON public.backups_usuario
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS backups_usuario_owner_delete ON public.backups_usuario;
CREATE POLICY backups_usuario_owner_delete ON public.backups_usuario
  FOR DELETE USING (auth.uid() = user_id);

-- Admin via service_role (APIs) ignora RLS

-- ============================================================
-- logs_sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS public.logs_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acao text NOT NULL,
  modulo text,
  referencia_id text,
  detalhes jsonb
);

CREATE INDEX IF NOT EXISTS idx_logs_sistema_user_created
  ON public.logs_sistema (user_id, created_at DESC);

ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logs_sistema_owner_select ON public.logs_sistema;
CREATE POLICY logs_sistema_owner_select ON public.logs_sistema
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS logs_sistema_owner_insert ON public.logs_sistema;
CREATE POLICY logs_sistema_owner_insert ON public.logs_sistema
  FOR INSERT WITH CHECK (auth.uid() = user_id);
