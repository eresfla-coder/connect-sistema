import { NextResponse } from 'next/server'
import { dataMaisDias } from '@/lib/access'
import { requireAdminFromRequest } from '@/lib/api-auth'
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

function senhaTemporaria() {
  const aleatorio = Math.random().toString(36).slice(2, 6)
  const final = Date.now().toString().slice(-4)
  return `Connect@${aleatorio}${final}`
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
}

/* =========================
   GET CLIENTES ADMIN
========================= */

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)

    const { data, error } = await supabaseAdmin
      .from('perfis')
      .select('*')
      .order('data_criacao', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      clientes: data || [],
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
        if (clienteRetry && virouPagante) {
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
    if (clienteAtualizado && virouPagante) {
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
  const tier = String(updates.plano_tier || perfil.plano_tier || 'starter')
  const vencimento = String(updates.vencimento || perfil.vencimento || dataMaisDias(30)).slice(0, 10)
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

    const criarAcesso = body.criar_acesso !== false

    const dias = tipo === 'trial' ? 7 : 30

    const vencimento = dataMaisDias(dias)

    const ultimoPagamento =
      tipo === 'ativo' ? dataMaisDias(0) : null

    const senhaInicial = senhaTemporaria()

    let userId: string | null = null

    let mode: 'created' | 'existing' | 'external' =
      criarAcesso ? 'created' : 'external'

    if (criarAcesso) {
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
      } else {
        userId = createResult.data.user?.id || null
      }
    } else {
      const createExternalResult =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: senhaInicial,
          email_confirm: true,
        })

      if (createExternalResult.error) {
        return NextResponse.json(
          { error: createExternalResult.error.message },
          { status: 400 }
        )
      }

      userId = createExternalResult.data.user?.id || null

      mode = 'external'
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Não foi possível criar usuário.' },
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

    const { error: upsertError } = await supabaseAdmin
      .from('perfis')
      .upsert([perfil], { onConflict: 'id' })

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message },
        { status: 400 }
      )
    }

    const accessLink = `${siteUrl()}/login`
    const nomeSaudacao = nomeEmpresa || email

    const inviteText =
      mode === 'external'
        ? [
            `Olá, ${nomeSaudacao}!`,
            '',
            `Seu cadastro financeiro do ${sistemaCliente} foi registrado com sucesso.`,
            '',
            `Mensalidade: R$ ${valorPlano.toFixed(2).replace('.', ',')}`,
            `Vencimento: ${vencimento}`,
            '',
            'Esse canal será usado para avisos, suporte e cobrança da mensalidade.',
            '',
            '— Connect Sistema',
          ].join('\n')
        : mode === 'created'
          ? [
              `Olá, ${nomeSaudacao}!`,
              '',
              `Seu acesso ao ${sistemaCliente} foi criado com sucesso.`,
              '',
              `Login: ${email}`,
              `Senha provisória: ${senhaInicial}`,
              '',
              `Acesse: ${accessLink}`,
              '',
              'Entre com esses dados e depois altere sua senha no painel.',
              '',
              '— Connect Sistema',
            ].join('\n')
          : [
              `Olá, ${nomeSaudacao}!`,
              '',
              `Seu cadastro no ${sistemaCliente} já existia e foi atualizado.`,
              '',
              `Login: ${email}`,
              '',
              `Acesse: ${accessLink}`,
              '',
              'Se você não lembrar a senha, use a opção "Esqueci minha senha" na tela de login.',
              '',
              '— Connect Sistema',
            ].join('\n')

    const whatsappUrl = telefone
      ? `https://wa.me/55${telefone.replace(/^55/, '')}?text=${encodeURIComponent(inviteText)}`
      : ''

    return NextResponse.json({
      ok: true,
      mode,
      accessLink: mode === 'external' ? '' : accessLink,
      temporaryPassword:
        mode === 'created' ? senhaInicial : null,
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
