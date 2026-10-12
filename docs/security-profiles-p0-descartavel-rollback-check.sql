-- Parte 3 do banco descartável. Rodar depois do rollback. NÃO RODAR em produção.

DO $furo_voltou$
BEGIN
  UPDATE auth.sessao SET uid = '33333333-3333-4333-8333-333333333333';
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.perfis
     SET vencimento = DATE '2099-12-31', status = 'ativo', ativo = true
   WHERE id = '33333333-3333-4333-8333-333333333333';
END
$furo_voltou$;

DO $confirma$
DECLARE
  venc date;
  st text;
BEGIN
  SELECT vencimento, status INTO venc, st
  FROM public.perfis
  WHERE id = '33333333-3333-4333-8333-333333333333';
  IF venc IS DISTINCT FROM DATE '2099-12-31' OR st IS DISTINCT FROM 'ativo' THEN
    RAISE EXCEPTION 'rollback nao devolveu UPDATE ao cliente (status=%, vencimento=%)', st, venc;
  END IF;
END
$confirma$;

INSERT INTO public.perfis (id, email, ativo, status, vencimento, plano_tier)
VALUES ('55555555-5555-4555-8555-555555555555', 'pago3@exemplo.test', true, 'ativo', DATE '2032-01-01', 'pro');

SET ROLE supabase_auth_admin;
INSERT INTO auth.users (id, email) VALUES ('55555555-5555-4555-8555-555555555555', 'pago3@exemplo.test');
RESET ROLE;

DO $reset_voltou$
DECLARE
  st text;
  venc date;
BEGIN
  SELECT status, vencimento INTO st, venc
  FROM public.perfis
  WHERE id = '55555555-5555-4555-8555-555555555555';
  IF st IS DISTINCT FROM 'teste' OR venc IS DISTINCT FROM (CURRENT_DATE + 7) THEN
    RAISE EXCEPTION 'rollback nao devolveu o ON CONFLICT DO UPDATE (status=%, vencimento=%)', st, venc;
  END IF;
END
$reset_voltou$;
