import { NextRequest, NextResponse } from 'next/server'
import { isAdminMasterServer } from '@/lib/access-server'
import { getBearerToken } from '@/lib/api-auth'
import { encerrarSessaoUsuario } from '@/lib/sessao-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type Payload = {
  deviceId?: string
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

    const result = await encerrarSessaoUsuario({
      userId: user.id,
      motivo: 'logout',
      somenteSeToken: deviceId || undefined,
    })

    return NextResponse.json({ ok: result.ok, ended: result.encerrada })
  } catch (error: unknown) {
    console.error('ERRO_API_ENCERRAR_SESSAO:', error)
    return NextResponse.json({ ok: false, message: 'Erro ao encerrar sessão.' }, { status: 500 })
  }
}
