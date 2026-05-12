-- Connect Sistema V96 — Correção: adicionar updated_at se não existir

-- 1. Adicionar coluna updated_at se a tabela já existe sem ela
alter table public.configuracoes_empresa 
  add column if not exists updated_at timestamptz not null default now();

-- 2. Criar índice
CREATE INDEX IF NOT EXISTS idx_configuracoes_user_id 
  ON public.configuracoes_empresa(user_id);

CREATE INDEX IF NOT EXISTS idx_configuracoes_updated_at 
  ON public.configuracoes_empresa(updated_at DESC);

-- 3. Trigger para updated_at automático
create or replace function public.set_updated_at_config()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_configuracoes_updated_at on public.configuracoes_empresa;
create trigger trg_configuracoes_updated_at
  before update on public.configuracoes_empresa
  for each row execute function public.set_updated_at_config();

-- 4. Política pública para leitura (anon) — já deve existir, mas garantir
drop policy if exists "configuracoes_select_public" on public.configuracoes_empresa;
create policy "configuracoes_select_public"
  on public.configuracoes_empresa for select
  to anon
  using (true);
