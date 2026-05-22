import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const rotasPublicas =
    pathname === '/login' ||
    pathname === '/bloqueado' ||
    pathname.startsWith('/publico') ||
    pathname.startsWith('/impressao-orcamento') ||
    pathname.startsWith('/impressao-ordem-servico') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/logo-connect.png') ||
    pathname.startsWith('/manifest.json') ||
    pathname.startsWith('/sw.js') ||
    pathname.endsWith('.zip')

  if (rotasPublicas) {
    return NextResponse.next()
  }

  const token =
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get('supabase-auth-token')?.value ||
    request.cookies.get('connect_auth')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
