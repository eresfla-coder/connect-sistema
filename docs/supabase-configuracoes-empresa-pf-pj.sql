-- Campos PF/PJ, documento e endereço completo em configuracoes_empresa
-- Executar no SQL Editor do Supabase (projeto Connect)

alter table public.configuracoes_empresa
  add column if not exists tipo_pessoa text default 'PJ',
  add column if not exists cpf text default '',
  add column if not exists cnpj text default '',
  add column if not exists cep text default '',
  add column if not exists bairro text default '';

comment on column public.configuracoes_empresa.tipo_pessoa is 'PF ou PJ';
comment on column public.configuracoes_empresa.cpf is 'CPF quando tipo_pessoa = PF';
comment on column public.configuracoes_empresa.cnpj is 'CNPJ quando tipo_pessoa = PJ';
