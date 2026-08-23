import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import {
  classificarStatusSessao,
  parsearUserAgent,
  rotuloStatusSessao,
} from '@/lib/sessao-uso'
import { encerrarSessaoUsuario, listarSessoesAdmin } from '@/lib/sessao-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type EncerrarBody = {
  userId?: string
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req)
    const rows = await listarSessoesAdmin(200)
    const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))]

    let perfis: Array<{
      id: string
      email?: string | null
      nome_empresa?: string | null
      plano_tier?: string | null
    }> = []

    if (ids.length) {
      const { data } = await supabaseAdmin
        .from('perfis')
        .select('id,email,nome_empresa,plano_tier')
        .in('id', ids)
      perfis = (data as typeof perfis) || []
    }

    const perfilMap = new Map(perfis.map((perfil) => [perfil.id, perfil]))
    const now = Date.now()

    const sessoes = rows.map((row) => {
      const perfil = perfilMap.get(row.user_id)
      const parsed = parsearUserAgent(row.user_agent)
      const status = classificarStatusSessao({
        lastSeenAt: row.last_seen_at,
        ativo: row.ativo,
        now,
      })
      return {
        userId: row.user_id,
        email: perfil?.email || row.email || '',
        cliente: perfil?.nome_empresa || perfil?.email || row.email || 'Cliente',
        plano: perfil?.plano_tier || '',
        deviceLabel: row.device_label || parsed.dispositivo,
        navegador: row.navegador || parsed.navegador,
        sistemaOperacional: row.sistema_operacional || parsed.sistemaOperacional,
        dispositivo: row.dispositivo || parsed.dispositivo,
        ip: row.ip_address || '',
        lastSeenAt: row.last_seen_at || row.updated_at || null,
        startedAt: row.created_at || row.last_seen_at || null,
        ativo: row.ativo !== false,
        motivoEncerramento: row.motivo_encerramento || null,
        status,
        statusLabel: rotuloStatusSessao(status),
      }
    })

    const resumo = {
      online: sessoes.filter((item) => item.status === 'online').length,
      inativo: sessoes.filter((item) => item.status === 'inativo').length,
      offline: sessoes.filter((item) => item.status === 'offline').length,
      total: sessoes.length,
    }

    return NextResponse.json({ ok: true, sessoes, resumo })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar sessões.'
    const status = message === 'Acesso negado.' || message === 'Sessão ausente.' || message === 'Sessão inválida.' ? 401 : 500
    return NextResponse.json({ ok: false, message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req)
    const body = (await req.json().catch(() => ({}))) as EncerrarBody
    const userId = String(body.userId || '').trim()
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Usuário não informado.' }, { status: 400 })
    }

    const result = await encerrarSessaoUsuario({ userId, motivo: 'admin' })
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: 'Não foi possível encerrar a sessão.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, ended: result.encerrada })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao encerrar sessão.'
    const status = message === 'Acesso negado.' || message === 'Sessão ausente.' || message === 'Sessão inválida.' ? 401 : 500
    return NextResponse.json({ ok: false, message }, { status })
  }
}
