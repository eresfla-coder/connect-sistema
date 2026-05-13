import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { RECIBO_DOCUMENT_TYPE } from '@/lib/recibo-publico'

function erro(mensagem: string, status = 400) {
  return NextResponse.json({ error: mensagem }, { status })
}

function gerarToken() {
  return crypto.randomUUID().replace(/-/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const documentType = String(body?.document_type || '')
    const snapshot = body?.snapshot

    if (documentType !== RECIBO_DOCUMENT_TYPE) {
      return erro('Tipo de documento inválido.')
    }

    if (!snapshot || typeof snapshot !== 'object') {
      return erro('Snapshot do documento é obrigatório.')
    }

    const id = crypto.randomUUID()
    const token = gerarToken()
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('public_documents')
      .insert({
        id,
        token,
        document_type: documentType,
        snapshot,
      })
      .select('id, token, document_type, snapshot, created_at')
      .single()

    if (error) {
      console.error('Erro ao salvar documento público:', error)
      return erro('Não foi possível salvar o documento público.', 500)
    }

    return NextResponse.json({
      id: data?.id || id,
      token: data?.token || token,
      document_type: data?.document_type || documentType,
      snapshot: data?.snapshot || snapshot,
      created_at: data?.created_at || null,
    })
  } catch (error) {
    console.error('Erro inesperado em public-docs POST:', error)
    return erro('Não foi possível processar o documento público.', 500)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const id = String(searchParams.get('id') || '')
    const token = String(searchParams.get('token') || '')
    const documentType = String(searchParams.get('document_type') || RECIBO_DOCUMENT_TYPE)

    if (!id || !token) {
      return erro('Documento e token são obrigatórios.')
    }

    if (documentType !== RECIBO_DOCUMENT_TYPE) {
      return erro('Tipo de documento inválido.')
    }

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('public_documents')
      .select('id, token, document_type, snapshot, created_at')
      .eq('id', id)
      .eq('token', token)
      .eq('document_type', documentType)
      .maybeSingle()

    if (error) {
      console.error('Erro ao carregar documento público:', error)
      return erro('Não foi possível carregar o documento público.', 500)
    }

    if (!data) {
      return erro('Documento público não encontrado.', 404)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Erro inesperado em public-docs GET:', error)
    return erro('Não foi possível carregar o documento público.', 500)
  }
}
