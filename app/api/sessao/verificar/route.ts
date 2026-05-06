import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ADMIN_EMAILS } from '@/lib/access'

export const dynamic = 'force-dynamic'

type Payload = {
  deviceId?: string
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return ''
  return auth.slice(7).trim()
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ ok: false, active: false, reason: 'sem_sessao' }, { status: 401 })
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    const user = userData?.user

    if (userError || !user) {
      return NextResponse.json({ ok: false, active: false, reason: 'sessao_invalida' }, { status: 401 })
    }

    const email = String(user.email || '').trim().toLowerCase()
    if (ADMIN_EMAILS.includes(email)) {
      return NextResponse.json({ ok: true, active: true, admin: true })
    }

    const body = (await req.json().catch(() => ({}))) as Payload
    const deviceId = String(body.deviceId || '').trim()

    if (!deviceId) {
      return NextResponse.json({ ok: true, active: false, reason: 'dispositivo_invalido' })
    }

    const { data, error } = await supabaseAdmin
      .from('sessoes_ativas')
      .select('session_token,device_label,updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('ERRO_VERIFICAR_SESSAO:', error)
      return NextResponse.json({ ok: false, active: true, reason: 'tabela_nao_configurada' })
    }

    if (!data?.session_token) {
      return NextResponse.json({ ok: true, active: true, reason: 'sem_registro' })
    }

    const active = String(data.session_token) === deviceId

    if (active) {
      await supabaseAdmin
        .from('sessoes_ativas')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      ok: true,
      active,
      reason: active ? 'ativo' : 'substituido',
      deviceLabel: data.device_label || null,
    })
  } catch (error: any) {
    console.error('ERRO_API_VERIFICAR_SESSAO:', error)
    return NextResponse.json({ ok: false, active: true, reason: 'erro_interno' })
  }
}
