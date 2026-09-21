/**
 * ADMIN.4.2.2 — Status do contexto (lookup por hash do cookie bruto).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireMasterAdminFromRequest } from '@/lib/api-auth'
import { CODIGO_SUPPORT_MASTER_ONLY, MSG_SUPPORT_MASTER_ONLY } from '@/lib/admin-support'
import {
  buscarSessaoPorTokenBruto,
  limparCookieSuporte,
  lerContextTokenDoRequest,
  marcarSessaoExpiradaIdempotente,
  montarStatusUx,
  sessaoSuporteEstaAtiva,
  statusAuthMasterSuporte,
} from '@/lib/admin-support-server'
import { logAdminApiError } from '@/lib/admin-api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function enriquecerNomes(row: {
  admin_cliente_id: string
  admin_cliente_sistema_id: string
}) {
  const supabase = getSupabaseAdmin()
  let clienteNome: string | null = null
  let sistemaNome: string | null = null

  const { data: cliente } = await supabase
    .from('admin_clientes')
    .select('nome,nome_empresa')
    .eq('id', row.admin_cliente_id)
    .maybeSingle()
  clienteNome =
    (cliente?.nome_empresa && String(cliente.nome_empresa)) ||
    (cliente?.nome && String(cliente.nome)) ||
    null

  const { data: vinculo } = await supabase
    .from('admin_cliente_sistemas')
    .select('sistema_id')
    .eq('id', row.admin_cliente_sistema_id)
    .maybeSingle()
  if (vinculo?.sistema_id) {
    const { data: sis } = await supabase
      .from('admin_sistemas')
      .select('nome')
      .eq('id', vinculo.sistema_id)
      .maybeSingle()
    sistemaNome = sis?.nome ? String(sis.nome) : null
  }

  return { clienteNome, sistemaNome }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireMasterAdminFromRequest(req)
    const tokenBruto = lerContextTokenDoRequest(req)

    if (!tokenBruto) {
      return NextResponse.json({ ok: true, active: false })
    }

    const { row, tabelaOk } = await buscarSessaoPorTokenBruto(tokenBruto)
    if (!tabelaOk) {
      const res = NextResponse.json({
        ok: true,
        active: false,
        aviso: 'Tabelas de suporte ainda não aplicadas.',
      })
      limparCookieSuporte(res)
      return res
    }

    if (!row) {
      const res = NextResponse.json({ ok: true, active: false })
      limparCookieSuporte(res)
      return res
    }

    if (row.admin_user_id !== user.id) {
      const res = NextResponse.json(
        {
          ok: false,
          active: false,
          code: 'ADMIN_SUPPORT_CONTEXTO_INVALIDO',
          error: 'Contexto de suporte inválido para este administrador.',
        },
        { status: 403 },
      )
      limparCookieSuporte(res)
      return res
    }

    if (row.revogado_em) {
      const res = NextResponse.json({ ok: true, active: false, reason: 'revogada' })
      limparCookieSuporte(res)
      return res
    }

    if (row.encerrado_em) {
      const res = NextResponse.json({ ok: true, active: false, reason: 'encerrada' })
      limparCookieSuporte(res)
      return res
    }

    if (!sessaoSuporteEstaAtiva(row)) {
      await marcarSessaoExpiradaIdempotente({
        sessionId: row.id,
        adminUserId: user.id,
        adminEmail: String(user.email || ''),
        fonte: 'status',
      })
      const res = NextResponse.json({ ok: true, active: false, reason: 'expirada' })
      limparCookieSuporte(res)
      return res
    }

    const nomes = await enriquecerNomes(row)
    return NextResponse.json({
      ok: true,
      ...montarStatusUx({
        row,
        clienteNome: nomes.clienteNome,
        sistemaNome: nomes.sistemaNome,
      }),
    })
  } catch (error: unknown) {
    logAdminApiError('suporte/status', error)
    const status = statusAuthMasterSuporte(error)
    return NextResponse.json(
      {
        ok: false,
        active: false,
        code: status === 403 ? CODIGO_SUPPORT_MASTER_ONLY : 'ADMIN_AUTH',
        error: status === 403 ? MSG_SUPPORT_MASTER_ONLY : 'Não autorizado.',
      },
      { status },
    )
  }
}
