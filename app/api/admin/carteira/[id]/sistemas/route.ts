import { NextResponse } from 'next/server'
import {
  acessoConnectDoVinculo,
  validarAcessoPorOrigem,
  validarIdsAcessoConnect,
  type OrigemSistemaAdmin,
  type StatusVinculoAdmin,
} from '@/lib/admin-carteira'
import {
  aplicarBloqueioVinculo,
  aplicarDesbloqueioVinculo,
  aplicarMarcarPagoComercial,
  aplicarRenovacaoComercial,
  camposIniciaisVinculoComercial,
  CODIGO_CONNECT_SYNC_FAILED,
  CODIGO_CONNECT_SYNC_INCONSISTENT,
  dataCalendarioLocal,
  decidirResultadoSyncConnect,
  deveDesativarAdminClientePorBloqueioVinculo,
  deveSincronizarPerfilConnect,
  isUuidAdmin,
  montarSnapshotVinculoComercial,
  MSG_CONNECT_SYNC_FAILED,
  MSG_CONNECT_SYNC_INCONSISTENT,
  normalizarStatusInicial,
  payloadSyncPerfilConnect,
  validarDiaVencimento,
  type SnapshotVinculoComercial,
} from '@/lib/admin-ciclo-comercial'
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
  dias_trial?: number | string
  observacoes?: string
  criar_acesso?: boolean
}

type BodyAcaoComercial = {
  vinculo_id?: string
  /** renovar | marcar_pago | bloquear | desbloquear | atualizar */
  acao?: 'renovar' | 'marcar_pago' | 'bloquear' | 'desbloquear' | 'atualizar'
  status?: string
  valor?: string | number
  dia_vencimento?: number | string
  data_vencimento?: string
  observacoes?: string
  /** Nunca criar Auth neste endpoint. */
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

async function syncPerfilConnectSeAplicavel(params: {
  origem: string
  acessoConnect: boolean
  perfilId: string | null
  status: string
  dataVencimento?: string | null
  statusPagamento?: string | null
  ultimoPagamento?: string | null
  valor?: number | null
}): Promise<{ precisaSync: false } | { precisaSync: true; syncOk: true } | { precisaSync: true; syncOk: false }> {
  const precisa = deveSincronizarPerfilConnect({
    origem: params.origem,
    acessoConnect: params.acessoConnect,
    perfilId: params.perfilId,
  })
  if (!precisa) return { precisaSync: false }

  const payload = payloadSyncPerfilConnect({
    status: params.status,
    dataVencimento: params.dataVencimento,
    statusPagamento: params.statusPagamento,
    ultimoPagamento: params.ultimoPagamento,
    valor: params.valor,
  })
  const { error } = await supabaseAdmin.from('perfis').update(payload).eq('id', params.perfilId!)
  if (error) {
    logAdminApiError('carteira sistemas sync perfil', error)
    return { precisaSync: true, syncOk: false }
  }
  return { precisaSync: true, syncOk: true }
}

async function restaurarVinculoSnapshot(params: {
  clienteId: string
  vinculoId: string
  snapshot: SnapshotVinculoComercial
}): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('admin_cliente_sistemas')
    .update({
      status: params.snapshot.status,
      valor: params.snapshot.valor,
      dia_vencimento: params.snapshot.dia_vencimento,
      data_vencimento: params.snapshot.data_vencimento,
      status_pagamento: params.snapshot.status_pagamento,
      ultimo_pagamento: params.snapshot.ultimo_pagamento,
      observacoes: params.snapshot.observacoes,
      fim_trial: params.snapshot.fim_trial,
    })
    .eq('id', params.vinculoId)
    .eq('cliente_id', params.clienteId)
  if (error) {
    logAdminApiError('carteira sistemas compensacao', error)
    return false
  }
  return true
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const { id: clienteId } = await ctx.params
    if (!isUuidAdmin(clienteId)) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'cliente_id inválido.' }, { status: 400 })
    }

    const body = (await req.json()) as BodyVinculo
    const sistemaId = String(body.sistema_id || '').trim()
    if (!sistemaId || !isUuidAdmin(sistemaId)) {
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
    if (origem === 'terceiro' && criarAcesso) {
      return NextResponse.json(
        { ok: false, code: 'ADMIN_ORIGEM_ACESSO_INVALIDO', error: 'Sistema de terceiro não pode ter acesso Connect.' },
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

    let campos
    try {
      campos = camposIniciaisVinculoComercial({
        statusInicial: normalizarStatusInicial(body.status || 'trial'),
        hoje: dataCalendarioLocal(),
        diaVencimento: body.dia_vencimento != null ? Number(body.dia_vencimento) : null,
        diasTrial: body.dias_trial != null ? Number(body.dias_trial) : 7,
        dataVencimentoOverride: body.data_vencimento || null,
      })
    } catch (e: unknown) {
      return NextResponse.json(
        { ok: false, code: 'ADMIN_VALIDATION', error: e instanceof Error ? e.message : 'Dados inválidos.' },
        { status: 400 },
      )
    }

    const valor = parseValor(body.valor)

    const { data, error } = await supabaseAdmin
      .from('admin_cliente_sistemas')
      .insert([
        {
          cliente_id: clienteId,
          sistema_id: sistemaId,
          status: campos.status,
          valor,
          dia_vencimento: campos.dia_vencimento,
          data_vencimento: campos.data_vencimento,
          inicio: campos.inicio,
          fim_trial: campos.fim_trial,
          status_pagamento: campos.status_pagamento,
          ultimo_pagamento: campos.ultimo_pagamento,
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
      authCreated: false,
    })
  } catch (error: unknown) {
    logAdminApiError('carteira sistemas POST', error)
    return NextResponse.json({ ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' }, { status: statusAuthAdmin(error) })
  }
}

/**
 * ADMIN.3.1 — ações comerciais no vínculo (sem depender de perfis/Auth).
 * Sync de perfis somente se acesso_connect=true (Connect).
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const { id: clienteId } = await ctx.params
    if (!isUuidAdmin(clienteId)) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'cliente_id inválido.' }, { status: 400 })
    }

    const body = (await req.json()) as BodyAcaoComercial
    const vinculoId = String(body.vinculo_id || '').trim()
    if (!vinculoId || !isUuidAdmin(vinculoId)) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'vinculo_id obrigatório.' }, { status: 400 })
    }

    // Nunca criar Auth em ação comercial
    if (body.criar_acesso === true) {
      return NextResponse.json(
        { ok: false, code: 'ADMIN_NO_AUTH_ON_COMMERCIAL', error: 'Ações comerciais não criam Auth.' },
        { status: 422 },
      )
    }

    const { data: vinculo, error: vErr } = await supabaseAdmin
      .from('admin_cliente_sistemas')
      .select(
        `${COLS_ADMIN_VINCULO}, sistema:admin_sistemas(id,nome,origem)`,
      )
      .eq('id', vinculoId)
      .eq('cliente_id', clienteId)
      .maybeSingle()

    if (vErr) {
      logAdminApiError('carteira sistemas PATCH load', vErr)
      const r = respostaErroPostgresAmigavel(vErr)
      return NextResponse.json(r.body, { status: r.status })
    }
    if (!vinculo?.id) {
      return NextResponse.json(
        { ok: false, code: 'ADMIN_NOT_FOUND', error: 'Vínculo não encontrado para este cliente.' },
        { status: 404 },
      )
    }

    const sistema = (vinculo.sistema || {}) as { id?: string; nome?: string; origem?: string }
    const origem = String(sistema.origem || 'terceiro') as OrigemSistemaAdmin
    const acessoConnect = Boolean(vinculo.acesso_connect)
    const perfilId = vinculo.perfil_id ? String(vinculo.perfil_id) : null
    const acao = String(body.acao || 'atualizar').toLowerCase()

    // Snapshot ANTES do UPDATE — compensação só deste vínculo
    const snapshot = montarSnapshotVinculoComercial(vinculo as SnapshotVinculoComercial)

    const updates: Record<string, unknown> = {}
    const diaAtual =
      validarDiaVencimento(body.dia_vencimento != null ? body.dia_vencimento : vinculo.dia_vencimento) ??
      validarDiaVencimento(vinculo.dia_vencimento)

    try {
      if (acao === 'renovar') {
        if (diaAtual == null) {
          return NextResponse.json(
            { ok: false, code: 'ADMIN_VALIDATION', error: 'Informe dia_vencimento (1–28) para renovar.' },
            { status: 400 },
          )
        }
        const r = aplicarRenovacaoComercial({
          dataVencimentoAtual: vinculo.data_vencimento ? String(vinculo.data_vencimento) : null,
          diaVencimento: diaAtual,
          hoje: dataCalendarioLocal(),
        })
        // Só ciclo + status operacional. NÃO toca status_pagamento / ultimo_pagamento.
        Object.assign(updates, r)
        if (body.dia_vencimento != null) updates.dia_vencimento = diaAtual
      } else if (acao === 'marcar_pago') {
        if (diaAtual == null) {
          return NextResponse.json(
            { ok: false, code: 'ADMIN_VALIDATION', error: 'Informe dia_vencimento (1–28) para marcar pagamento.' },
            { status: 400 },
          )
        }
        const r = aplicarMarcarPagoComercial({
          dataVencimentoAtual: vinculo.data_vencimento ? String(vinculo.data_vencimento) : null,
          diaVencimento: diaAtual,
          hoje: dataCalendarioLocal(),
        })
        Object.assign(updates, r)
        if (body.dia_vencimento != null) updates.dia_vencimento = diaAtual
      } else if (acao === 'bloquear') {
        Object.assign(updates, aplicarBloqueioVinculo())
        void deveDesativarAdminClientePorBloqueioVinculo()
      } else if (acao === 'desbloquear') {
        Object.assign(updates, aplicarDesbloqueioVinculo())
      } else if (acao === 'atualizar') {
        if (body.status != null) {
          const st = normalizarStatusInicial(body.status)
          if (!['trial', 'ativo', 'bloqueado'].includes(st)) {
            return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Status inválido.' }, { status: 400 })
          }
          updates.status = st
          if (st === 'bloqueado') updates.status_pagamento = 'bloqueado'
          if (st === 'trial') updates.status_pagamento = 'trial'
          if (st === 'ativo' && !vinculo.status_pagamento) updates.status_pagamento = 'pendente'
        }
        if (body.valor != null) updates.valor = parseValor(body.valor)
        if (body.dia_vencimento != null) {
          const dia = validarDiaVencimento(body.dia_vencimento)
          if (dia == null) {
            return NextResponse.json(
              { ok: false, code: 'ADMIN_VALIDATION', error: 'Dia de vencimento deve ser 1–28.' },
              { status: 400 },
            )
          }
          updates.dia_vencimento = dia
        }
        if (body.data_vencimento != null) {
          const d = String(body.data_vencimento).trim().slice(0, 10)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'data_vencimento inválida.' }, { status: 400 })
          }
          updates.data_vencimento = d
        }
        if (body.observacoes !== undefined) {
          updates.observacoes = String(body.observacoes || '').trim() || null
        }
      } else {
        return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Ação comercial inválida.' }, { status: 400 })
      }
    } catch (e: unknown) {
      return NextResponse.json(
        { ok: false, code: 'ADMIN_VALIDATION', error: e instanceof Error ? e.message : 'Falha na ação comercial.' },
        { status: 400 },
      )
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Nada para atualizar.' }, { status: 400 })
    }

    const { data: atualizado, error: upErr } = await supabaseAdmin
      .from('admin_cliente_sistemas')
      .update(updates)
      .eq('id', vinculoId)
      .eq('cliente_id', clienteId)
      .select(COLS_ADMIN_VINCULO)
      .maybeSingle()

    if (upErr || !atualizado) {
      logAdminApiError('carteira sistemas PATCH', upErr)
      const r = respostaErroPostgresAmigavel(upErr)
      return NextResponse.json(r.body, { status: r.status })
    }

    const sync = await syncPerfilConnectSeAplicavel({
      origem,
      acessoConnect,
      perfilId,
      status: String(atualizado.status),
      dataVencimento: atualizado.data_vencimento ? String(atualizado.data_vencimento) : null,
      statusPagamento: atualizado.status_pagamento ? String(atualizado.status_pagamento) : null,
      ultimoPagamento: atualizado.ultimo_pagamento ? String(atualizado.ultimo_pagamento) : null,
      valor: atualizado.valor != null ? Number(atualizado.valor) : null,
    })

    if (!sync.precisaSync) {
      return NextResponse.json({
        ok: true,
        vinculo: atualizado,
        acao,
        authCreated: false,
        perfilSynced: false,
        adminClienteAtivoPreserved: true,
      })
    }

    if (sync.syncOk) {
      return NextResponse.json({
        ok: true,
        vinculo: atualizado,
        acao,
        authCreated: false,
        perfilSynced: true,
        adminClienteAtivoPreserved: true,
      })
    }

    // Sync falhou: compensar vínculo específico (nunca ok:true)
    const compensado = await restaurarVinculoSnapshot({
      clienteId,
      vinculoId,
      snapshot,
    })
    const decisao = decidirResultadoSyncConnect({
      precisaSync: true,
      syncOk: false,
      compensacaoOk: compensado,
    })

    if (decisao.ok === false && decisao.code === CODIGO_CONNECT_SYNC_INCONSISTENT) {
      logAdminApiError(
        'carteira sistemas sync inconsistente',
        `vinculo=${vinculoId} cliente=${clienteId} acao=${acao}`,
      )
      return NextResponse.json(
        { ok: false, code: CODIGO_CONNECT_SYNC_INCONSISTENT, error: MSG_CONNECT_SYNC_INCONSISTENT },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { ok: false, code: CODIGO_CONNECT_SYNC_FAILED, error: MSG_CONNECT_SYNC_FAILED },
      { status: 422 },
    )
  } catch (error: unknown) {
    logAdminApiError('carteira sistemas PATCH', error)
    return NextResponse.json({ ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' }, { status: statusAuthAdmin(error) })
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const { id: clienteId } = await ctx.params
    const url = new URL(req.url)
    const vinculoId = String(url.searchParams.get('vinculo_id') || '').trim()
    if (!vinculoId || !isUuidAdmin(vinculoId)) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'vinculo_id obrigatório.' }, { status: 400 })
    }

    const { data: existente } = await supabaseAdmin
      .from('admin_cliente_sistemas')
      .select('id')
      .eq('id', vinculoId)
      .eq('cliente_id', clienteId)
      .maybeSingle()

    if (!existente?.id) {
      return NextResponse.json(
        { ok: false, code: 'ADMIN_NOT_FOUND', error: 'Vínculo não encontrado para este cliente.' },
        { status: 404 },
      )
    }

    const { error } = await supabaseAdmin.from('admin_cliente_sistemas').delete().eq('id', vinculoId)
    if (error) {
      logAdminApiError('carteira sistemas DELETE', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }

    return NextResponse.json({ ok: true, authPreserved: true, perfilPreserved: true, authCreated: false })
  } catch (error: unknown) {
    logAdminApiError('carteira sistemas DELETE', error)
    return NextResponse.json({ ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' }, { status: statusAuthAdmin(error) })
  }
}
