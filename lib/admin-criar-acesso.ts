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

function formatarValorMensagem(valor: number | string | null | undefined): string {
  const n = Number(String(valor ?? '0').replace(',', '.'))
  const v = Number.isFinite(n) ? n : 0
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * ADMIN.3.5 — mensagem WhatsApp do cadastro (rascunho ou pós-API).
 * Terceiro: só comercial, sem Connect/login/assinatura/MP.
 * Pré-salvamento: nunca afirma que “foi registrado”.
 */
export function montarMensagemWhatsappCadastroCliente(params: {
  origem: OrigemSistemaAdminLocal
  criarAcesso: boolean
  nomeSaudacao: string
  sistemaCliente: string
  valorPlano?: number | string | null
  diaVencimento?: number | string | null
  email?: string
  accessLink?: string
  senhaInicial?: string | null
  /** rascunho = modal pré-salvar; confirmado = resposta da API após persistir */
  fase?: 'rascunho' | 'confirmado'
}): string {
  const origem = params.origem === 'connect' ? 'connect' : 'terceiro'
  const nome = String(params.nomeSaudacao || 'cliente').trim() || 'cliente'
  const sistema = String(params.sistemaCliente || 'Sistema').trim() || 'Sistema'
  const valorFmt = formatarValorMensagem(params.valorPlano)
  const dia =
    params.diaVencimento != null && String(params.diaVencimento).trim() !== ''
      ? String(params.diaVencimento).trim()
      : null
  const fase = params.fase || 'rascunho'
  const criarAcesso = params.criarAcesso === true

  if (origem === 'terceiro') {
    return [
      `Olá, ${nome}!`,
      '',
      'Segue o resumo do seu cadastro comercial:',
      `Sistema: ${sistema}`,
      `Valor mensal: ${valorFmt}`,
      dia ? `Dia de vencimento: ${dia}` : null,
      '',
      'Em caso de dúvidas, estamos à disposição.',
    ]
      .filter((l) => l != null)
      .join('\n')
  }

  // Connect próprio
  if (criarAcesso) {
    if (fase === 'confirmado' && params.senhaInicial) {
      return [
        `Olá, ${nome}!`,
        '',
        `Seu acesso ao ${sistema} foi criado com sucesso.`,
        '',
        `Login: ${params.email || ''}`,
        `Senha provisória: ${params.senhaInicial}`,
        '',
        `Acesse: ${params.accessLink || ''}`.trim(),
        '',
        'Entre com esses dados e depois altere sua senha no painel.',
        '',
        '— Connect Sistema',
      ].join('\n')
    }
    return [
      `Olá, ${nome}!`,
      '',
      'Segue o resumo do seu cadastro no Connect:',
      `Sistema: ${sistema}`,
      `Valor mensal: ${valorFmt}`,
      dia ? `Dia de vencimento: ${dia}` : null,
      params.email ? `E-mail de login: ${params.email}` : null,
      '',
      'O acesso ao painel Connect será liberado conforme o cadastro.',
      '',
      '— Connect Sistema',
    ]
      .filter((l) => l != null)
      .join('\n')
  }

  // Connect sem login
  return [
    `Olá, ${nome}!`,
    '',
    'Segue o resumo do seu cadastro comercial no Connect:',
    `Sistema: ${sistema}`,
    `Valor mensal: ${valorFmt}`,
    dia ? `Dia de vencimento: ${dia}` : null,
    '',
    'Neste momento o cadastro é comercial; o acesso de login ao sistema não está sendo criado agora.',
    '',
    '— Connect Sistema',
  ]
    .filter((l) => l != null)
    .join('\n')
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
  origem?: OrigemSistemaAdminLocal
  criarAcesso?: boolean
  diaVencimento?: number | string | null
}): string {
  const origem = params.origem === 'terceiro' ? 'terceiro' : 'connect'
  const criarAcesso =
    params.criarAcesso != null
      ? params.criarAcesso === true
      : params.mode === 'created' || params.mode === 'existing'

  if (params.mode === 'admin_only' || origem === 'terceiro' || !criarAcesso) {
    return montarMensagemWhatsappCadastroCliente({
      origem,
      criarAcesso: origem === 'connect' && criarAcesso,
      nomeSaudacao: params.nomeSaudacao,
      sistemaCliente: params.sistemaCliente,
      valorPlano: params.valorPlano,
      diaVencimento: params.diaVencimento,
      email: params.email,
      accessLink: params.accessLink,
      senhaInicial: params.senhaInicial,
      fase: 'confirmado',
    })
  }

  if (params.mode === 'created') {
    return montarMensagemWhatsappCadastroCliente({
      origem: 'connect',
      criarAcesso: true,
      nomeSaudacao: params.nomeSaudacao,
      sistemaCliente: params.sistemaCliente,
      valorPlano: params.valorPlano,
      diaVencimento: params.diaVencimento,
      email: params.email,
      accessLink: params.accessLink,
      senhaInicial: params.senhaInicial,
      fase: 'confirmado',
    })
  }

  return [
    `Olá, ${params.nomeSaudacao}!`,
    '',
    `Seu cadastro no ${params.sistemaCliente} já existia e foi atualizado.`,
    '',
    `Login: ${params.email}`,
    '',
    `Acesse: ${params.accessLink}`,
    '',
    'Se você não lembrar a senha, use a opção "Esqueci minha senha" na tela de login.',
    '',
    '— Connect Sistema',
  ].join('\n')
}
