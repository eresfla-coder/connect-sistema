import { NextRequest, NextResponse } from 'next/server'
import { osParaUpsertSupabaseRow } from '@/lib/ordensServicoServer'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const [type, token] = authHeader.split(' ')
  if (String(type || '').toLowerCase() !== 'bearer') return ''
  return String(token || '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !authData?.user?.id) {
      return NextResponse.json({ success: false, error: 'Sessão inválida.' }, { status: 401 })
    }

    const userId = authData.user.id
    const body = await req.json().catch(() => ({}))
    const os = body?.os || body?.payload || body

    if (!os?.id) {
      return NextResponse.json({ success: false, error: 'OS inválida.' }, { status: 400 })
    }

    const row = osParaUpsertSupabaseRow(os, userId)

    const { data, error } = await supabaseAdmin
      .from('ordens_servico')
      .upsert(row, { onConflict: 'user_id,local_id' })
      .select('local_id')
      .maybeSingle()

    if (error) {
      console.error('[API_OS_SYNC]', error)
      return NextResponse.json(
        { success: false, error: error.message || 'Falha ao gravar OS na nuvem.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      local_id: data?.local_id || row.local_id,
      user_id: userId,
    })
  } catch (e) {
    console.error('[API_OS_SYNC]', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Erro interno.' },
      { status: 500 }
    )
  }
}
