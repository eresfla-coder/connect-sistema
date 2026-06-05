-- Coluna opcional cidade_uf em configuracoes_empresa (execute se quiser salvar cidade na nuvem)
ALTER TABLE public.configuracoes_empresa
  ADD COLUMN IF NOT EXISTS cidade_uf text;
