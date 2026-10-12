-- SECURITY.PROFILES.P0 — leitura
-- Somente SELECT. Não altera privilégio, função, policy nem dados.
-- Rodar no SQL Editor e guardar a saída inteira antes de qualquer correção.
-- O rollback da função deve usar o pg_get_functiondef desta saída se ele
-- diferir de docs/security-profiles-p0-rollback.sql.

SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'perfis';

SELECT pol.polname, pol.polcmd, pol.polpermissive,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'perfis'
ORDER BY pol.polname;

SELECT grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'perfis'
ORDER BY 1, 2;

SELECT grantee, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'perfis'
ORDER BY 1, 2, 3;

SELECT member.rolname AS membro, granted.rolname AS papel_herdado
FROM pg_auth_members m
JOIN pg_roles member ON member.oid = m.member
JOIN pg_roles granted ON granted.oid = m.roleid
WHERE member.rolname IN ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
ORDER BY 1, 2;

SELECT a.attname, pg_get_expr(ad.adbin, ad.adrelid) AS default_expr, a.attnotnull
FROM pg_attribute a
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE a.attrelid = 'public.perfis'::regclass
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

SELECT p.oid::regprocedure AS assinatura,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig,
       pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'criar_perfil';

SELECT n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND p.proname = 'criar_perfil';
