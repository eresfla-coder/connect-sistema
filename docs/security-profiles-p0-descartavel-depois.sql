-- Parte 2 do banco descartável. Rodar depois de security-profiles-p0.sql.
-- NÃO RODAR em produção.

DO $recusa$
BEGIN
  IF to_regclass('public.perfis') IS NULL THEN
    RAISE EXCEPTION 'public.perfis ausente; o setup descartavel nao rodou';
  END IF;
END
$recusa$;

DO $cliente_nao_escreve$
BEGIN
  UPDATE auth.sessao SET uid = '11111111-1111-4111-8111-111111111111';
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.perfis
       SET vencimento = DATE '2098-01-01'
     WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'authenticated alterou vencimento';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.perfis (id, email, ativo, status, vencimento, plano_tier)
    VALUES ('33333333-3333-4333-8333-333333333331', 'forjado@exemplo.test', true, 'ativo', DATE '2099-12-31', 'empresa');
    RAISE EXCEPTION 'authenticated inseriu perfil';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM public.perfis WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'authenticated apagou perfil';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    TRUNCATE public.perfis;
    RAISE EXCEPTION 'authenticated truncou perfis';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    TRUNCATE public.perfis;
    RAISE EXCEPTION 'anon truncou perfis';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  IF has_function_privilege('authenticated', 'public.criar_perfil()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.criar_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ou authenticated ainda executa criar_perfil';
  END IF;
  IF NOT has_function_privilege('supabase_auth_admin', 'public.criar_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'supabase_auth_admin perdeu EXECUTE em criar_perfil';
  END IF;
END
$cliente_nao_escreve$;

DO $cliente_le_so_a_propria$
DECLARE
  n int;
  venc date;
BEGIN
  UPDATE auth.sessao SET uid = '11111111-1111-4111-8111-111111111111';
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.perfis;
  IF n <> 1 THEN
    RAISE EXCEPTION 'authenticated leu % linhas, esperado 1', n;
  END IF;
  SELECT vencimento INTO venc FROM public.perfis WHERE id = '11111111-1111-4111-8111-111111111111';
  IF venc IS NULL THEN
    RAISE EXCEPTION 'authenticated nao leu o proprio vencimento';
  END IF;
END
$cliente_le_so_a_propria$;

RESET ROLE;

DO $cadastro_novo$
DECLARE
  st text;
  venc date;
BEGIN
  SET LOCAL ROLE supabase_auth_admin;
  INSERT INTO auth.users (id, email)
  VALUES ('33333333-3333-4333-8333-333333333333', 'novo@exemplo.test');
  RESET ROLE;
  SELECT status, vencimento INTO st, venc
  FROM public.perfis
  WHERE id = '33333333-3333-4333-8333-333333333333';
  IF st IS DISTINCT FROM 'teste' OR venc IS DISTINCT FROM (CURRENT_DATE + 7) THEN
    RAISE EXCEPTION 'cadastro novo nao criou teste (status=%, vencimento=%)', st, venc;
  END IF;
END
$cadastro_novo$;

INSERT INTO public.perfis (id, email, ativo, status, vencimento, plano_tier, valor_plano, status_pagamento)
VALUES ('44444444-4444-4444-8444-444444444444', 'pago2@exemplo.test', true, 'ativo', DATE '2030-01-01', 'starter', 49.90, 'pago');

DO $conflito_preserva$
DECLARE
  st text;
  venc date;
  valor numeric;
BEGIN
  SET LOCAL ROLE supabase_auth_admin;
  INSERT INTO auth.users (id, email)
  VALUES ('44444444-4444-4444-8444-444444444444', 'pago2@exemplo.test');
  RESET ROLE;
  SELECT status, vencimento, valor_plano INTO st, venc, valor
  FROM public.perfis
  WHERE id = '44444444-4444-4444-8444-444444444444';
  IF st IS DISTINCT FROM 'ativo' OR venc IS DISTINCT FROM DATE '2030-01-01' OR valor IS DISTINCT FROM 49.90 THEN
    RAISE EXCEPTION 'conflito regravou assinatura (status=%, vencimento=%, valor=%)', st, venc, valor;
  END IF;
END
$conflito_preserva$;

DO $servico_grava_pagamento$
DECLARE
  venc date;
  st text;
BEGIN
  SET LOCAL ROLE service_role;
  UPDATE public.perfis
     SET vencimento = DATE '2031-05-01',
         ultimo_pagamento = DATE '2026-10-12',
         status_pagamento = 'pago',
         status = 'ativo',
         ativo = true,
         plano_tier = 'starter',
         valor_plano = 49.90
   WHERE id = '44444444-4444-4444-8444-444444444444';
  RESET ROLE;
  SELECT vencimento, status INTO venc, st
  FROM public.perfis
  WHERE id = '44444444-4444-4444-8444-444444444444';
  IF venc IS DISTINCT FROM DATE '2031-05-01' OR st IS DISTINCT FROM 'ativo' THEN
    RAISE EXCEPTION 'service_role nao gravou o pagamento (status=%, vencimento=%)', st, venc;
  END IF;
END
$servico_grava_pagamento$;

DO $bloqueio$
DECLARE
  st text;
  ativo boolean;
BEGIN
  SET LOCAL ROLE service_role;
  UPDATE public.perfis
     SET status = 'bloqueado', ativo = false
   WHERE id = '11111111-1111-4111-8111-111111111111';
  RESET ROLE;
  UPDATE auth.sessao SET uid = '11111111-1111-4111-8111-111111111111';
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.perfis SET status = 'ativo', ativo = true WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'cliente removeu o bloqueio';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  SELECT status, perfis.ativo INTO st, ativo
  FROM public.perfis
  WHERE id = '11111111-1111-4111-8111-111111111111';
  IF st IS DISTINCT FROM 'bloqueado' OR ativo IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'bloqueio nao permaneceu (status=%, ativo=%)', st, ativo;
  END IF;
END
$bloqueio$;
