import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function erroApi(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'Erro interno.'
  return NextResponse.json({ error: message }, { status })
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { token } = await context.params

    if (!token) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('public_documents')
      .select('token, tipo, documento_id, payload, updated_at')
      .eq('token', token)
      .maybeSingle()

    if (error) return erroApi(error)
    if (!data) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    return erroApi(error)
  }
}
