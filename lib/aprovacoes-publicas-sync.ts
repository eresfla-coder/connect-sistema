/**
 * CONNECT SISTEMA — sync de aprovações públicas (orçamentos).
 * Helpers puros para reduzir volume de GET /api/public-docs sem batch endpoint.
 */

/** Intervalo do polling automático (antes: 60s). */
export const APROVACOES_SYNC_INTERVAL_MS = 5 * 60 * 1000

/** Máximo de documentos por ciclo (antes: 18). */
export const APROVACOES_SYNC_FANOUT_MAX = 5

/** Cooldown entre syncs disparados por focus / visibilitychange. */
export const APROVACOES_SYNC_UI_COOLDOWN_MS = 60 * 1000

/** Delay da sincronização inicial ao entrar na tela. */
export const APROVACOES_SYNC_INITIAL_DELAY_MS = 1200

export type AprovacoesSyncMotivo = 'initial' | 'interval' | 'ui-event'

export type AprovacoesSyncGateInput = {
  motivo: AprovacoesSyncMotivo
  agoraMs: number
  ultimaSyncMs: number
  rodando: boolean
  /** document.visibilityState === 'visible' */
  visivel: boolean
  temItens: boolean
}

export type AprovacoesSyncGateResult = {
  pular: boolean
  razao?: 'single-flight' | 'empty' | 'hidden' | 'ui-cooldown'
}

/**
 * Decide se um disparo de sync deve ser ignorado.
 * - single-flight: já há execução em andamento
 * - hidden: aba não visível
 * - ui-event: respeita cooldown de 60s desde a última sync efetiva
 * - interval/initial: não usam o cooldown de UI (intervalo já é 5 min)
 */
export function devePularSyncAprovacoes(input: AprovacoesSyncGateInput): AprovacoesSyncGateResult {
  if (input.rodando) return { pular: true, razao: 'single-flight' }
  if (!input.temItens) return { pular: true, razao: 'empty' }
  if (!input.visivel) return { pular: true, razao: 'hidden' }
  if (input.motivo === 'ui-event') {
    if (input.agoraMs - input.ultimaSyncMs < APROVACOES_SYNC_UI_COOLDOWN_MS) {
      return { pular: true, razao: 'ui-cooldown' }
    }
  }
  return { pular: false }
}

/** Únicos campos do documento público que o sync de aprovação copia para o orçamento. */
export const CAMPOS_PATCH_APROVACAO_PUBLICA = [
  'status',
  'aprovado',
  'aprovadoEm',
  'aprovacaoDigital',
  'atualizadoEm',
] as const

export type PatchAprovacaoPublica = {
  status?: string
  aprovado?: boolean
  aprovadoEm?: string
  aprovacaoDigital?: {
    status?: 'aprovado' | 'recusado'
    nome?: string
    data?: string
    assinatura?: string
    origem?: string
  }
  atualizadoEm?: number
}

/**
 * Allowlist: monta o patch campo a campo a partir do payload público.
 * Qualquer outra propriedade (cfg, config, logos, token, user_id...) é ignorada.
 */
export function extrairPatchAprovacaoPublica(publico: unknown): PatchAprovacaoPublica {
  if (!publico || typeof publico !== 'object' || Array.isArray(publico)) return {}
  const p = publico as Record<string, unknown>
  const patch: PatchAprovacaoPublica = {}
  if (typeof p.status === 'string') patch.status = p.status
  if (typeof p.aprovado === 'boolean') patch.aprovado = p.aprovado
  if (typeof p.aprovadoEm === 'string') patch.aprovadoEm = p.aprovadoEm
  if (p.aprovacaoDigital && typeof p.aprovacaoDigital === 'object' && !Array.isArray(p.aprovacaoDigital)) {
    patch.aprovacaoDigital = JSON.parse(JSON.stringify(p.aprovacaoDigital)) as PatchAprovacaoPublica['aprovacaoDigital']
  }
  const atualizadoEm = Number(p.atualizadoEm)
  if (p.atualizadoEm != null && Number.isFinite(atualizadoEm) && atualizadoEm > 0) patch.atualizadoEm = atualizadoEm
  return patch
}

function valorCanonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(valorCanonico)
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {}
    for (const chave of Object.keys(valor).sort()) {
      const v = (valor as Record<string, unknown>)[chave]
      if (v !== undefined) saida[chave] = valorCanonico(v)
    }
    return saida
  }
  return valor
}

/** JSON determinístico (chaves ordenadas) apenas para comparação; não altera o valor. */
export function serializacaoCanonica(valor: unknown): string {
  return JSON.stringify(valorCanonico(valor ?? null)) ?? 'null'
}

/** Compara conteúdo (não referência). Ausente equivale a `{}`, como no comportamento anterior. */
export function aprovacaoDigitalEquivalente(a: unknown, b: unknown): boolean {
  return serializacaoCanonica(a ?? {}) === serializacaoCanonica(b ?? {})
}

export type CamposAprovacaoOrcamento = {
  status?: string | null
  aprovado?: boolean | null
  aprovadoEm?: string | null
  aprovacaoDigital?: unknown
  atualizadoEm?: number | null
}

/**
 * Decide se o resultado do sync de aprovação (já resolvido pelo painel) difere
 * semanticamente do orçamento local. Considera somente os campos da allowlist;
 * qualquer outra propriedade (cfg, logos, token, empresa_*...) é irrelevante.
 * Campos ausentes no resolvido não são mudança. `atualizadoEm` só conta se o
 * remoto for mais novo (remoto mais antigo não é mudança real e causaria regravação
 * a cada ciclo).
 */
export function syncAprovacaoExigePersistencia(
  local: CamposAprovacaoOrcamento,
  resolvido: CamposAprovacaoOrcamento,
): boolean {
  if (String(local.status ?? '') !== String(resolvido.status ?? '')) return true
  if (Boolean(local.aprovado) !== Boolean(resolvido.aprovado)) return true
  if (resolvido.aprovadoEm != null && String(local.aprovadoEm ?? '') !== String(resolvido.aprovadoEm)) return true
  if (resolvido.aprovacaoDigital != null && !aprovacaoDigitalEquivalente(local.aprovacaoDigital, resolvido.aprovacaoDigital)) {
    return true
  }
  const remotoEm = Number(resolvido.atualizadoEm)
  if (resolvido.atualizadoEm != null && Number.isFinite(remotoEm) && remotoEm > Number(local.atualizadoEm || 0)) return true
  return false
}

/** Após o sync, persiste somente orçamentos alterados pelo sync que estejam aprovados/convertidos. */
export function selecionarOrcamentosParaPersistirAposSync<
  T extends { id?: number | string | null; status?: string | null; aprovado?: boolean | null },
>(lista: T[], idsAlterados: ReadonlySet<string>): T[] {
  return lista.filter(
    (item) =>
      idsAlterados.has(String(item.id)) &&
      (item.status === 'Aprovado' || item.status === 'Convertido' || item.aprovado === true),
  )
}

export type OrcamentoSyncLite = {
  id?: number | string | null
  status?: string | null
}

export type SelecaoSyncAprovacao<T> = {
  selecionados: T[]
  /** Próximo índice na lista elegível ordenada (round-robin em memória). */
  nextCursorOffset: number
}

/** Elegíveis: pendentes (não aprov/cancel/recus), mais recentes (id) primeiro. */
export function listarOrcamentosElegiveisSyncAprovacao<T extends OrcamentoSyncLite>(lista: T[]): T[] {
  return [...lista]
    .filter((orcamento) => {
      const status = String(orcamento?.status || '').toLowerCase()
      return !status.includes('aprov') && !status.includes('cancel') && !status.includes('recus')
    })
    .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
}

/**
 * Seleciona até `limite` elegíveis com round-robin a partir de `cursorOffset`.
 * Cursor é só memória de chamada (não persiste). Índice fora do tamanho é normalizado.
 */
export function selecionarOrcamentosParaSyncAprovacao<T extends OrcamentoSyncLite>(
  lista: T[],
  limite: number = APROVACOES_SYNC_FANOUT_MAX,
  cursorOffset: number = 0,
): SelecaoSyncAprovacao<T> {
  const elegiveis = listarOrcamentosElegiveisSyncAprovacao(lista)
  if (elegiveis.length === 0) {
    return { selecionados: [], nextCursorOffset: 0 }
  }

  const max = Math.min(Math.max(0, Math.trunc(limite)), elegiveis.length)
  if (max === 0) {
    return { selecionados: [], nextCursorOffset: 0 }
  }

  const start =
    ((Math.trunc(cursorOffset) % elegiveis.length) + elegiveis.length) % elegiveis.length
  const selecionados: T[] = []
  for (let i = 0; i < max; i += 1) {
    selecionados.push(elegiveis[(start + i) % elegiveis.length])
  }

  return {
    selecionados,
    nextCursorOffset: (start + max) % elegiveis.length,
  }
}
