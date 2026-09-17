/**
 * ADMIN.1C + ADMIN.2 — semântica de criar_acesso (Opção B).
 * criar_acesso = “este vínculo Connect possui login no Connect?”
 * Não significa “cliente existe ou não”.
 */

export type OrigemSistemaAdminLocal = 'connect' | 'terceiro'

export type ModoCriacaoClienteAdmin = 'created' | 'existing' | 'admin_only'

/**
 * Default consciente: ausência da flag = true (callers antigos esperam login Connect).
 * Somente `false` explícito desliga Auth.
 */
export function resolverCriarAcesso(valor: unknown): boolean {
  if (valor === false || valor === 'false' || valor === 0 || valor === '0') return false
  return true
}

/** @deprecated Prefer deveChamarCreateUserAuthParaOrigem — mantido para compat testes/callers. */
export function deveChamarCreateUserAuth(criarAcesso: boolean): boolean {
  return criarAcesso === true
}

export function deveGerarSenhaTemporaria(criarAcesso: boolean): boolean {
  return criarAcesso === true
}

export function deveChamarCreateUserAuthParaOrigem(params: {
  origem: OrigemSistemaAdminLocal
  criarAcesso: boolean
}): boolean {
  return params.origem === 'connect' && params.criarAcesso === true
}

export function deveGerarSenhaParaOrigem(params: {
  origem: OrigemSistemaAdminLocal
  criarAcesso: boolean
}): boolean {
  return params.origem === 'connect' && params.criarAcesso === true
}

/**
 * Cleanup só se Auth foi criado NESTA request (não pré-existente).
 */
export function deveLimparAuthRecemCriado(params: {
  authRecemCriadoNestaRequest: boolean
  falhaPosterior: boolean
}): boolean {
  return params.authRecemCriadoNestaRequest === true && params.falhaPosterior === true
}

export function montarConviteClienteAdmin(params: {
  mode: ModoCriacaoClienteAdmin
  nomeSaudacao: string
  email: string
  sistemaCliente: string
  valorPlano: number
  vencimento: string
  accessLink: string
  senhaInicial?: string | null
}): string {
  const { mode, nomeSaudacao, email, sistemaCliente, accessLink, senhaInicial } = params

  if (mode === 'admin_only') {
    return [
      `Olá, ${nomeSaudacao}!`,
      '',
      `Seu cadastro comercial do ${sistemaCliente} foi registrado.`,
      '',
      'Este vínculo ainda não inclui login no Connect.',
      '',
      '— Connect Sistema',
    ].join('\n')
  }

  if (mode === 'created') {
    return [
      `Olá, ${nomeSaudacao}!`,
      '',
      `Seu acesso ao ${sistemaCliente} foi criado com sucesso.`,
      '',
      `Login: ${email}`,
      `Senha provisória: ${senhaInicial || ''}`,
      '',
      `Acesse: ${accessLink}`,
      '',
      'Entre com esses dados e depois altere sua senha no painel.',
      '',
      '— Connect Sistema',
    ].join('\n')
  }

  return [
    `Olá, ${nomeSaudacao}!`,
    '',
    `Seu cadastro no ${sistemaCliente} já existia e foi atualizado.`,
    '',
    `Login: ${email}`,
    '',
    `Acesse: ${accessLink}`,
    '',
    'Se você não lembrar a senha, use a opção "Esqueci minha senha" na tela de login.',
    '',
    '— Connect Sistema',
  ].join('\n')
}
