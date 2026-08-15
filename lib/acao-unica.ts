/**
 * Guarda de ação única: garante que apenas uma abertura/processamento fique
 * pendente por vez, mesmo com múltiplos toques rápidos no celular.
 */
export type StatusAcaoUnica = 'executado' | 'ignorado'

export type GuardaAcaoUnica<T> = {
  pendente: () => T | null
  ocupado: () => boolean
  liberar: () => void
  executar: (id: T, acao: () => Promise<void> | void) => Promise<StatusAcaoUnica>
}

export function criarGuardaAcaoUnica<T>(opcoes: {
  aoMudar?: (pendente: T | null) => void
  /** Ações que navegam para outra página devem manter o bloqueio até a saída. */
  liberarNoSucesso?: boolean
} = {}): GuardaAcaoUnica<T> {
  const { aoMudar, liberarNoSucesso = true } = opcoes
  let pendente: T | null = null

  function definir(valor: T | null) {
    pendente = valor
    aoMudar?.(valor)
  }

  return {
    pendente: () => pendente,
    ocupado: () => pendente !== null,
    liberar: () => definir(null),
    async executar(id, acao) {
      if (pendente !== null) return 'ignorado'
      definir(id)
      try {
        await acao()
      } catch (erro) {
        definir(null)
        throw erro
      }
      if (liberarNoSucesso) definir(null)
      return 'executado'
    },
  }
}
