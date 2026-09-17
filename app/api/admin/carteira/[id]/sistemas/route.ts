import { NextResponse } from 'next/server'
import { dataMaisDias } from '@/lib/access'
import {
  acessoConnectDoVinculo,
  validarAcessoPorOrigem,
  validarIdsAcessoConnect,
  type OrigemSistemaAdmin,
  type StatusVinculoAdmin,
} from '@/lib/admin-carteira'
import { resolverCriarAcesso } from '@/lib/admin-criar-acesso'
import {
  COLS_ADMIN_VINCULO,
  logAdminApiError,
  respostaErroPostgresAmigavel,
  statusAuthAdmin,
} from '@/lib/admin-api-errors'
import { requireAdminFromRequest } from '@/lib/api-auth'
import {
  probeAdminTables,
  respostaAdminTablesNotReady,
  respostaAdminTablesProbeError,
} from '@/lib/admin-tables'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BodyVinculo = {
  sistema_id?: string
  status?: StatusVinculoAdmin
  valor?: string | number
  dia_vencimento?: number | string
  data_vencimento?: string
  observacoes?: string
  criar_acesso?: boolean
}

function parseValor(value?: string | number) {
  const numero = Number(String(value ?? '0').replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
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

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const { id: clienteId } = await ctx.params
    const body = (await req.json()) as BodyVinculo
    const sistemaId = String(body.sistema_id || '').trim()
    if (!sistemaId) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'sistema_id obrigatório.' }, { status: 400 })
    }

    const { data: sistema, error: sistemaError } = await supabaseAdmin
      .from('admin_sistemas')
      .select('id,nome,origem')
      .eq('id', sistemaId)
      .maybeSingle()

    if (sistemaError || !sistema?.id) {
      return NextResponse.json({ ok: false, code: 'ADMIN_NOT_FOUND', error: 'Sistema não encontrado.' }, { status: 404 })
    }

    const origem = String(sistema.origem) as OrigemSistemaAdmin
    const criarAcesso = resolverCriarAcesso(body.criar_acesso)
    if (origem === 'connect' && criarAcesso) {
      return NextResponse.json(
        {
          ok: false,
          code: 'USE_CARTEIRA_POST_FOR_AUTH',
          error:
            'Para criar login Connect neste vínculo, use o cadastro completo em /api/admin/carteira (criar_acesso=true).',
        },
        { status: 422 },
      )
    }

    const acessoConnect = acessoConnectDoVinculo({ origem, criarAcesso: false })
    const validacao = validarAcessoPorOrigem({ origem, acessoConnect })
    if (validacao.ok === false) {
      return NextResponse.json({ ok: false, code: validacao.code, error: validacao.error }, { status: 422 })
    }
    const idsOk = validarIdsAcessoConnect({ acessoConnect: false, authUserId: null, perfilId: null })
    if (idsOk.ok === false) {
      return NextResponse.json({ ok: false, code: idsOk.code, error: idsOk.error }, { status: 422 })
    }

    const statusVinculo: StatusVinculoAdmin =
      body.status === 'ativo' || body.status === 'bloqueado' || body.status === 'cancelado' || body.status === 'inadimplente'
        ? body.status
        : 'trial'
    const valor = parseValor(body.valor)
    const diaRaw = body.dia_vencimento != null ? Number(body.dia_vencimento) : null
    const diaVencimento =
      diaRaw != null && Number.isFinite(diaRaw) && diaRaw >= 1 && diaRaw <= 28 ? Math.floor(diaRaw) : null
    const dataVencimento =
      String(body.data_vencimento || '').trim().slice(0, 10) || dataMaisDias(30).slice(0, 10)

    const { data, error } = await supabaseAdmin
      .from('admin_cliente_sistemas')
      .insert([
        {
          cliente_id: clienteId,
          sistema_id: sistemaId,
          status: statusVinculo,
          valor,
          dia_vencimento: diaVencimento,
          data_vencimento: dataVencimento,
          inicio: dataMaisDias(0).slice(0, 10),
          observacoes: String(body.observacoes || '').trim() || null,
          acesso_connect: false,
          auth_user_id: null,
          perfil_id: null,
        },
      ])
      .select(COLS_ADMIN_VINCULO)
      .maybeSingle()

    if (error) {
      logAdminApiError('carteira sistemas POST', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }

    return NextResponse.json({
      ok: true,
      vinculo: data,
      sistema: { id: sistema.id, nome: sistema.nome, origem: sistema.origem },
    })
  } catch (error: unknown) {
    logAdminApiError('carteira sistemas POST', error)
    return NextResponse.json({ ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' }, { status: statusAuthAdmin(error) })
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    await ctx.params
    const url = new URL(req.url)
    const vinculoId = String(url.searchParams.get('vinculo_id') || '').trim()
    if (!vinculoId) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'vinculo_id obrigatório.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('admin_cliente_sistemas').delete().eq('id', vinculoId)
    if (error) {
      logAdminApiError('carteira sistemas DELETE', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }

    return NextResponse.json({ ok: true, authPreserved: true, perfilPreserved: true })
  } catch (error: unknown) {
    logAdminApiError('carteira sistemas DELETE', error)
    return NextResponse.json({ ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' }, { status: statusAuthAdmin(error) })
  }
}
