import { NextResponse } from 'next/server'
import { dataMaisDias } from '@/lib/access'
import {
  deveChamarCreateUserAuth,
  deveLimparAuthRecemCriado,
  montarConviteClienteAdmin,
  resolverCriarAcesso,
  type ModoCriacaoClienteAdmin,
} from '@/lib/admin-criar-acesso'
import { requireAdminFromRequest } from '@/lib/api-auth'
import { probeAdminTables, respostaAdminTablesNotReady, respostaAdminTablesProbeError } from '@/lib/admin-tables'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TipoNovoCliente = 'trial' | 'ativo'

type BodyPayload = {
  email?: string
  nome_empresa?: string
  telefone?: string
  valor_plano?: string | number
  tipo?: TipoNovoCliente
  sistema_cliente?: string
  observacoes?: string
  criar_acesso?: boolean
}

type PatchPayload = {
  id?: string
  updates?: Record<string, any>
}

function normalizarTelefone(value?: string) {
  return String(value || '').replace(/\D/g, '')
}

function parseValorPlano(value?: string | number) {
  const numero = Number(String(value ?? '0').replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

function isPerfilPermanenteAdmin(perfil: Record<string, unknown>) {
  const vencimento = String(perfil.vencimento || '').slice(0, 10)
  return vencimento === '2099-12-31' || Number(perfil.valor_plano || 0) === 0
}

function senhaTemporaria() {
  const aleatorio = Math.random().toString(36).slice(2, 6)
  const final = Date.now().toString().slice(-4)
  return `Connect@${aleatorio}${final}`
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
}

const PERFIS_ADMIN_COLS =
  'id,email,ativo,vencimento,status,plano_tier,data_criacao,valor_plano,telefone,nome_empresa,ultimo_pagamento,status_pagamento,sistema_cliente,observacoes'

const ADMIN_CLIENTES_LIMIT_DEFAULT = 50
const ADMIN_CLIENTES_LIMIT_MAX = 100

/* =========================
   GET CLIENTES ADMIN
========================= */

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)

    const url = new URL(req.url)
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const limitRaw = Number.parseInt(url.searchParams.get('limit') || String(ADMIN_CLIENTES_LIMIT_DEFAULT), 10)
    const limit = Math.min(ADMIN_CLIENTES_LIMIT_MAX, Math.max(1, limitRaw || ADMIN_CLIENTES_LIMIT_DEFAULT))
    const offset = (page - 1) * limit
    const rangeEnd = offset + limit - 1

    const { data, error, count } = await supabaseAdmin
      .from('perfis')
      .select(PERFIS_ADMIN_COLS, { count: 'exact' })
      .order('data_criacao', { ascending: false })
      .range(offset, rangeEnd)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    const total = count ?? (data?.length || 0)
    const hasMore = offset + (data?.length || 0) < total

    return NextResponse.json({
      ok: true,
      clientes: data || [],
      pagination: {
        page,
        limit,
        total,
        hasMore,
      },
    })
  } catch (error: any) {
    const status = error?.message === 'Acesso negado.' || error?.message === 'Sessão ausente.' || error?.message === 'Sessão inválida.' ? 403 : 500
    return NextResponse.json(
      {
        error: error?.message || 'Erro ao carregar clientes.',
      },
      { status }
    )
  }
}

/* =========================
   PATCH CLIENTE ADMIN
========================= */

export async function PATCH(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const body = (await req.json()) as PatchPayload

    const id = String(body.id || '').trim()

    if (!id) {
      return NextResponse.json(
        { error: 'ID do cliente não informado.' },
        { status: 400 }
      )
    }

    const updates = body.updates || {}

    const allowedKeys = [
      'email',
      'nome_empresa',
      'telefone',
      'valor_plano',
      'status',
      'ativo',
      'vencimento',
      'status_pagamento',
      'ultimo_pagamento',
      'sistema_cliente',
      'observacoes',
      'plano_tier',
    ]

    const safeUpdates: Record<string, any> = {}

    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        safeUpdates[key] = updates[key]
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json(
        { error: 'Nenhum dado válido para atualizar.' },
        { status: 400 }
      )
    }

    const statusNorm = String(safeUpdates.status || '').toLowerCase()
    const pagamentoNorm = String(safeUpdates.status_pagamento || '').toLowerCase()
    const virouPagante =
      statusNorm === 'ativo' ||
      statusNorm === 'active' ||
      pagamentoNorm === 'pago' ||
      pagamentoNorm === 'em_dia'

    if (virouPagante) {
      safeUpdates.ativo = safeUpdates.ativo ?? true
      const tierAtual = String(safeUpdates.plano_tier || '').toLowerCase()
      if (!tierAtual || tierAtual === 'trial') {
        safeUpdates.plano_tier = 'starter'
      }
      if (!safeUpdates.status_pagamento) {
        safeUpdates.status_pagamento = 'em_dia'
      }
      if (!safeUpdates.ultimo_pagamento) {
        safeUpdates.ultimo_pagamento = dataMaisDias(0).slice(0, 10)
      }
    }

    const { data: perfilAntes } = await supabaseAdmin
      .from('perfis')
      .select('vencimento,valor_plano,status,plano_tier')
      .eq('id', id)
      .maybeSingle()

    const perfilPrevisto = { ...(perfilAntes || {}), ...safeUpdates }
    const precisaSyncAssinatura = virouPagante || isPerfilPermanenteAdmin(perfilPrevisto)

    const updateCompleto = await supabaseAdmin
      .from('perfis')
      .update(safeUpdates)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (updateCompleto.error) {
      const msg = String(updateCompleto.error.message || '').toLowerCase()
      const erroColunaOpcional =
        msg.includes('sistema_cliente') ||
        msg.includes('observacoes') ||
        msg.includes('schema cache') ||
        msg.includes('column')

      if (erroColunaOpcional) {
        const fallbackUpdates = { ...safeUpdates }
        delete fallbackUpdates.sistema_cliente
        delete fallbackUpdates.observacoes

        const retry = await supabaseAdmin
          .from('perfis')
          .update(fallbackUpdates)
          .eq('id', id)
          .select('*')
          .maybeSingle()

        if (retry.error) {
          return NextResponse.json(
            { error: retry.error.message },
            { status: 400 }
          )
        }

        const clienteRetry = retry.data
        if (clienteRetry && precisaSyncAssinatura) {
          await sincronizarAssinaturaPagante(id, safeUpdates, clienteRetry)
        }
        return NextResponse.json({ ok: true, cliente: clienteRetry })
      }

      return NextResponse.json(
        { error: updateCompleto.error.message },
        { status: 400 }
      )
    }

    const clienteAtualizado = updateCompleto.data
    if (clienteAtualizado && precisaSyncAssinatura) {
      await sincronizarAssinaturaPagante(id, safeUpdates, clienteAtualizado)
    }

    return NextResponse.json({ ok: true, cliente: clienteAtualizado })
  } catch (error: any) {
    const status = error?.message === 'Acesso negado.' || error?.message === 'Sessão ausente.' || error?.message === 'Sessão inválida.' ? 403 : 500
    return NextResponse.json(
      {
        error: error?.message || 'Erro ao atualizar cliente.',
      },
      { status }
    )
  }
}

async function sincronizarAssinaturaPagante(
  userId: string,
  updates: Record<string, unknown>,
  perfil: Record<string, unknown>
) {
  const permanente = isPerfilPermanenteAdmin(perfil)
  let tier = String(updates.plano_tier || perfil.plano_tier || (permanente ? 'empresa' : 'starter'))
  if (tier === 'trial') tier = permanente ? 'empresa' : 'starter'

  const vencimento = permanente
    ? '2099-12-31'
    : String(updates.vencimento || perfil.vencimento || dataMaisDias(30)).slice(0, 10)
  const valorMensal = Number(updates.valor_plano ?? perfil.valor_plano ?? 0)

  try {
    await supabaseAdmin.from('assinaturas').upsert(
      {
        user_id: userId,
        plano: `${tier}_mensal`,
        plano_tier: tier,
        status: 'ativa',
        data_fim: `${vencimento}T23:59:59.999Z`,
        data_trial_fim: null,
        proxima_cobranca: vencimento,
        trial_dias: 0,
        renovacao_automatica: false,
        valor_mensal: valorMensal > 0 ? valorMensal : null,
        gateway: 'manual',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  } catch (assinaturaErro) {
    console.warn('[ADMIN CLIENTES] assinaturas sync:', assinaturaErro)
  }
}

/* =========================
   DELETE CLIENTE ADMIN
========================= */

export async function DELETE(req: Request) {
  try {
    await requireAdminFromRequest(req)

    const url = new URL(req.url)
    const id = String(url.searchParams.get('id') || '').trim()

    if (!id) {
      return NextResponse.json(
        { error: 'ID do cliente não informado.' },
        { status: 400 }
      )
    }

    const { error: perfilError } = await supabaseAdmin
      .from('perfis')
      .delete()
      .eq('id', id)

    if (perfilError) {
      return NextResponse.json(
        { error: perfilError.message },
        { status: 400 }
      )
    }

    try {
      await supabaseAdmin.auth.admin.deleteUser(id)
    } catch (authError) {
      console.warn('[ADMIN CLIENTES] perfil removido, mas auth não foi removido:', authError)
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const status = error?.message === 'Acesso negado.' || error?.message === 'Sessão ausente.' || error?.message === 'Sessão inválida.' ? 403 : 500
    return NextResponse.json(
      {
        error: error?.message || 'Erro ao excluir cliente.',
      },
      { status }
    )
  }
}

/* =========================
   POST CLIENTE
========================= */

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const body = (await req.json()) as BodyPayload

    const email = String(body.email || '').trim().toLowerCase()

    if (!email) {
      return NextResponse.json(
        { error: 'Informe o e-mail do cliente.' },
        { status: 400 }
      )
    }

    const nomeEmpresa = String(body.nome_empresa || '').trim()

    const telefone = normalizarTelefone(body.telefone)

    const tipo = body.tipo === 'ativo' ? 'ativo' : 'trial'

    const valorPlano = parseValorPlano(body.valor_plano)

    const sistemaCliente =
      String(body.sistema_cliente || 'Connect Sistema').trim() ||
      'Connect Sistema'

    const observacoes = String(body.observacoes || '').trim()

    // Default true se flag ausente (callers antigos). Somente false explícito = sem Auth.
    const criarAcesso = resolverCriarAcesso(body.criar_acesso)

    // Sem login Connect: exige carteira ADMIN.2 (admin_*). Esta rota legado só cria Auth+perfis.
    if (!deveChamarCreateUserAuth(criarAcesso)) {
      const probe = await probeAdminTables()
      if (probe.status === 'missing') {
        const r = respostaAdminTablesNotReady()
        return NextResponse.json(
          {
            ...r.body,
            hint: 'Cadastro sem acesso usa POST /api/admin/carteira após aplicar docs/admin2-migration.sql.',
          },
          { status: r.status },
        )
      }
      if (probe.status === 'error') {
        const r = respostaAdminTablesProbeError(probe)
        return NextResponse.json(r.body, { status: r.status })
      }
      return NextResponse.json(
        {
          ok: false,
          code: 'USE_ADMIN_CARTEIRA',
          error:
            'Para cadastrar sem login Connect (ou sistema de terceiro), use a carteira administrativa (/api/admin/carteira) com sistema_id.',
        },
        { status: 422 },
      )
    }

    const dias = tipo === 'trial' ? 7 : 30

    const vencimento = dataMaisDias(dias)

    const ultimoPagamento =
      tipo === 'ativo' ? dataMaisDias(0) : null

    const senhaInicial = senhaTemporaria()

    let userId: string | null = null
    let mode: ModoCriacaoClienteAdmin = 'created'
    let authRecemCriadoNestaRequest = false

    const createResult =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senhaInicial,
        email_confirm: true,
      })

    if (createResult.error) {
      const { data: perfilExistente } = await supabaseAdmin
        .from('perfis')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (!perfilExistente?.id) {
        return NextResponse.json(
          { error: createResult.error.message },
          { status: 400 }
        )
      }

      userId = perfilExistente.id
      mode = 'existing'
      authRecemCriadoNestaRequest = false
    } else {
      userId = createResult.data.user?.id || null
      authRecemCriadoNestaRequest = Boolean(userId)
      mode = 'created'
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Não foi possível criar o cadastro do cliente.' },
        { status: 400 }
      )
    }

    const perfil = {
      id: userId,
      email,
      nome_empresa: nomeEmpresa || null,
      telefone: telefone || null,
      valor_plano: valorPlano,
      status: tipo,
      ativo: true,
      vencimento,
      status_pagamento:
        tipo === 'trial' ? 'trial' : 'em_dia',
      ultimo_pagamento: ultimoPagamento,
      sistema_cliente: sistemaCliente,
      observacoes: observacoes || null,
    }

    let upsertError = (
      await supabaseAdmin.from('perfis').upsert([perfil], { onConflict: 'id' })
    ).error

    if (upsertError) {
      const msg = String(upsertError.message || '').toLowerCase()
      const colunaOpcional =
        msg.includes('sistema_cliente') ||
        msg.includes('observacoes') ||
        msg.includes('schema cache') ||
        msg.includes('column')

      if (colunaOpcional) {
        const fallback = { ...perfil } as Record<string, unknown>
        if (msg.includes('sistema_cliente')) delete fallback.sistema_cliente
        if (msg.includes('observacoes')) delete fallback.observacoes

        upsertError = (
          await supabaseAdmin.from('perfis').upsert([fallback], { onConflict: 'id' })
        ).error
      }
    }

    if (upsertError) {
      if (
        deveLimparAuthRecemCriado({
          authRecemCriadoNestaRequest,
          falhaPosterior: true,
        }) &&
        userId
      ) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(userId)
        } catch (cleanupErr) {
          console.warn('[ADMIN CLIENTES] cleanup auth após falha de perfil:', cleanupErr)
        }
      }

      return NextResponse.json(
        { error: upsertError.message },
        { status: 400 }
      )
    }

    const accessLink = `${siteUrl()}/login`
    const nomeSaudacao = nomeEmpresa || email

    const inviteText = montarConviteClienteAdmin({
      mode,
      nomeSaudacao,
      email,
      sistemaCliente,
      valorPlano,
      vencimento,
      accessLink,
      senhaInicial: mode === 'created' ? senhaInicial : null,
      origem: 'connect',
      criarAcesso: true,
    })

    const whatsappUrl = telefone
      ? `https://wa.me/55${telefone.replace(/^55/, '')}?text=${encodeURIComponent(inviteText)}`
      : ''

    return NextResponse.json({
      ok: true,
      mode,
      criar_acesso: true,
      accessLink,
      temporaryPassword: mode === 'created' ? senhaInicial : null,
      inviteText,
      whatsappUrl,
      cliente: perfil,
    })
  } catch (error: any) {
    const status = error?.message === 'Acesso negado.' || error?.message === 'Sessão ausente.' || error?.message === 'Sessão inválida.' ? 403 : 500
    return NextResponse.json(
      {
        error: error?.message || 'Erro inesperado.',
      },
      { status }
    )
  }
}
