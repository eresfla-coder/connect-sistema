/**
 * ADMIN.4.2.2 — Inicia contexto de Modo Suporte (read_only) via RPC atômica.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireMasterAdminFromRequest } from '@/lib/api-auth'
import { ADMIN_SUPPORT_MODO_FASE, CODIGO_SUPPORT_MASTER_ONLY, MSG_SUPPORT_MASTER_ONLY } from '@/lib/admin-support'
import {
  aplicarCookieSuporte,
  criarSessaoSuporte,
  resolverIpSuporteConfiavel,
  statusAuthMasterSuporte,
} from '@/lib/admin-support-server'
import { logAdminApiError } from '@/lib/admin-api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  admin_cliente_id?: string
  vinculo_id?: string
  motivo?: string
  duracao_minutos?: number
  /** Ignorado — servidor força read_only. */
  modo?: string
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireMasterAdminFromRequest(req)
    const email = String(user.email || '').trim().toLowerCase()
    const body = (await req.json().catch(() => ({}))) as Body

    const adminClienteId = String(body.admin_cliente_id || '').trim()
    const vinculoId = String(body.vinculo_id || '').trim()
    if (!adminClienteId || !vinculoId) {
      return NextResponse.json(
        {
          ok: false,
          code: 'ADMIN_SUPPORT_PAYLOAD',
          error: 'Informe admin_cliente_id e vinculo_id.',
        },
        { status: 400 },
      )
    }

    void body.modo

    const result = await criarSessaoSuporte({
      adminUserId: user.id,
      adminEmail: email,
      adminClienteId,
      vinculoId,
      motivo: body.motivo,
      duracaoMinutos: body.duracao_minutos,
      userAgent: req.headers.get('user-agent'),
      ipAddress: resolverIpSuporteConfiavel(req),
    })

    if (result.ok === false) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.error },
        { status: result.status },
      )
    }

    const res = NextResponse.json({
      ok: true,
      support_session_id: result.session.id,
      modo: ADMIN_SUPPORT_MODO_FASE,
      motivo: result.session.motivo,
      iniciado_em: result.session.iniciado_em,
      expira_em: result.session.expira_em,
      cliente: { id: result.session.admin_cliente_id, nome: result.clienteNome },
      sistema: {
        vinculo_id: result.session.admin_cliente_sistema_id,
        nome: result.sistemaNome,
      },
      aviso:
        'Contexto de suporte criado (read_only). Acesso a dados do cliente será ADMIN.4.3.',
    })

    aplicarCookieSuporte(res, result.tokenBruto, result.session.expira_em)
    return res
  } catch (error: unknown) {
    logAdminApiError('suporte/iniciar', error)
    const status = statusAuthMasterSuporte(error)
    return NextResponse.json(
      {
        ok: false,
        code: status === 403 ? CODIGO_SUPPORT_MASTER_ONLY : 'ADMIN_AUTH',
        error: status === 403 ? MSG_SUPPORT_MASTER_ONLY : 'Não autorizado.',
      },
      { status },
    )
  }
}
