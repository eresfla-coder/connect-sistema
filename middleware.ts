import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const rotasPublicas = ['/login', '/publico', '/bloqueado']

  const ehPublica =
    rotasPublicas.some((rota) => pathname.startsWith(rota)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')

  if (ehPublica) {
    return NextResponse.next()
  }

  const logado = req.cookies.get('connect_auth')

  if (!logado) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}