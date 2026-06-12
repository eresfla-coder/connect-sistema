import { montarUrlPublicaDocumento, timestampVersaoPublica } from '@/lib/empresaPublica'
import { supabase } from '@/lib/supabase'

export type PublicacaoOrcamentoResult = {
  url: string
  urlView: string
  token: string
  link: string
  updatedAt?: string
}

/**
 * Publica ou atualiza idempotentemente um orçamento em public_documents.
 * Exige Bearer do emitente (Sprint Segurança).
 */
export async function garantirPublicacaoOrcamento(
  documentoId: number | string,
  payload: Record<string, unknown>,
  cfgPublica: Record<string, unknown>,
): Promise<PublicacaoOrcamentoResult> {
  const id = String(documentoId)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sessão inválida. Faça login para publicar o orçamento.')
  }
  headers.Authorization = `Bearer ${session.access_token}`

  const resp = await fetch('/api/public-docs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tipo: 'orcamento',
      documentoId: id,
      document_type: 'orcamento',
      document_id: id,
      payload: { ...payload, config: cfgPublica, cfg: cfgPublica },
    }),
  })

  let json: Record<string, unknown> = {}
  try {
    json = (await resp.json()) as Record<string, unknown>
  } catch {
    json = {}
  }

  if (!resp.ok || !json?.token) {
    throw new Error(String(json?.error || 'Não foi possível publicar o orçamento.'))
  }

  const token = String(json.token)
  const v = timestampVersaoPublica(String(json.updated_at || Date.now()))
  const url = montarUrlPublicaDocumento('/impressao-orcamento', id, {
    token,
    preview: true,
    v,
  })

  return {
    url,
    urlView: url.replace('/impressao-orcamento/', '/view/orcamento/'),
    token,
    link: url,
    updatedAt: String(json.updated_at || ''),
  }
}
