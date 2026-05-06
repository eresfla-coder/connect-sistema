-- CONNECT SISTEMA V87.2 — DESBLOQUEAR USUÁRIO PARA TESTE/PRODUÇÃO
-- Troque o e-mail abaixo pelo e-mail usado no login do cliente/usuário.
-- Execute no Supabase > SQL Editor.

update public.perfis
set
  ativo = true,
  status = 'ativo',
  vencimento = (current_date + interval '365 days')::date::text
where lower(email) = lower('SEU_EMAIL_AQUI@EXEMPLO.COM');

update public.empresas
set
  ativo = true,
  plano = 'ativo',
  trial_ate = now() + interval '365 days'
where lower(email) = lower('SEU_EMAIL_AQUI@EXEMPLO.COM');
