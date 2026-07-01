/**
 * Auth no edge middleware — cookies SSR + fail-fast 1,5s.
 * Pareado com lib/supabase.ts (createBrowserClient).
 * @see docs/AUTENTICACAO-V1.md
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export const MIDDLEWARE_AUTH_TIMEOUT_MS = 1500
export const DEMO_COOKIE = 'connect_demo_ativo'

const PUBLIC_PREFIXES = [
  '/login',
  '/reset-senha',
  '/manutencao',
  '/bloqueado',
  '/sessao-bloqueada',
  '/view/',
  '/visualizar/',
  '/pagar/',
  '/impressao-',
  '/api/',
  '/_next/',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/icons/',
]

const PUBLIC_EXACT = new Set(['/', '/pagamento', '/teste-supabase', '/conta', '/painel-cliente'])

export function isDemoCookie(request: NextRequest) {
  return request.cookies.get(DEMO_COOKIE)?.value === 'sim'
}

export function isMaintenanceExempt(pathname: string) {
  return pathname === '/manutencao' || pathname.startsWith('/api/health')
}

export function isPublicPath(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function isProtectedPainelPath(pathname: string) {
  if (isPublicPath(pathname)) return false
  if (pathname.startsWith('/admin')) return true

  const painelRoots = [
    '/dashboard',
    '/orcamentos',
    '/ordens-servico',
    '/clientes',
    '/produtos',
    '/financeiro',
    '/crm',
    '/assinatura',
    '/planos',
    '/boas-vindas',
    '/configuracoes',
    '/contratos',
    '/recibos',
    '/recibo-avulso',
    '/connect-ai',
    '/automacoes',
    '/categorias',
    '/formas-pagamento',
    '/vendas',
  ]

  return painelRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

/** Detecta cookie Supabase sem rede. Deve existir após login com createBrowserClient. */
export function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name, value }) => {
    if (!name.includes('-auth-token')) return false
    const trimmed = String(value || '').trim()
    return trimmed.length > 8 && trimmed !== '[]' && trimmed !== 'null'
  })
}

type SessionRefreshResult =
  | { status: 'ok'; response: NextResponse }
  | { status: 'timeout' }
  | { status: 'invalid' }

/**
 * Atualiza cookies de sessão via anon key — sem service_role, sem perfil/plano.
 * Aborta em MIDDLEWARE_AUTH_TIMEOUT_MS para nunca estourar o limite da Vercel.
 */
export async function refreshSessionWithTimeout(
  request: NextRequest,
  timeoutMs = MIDDLEWARE_AUTH_TIMEOUT_MS,
): Promise<SessionRefreshResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 'ok', response: NextResponse.next({ request }) }
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const authResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<{ data: { session: null }; error: { message: 'middleware_timeout' } }>((resolve) => {
      setTimeout(
        () => resolve({ data: { session: null }, error: { message: 'middleware_timeout' } }),
        timeoutMs,
      )
    }),
  ])

  if (authResult.error?.message === 'middleware_timeout') {
    return { status: 'timeout' }
  }

  if (authResult.error || !authResult.data.session?.user) {
    return { status: 'invalid' }
  }

  return { status: 'ok', response }
}
