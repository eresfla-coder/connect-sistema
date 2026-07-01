/**
 * Gate de rotas protegidas. Exige cookie + refreshSession (1,5s max).
 * /api/* é público no matcher lógico (isPublicPath) — auth fica nas route handlers.
 * @see docs/AUTENTICACAO-V1.md
 */
import { NextResponse, type NextRequest } from 'next/server'
import {
  hasSupabaseAuthCookie,
  isDemoCookie,
  isMaintenanceExempt,
  isProtectedPainelPath,
  isPublicPath,
  refreshSessionWithTimeout,
} from '@/lib/middleware-auth'

const CANONICAL_HOST = 'www.appconnectpro.com.br'
const LEGACY_HOST = 'appconnectpro.com.br'

function redirectTo(request: NextRequest, pathname: string, query?: Record<string, string>) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  if (query) {
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value))
  }
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''

  if (host === LEGACY_HOST) {
    const url = request.nextUrl.clone()
    url.hostname = CANONICAL_HOST
    url.protocol = 'https:'
    return NextResponse.redirect(url, 308)
  }

  const { pathname } = request.nextUrl

  if (isMaintenanceExempt(pathname) || isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (!isProtectedPainelPath(pathname)) {
    return NextResponse.next()
  }

  if (isDemoCookie(request)) {
    return NextResponse.next()
  }

  if (!hasSupabaseAuthCookie(request)) {
    if (pathname.startsWith('/login')) return NextResponse.next()
    return redirectTo(request, '/login', { redirect: pathname })
  }

  const session = await refreshSessionWithTimeout(request)

  if (session.status === 'timeout') {
    return redirectTo(request, '/manutencao', { from: pathname })
  }

  if (session.status === 'invalid') {
    return redirectTo(request, '/login', { redirect: pathname, motivo: 'sessao' })
  }

  return session.response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
