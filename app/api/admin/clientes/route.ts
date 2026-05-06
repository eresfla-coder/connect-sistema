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
  if (String(type || '').toLowerCase() !== 'bearer' || !token) return ''
  return token.trim()
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
}

function isAdminEmail(email?: string | null) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}

async function identificarAdmin(req: Request, body: BodyPayload) {
  const token = getBearerToken(req)

  if (token) {
    const authUserResult = await supabaseAdmin.auth.getUser(token)
    const emailToken = authUserResult.data.user?.email?.trim().toLowerCase() || ''

    if (!authUserResult.error && isAdminEmail(emailToken)) {
      return { ok: true as const, email: emailToken, origem: 'token' }
    }

    console.log('[ADMIN CLIENTES] token recusado pelo Supabase:', {
      email: emailToken || null,
      error: authUserResult.error?.message || null,
    })
  }

  const emailFallback = String(body.admin_email || '').trim().toLowerCase()

  if (isAdminEmail(emailFallback)) {
    console.log('[ADMIN CLIENTES] usando fallback admin_email:', emailFallback)
    return { ok: true as const, email: emailFallback, origem: 'fallback' }
  }

  return {
    ok: false as const,
    email: emailFallback || null,
    origem: 'negado',
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BodyPayload
    const admin = await identificarAdmin(req, body)

    if (!admin.ok) {
      return NextResponse.json(
        { error: `Acesso restrito ao administrador: ${admin.email || 'sessão inválida'}` },
        { status: 403 }
      )
    }

    const email = String(body.email || '').trim().toLowerCase()
    const nomeEmpresa = String(body.nome_empresa || '').trim()
    const telefone = normalizarTelefone(body.telefone)
    const tipo = body.tipo === 'ativo' ? 'ativo' : 'trial'
    const valorPlano = parseValorPlano(body.valor_plano)
    const sistemaCliente = String(body.sistema_cliente || 'Connect Pro').trim() || 'Connect Pro'
    const observacoes = String(body.observacoes || '').trim()
    const criarAcesso = body.criar_acesso !== false

    if (!email) {
      return NextResponse.json(
        { error: 'Informe o e-mail do cliente.' },
        { status: 400 }
      )
    }

    const dias = tipo === 'trial' ? 7 : 30
    const vencimento = dataMaisDias(dias)
    const ultimoPagamento = tipo === 'ativo' ? dataMaisDias(0) : null
    const senhaInicial = senhaTemporaria()

    let userId: string | null = null
    let mode: 'created' | 'existing' | 'external' = criarAcesso ? 'created' : 'external'

    if (criarAcesso) {
      const createResult = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senhaInicial,
        email_confirm: true,
        user_metadata: {
          nome_empresa: nomeEmpresa || null,
          telefone: telefone || null,
        },
      })

      if (createResult.error) {
        const msg = String(createResult.error.message || '').toLowerCase()
        const jaExiste =
          msg.includes('already') ||
          msg.includes('registered') ||
          msg.includes('exists') ||
          msg.includes('duplicate') ||
          msg.includes('user already registered')

        if (!jaExiste) {
          return NextResponse.json(
            {
              error:
                createResult.error.message ||
                'Não foi possível criar o usuário no Auth. Confira a variável SUPABASE_SERVICE_ROLE_KEY na Vercel.',
              debug: {
                code: (createResult.error as any)?.code || null,
                status: (createResult.error as any)?.status || null,
                name: (createResult.error as any)?.name || null,
              },
            },
            { status: 400 }
          )
        }

        mode = 'existing'

        const { data: perfilExistente, error: perfilError } = await supabaseAdmin
          .from('perfis')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (perfilError || !perfilExistente?.id) {
          return NextResponse.json(
            {
              error:
                'Esse e-mail já existe no Auth, mas não consegui localizar o perfil correspondente.',
            },
            { status: 409 }
          )
        }

        userId = perfilExistente.id
      } else {
        userId = createResult.data.user?.id || null
      }
    } else {
      // Cliente externo: a tabela perfis usa id vinculado ao Auth.
      // Para não quebrar a chave estrangeira, criamos um usuário técnico no Auth,
      // mas NÃO enviamos senha nem link de acesso ao cliente. Ele fica apenas para cobrança/financeiro.
      const { data: perfilExistente, error: perfilBuscaError } = await supabaseAdmin
        .from('perfis')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (perfilBuscaError) {
        return NextResponse.json({ error: perfilBuscaError.message }, { status: 400 })
      }

      if (perfilExistente?.id) {
        userId = perfilExistente.id
      } else {
        const createExternalResult = await supabaseAdmin.auth.admin.createUser({
          email,
          password: senhaInicial,
          email_confirm: true,
          user_metadata: {
            nome_empresa: nomeEmpresa || null,
            telefone: telefone || null,
            cliente_externo: true,
            sistema_cliente: sistemaCliente,
          },
        })

        if (createExternalResult.error) {
          return NextResponse.json(
            {
              error:
                createExternalResult.error.message ||
                'Não foi possível criar o registro técnico do cliente externo no Auth.',
              debug: {
                code: (createExternalResult.error as any)?.code || null,
                status: (createExternalResult.error as any)?.status || null,
                name: (createExternalResult.error as any)?.name || null,
              },
            },
            { status: 400 }
          )
        }

        userId = createExternalResult.data.user?.id || null
      }

      mode = 'external'
    }



    if (!userId) {
      return NextResponse.json(
        { error: 'Não foi possível identificar o usuário do cliente.' },
        { status: 400 }
      )
    }

    const perfilBase = {
      id: userId,
      email,
      nome_empresa: nomeEmpresa || null,
      telefone: telefone || null,
      valor_plano: valorPlano,
      status: tipo,
      ativo: true,
      vencimento,
      status_pagamento: tipo === 'trial' ? 'trial' : 'em_dia',
      ultimo_pagamento: ultimoPagamento,
    }

    const perfilCompleto = {
      ...perfilBase,
      sistema_cliente: sistemaCliente,
      observacoes: observacoes || null,
    }

    const upsertCompleto = await supabaseAdmin.from('perfis').upsert([perfilCompleto], { onConflict: 'id' })

    if (upsertCompleto.error) {
      const msg = String(upsertCompleto.error.message || '').toLowerCase()
      const erroColunaOpcional = msg.includes('sistema_cliente') || msg.includes('observacoes') || msg.includes('schema cache') || msg.includes('column')

      if (erroColunaOpcional) {
        const upsertBase = await supabaseAdmin.from('perfis').upsert([perfilBase], { onConflict: 'id' })
        if (upsertBase.error) {
          return NextResponse.json({ error: upsertBase.error.message }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: upsertCompleto.error.message }, { status: 400 })
      }
    }

    const nomeSaudacao = nomeEmpresa || email
    const accessLink = `${siteUrl()}/login`
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
            '— Connect Pro',
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
            ].join('\n')

    return NextResponse.json({
      ok: true,
      mode,
      accessLink: mode === 'external' ? '' : accessLink,
      temporaryPassword: mode === 'created' ? senhaInicial : null,
      inviteText,
      cliente: {
        id: userId,
        email,
        nome_empresa: nomeEmpresa || null,
        telefone: telefone || null,
        valor_plano: valorPlano,
        sistema_cliente: sistemaCliente,
        observacoes: observacoes || null,
        status: tipo,
        ativo: true,
        vencimento,
        status_pagamento: tipo === 'trial' ? 'trial' : 'em_dia',
        ultimo_pagamento: ultimoPagamento,
      },
    })
  } catch (error: any) {
    console.error('[ADMIN CLIENTES] erro fatal:', error)
    return NextResponse.json(
      {
        error: error?.message || 'Erro inesperado ao criar cliente.',
      },
      { status: 500 }
    )
  }
}
