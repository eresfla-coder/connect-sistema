-- CONNECT — Garantir tipos recibo e contrato em public_documents (se existir CHECK em tipo)
-- Execute no Supabase SQL Editor somente se INSERT com tipo 'recibo' ou 'contrato' falhar por constraint.

-- Ver constraints atuais:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.public_documents'::regclass;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'public_documents'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.public_documents DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Constraint removida: %', r.conname;
  END LOOP;
END $$;

-- Coluna tipo permanece text livre (orcamento, ordem_servico, recibo, contrato).
COMMENT ON COLUMN public.public_documents.tipo IS 'orcamento | ordem_servico | recibo | contrato';
