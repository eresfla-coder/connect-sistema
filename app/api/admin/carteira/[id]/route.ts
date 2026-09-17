import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import {
  COLS_ADMIN_CLIENTE,
  logAdminApiError,
  respostaErroPostgresAmigavel,
  statusAuthAdmin,
} from '@/lib/admin-api-errors'
import { normalizarEmailAdmin } from '@/lib/admin-carteira'
import {
  probeAdminTables,
  respostaAdminTablesNotReady,
  respostaAdminTablesProbeError,
} from '@/lib/admin-tables'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PatchBody = {
  nome?: string
  nome_empresa?: string
  email?: string
  telefone?: string
  documento?: string
  observacoes?: string
  ativo?: boolean
}

type Ctx = { params: Promise<{ id: string }> }

async function gateTables() {
  const probe = await probeAdminTables()
  if (probe.status === 'ready') return null
  if (probe.status === 'missing') {
    const r = respostaAdminTablesNotReady()
    return NextResponse.json(r.body, { status: r.status })
  }
  const r = respostaAdminTablesProbeError(probe)
  return NextResponse.json(r.body, { status: r.status })
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const { id } = await ctx.params
    const { data, error } = await supabaseAdmin
      .from('admin_clientes')
      .select(
        `
        ${COLS_ADMIN_CLIENTE},
        vinculos:admin_cliente_sistemas(
          id,status,valor,dia_vencimento,data_vencimento,acesso_connect,auth_user_id,perfil_id,observacoes,
          sistema:admin_sistemas(id,slug,nome,origem,ativo)
        )
      `,
      )
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logAdminApiError('carteira/[id] GET', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }
    if (!data) {
      return NextResponse.json({ ok: false, code: 'ADMIN_NOT_FOUND', error: 'Cliente administrativo não encontrado.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, cliente: data })
  } catch (error: unknown) {
    logAdminApiError('carteira/[id] GET', error)
    return NextResponse.json({ ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' }, { status: statusAuthAdmin(error) })
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const { id } = await ctx.params
    const body = (await req.json()) as PatchBody
    const updates: Record<string, unknown> = {}

    if (body.nome !== undefined) updates.nome = String(body.nome || '').trim() || null
    if (body.nome_empresa !== undefined) updates.nome_empresa = String(body.nome_empresa || '').trim() || null
    if (body.email !== undefined) updates.email = normalizarEmailAdmin(body.email) || null
    if (body.telefone !== undefined) updates.telefone = String(body.telefone || '').replace(/\D/g, '') || null
    if (body.documento !== undefined) updates.documento = String(body.documento || '').trim() || null
    if (body.observacoes !== undefined) updates.observacoes = String(body.observacoes || '').trim() || null
    if (body.ativo !== undefined) updates.ativo = Boolean(body.ativo)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Nenhum dado para atualizar.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('admin_clientes')
      .update(updates)
      .eq('id', id)
      .select(COLS_ADMIN_CLIENTE)
      .maybeSingle()

    if (error) {
      logAdminApiError('carteira/[id] PATCH', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }

    return NextResponse.json({ ok: true, cliente: data })
  } catch (error: unknown) {
    logAdminApiError('carteira/[id] PATCH', error)
    return NextResponse.json({ ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' }, { status: statusAuthAdmin(error) })
  }
}
