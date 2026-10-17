-- Reversão de public.cadastros_publicos.
-- Não altera public.criar_perfil, auth.users.on_user_create, perfis,
-- pagamentos, assinaturas nem a carteira admin_*.

DROP TRIGGER IF EXISTS retirar_cadastro_publico_admin ON auth.users;
DROP TRIGGER IF EXISTS registrar_cadastro_publico ON auth.users;
DROP FUNCTION IF EXISTS public.retirar_cadastro_publico_admin();
DROP FUNCTION IF EXISTS public.registrar_cadastro_publico();
DROP TABLE IF EXISTS public.cadastros_publicos;
