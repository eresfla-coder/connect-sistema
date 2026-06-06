import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BodyPayload = {
  user_id?: string
  email?: string
  nome_empresa?: string
  telefone?: string
  sistema_cliente?: string
}

function senhaTemporaria() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let meio = ''
  for (let i = 0; i < 6; i++) meio += letras[Math.floor(Math.random() * letras.length)]
  return `Connect@${meio}${new Date().getDate().toString().padStart(2, '0')}`
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
}

function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

async function localizarUserId(body: BodyPayload) {
  const idInformado = String(body.user_id || '').trim()
  const email = String(body.email || '').trim().toLowerCase()

  if (idInformado) {
    const teste = await supabaseAdmin.auth.admin.getUserById(idInformado)
    if (!teste.error && teste.data.user?.id) return teste.data.user.id
  }

  if (email) {
    const { data: perfil } = await supabaseAdmin
      .from('perfis')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()

    if (perfil?.id) {
      const teste = await supabaseAdmin.auth.admin.getUserById(String(perfil.id))
      if (!teste.error && teste.data.user?.id) return teste.data.user.id
    }

    let page = 1
    while (page <= 10) {
      const lista = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 })
      if (lista.error) break
      const usuariosAuth = (lista.data?.users || []) as Array<{ id?: string; email?: string | null }>
      const encontrado = usuariosAuth.find((u) => String(u.email || '').toLowerCase() === email)
      if (encontrado?.id) return encontrado.id
      if (usuariosAuth.length < 100) break
      page += 1
    }
  }

  return ''
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdminFromRequest(req)
    const body = (await req.json()) as BodyPayload

    const email = String(body.email || '').trim().toLowerCase()
    const userId = await localizarUserId(body)

    if (!userId) {
      return NextResponse.json(
        { error: 'Não encontrei o usuário no Authentication do Supabase. Confira se o cliente foi criado em Authentication > Users.' },
        { status: 404 }
      )
    }

    const novaSenha = senhaTemporaria()
    const updateResult = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: novaSenha,
      user_metadata: {
        senha_temporaria: true,
        senha_temporaria_em: new Date().toISOString(),
        reset_admin_por: admin.email,
      },
    })

    if (updateResult.error) {
      return NextResponse.json(
        {
          error:
            updateResult.error.message ||
            'Não foi possível redefinir a senha. Confira SUPABASE_SERVICE_ROLE_KEY no .env.local/Vercel.',
        },
        { status: 400 }
      )
    }

    const nome = String(body.nome_empresa || email || 'cliente').trim()
    const sistema = String(body.sistema_cliente || 'Connect Sistema').trim()
    const loginUrl = `${siteUrl()}/login`
    const textoWhatsApp = [
      `Olá, ${nome}!`,
      '',
      `Redefini sua senha de acesso ao ${sistema}.`,
      '',
      `Login: ${email}`,
      `Senha provisória: ${novaSenha}`,
      '',
      `Acesse: ${loginUrl}`,
      '',
      'Depois de entrar, altere a senha para uma de sua preferência.',
      '',
      '— Connect Sistema',
    ].join('\n')

    const telefone = onlyDigits(body.telefone)
    const whatsappUrl = telefone ? `https://wa.me/55${telefone.replace(/^55/, '')}?text=${encodeURIComponent(textoWhatsApp)}` : ''

    return NextResponse.json({
      ok: true,
      userId,
      email,
      temporaryPassword: novaSenha,
      accessLink: loginUrl,
      inviteText: textoWhatsApp,
      whatsappUrl,
    })
  } catch (error: any) {
    const status = error?.message === 'Acesso negado.' || error?.message === 'Sessão ausente.' || error?.message === 'Sessão inválida.' ? 403 : 500
    console.error('[ADMIN RESET SENHA] erro fatal:', error)
    return NextResponse.json({ error: error?.message || 'Erro inesperado ao redefinir senha.' }, { status })
  }
}
