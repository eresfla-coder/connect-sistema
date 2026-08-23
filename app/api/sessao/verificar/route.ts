import { NextRequest, NextResponse } from 'next/server'
import { isAdminMasterServer } from '@/lib/access-server'
import { getBearerToken } from '@/lib/api-auth'
import { verificarSessaoUsuario } from '@/lib/sessao-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type Payload = {
  deviceId?: string
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
    if (isAdminMasterServer(email)) {
      return NextResponse.json({ ok: true, active: true, admin: true })
    }

    const body = (await req.json().catch(() => ({}))) as Payload
    const deviceId = String(body.deviceId || '').trim()
    if (!deviceId) {
      return NextResponse.json({ ok: true, active: false, reason: 'dispositivo_invalido' })
    }

    const result = await verificarSessaoUsuario({ userId: user.id, deviceId })
    const active = result.active === true
    return NextResponse.json({
      ...result,
      active,
      ativa: active,
    })
  } catch (error: unknown) {
    console.error('ERRO_API_VERIFICAR_SESSAO:', error)
    return NextResponse.json({ ok: false, active: true, reason: 'erro_interno' })
  }
}
