/**
 * CONNECT SISTEMA — view opt-in `view=aprovacao` de GET /api/public-docs.
 * Projeção mínima do payload para o sync de aprovações do painel (owner + orçamento).
 */

export const PUBLIC_DOCS_VIEW_APROVACAO = 'aprovacao'

/** Mesmos campos de CAMPOS_PATCH_APROVACAO_PUBLICA (lib/aprovacoes-publicas-sync). */
export const CAMPOS_VIEW_APROVACAO = [
  'status',
  'aprovado',
  'aprovadoEm',
  'aprovacaoDigital',
  'atualizadoEm',
] as const

/**
 * Select PostgREST com `->` (preserva o tipo JSON; `->>` converteria para texto).
 * Chave ausente no payload retorna null.
 */
export const PUBLIC_DOCS_APROVACAO_VIEW_COLS =
  'status:payload->status,aprovado:payload->aprovado,aprovadoEm:payload->aprovadoEm,aprovacaoDigital:payload->aprovacaoDigital,atualizadoEm:payload->atualizadoEm'

export type ViewAprovacaoGateInput = {
  view: string | null | undefined
  documentType: string
  /** Token público recebido (token/p), mesmo que inválido. */
  token: string
  userIdOwner: string
}

/** Só owner autenticado, sem token público, orçamento e view explícita. */
export function deveUsarViewAprovacao(input: ViewAprovacaoGateInput): boolean {
  return (
    input.view === PUBLIC_DOCS_VIEW_APROVACAO &&
    input.documentType === 'orcamento' &&
    !input.token &&
    Boolean(input.userIdOwner)
  )
}

/** Resposta da view: somente os campos da allowlist não nulos, valores intactos. */
export function montarRespostaViewAprovacao(row: unknown): { payload: Record<string, unknown> } {
  const origem =
    row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {}
  const payload: Record<string, unknown> = {}
  for (const campo of CAMPOS_VIEW_APROVACAO) {
    const valor = origem[campo]
    if (valor !== null && valor !== undefined) payload[campo] = valor
  }
  return { payload }
}
