/**
 * Guards server para APIs autenticadas.
 * requireAdminFromRequest: ADMIN_EMAILS (env) ou role no perfil — ver access-server.
 * @see docs/AUTENTICACAO-V1.md
 */
import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isUsuarioAdminServer } from '@/lib/access-server'

export function getBearerToken(request: NextRequest | Request) {
  const header = request.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

export async function getUserFromRequest(request: NextRequest | Request) {
  const token = getBearerToken(request)
  if (!token) throw new Error('Sessão ausente.')
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id) throw new Error('Sessão inválida.')
  return { user: data.user, token }
}

export async function requireAdminFromRequest(request: NextRequest | Request) {
  const { user } = await getUserFromRequest(request)
  const email = String(user.email || '').toLowerCase()

  if (isUsuarioAdminServer({ email })) return user

  const supabase = getSupabaseAdmin()
  const { data: perfil } = await supabase
    .from('perfis')
    .select('role,plano_tier,status,email')
    .eq('id', user.id)
    .maybeSingle()

  if (isUsuarioAdminServer({ email, perfil })) return user

  throw new Error('Acesso negado.')
}
