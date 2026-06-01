import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/api-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const body = await request.json().catch(() => ({}))
    const acao = String(body?.acao || '').trim()
    if (!acao) return NextResponse.json({ ok: false, message: 'Ação obrigatória.' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('logs_sistema').insert({
      user_id: user.id,
      acao,
      modulo: body?.modulo || null,
      referencia_id: body?.referencia_id || null,
      detalhes: body?.detalhes || null,
    })

    if (error) {
      if (String(error.message).includes('does not exist')) {
        return NextResponse.json({ ok: true, aviso: 'logs_sistema não configurado.' })
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao registrar log.'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
