/**
 * Recuperação de senha do Connect Sistema.
 *
 * Em produção o pedido só sai de https://www.appconnectpro.com.br, e o
 * redirectTo é exatamente a URL já autorizada no Supabase. A Site URL
 * compartilhada não entra nesta decisão.
 *
 * O cliente @supabase/ssr troca o ?code= uma única vez dentro de initialize()
 * (detectSessionInUrl). Não chamar exchangeCodeForSession de novo: o código
 * PKCE é de uso único.
 */

export const ORIGEM_CANONICA = 'https://www.appconnectpro.com.br'

export const CAMINHO_LOGIN = '/login'

export const CAMINHO_RESET = '/reset-senha'

export const PARAM_RECUPERACAO = 'recuperacao'

export const MSG_CONTINUAR_NA_ORIGEM =
  'A recuperação de senha continua neste endereço. Confira o e-mail e clique em ESQUECI MINHA SENHA.'

export const MSG_LINK_INVALIDO =
  'Este link de recuperação é inválido. Solicite um novo e-mail.'

export const MSG_LINK_EXPIRADO =
  'Este link de recuperação expirou. Solicite um novo e-mail.'

export const MSG_LINK_INVALIDO_OU_EXPIRADO =
  'Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.'

export const MSG_LINK_REUTILIZADO =
  'Este link de recuperação já foi utilizado. Solicite um novo e-mail.'

export const MSG_SEM_VERIFICADOR =
  'Abra o link no mesmo navegador em que você pediu a recuperação, em www.appconnectpro.com.br. Se o navegador for outro, solicite um novo e-mail.'

export const MSG_REDE =
  'Não foi possível validar o link por uma falha de conexão. Verifique a internet e tente de novo. Se o erro continuar, solicite um novo e-mail.'

export const MSG_SENHA_CURTA = 'A senha deve ter pelo menos 6 caracteres.'

export const MSG_SENHA_DIFERENTE = 'As senhas não coincidem.'

export const MSG_SENHA_VAZIA = 'Preencha todos os campos.'

export const MSG_SENHA_FALHA = 'Não foi possível alterar a senha. Tente novamente.'

export const MSG_SESSAO_AUSENTE =
  'A sessão de recuperação não está mais ativa. Solicite um novo e-mail.'

export const MSG_VALIDANDO = 'Validando o link de recuperação...'

const CHAVE_VERIFICADOR = '-code-verifier'

export type ErroAuthResumo = {
  message?: string
  code?: string
  name?: string
  status?: number
}

export type ResultadoRecuperacao =
  | { ok: true }
  | { ok: false; mensagem: string }

export type ClienteRecuperacao = {
  temVerificador: () => boolean
  initialize: () => Promise<{ error: ErroAuthResumo | null }>
  onPasswordRecovery: (ouvinte: () => void) => () => void
  definirSessao: (
    accessToken: string,
    refreshToken: string,
  ) => Promise<{ error: ErroAuthResumo | null; autenticado: boolean }>
}

export type DecisaoPedidoRecuperacao =
  | { tipo: 'enviar'; redirectTo: string }
  | { tipo: 'redirecionar'; destino: string }

type AnaliseUrl =
  | { tipo: 'pkce' }
  | { tipo: 'implicito'; accessToken: string; refreshToken: string }
  | { tipo: 'erro-url'; erro: ErroAuthResumo }
  | { tipo: 'ausente' }

export function resumirErroAuth(erro: unknown): ErroAuthResumo | null {
  if (!erro || typeof erro !== 'object') return null
  const bruto = erro as {
    message?: unknown
    code?: unknown
    name?: unknown
    status?: unknown
  }
  return {
    message: typeof bruto.message === 'string' ? bruto.message : undefined,
    code: typeof bruto.code === 'string' ? bruto.code : undefined,
    name: typeof bruto.name === 'string' ? bruto.name : undefined,
    status: typeof bruto.status === 'number' ? bruto.status : undefined,
  }
}

export function ehOrigemLocal(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')
  } catch {
    return false
  }
}

function emailParaQuery(email: string): string | null {
  const limpo = email.trim().toLowerCase()
  if (!limpo || limpo.length > 320 || /[\s<>]/.test(limpo) || !limpo.includes('@')) return null
  return limpo
}

export function decidirInicioRecuperacao(origin: string, email: string): DecisaoPedidoRecuperacao {
  if (ehOrigemLocal(origin)) {
    const base = new URL(origin).origin
    return { tipo: 'enviar', redirectTo: `${base}${CAMINHO_RESET}` }
  }

  let origemNormalizada = ''
  try {
    origemNormalizada = new URL(origin).origin
  } catch {
    origemNormalizada = ''
  }

  if (origemNormalizada === ORIGEM_CANONICA) {
    return { tipo: 'enviar', redirectTo: `${ORIGEM_CANONICA}${CAMINHO_RESET}` }
  }

  const destino = new URL(`${ORIGEM_CANONICA}${CAMINHO_LOGIN}`)
  destino.searchParams.set(PARAM_RECUPERACAO, '1')
  const emailQuery = emailParaQuery(email)
  if (emailQuery) destino.searchParams.set('email', emailQuery)
  return { tipo: 'redirecionar', destino: destino.toString() }
}

export function lerChegadaRecuperacao(search: string): { continuar: boolean; email: string } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const email = emailParaQuery(params.get('email') || '') || ''
  return {
    continuar: params.get(PARAM_RECUPERACAO) === '1',
    email,
  }
}

export function buscaSemRecuperacao(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  params.delete(PARAM_RECUPERACAO)
  params.delete('email')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function temVerificadorPkce(cookieHeader: string): boolean {
  return cookieHeader.split(';').some((parte) => {
    const nome = parte.trim().split('=')[0] || ''
    return nome.includes(CHAVE_VERIFICADOR)
  })
}

export function hrefSemSegredo(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('code')
  url.searchParams.delete('token_hash')
  url.searchParams.delete('access_token')
  url.searchParams.delete('refresh_token')
  url.hash = ''
  return `${url.pathname}${url.search}`
}

export function classificarErroRecuperacao(erro: ErroAuthResumo | null | undefined): string {
  const message = (erro?.message || '').toLowerCase()
  const code = (erro?.code || '').toLowerCase()
  const name = erro?.name || ''
  const status = erro?.status

  if (
    name === 'AuthPKCECodeVerifierMissingError' ||
    code === 'pkce_code_verifier_not_found' ||
    message.includes('code verifier')
  ) {
    return MSG_SEM_VERIFICADOR
  }

  if (
    name === 'AuthRetryableFetchError' ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('network') ||
    status === 0 ||
    (typeof status === 'number' && status >= 500)
  ) {
    return MSG_REDE
  }

  if (
    message.includes('already used') ||
    message.includes('already been used') ||
    message.includes('code has been used') ||
    code.includes('reuse')
  ) {
    return MSG_LINK_REUTILIZADO
  }

  if (code === 'otp_expired' || code === 'flow_state_expired') {
    return MSG_LINK_EXPIRADO
  }

  if (message.includes('expired') && message.includes('invalid')) {
    return MSG_LINK_INVALIDO_OU_EXPIRADO
  }

  if (message.includes('expired') || message.includes('expirou')) {
    return MSG_LINK_EXPIRADO
  }

  return MSG_LINK_INVALIDO
}

export function classificarErroSenha(erro: ErroAuthResumo | null | undefined): string {
  const message = (erro?.message || '').toLowerCase()
  const name = erro?.name || ''
  const status = erro?.status

  if (message.includes('password should be at least') || message.includes('at least 6')) {
    return MSG_SENHA_CURTA
  }

  if (name === 'AuthSessionMissingError' || message.includes('session missing')) {
    return MSG_SESSAO_AUSENTE
  }

  if (
    name === 'AuthRetryableFetchError' ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('network') ||
    status === 0 ||
    (typeof status === 'number' && status >= 500)
  ) {
    return MSG_REDE
  }

  return MSG_SENHA_FALHA
}

function analisarUrlRecuperacao(href: string): AnaliseUrl {
  const url = new URL(href)
  const erroCodigo = url.searchParams.get('error_code') || url.searchParams.get('error')
  if (erroCodigo || url.searchParams.get('error_description')) {
    return {
      tipo: 'erro-url',
      erro: { code: erroCodigo || undefined, message: '' },
    }
  }

  const code = url.searchParams.get('code')
  if (code) return { tipo: 'pkce' }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const accessToken = hash.get('access_token') || ''
  const refreshToken = hash.get('refresh_token') || ''
  const type = hash.get('type')
  if (accessToken && refreshToken && type === 'recovery') {
    return { tipo: 'implicito', accessToken, refreshToken }
  }

  return { tipo: 'ausente' }
}

function esperarMacrotarefa() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

export async function validarLinkRecuperacao(
  href: string,
  cliente: ClienteRecuperacao,
): Promise<ResultadoRecuperacao> {
  const analise = analisarUrlRecuperacao(href)

  if (analise.tipo === 'erro-url') {
    return { ok: false, mensagem: classificarErroRecuperacao(analise.erro) }
  }

  if (analise.tipo === 'ausente') {
    return { ok: false, mensagem: MSG_LINK_INVALIDO }
  }

  if (analise.tipo === 'pkce') {
    if (!cliente.temVerificador()) {
      return { ok: false, mensagem: MSG_SEM_VERIFICADOR }
    }

    let recuperacaoConfirmada = false
    const cancelar = cliente.onPasswordRecovery(() => {
      recuperacaoConfirmada = true
    })

    try {
      const inicio = await cliente.initialize()
      await esperarMacrotarefa()
      if (recuperacaoConfirmada) return { ok: true }
      if (inicio.error) return { ok: false, mensagem: classificarErroRecuperacao(inicio.error) }
      return { ok: false, mensagem: MSG_LINK_INVALIDO }
    } catch (erro) {
      return { ok: false, mensagem: mensagemDeFalha(erro) }
    } finally {
      cancelar()
    }
  }

  try {
    const sessao = await cliente.definirSessao(analise.accessToken, analise.refreshToken)
    if (sessao.error || !sessao.autenticado) {
      return { ok: false, mensagem: classificarErroRecuperacao(sessao.error) }
    }
    return { ok: true }
  } catch (erro) {
    return { ok: false, mensagem: mensagemDeFalha(erro) }
  }
}

function mensagemDeFalha(erro: unknown): string {
  const resumo = resumirErroAuth(erro)
  if (!resumo?.message && !resumo?.code && !resumo?.name) return MSG_REDE
  return classificarErroRecuperacao(resumo)
}

export function criarTrocaUnica() {
  const pendentes = new Map<string, Promise<ResultadoRecuperacao>>()

  return function umaVez(
    chave: string,
    executar: () => Promise<ResultadoRecuperacao>,
  ): Promise<ResultadoRecuperacao> {
    const existente = pendentes.get(chave)
    if (existente) return existente

    const promessa = executar().then(
      (resultado) => resultado,
      () => ({ ok: false as const, mensagem: MSG_REDE }),
    )
    pendentes.set(chave, promessa)
    return promessa
  }
}
