import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CANONICAL_HOST = 'www.appconnectpro.com.br'
const LEGACY_HOST = 'appconnectpro.com.br'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''

  if (host === LEGACY_HOST) {
    const url = request.nextUrl.clone()
    url.hostname = CANONICAL_HOST
    url.protocol = 'https:'
    return NextResponse.redirect(url, 308)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
