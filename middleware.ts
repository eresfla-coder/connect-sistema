import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const searchParams = request.nextUrl.searchParams
  const reciboPublico =
    pathname === '/recibo-avulso' &&
    searchParams.get('preview') === '1' &&
    Boolean(searchParams.get('id')) &&
    Boolean(searchParams.get('token'))

  // ROTAS LIVRES (SEM LOGIN)
  const rotasPublicas =
    pathname === '/login' ||
    pathname === '/bloqueado' ||
    reciboPublico ||
    pathname.startsWith('/publico') ||
    pathname.startsWith('/impressao-orcamento') ||
    pathname.startsWith('/impressao-ordem-servico') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/logo-connect.png') ||
    pathname.startsWith('/manifest.json')

  if (rotasPublicas) {
    return NextResponse.next()
  }

  // COOKIE/TOKEN DE AUTENTICAÇÃO
  const token =
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get('supabase-auth-token')?.value

  // SE NÃO ESTIVER LOGADO, REDIRECIONA
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}