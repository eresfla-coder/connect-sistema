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
