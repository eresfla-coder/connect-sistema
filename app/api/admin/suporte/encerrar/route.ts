/**
 * ADMIN.4.2.2 — Encerra contexto (lookup por hash). Auth admin intacta.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireMasterAdminFromRequest } from '@/lib/api-auth'
import { CODIGO_SUPPORT_MASTER_ONLY, MSG_SUPPORT_MASTER_ONLY } from '@/lib/admin-support'
import {
  encerrarSessaoSuporte,
  limparCookieSuporte,
  lerContextTokenDoRequest,
  statusAuthMasterSuporte,
} from '@/lib/admin-support-server'
import { logAdminApiError } from '@/lib/admin-api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await requireMasterAdminFromRequest(req)
    const tokenBruto = lerContextTokenDoRequest(req)

    const result = await encerrarSessaoSuporte({
      adminUserId: user.id,
      tokenBruto,
    })

    if (result.ok === false) {
      const res = NextResponse.json(
        { ok: false, code: result.code, error: result.error },
        { status: result.status },
      )
      if (result.status === 403) limparCookieSuporte(res)
      return res
    }

    const res = NextResponse.json({
      ok: true,
      encerrado: true,
      ja_encerrada: result.jaEncerrada,
      support_session_id: result.sessionId,
      auth_admin_intacta: true,
    })
    limparCookieSuporte(res)
    return res
  } catch (error: unknown) {
    logAdminApiError('suporte/encerrar', error)
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
