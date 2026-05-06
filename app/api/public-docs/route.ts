import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function gerarToken() {
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function erroApi(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'Erro interno.'
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const url = new URL(req.url)
    const tipo = String(url.searchParams.get('tipo') || '').trim()
    const documentoId = String(url.searchParams.get('documentoId') || url.searchParams.get('id') || '').trim()

    if (!tipo || !documentoId) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('public_documents')
      .select('token, tipo, documento_id, payload, updated_at')
      .eq('tipo', tipo)
      .eq('documento_id', documentoId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return erroApi(error)
    if (!data) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    return erroApi(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const body = await req.json()
    const tipo = String(body?.tipo || '').trim()
    const payload = body?.payload
    const documentoId = String(body?.documentoId || payload?.id || payload?.i || '').trim()

    if (!tipo || !payload || !documentoId) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    }

    const existente = await supabaseAdmin
      .from('public_documents')
      .select('token')
      .eq('tipo', tipo)
      .eq('documento_id', documentoId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existente.error) return erroApi(existente.error)

    const token = String(body?.token || existente.data?.token || gerarToken()).trim()

    const { error } = await supabaseAdmin.from('public_documents').upsert({
      token,
      tipo,
      documento_id: documentoId,
      payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'token' })

    if (error) return erroApi(error)

    return NextResponse.json({ token, tipo, documentoId })
  } catch (error) {
    return erroApi(error)
  }
}
