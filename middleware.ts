import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const rotasPublicas = [
    '/login',
    '/bloqueado',
    '/favicon.ico',
    '/logo-connect.png',
    '/logo-connect.svg',
    '/manifest.json',
  ]

  const segmentosPublicos = [
    '/publico',
    '/view',
    '/visualizar',
    '/impressao-orcamento',
    '/impressao-ordem-servico',
    '/_next',
  ]

  const rotaLivre =
    rotasPublicas.includes(pathname) ||
    segmentosPublicos.some((rota) => pathname.startsWith(rota))

  if (rotaLivre) {
    return NextResponse.next()
  }

  const temCookieSupabase = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))

  const token =
    request.cookies.get('connect_auth')?.value ||
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get('supabase-auth-token')?.value ||
    (temCookieSupabase ? 'supabase-cookie' : '')

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}