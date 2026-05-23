import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/redefinir-senha'

  const destinoSeguro = next.startsWith('/') && !next.startsWith('//') ? next : '/redefinir-senha'

  if (!code) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('erro', 'link-invalido')
    return NextResponse.redirect(loginUrl)
  }

  try {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      const loginUrl = new URL('/login', requestUrl.origin)
      loginUrl.searchParams.set('erro', 'sessao-recuperacao')
      return NextResponse.redirect(loginUrl)
    }

    const redirectUrl = new URL(destinoSeguro, requestUrl.origin)
    redirectUrl.searchParams.set('recuperacao', '1')
    return NextResponse.redirect(redirectUrl)
  } catch {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('erro', 'auth-callback')
    return NextResponse.redirect(loginUrl)
  }
}
