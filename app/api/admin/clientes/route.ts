import { NextResponse } from 'next/server'
import { ADMIN_EMAILS, dataMaisDias } from '@/lib/access'
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
  admin_email?: string
  sistema_cliente?: string
  observacoes?: string
  criar_acesso?: boolean
}

type PatchPayload = {
  id?: string
  updates?: Record<string, any>
  admin_email?: string
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

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authHeader) return ''

  const [type, token] = authHeader.split(' ')

  if (String(type || '').toLowerCase() !== 'bearer' || !token) {
    return ''
  }

  return token.trim()
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
}

function isAdminEmail(email?: string | null) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}

async function identificarAdmin(req: Request, body?: BodyPayload | PatchPayload) {
  const token = getBearerToken(req)

  if (token) {
    const authUserResult = await supabaseAdmin.auth.getUser(token)

    const emailToken =
      authUserResult.data.user?.email?.trim().toLowerCase() || ''

    if (!authUserResult.error && isAdminEmail(emailToken)) {
      return {
        ok: true as const,
        email: emailToken,
      }
    }
  }

  const emailFallback = String(body?.admin_email || '')
    .trim()
    .toLowerCase()

  if (isAdminEmail(emailFallback)) {
    return {
      ok: true as const,
      email: emailFallback,
    }
  }

  return {
    ok: false as const,
    email: null,
  }
}

/* =========================
   GET CLIENTES ADMIN
========================= */

export async function GET(req: Request) {
  try {
    const admin = await identificarAdmin(req)

    if (!admin.ok) {
      return NextResponse.json(
        { error: 'Acesso negado.' },
        { status: 403 }
      )
    }

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
    return NextResponse.json(
      {
        error: error?.message || 'Erro ao carregar clientes.',
      },
      { status: 500 }
    )
  }
}




/* =========================
   PATCH CLIENTE ADMIN
========================= */

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as PatchPayload
    const admin = await identificarAdmin(req, body)

    if (!admin.ok) {
      return NextResponse.json(
        { error: 'Acesso negado.' },
        { status: 403 }
      )
    }

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

        return NextResponse.json({ ok: true, cliente: retry.data })
      }

      return NextResponse.json(
        { error: updateCompleto.error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, cliente: updateCompleto.data })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Erro ao atualizar cliente.',
      },
      { status: 500 }
    )
  }
}

/* =========================
   DELETE CLIENTE ADMIN
========================= */

export async function DELETE(req: Request) {
  try {
    const admin = await identificarAdmin(req)

    if (!admin.ok) {
      return NextResponse.json(
        { error: 'Acesso negado.' },
        { status: 403 }
      )
    }

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
    return NextResponse.json(
      {
        error: error?.message || 'Erro ao excluir cliente.',
      },
      { status: 500 }
    )
  }
}

/* =========================
   POST CLIENTE
========================= */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BodyPayload

    const admin = await identificarAdmin(req, body)

    if (!admin.ok) {
      return NextResponse.json(
        { error: 'Acesso restrito ao administrador.' },
        { status: 403 }
      )
    }

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
      String(body.sistema_cliente || 'Connect Pro').trim() ||
      'Connect Pro'

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
    return NextResponse.json(
      {
        error: error?.message || 'Erro inesperado.',
      },
      { status: 500 }
    )
  }
}