/**
 * Decisão de acesso ao painel (client) — sem React, sem Supabase: dependências injetadas.
 * Só libera com resposta positiva e completa de /api/painel/acesso.
 * Falha técnica (timeout, exceção, 5xx, resposta inválida, prazo de 20 s) → indisponível, nunca liberado
 * e nunca apresentado como inadimplência.
 */

export const SESSAO_TIMEOUT_MS = 2500
export const ACESSO_RETRY_MS = 900
export const ACESSO_MAX_TENTATIVAS = 3
export const SAFETY_TIMEOUT_MS = 20000

export const MENSAGEM_ACESSO_INDISPONIVEL =
  'Não foi possível confirmar seu acesso agora. Verifique sua conexão e tente novamente.'

export type RespostaAcessoPainel = {
  ok: boolean
  reason?: string
  message?: string
  userId?: string
  email?: string
  adminLogado?: boolean
  avisoTrial?: string | null
  bloqueado?: boolean
  assinaturaVencida?: boolean
  diasVencidos?: number
  statusNormalizado?: string
  perfil?: { vencimento?: string | null; status?: string | null }
  isTrial?: boolean
}

export type SessaoPainel = {
  data: { session: { user?: { id: string }; access_token?: string } | null }
  error: { message: string } | null
}

export type AcaoAcessoPainel =
  | 'liberar'
  | 'liberar_demo'
  | 'bloquear'
  | 'login'
  | 'manutencao'
  | 'indisponivel'

export type DecisaoAcessoPainel = {
  acao: AcaoAcessoPainel
  /** reason devolvido pela API ou motivo técnico local. */
  motivo?: string
  mensagem?: string
  destino?: string
  acesso?: RespostaAcessoPainel
}

/** Motivos técnicos em que vale repetir a consulta; os demais são respostas definitivas da API. */
function motivoRetentavel(reason?: string) {
  const r = String(reason || '')
  return r === '' || r === 'timeout' || r === 'erro_rede' || r === 'erro_parse' || r === 'perfil_indisponivel' || /^http_5\d\d$/.test(r)
}

/** Confirmação positiva: ok === true e estado de bloqueio explícito. Qualquer outra forma é inválida. */
export function acessoConfirmado(acesso: unknown): boolean {
  if (!acesso || typeof acesso !== 'object') return false
  const a = acesso as RespostaAcessoPainel
  return a.ok === true && typeof a.bloqueado === 'boolean' && typeof a.userId === 'string' && a.userId !== ''
}

export function indisponivel(motivo: string, mensagem = MENSAGEM_ACESSO_INDISPONIVEL): DecisaoAcessoPainel {
  return { acao: 'indisponivel', motivo, mensagem }
}

function destinoBloqueio(acesso: RespostaAcessoPainel) {
  const vencimento = encodeURIComponent(acesso.perfil?.vencimento || '')
  if (acesso.assinaturaVencida) {
    return `/bloqueado?status=vencido&dias=${acesso.diasVencidos || 1}&vencimento=${vencimento}`
  }
  return `/bloqueado?status=${encodeURIComponent(acesso.statusNormalizado || 'bloqueado')}&vencimento=${vencimento}`
}

export function decidirAcessoPainel(
  acesso: RespostaAcessoPainel | null | undefined,
  opts: { rotaLivreAssinatura: boolean },
): DecisaoAcessoPainel {
  if (!acesso || typeof acesso !== 'object') return indisponivel('sem_resposta')

  if (acesso.ok === true) {
    if (!acessoConfirmado(acesso)) return indisponivel('resposta_invalida')
    if (acesso.bloqueado && !opts.rotaLivreAssinatura) {
      return { acao: 'bloquear', motivo: acesso.assinaturaVencida ? 'vencido' : 'bloqueado', destino: destinoBloqueio(acesso), acesso }
    }
    return { acao: 'liberar', acesso }
  }

  const reason = String(acesso.reason || '')
  if (reason === 'sem_sessao' || reason === 'sessao_invalida') return { acao: 'login', motivo: reason }
  if ((reason === 'perfil_indisponivel' || reason === 'sem_perfil') && acesso.message) {
    return indisponivel(reason, acesso.message)
  }
  return indisponivel(reason || 'resposta_invalida')
}

export async function consultarAcessoComRetry(deps: {
  token: string
  consultar: (token: string, opts?: { forcar?: boolean }) => Promise<RespostaAcessoPainel>
  esperar: (ms: number) => Promise<void>
  forcar?: boolean
}): Promise<RespostaAcessoPainel> {
  let ultimo: RespostaAcessoPainel = { ok: false, reason: 'erro_rede' }
  for (let tentativa = 0; tentativa < ACESSO_MAX_TENTATIVAS; tentativa += 1) {
    try {
      ultimo = await deps.consultar(deps.token, { forcar: Boolean(deps.forcar) || tentativa > 0 })
    } catch (error) {
      ultimo = { ok: false, reason: 'erro_rede', message: error instanceof Error ? error.message : undefined }
    }
    if (acessoConfirmado(ultimo)) return ultimo
    if (!motivoRetentavel(ultimo?.reason)) return ultimo
    if (tentativa < ACESSO_MAX_TENTATIVAS - 1) await deps.esperar(ACESSO_RETRY_MS * (tentativa + 1))
  }
  return ultimo
}

/**
 * Fluxo completo do layout: sessão → /api/painel/acesso → decisão.
 * Termina sempre em até prazoMs; estourado o prazo, a decisão é indisponível (timer de segurança).
 */
export async function executarVerificacaoPainel(deps: {
  obterSessao: () => Promise<SessaoPainel>
  consultar: (token: string, opts?: { forcar?: boolean }) => Promise<RespostaAcessoPainel>
  esperar: (ms: number) => Promise<void>
  demo: () => boolean
  rotaLivreAssinatura: boolean
  aoObterSessao?: (userId: string) => void
  forcar?: boolean
  prazoMs?: number
  agendar?: (fn: () => void, ms: number) => unknown
  cancelar?: (id: unknown) => void
}): Promise<DecisaoAcessoPainel> {
  const agendar = deps.agendar || ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const cancelar = deps.cancelar || ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))

  async function fluxo(): Promise<DecisaoAcessoPainel> {
    try {
      const { data, error } = await deps.obterSessao()
      if (error?.message === 'timeout') return { acao: 'manutencao', motivo: 'sessao_timeout' }

      const session = data?.session
      if (session?.user) {
        deps.aoObterSessao?.(session.user.id)
        if (!session.access_token) return { acao: 'login', motivo: 'sem_token' }
        const acesso = await consultarAcessoComRetry({
          token: session.access_token,
          consultar: deps.consultar,
          esperar: deps.esperar,
          forcar: deps.forcar,
        })
        return decidirAcessoPainel(acesso, { rotaLivreAssinatura: deps.rotaLivreAssinatura })
      }

      if (deps.demo()) return { acao: 'liberar_demo' }
      return { acao: 'login', motivo: 'sem_sessao' }
    } catch {
      return indisponivel('excecao')
    }
  }

  let timer: unknown
  const prazo = new Promise<DecisaoAcessoPainel>((resolve) => {
    timer = agendar(() => resolve(indisponivel('timer_seguranca')), deps.prazoMs ?? SAFETY_TIMEOUT_MS)
  })
  try {
    return await Promise.race([fluxo(), prazo])
  } finally {
    cancelar(timer)
  }
}
