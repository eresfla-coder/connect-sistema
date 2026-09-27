/**
 * Mapper de persistência Supabase para public.orcamentos.
 * ADMIN.4.3.6 — colunas resumo (status/total/cliente) + payload intacto.
 * ADMIN.4.3.10 — payload sem envelope de publicação (CAMPOS_PUBLICACAO_NAO_PERSISTIDOS).
 *
 * NÃO recalcula totais (desconto/frete/m²). NÃO reestrutura payload.
 * A resolução sticky de status permanece no painel (aplicarStatusResolvido);
 * este módulo monta o row a partir do objeto já canônico.
 */

export type StatusOrcamentoUpsert = 'Pendente' | 'Aprovado' | 'Convertido' | 'Cancelado'

/** Shape mínimo canônico do orçamento salvo no painel (fonte do mapper). */
export type OrcamentoSalvoUpsertInput = {
  id: number
  status?: string
  total: number
  cliente: { nome?: string | null; [key: string]: unknown } | string | null
  aprovado?: boolean
  [key: string]: unknown
}

export type OrcamentoSupabaseUpsert = {
  user_id: string
  local_id: string
  status: StatusOrcamentoUpsert
  total: number
  cliente: string | null
  aprovado: boolean
  payload: Record<string, unknown>
}

export function normalizarStatusOrcamentoUpsert(status?: string): StatusOrcamentoUpsert {
  if (status === 'Aprovado' || status === 'Convertido' || status === 'Cancelado') return status
  return 'Pendente'
}

/**
 * Envelope de publicação injetado em public_documents
 * (enriquecerPayloadDocumentoPublico / garantirPublicacaoOrcamento).
 * Não pertence a OrcamentoSalvo: branding (pode conter logo base64,
 * resolvido pela configuração canônica da empresa) e metadados do link.
 * Somente primeiro nível — homônimos em cliente/itens são dados do documento.
 */
export const CAMPOS_PUBLICACAO_NAO_PERSISTIDOS = [
  'cfg',
  'config',
  'empresa_logo',
  'empresa_logo_og',
  'empresa_nome',
  'empresa_telefone',
  'empresa_email',
  'empresa_endereco',
  'token',
  'user_id',
  'owner_user_id',
] as const

/** Cópia do orçamento para `payload`, sem envelope de publicação. Não muta a entrada. */
export function serializarPayloadOrcamento(
  orcamento: OrcamentoSalvoUpsertInput,
): Record<string, unknown> {
  let copia: Record<string, unknown>
  try {
    copia = JSON.parse(JSON.stringify(orcamento)) as Record<string, unknown>
  } catch {
    copia = { ...orcamento } as Record<string, unknown>
  }
  for (const campo of CAMPOS_PUBLICACAO_NAO_PERSISTIDOS) delete copia[campo]
  return copia
}

/** Nome do cliente para coluna `cliente` — nunca "undefined"/"null" textuais. */
export function clienteNomeParaColuna(
  cliente: OrcamentoSalvoUpsertInput['cliente'],
): string | null {
  if (cliente == null) return null
  if (typeof cliente === 'string') {
    const nome = cliente.trim()
    if (!nome || nome === 'undefined' || nome === 'null') return null
    return nome
  }
  if (typeof cliente === 'object') {
    const raw = cliente.nome
    if (raw == null) return null
    const nome = String(raw).trim()
    if (!nome || nome === 'undefined' || nome === 'null') return null
    return nome
  }
  return null
}

/** Total canônico já persistido no objeto — sem recalcular desconto/frete/m². */
export function totalCanonicoParaColuna(total: number): number {
  const n = Number(total)
  return Number.isFinite(n) ? n : 0
}

/**
 * Row de upsert em public.orcamentos.
 * Preserva user_id, local_id, aprovado, payload e adiciona status/total/cliente.
 * Esperado: `orc` já passou por aplicarStatusResolvido no painel (comportamento pré-existente).
 */
export function orcamentoParaUpsertSupabase(
  orc: OrcamentoSalvoUpsertInput,
  userId: string,
): OrcamentoSupabaseUpsert {
  const status = normalizarStatusOrcamentoUpsert(
    typeof orc.status === 'string' ? orc.status : undefined,
  )

  return {
    user_id: userId,
    local_id: String(orc.id),
    status,
    total: totalCanonicoParaColuna(Number(orc.total)),
    cliente: clienteNomeParaColuna(orc.cliente),
    aprovado: status === 'Aprovado' || status === 'Convertido' || orc.aprovado === true,
    payload: serializarPayloadOrcamento(orc),
  }
}
