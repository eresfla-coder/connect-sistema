import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const documentId = String(body?.document_id || body?.id || '').trim()
    const token = String(body?.token || '').trim()
    const status = String(body?.status || 'Assinado').trim()

    if (!documentId || !token) {
      return NextResponse.json({ success: false, error: 'document_id e token são obrigatórios.' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: doc, error: docErr } = await supabaseAdmin
      .from('public_documents')
      .select('token, document_id, documento_id, document_type, tipo')
      .eq('token', token)
      .maybeSingle()

    if (docErr || !doc) {
      return NextResponse.json({ success: false, error: 'Link inválido ou expirado.' }, { status: 404 })
    }

    const docIdSalvo = String(doc.document_id || doc.documento_id || '')
    if (docIdSalvo !== documentId) {
      return NextResponse.json({ success: false, error: 'Contrato não confere com o link.' }, { status: 403 })
    }

    const tipo = String(doc.document_type || doc.tipo || '')
    if (tipo !== 'contrato') {
      return NextResponse.json({ success: false, error: 'Documento inválido.' }, { status: 400 })
    }

    const updatePayload = { status }

    const { error: updateErr } = await supabaseAdmin.from('contratos').update(updatePayload).eq('id', documentId)

    if (updateErr) {
      console.warn('[contratos/assinatura] update por id:', updateErr.message)
    }

    return NextResponse.json({ success: true, status, document_id: documentId })
  } catch (error) {
    console.error('[contratos/assinatura]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 500 },
    )
  }
}
