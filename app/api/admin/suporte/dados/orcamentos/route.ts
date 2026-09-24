/**
 * ADMIN.4.3.2 — Gateway piloto read-only: lista orçamentos do tenant da support session.
 * SOMENTE GET. ZERO write. Tenant somente da sessão validada.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireMasterAdminFromRequest } from '@/lib/api-auth'
import { CODIGO_SUPPORT_MASTER_ONLY, MSG_SUPPORT_MASTER_ONLY } from '@/lib/admin-support'
import { limparCookieSuporte, statusAuthMasterSuporte } from '@/lib/admin-support-server'
import {
  headersGatewayNoStore,
  listarOrcamentosSuporteReadOnly,
  parseOrcamentosGatewayQuery,
  resolverContextoGatewayOrcamentos,
} from '@/lib/admin-support-gateway'
import { logAdminApiError } from '@/lib/admin-api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonGateway(body: unknown, init?: { status?: number; limparCookie?: boolean }) {
  const res = NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: headersGatewayNoStore(),
  })
  if (init?.limparCookie) limparCookieSuporte(res)
  return res
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireMasterAdminFromRequest(req)

    const parsed = parseOrcamentosGatewayQuery(req.nextUrl.searchParams)
    if (parsed.ok === false) {
      return jsonGateway(
        { ok: false, code: parsed.code, error: parsed.error },
        { status: parsed.httpStatus },
      )
    }

    const ctx = await resolverContextoGatewayOrcamentos(req, user.id)
    if (ctx.ok === false) {
      return jsonGateway(
        { ok: false, code: ctx.code, error: ctx.error },
        { status: ctx.httpStatus, limparCookie: ctx.limparCookie },
      )
    }

    const lista = await listarOrcamentosSuporteReadOnly({
      targetAuthUserId: ctx.targetAuthUserId,
      limit: parsed.limit,
      offset: parsed.offset,
      status: parsed.status,
    })

    if (lista.ok === false) {
      return jsonGateway(
        { ok: false, code: lista.code, error: lista.error },
        { status: lista.httpStatus },
      )
    }

    return jsonGateway({
      ok: true,
      data: lista.data,
      pagination: lista.pagination,
    })
  } catch (error: unknown) {
    logAdminApiError('suporte/dados/orcamentos', error)
    const status = statusAuthMasterSuporte(error)
    return jsonGateway(
      {
        ok: false,
        code: status === 403 ? CODIGO_SUPPORT_MASTER_ONLY : 'ADMIN_AUTH',
        error: status === 403 ? MSG_SUPPORT_MASTER_ONLY : 'Não autorizado.',
      },
      { status },
    )
  }
}
