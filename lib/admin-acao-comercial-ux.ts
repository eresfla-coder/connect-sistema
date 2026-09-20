/**
 * ADMIN.3.14 — UX robusta das ações comerciais (sem mudar regras backend).
 * Separação PATCH vs refresh; zero retry de escrita.
 */

export type AcaoComercialEscrita = 'renovar' | 'marcar_pago' | 'bloquear' | 'desbloquear'

export const MSG_SUCESSO_RENOVAR = 'Ciclo renovado com sucesso.'
export const MSG_SUCESSO_BLOQUEAR = 'Cliente bloqueado com sucesso.'
export const MSG_SUCESSO_DESBLOQUEAR = 'Cliente ativado com sucesso.'
export const MSG_SUCESSO_MARCAR_PAGO = 'Pagamento marcado como em dia.'

export const MSG_OPERACAO_NAO_CONFIRMADA =
  'Não foi possível confirmar a operação. Atualize o painel antes de tentar novamente.'

export const MSG_COMUNICACAO_SERVIDOR =
  'Não foi possível concluir a comunicação com o servidor. Verifique a conexão e tente novamente.'

export const MSG_REFRESH_APOS_SUCESSO =
  'A operação foi concluída, mas não foi possível atualizar o painel automaticamente. Atualize o painel.'

export type ResultadoPatchComercial =
  | { kind: 'ok'; payload?: unknown }
  | { kind: 'http_error'; status: number; mensagem: string }
  | { kind: 'sem_resposta' }

export type FeedbackAcaoComercial = {
  tipo: 'sucesso' | 'erro' | 'aviso'
  mensagem: string
  /** true = caller deve tentar refresh; false = não */
  tentarRefresh: boolean
  /** true = escrita confirmada pelo servidor */
  escritaConfirmada: boolean
}

/** PROIBIDO retry automático de escrita. */
export function deveFazerRetryEscritaComercial(): false {
  return false
}

export function mensagemSucessoAcaoComercial(acao: AcaoComercialEscrita): string {
  if (acao === 'renovar') return MSG_SUCESSO_RENOVAR
  if (acao === 'bloquear') return MSG_SUCESSO_BLOQUEAR
  if (acao === 'desbloquear') return MSG_SUCESSO_DESBLOQUEAR
  return MSG_SUCESSO_MARCAR_PAGO
}

export function isErroFetchSemResposta(error: unknown): boolean {
  if (error instanceof TypeError) return true
  const msg = error instanceof Error ? error.message : String(error || '')
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
}

/**
 * Interpreta resposta HTTP do PATCH (quando houve response).
 * Não faz retry.
 */
export function interpretarRespostaPatchComercial(params: {
  ok: boolean
  status: number
  errorMessage?: string | null
  payload?: unknown
}): ResultadoPatchComercial {
  if (params.ok) return { kind: 'ok', payload: params.payload }
  return {
    kind: 'http_error',
    status: params.status,
    mensagem: String(params.errorMessage || 'Não foi possível concluir a ação comercial.'),
  }
}

export function interpretarExcecaoPatchComercial(error: unknown): ResultadoPatchComercial {
  if (isErroFetchSemResposta(error)) return { kind: 'sem_resposta' }
  const mensagem = error instanceof Error ? error.message : 'Não foi possível concluir a ação comercial.'
  return { kind: 'http_error', status: 0, mensagem }
}

/**
 * Feedback após PATCH (antes do refresh).
 */
export function feedbackAposPatchComercial(params: {
  acao: AcaoComercialEscrita
  resultado: ResultadoPatchComercial
}): FeedbackAcaoComercial {
  if (params.resultado.kind === 'ok') {
    return {
      tipo: 'sucesso',
      mensagem: mensagemSucessoAcaoComercial(params.acao),
      tentarRefresh: true,
      escritaConfirmada: true,
    }
  }
  if (params.resultado.kind === 'sem_resposta') {
    return {
      tipo: 'erro',
      mensagem: MSG_OPERACAO_NAO_CONFIRMADA,
      tentarRefresh: false,
      escritaConfirmada: false,
    }
  }
  return {
    tipo: 'erro',
    mensagem: params.resultado.mensagem || MSG_COMUNICACAO_SERVIDOR,
    tentarRefresh: false,
    escritaConfirmada: false,
  }
}

/**
 * Após escrita confirmada: se refresh falhar, aviso (não erro da ação).
 */
export function feedbackAposRefreshComercial(params: {
  escritaConfirmada: boolean
  refreshOk: boolean
  mensagemSucesso: string
}): FeedbackAcaoComercial | null {
  if (!params.escritaConfirmada) return null
  if (params.refreshOk) {
    return {
      tipo: 'sucesso',
      mensagem: params.mensagemSucesso,
      tentarRefresh: false,
      escritaConfirmada: true,
    }
  }
  return {
    tipo: 'aviso',
    mensagem: MSG_REFRESH_APOS_SUCESSO,
    tentarRefresh: false,
    escritaConfirmada: true,
  }
}

/** Simula lock de reentrada (mesmo contrato de iniciarAcaoCliente / finalizarAcaoCliente). */
export function criarLockAcaoComercial() {
  let processandoId: string | null = null
  return {
    getProcessandoId: () => processandoId,
    iniciar(clienteId: string): boolean {
      if (processandoId && processandoId === clienteId) return false
      processandoId = clienteId
      return true
    },
    finalizar() {
      processandoId = null
    },
  }
}

/**
 * Executa fluxo PATCH → refresh sem retry de escrita.
 * Útil em testes: conta quantas vezes a escrita é invocada.
 */
export async function executarFluxoAcaoComercialSemRetry<T>(params: {
  escrever: () => Promise<T>
  refresh: () => Promise<void>
}): Promise<{
  resultadoPatch: ResultadoPatchComercial
  refreshOk: boolean
  escritaChamadas: number
}> {
  let escritaChamadas = 0
  let resultadoPatch: ResultadoPatchComercial
  try {
    escritaChamadas += 1
    const payload = await params.escrever()
    resultadoPatch = { kind: 'ok', payload }
  } catch (error: unknown) {
    resultadoPatch = interpretarExcecaoPatchComercial(error)
    // ZERO retry de escrita
    return { resultadoPatch, refreshOk: false, escritaChamadas }
  }

  let refreshOk = true
  try {
    await params.refresh()
  } catch {
    refreshOk = false
  }
  return { resultadoPatch, refreshOk, escritaChamadas }
}

/** Simula execução com refresh separado — testável sem rede. */
export function resolverFeedbackAcaoComercialCompleta(params: {
  acao: AcaoComercialEscrita
  resultadoPatch: ResultadoPatchComercial
  refreshOk?: boolean
}): FeedbackAcaoComercial {
  const aposPatch = feedbackAposPatchComercial({
    acao: params.acao,
    resultado: params.resultadoPatch,
  })
  if (!aposPatch.escritaConfirmada) return aposPatch
  return (
    feedbackAposRefreshComercial({
      escritaConfirmada: true,
      refreshOk: params.refreshOk !== false,
      mensagemSucesso: aposPatch.mensagem,
    }) || aposPatch
  )
}
