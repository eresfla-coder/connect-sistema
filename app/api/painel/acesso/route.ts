/**
 * Validação de acesso ao painel (perfil, trial, bloqueio, adminLogado).
 *
 * Usar no login e layout — NÃO chamar /api/assinatura/status daqui (loop/timeout).
 * Assinatura/planos: usar /api/assinatura/status apenas em useAssinatura.
 * @see docs/AUTENTICACAO-V1.md
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  acessoBloqueado,
  avisoTrial,
  emailDoUsuarioAuth,
  normalizarStatus,
} from '@/lib/access'
import { isUsuarioAdminServer } from '@/lib/access-server'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { diasAteVencimento } from '@/lib/vigencia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_TIMEOUT_MS = 8000

/** Só colunas existentes em public.perfis: coluna inexistente faz o PostgREST falhar (42703). */
const COLUNAS_PERFIL_PAINEL = 'id,email,ativo,status,vencimento,plano_tier'

const MENSAGEM_PERFIL_INDISPONIVEL = 'Não foi possível validar seu acesso agora. Tente novamente em instantes.'
const MENSAGEM_SEM_PERFIL = 'Não encontramos o cadastro desta conta. Fale com o suporte.'

type PerfilPainel = {
  id: string
  email?: string | null
  ativo?: boolean | null
  status?: string | null
  vencimento?: string | null
  plano_tier?: string | null
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

function supabaseAnonFromToken(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase não configurado')
  return createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetchWithTimeout(input, init, API_TIMEOUT_MS),
    },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: NextRequest) {
  const token = getBearerToken(request)
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'sem_sessao' }, { status: 401 })
  }

  try {
    const supabase = supabaseAnonFromToken(token)
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    const user = userData?.user

    if (userError || !user) {
      return NextResponse.json({ ok: false, reason: 'sessao_invalida' }, { status: 401 })
    }

    const emailNormalizado = emailDoUsuarioAuth(user)
    const adminLogado = isUsuarioAdminServer({ email: emailNormalizado })

    const { data: perfilExistente, error } = await supabase
      .from('perfis')
      .select(COLUNAS_PERFIL_PAINEL)
      .eq('id', user.id)
      .maybeSingle<PerfilPainel>()

    // Falha de leitura não é "perfil ausente": nunca vira trial nem libera acesso.
    if (error) {
      console.error('ERRO_PERFIL_API:', error.code || '', error.message)
      return NextResponse.json(
        { ok: false, reason: 'perfil_indisponivel', message: MENSAGEM_PERFIL_INDISPONIVEL },
        { status: 503 },
      )
    }

    let perfil = perfilExistente

    if (!perfil && adminLogado) {
      // Admin é definido por ADMIN_EMAILS no servidor; o perfil é só apresentação.
      perfil = { id: user.id, email: user.email ?? null, ativo: true, status: 'ativo', vencimento: '2099-12-31', plano_tier: 'empresa' }
    }

    if (!perfil) {
      return NextResponse.json({ ok: false, reason: 'sem_perfil', message: MENSAGEM_SEM_PERFIL }, { status: 403 })
    }

    // Normalização e elevação de admin valem só para esta resposta. O token do cliente não grava perfis.
    const statusNormalizado = normalizarStatus(perfil.status)
    if (statusNormalizado !== perfil.status) {
      perfil = { ...perfil, status: statusNormalizado }
    }

    if (adminLogado && (perfil.status === 'trial' || perfil.plano_tier === 'trial')) {
      perfil = { ...perfil, status: 'ativo', ativo: true, plano_tier: 'empresa', vencimento: '2099-12-31' }
    }

    const diasAteFim = diasAteVencimento(perfil.vencimento)
    const assinaturaVencida = diasAteFim !== null && diasAteFim < 0
    const diasVencidos = assinaturaVencida ? Math.max(1, -(diasAteFim as number)) : 0

    const bloqueado =
      !adminLogado &&
      (assinaturaVencida || acessoBloqueado(perfil))

    return NextResponse.json({
      ok: true,
      userId: user.id,
      email: emailNormalizado,
      adminLogado,
      perfil,
      avisoTrial: adminLogado ? null : avisoTrial(perfil, { email: emailNormalizado, perfil }),
      bloqueado,
      assinaturaVencida: !adminLogado && assinaturaVencida,
      diasVencidos,
      statusNormalizado,
      isTrial:
        !adminLogado &&
        (statusNormalizado === 'teste' || perfil.plano_tier === 'trial' || perfil.status === 'trial'),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'erro_interno'
    const isTimeout = message.includes('excedeu') || message.includes('abort')
    console.error('ERRO_API_PAINEL_ACESSO:', message)
    return NextResponse.json(
      { ok: false, reason: isTimeout ? 'timeout' : 'erro_interno', message },
      { status: isTimeout ? 503 : 500 },
    )
  }
}
