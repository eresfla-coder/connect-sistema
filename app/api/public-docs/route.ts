import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import type { PublicDocumentSnapshot, PublicDocumentType } from '@/lib/connect-public'

export const dynamic = 'force-dynamic'

type PublicDocumentRow = Record<string, unknown>

const VALID_TYPES = new Set<PublicDocumentType>(['orcamento', 'ordem_servico'])

function normalizeDocumentType(value?: unknown): PublicDocumentType | null {
  if (typeof value !== 'string') return null

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')

  if (['orcamento', 'quote', 'quotation', 'cotacao'].includes(normalized)) {
    return 'orcamento'
  }

  if (
    [
      'os',
      'service_order',
      'ordem_servico',
      'ordem-servico',
      'ordem_de_servico',
      'ordem-de-servico',
    ].includes(normalized)
  ) {
    return 'ordem_servico'
  }

  return null
}

function looksLikeServiceOrder(value: unknown) {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  const document =
    candidate.document && typeof candidate.document === 'object'
      ? (candidate.document as Record<string, unknown>)
      : candidate

  return Boolean(
    document.equipamento ||
      document.defeito ||
      document.checklist ||
      document.tecnico ||
      document.prioridade ||
      document.serial ||
      document.entrada ||
      document.saldo
  )
}

function generateToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replaceAll('-', '')
  }

  const bytes = new Uint8Array(24)
  globalThis.crypto?.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function normalizePayload(value: unknown): PublicDocumentSnapshot | null {
  if (!value) return null

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as PublicDocumentSnapshot
    } catch {
      return null
    }
  }

  if (typeof value === 'object') {
    return value as PublicDocumentSnapshot
  }

  return null
}

function extractPayload(row: PublicDocumentRow): PublicDocumentSnapshot | null {
  const payload =
    normalizePayload(row.payload) ||
    normalizePayload(row.data) ||
    normalizePayload(row.document) ||
    normalizePayload(row.content) ||
    normalizePayload(row.snapshot)

  if (payload) return payload

  const documentType = row.document_type || row.type
  const documentId = row.document_id || row.public_id

  if (typeof documentType !== 'string' || typeof documentId !== 'string') {
    return null
  }

  return {
    documentType: normalizeDocumentType(documentType) || (documentType as PublicDocumentType),
    document_type: normalizeDocumentType(documentType) || (documentType as PublicDocumentType),
    documentId,
    document_id: documentId,
    document: row,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function payloadMatches(
  payload: PublicDocumentSnapshot,
  documentType: PublicDocumentType,
  documentId: string
) {
  const payloadDocument = payload.document as { id?: string | number; numero?: string | number } | undefined
  const payloadType = normalizeDocumentType(payload.document_type || payload.documentType)
  const payloadId = payload.document_id || payload.documentId || payloadDocument?.id || payloadDocument?.numero

  return payloadType === documentType && String(payloadId) === documentId
}

export async function POST(request: NextRequest) {
  let body: {
    document_type?: string
    documentType?: PublicDocumentType
    type?: string
    tipo?: string
    document_id?: string | number
    documentId?: string | number
    token?: string
    payload?: PublicDocumentSnapshot
  }

  try {
    body = await request.json()
  } catch {
    return jsonError('JSON invalido.', 400)
  }

  const payload = body.payload
  const documentType =
    normalizeDocumentType(body.document_type || body.documentType || body.type || body.tipo) ||
    normalizeDocumentType(payload?.document_type || payload?.documentType) ||
    normalizeDocumentType((payload as Record<string, unknown> | undefined)?.type) ||
    normalizeDocumentType((payload as Record<string, unknown> | undefined)?.tipo) ||
    (looksLikeServiceOrder(payload) ? 'ordem_servico' : null)
  const documentId = String(body.document_id || body.documentId || '')

  if (!documentType || !VALID_TYPES.has(documentType)) {
    return jsonError('Tipo de documento publico invalido.', 400)
  }

  if (!documentId) {
    return jsonError('ID do documento publico e obrigatorio.', 400)
  }

  if (!payload || typeof payload !== 'object') {
    return jsonError('Snapshot publico invalido.', 400)
  }

  const token = body.token || generateToken()
  const snapshot: PublicDocumentSnapshot = {
    ...payload,
    documentType,
    document_type: documentType,
    documentId,
    document_id: documentId,
    createdAt: payload.createdAt || new Date().toISOString(),
  }

  let supabase
  try {
    supabase = createServiceRoleClient()
  } catch (error) {
    console.error('Erro ao criar service role client:', error)
    return jsonError('Publicacao indisponivel sem service role configurada.', 503)
  }

  const row: PublicDocumentRow = {
    document_type: documentType,
    document_id: documentId,
    token,
    payload: snapshot,
  }

  const { data: existing, error: selectError } = await supabase
    .from('public_documents')
    .select('id')
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .limit(1)
    .maybeSingle()

  if (selectError) {
    console.error('Erro ao consultar public_documents para atualização:', selectError)
  }

  if (!selectError && existing?.id) {
    const { error: updateError } = await supabase
      .from('public_documents')
      .update(row)
      .eq('id', existing.id)

    if (!updateError) {
      return NextResponse.json({
        token,
        documentType,
        document_type: documentType,
        documentId,
        document_id: documentId,
        payload: snapshot,
      })
    }

    console.error('Erro ao atualizar public_documents:', updateError)
  }

  const { error: insertError } = await supabase.from('public_documents').insert(row)

  if (insertError) {
    console.error('Erro ao salvar public_documents:', insertError)
    return jsonError('Nao foi possivel salvar o documento publico.', 500)
  }

  return NextResponse.json({
    token,
    documentType,
    document_type: documentType,
    documentId,
    document_id: documentId,
    payload: snapshot,
  })
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const documentType = normalizeDocumentType(
    searchParams.get('document_type') || searchParams.get('type') || searchParams.get('tipo')
  )
  const documentId = searchParams.get('document_id') || searchParams.get('id') || ''
  const token = searchParams.get('token') || ''

  if (!documentType || !VALID_TYPES.has(documentType)) {
    return jsonError('Tipo de documento publico invalido.', 400)
  }

  if (!documentId || !token) {
    return jsonError('ID e token sao obrigatorios.', 400)
  }

  let supabase
  try {
    supabase = createServiceRoleClient()
  } catch (error) {
    console.error('Erro ao criar service role client:', error)
    return jsonError('Consulta publica indisponivel sem service role configurada.', 503)
  }

  const { data, error } = await supabase
    .from('public_documents')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar public_documents:', error)
    return jsonError('Documento publico nao encontrado.', 404)
  }

  if (!data) {
    return jsonError('Documento publico nao encontrado.', 404)
  }

  const payload = extractPayload(data as PublicDocumentRow)

  if (!payload || !payloadMatches(payload, documentType, documentId)) {
    return jsonError('Documento publico nao encontrado.', 404)
  }

  return NextResponse.json({
    token,
    documentType,
    document_type: documentType,
    documentId,
    document_id: documentId,
    payload,
  })
}
