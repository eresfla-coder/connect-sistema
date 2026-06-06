import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminMasterServer } from '@/lib/access-server'

export const dynamic = 'force-dynamic'

type Payload = {
  deviceId?: string
  deviceLabel?: string
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return ''
  return auth.slice(7).trim()
}

function getClientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    ''
  )
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Sessão não informada.' }, { status: 401 })
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    const user = userData?.user

    if (userError || !user) {
      return NextResponse.json({ ok: false, message: 'Sessão inválida.' }, { status: 401 })
    }

    const email = String(user.email || '').trim().toLowerCase()
    if (isAdminMasterServer(email)) {
      return NextResponse.json({ ok: true, admin: true })
    }

    const body = (await req.json().catch(() => ({}))) as Payload
    const deviceId = String(body.deviceId || '').trim()

    if (!deviceId || deviceId.length < 12) {
      return NextResponse.json({ ok: false, message: 'Dispositivo inválido.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const userAgent = req.headers.get('user-agent') || ''
    const ip = getClientIp(req)

    const { error } = await supabaseAdmin.from('sessoes_ativas').upsert(
      {
        user_id: user.id,
        email,
        session_token: deviceId,
        device_label: String(body.deviceLabel || 'Dispositivo').slice(0, 120),
        user_agent: userAgent.slice(0, 500),
        ip_address: ip.slice(0, 80),
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    )

    if (error) {
      console.error('ERRO_REGISTRAR_SESSAO:', error)
      return NextResponse.json(
        { ok: false, message: 'Tabela de sessões não configurada.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('ERRO_API_REGISTRAR_SESSAO:', error)
    return NextResponse.json(
      { ok: false, message: error?.message || 'Erro ao registrar sessão.' },
      { status: 500 }
    )
  }
}
