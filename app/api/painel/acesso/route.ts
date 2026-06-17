import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  acessoBloqueado,
  avisoTrial,
  dataMaisDias,
  emailDoUsuarioAuth,
  isUsuarioAdmin,
  normalizarStatus,
} from '@/lib/access'
import { isUsuarioAdminServer } from '@/lib/access-server'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_TIMEOUT_MS = 8000

type PerfilPainel = {
  id: string
  email?: string | null
  ativo?: boolean | null
  status?: string | null
  vencimento?: string | null
  plano_tier?: string | null
  role?: string | null
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

async function consultarAdminMasterApi(request: NextRequest, token: string) {
  try {
    const origin = request.nextUrl.origin
    const res = await fetchWithTimeout(
      `${origin}/api/assinatura/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
      5000,
    )
    const payload = await res.json().catch(() => null)
    return Boolean(payload?.isAdminMaster)
  } catch {
    return false
  }
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
    const { data: perfilExistente, error } = await supabase
      .from('perfis')
      .select('id,email,ativo,status,vencimento,plano_tier,role')
      .eq('id', user.id)
      .maybeSingle<PerfilPainel>()

    let adminLogado = isUsuarioAdmin({ email: emailNormalizado, perfil: perfilExistente })
    if (!adminLogado) {
      adminLogado = isUsuarioAdminServer({ email: emailNormalizado, perfil: perfilExistente })
    }
    if (!adminLogado) {
      adminLogado = await consultarAdminMasterApi(request, token)
    }

    let perfil = perfilExistente

    if (error) {
      console.error('ERRO_PERFIL_API:', error.message)
    }

    if (!perfil) {
      const perfilNovo: PerfilPainel = {
        id: user.id,
        email: user.email ?? null,
        ativo: true,
        status: adminLogado ? 'ativo' : 'trial',
        vencimento: adminLogado ? '2099-12-31' : dataMaisDias(7).slice(0, 10),
        plano_tier: adminLogado ? 'empresa' : 'trial',
      }

      const { error: insertError } = await supabase.from('perfis').upsert([perfilNovo], { onConflict: 'id' })
      if (insertError) console.error('ERRO_CRIAR_PERFIL_API:', insertError.message)
      perfil = perfilNovo
    }

    if (!perfil) {
      return NextResponse.json({ ok: false, reason: 'sem_perfil' }, { status: 403 })
    }

    const statusNormalizado = normalizarStatus(perfil.status)
    if (statusNormalizado !== perfil.status) {
      await supabase.from('perfis').update({ status: statusNormalizado }).eq('id', user.id)
      perfil.status = statusNormalizado
    }

    if (adminLogado && (perfil.status === 'trial' || perfil.plano_tier === 'trial')) {
      await supabase
        .from('perfis')
        .update({ status: 'ativo', ativo: true, plano_tier: 'empresa', vencimento: '2099-12-31' })
        .eq('id', user.id)
      perfil.status = 'ativo'
      perfil.ativo = true
      perfil.plano_tier = 'empresa'
    }

    const vencimento = perfil.vencimento ? new Date(perfil.vencimento) : null
    const assinaturaVencida =
      !!vencimento && !Number.isNaN(vencimento.getTime()) && vencimento.getTime() < Date.now()
    const diasVencidos = assinaturaVencida
      ? Math.max(1, Math.ceil((Date.now() - vencimento.getTime()) / 86400000))
      : 0

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
