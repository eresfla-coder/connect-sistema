import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { RECIBO_DOCUMENT_TYPE } from '@/lib/recibo-publico'

function erro(mensagem: string, status = 400) {
  return NextResponse.json({ error: mensagem }, { status })
}

function gerarToken() {
  return crypto.randomUUID().replace(/-/g, '')
}

function extrairSnapshot(body: any) {
  return body?.snapshot || body?.payload || body?.ficha
}

function normalizarDocumento(
  data: any,
  documentId: string,
  token: string,
  documentType: string,
  snapshot: unknown
) {
  const snapshotSalvo = data?.snapshot || data?.payload || data?.ficha || snapshot
  const publicId = String(data?.document_id || data?.id || documentId)

  return {
    ...data,
    id: publicId,
    document_id: String(data?.document_id || publicId),
    token: data?.token || token,
    document_type: data?.document_type || documentType,
    snapshot: snapshotSalvo,
    ficha: data?.ficha || snapshotSalvo,
    payload: data?.payload || snapshotSalvo,
    created_at: data?.created_at || null,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const documentType = String(body?.document_type || body?.documento_tipo || '')
    const snapshot = extrairSnapshot(body)

    if (documentType !== RECIBO_DOCUMENT_TYPE) {
      return erro('Tipo de documento inválido.')
    }

    if (!snapshot || typeof snapshot !== 'object') {
      return erro('Snapshot do documento é obrigatório.')
    }

    const recordId = crypto.randomUUID()
    const documentId = String(
      body?.document_id ||
        body?.id ||
        snapshot?.id ||
        snapshot?.numero ||
        snapshot?.numeroRecibo ||
        recordId
    )
    const token = gerarToken()
    const supabase = createServerClient()

    const tentativas = [
      {
        id: recordId,
        token,
        document_type: documentType,
        document_id: documentId,
        ficha: snapshot,
        payload: snapshot,
        snapshot,
      },
      {
        id: recordId,
        token,
        document_type: documentType,
        document_id: documentId,
        payload: snapshot,
      },
      {
        id: recordId,
        token,
        document_type: documentType,
        snapshot,
      },
    ]

    let ultimoErro: unknown = null

    for (const registro of tentativas) {
      const { data, error } = await supabase
        .from('public_documents')
        .insert(registro)
        .select('*')
        .single()

      if (!error) {
        return NextResponse.json(
          normalizarDocumento(data, documentId, token, documentType, snapshot)
        )
      }

      ultimoErro = error
    }

    console.error('Erro ao salvar documento público:', ultimoErro)
    return erro('Não foi possível salvar o documento público.', 500)
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
    const campos = ['document_id', 'id']
    let ultimoErro: unknown = null

    for (const campo of campos) {
      const { data, error } = await supabase
        .from('public_documents')
        .select('*')
        .eq(campo, id)
        .eq('token', token)
        .eq('document_type', documentType)
        .maybeSingle()

      if (!error && data) {
        return NextResponse.json(
          normalizarDocumento(data, id, token, documentType, data?.snapshot || data?.payload || data?.ficha)
        )
      }

      if (error) {
        ultimoErro = campo === 'id' ? error : ultimoErro
      }
    }

    if (ultimoErro) {
      console.error('Erro ao carregar documento público:', ultimoErro)
      return erro('Não foi possível carregar o documento público.', 500)
    }

    return erro('Documento público não encontrado.', 404)
  } catch (error) {
    console.error('Erro inesperado em public-docs GET:', error)
    return erro('Não foi possível carregar o documento público.', 500)
  }
}
