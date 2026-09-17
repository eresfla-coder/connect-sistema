/**
 * Autorização de recursos públicos (documentos / branding / OG).
 * Capability = token em public_documents. Sem token válido = sem dados.
 */

export const PUBLIC_TOKEN_MIN_LEN = 10

/** Colunas explícitas de configuracoes_empresa para branding público. */
/** Alinhado ao select já usado em public-docs (evita colunas inexistentes em tenants legados). */
export const CFG_EMPRESA_COLS_PUBLICAS =
  'id,user_id,nome_empresa,tipo_pessoa,cpf,cnpj,cep,bairro,telefone,celular_empresa,whatsapp_empresa,email,endereco,cidade_uf,responsavel,logo_url,cor_primaria,cor_secundaria,updated_at'

/** Colunas de public_documents necessárias para resolver branding (sem devolver payload ao cliente). */
export const PUBLIC_DOC_COLS_BRANDING =
  'token,tipo,documento_id,user_id,updated_at,payload'

/** Colunas de public_documents para metadata OG (payload necessário para título/descrição). */
export const PUBLIC_DOC_COLS_METADATA =
  'token,tipo,documento_id,document_type,document_id,user_id,updated_at,payload'

export function tokenPublicoValido(token: unknown): string {
  const t = String(token || '').trim()
  if (t.length < PUBLIC_TOKEN_MIN_LEN) return ''
  return t
}

/** Resposta uniforme — não revela se o documento existe. */
export function respostaPublicaNegada() {
  return { status: 404 as const, body: { error: 'Documento não encontrado.' } }
}

/**
 * Se o caller informar tipo/documentoId junto com o token,
 * devem bater com o documento do token (evita token A em doc B).
 */
export function tokenPertenceAoDocumento(
  doc: {
    token?: string | null
    tipo?: string | null
    documento_id?: string | number | null
  },
  opts: {
    token: string
    tipo?: string | null
    documentoId?: string | null
  }
): boolean {
  const tokenDoc = String(doc.token || '').trim()
  if (!tokenDoc || tokenDoc !== opts.token) return false

  const docIdReq = String(opts.documentoId || '').trim()
  if (docIdReq) {
    const docId = String(doc.documento_id ?? '').trim()
    if (!docId || docId !== docIdReq) return false
  }

  const tipoReq = String(opts.tipo || '').trim().toLowerCase()
  if (tipoReq) {
    const tipoDoc = String(doc.tipo || '').trim().toLowerCase()
    const aliasesOs = new Set(['os', 'ordem_servico'])
    if (aliasesOs.has(tipoReq)) {
      if (!aliasesOs.has(tipoDoc)) return false
    } else if (tipoDoc !== tipoReq) {
      return false
    }
  }

  return true
}

/** Campos permitidos na resposta pública de branding (sem payload, sem user_id). */
export const CAMPOS_CONFIG_PUBLICA_PERMITIDOS = [
  'nomeEmpresa',
  'tipoPessoa',
  'cpf',
  'cnpj',
  'cep',
  'bairro',
  'telefone',
  'celularEmpresa',
  'whatsappEmpresa',
  'telefoneEmpresa',
  'email',
  'endereco',
  'cidadeUf',
  'responsavel',
  'logoUrl',
  'empresa_logo_og',
  'corPrimaria',
  'corSecundaria',
  'tituloPdf',
  'rodapePdf',
  'validadePadrao',
  'prazoEntregaPadrao',
  'formaPagamentoPadrao',
  'mostrarQuantidade',
] as const

export type ConfigPublicaBranding = {
  [K in (typeof CAMPOS_CONFIG_PUBLICA_PERMITIDOS)[number]]?: unknown
}

export function extrairCfgDoPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== 'object') return {} as Record<string, unknown>
  const cfg = (payload.cfg || payload.config || {}) as Record<string, unknown>
  return cfg && typeof cfg === 'object' ? cfg : {}
}

export function montarConfigPublicaBranding(input: {
  nomeEmpresa: string
  cfgMerged: Record<string, unknown>
  configAtual: Record<string, unknown>
  telefoneFinal: string
  empresaLogoOg: string
}): ConfigPublicaBranding {
  const { nomeEmpresa, cfgMerged, configAtual, telefoneFinal, empresaLogoOg } = input
  return {
    nomeEmpresa,
    tipoPessoa: cfgMerged.tipoPessoa || 'PJ',
    cpf: String(configAtual.cpf || cfgMerged.cpf || ''),
    cnpj: String(configAtual.cnpj || cfgMerged.cnpj || ''),
    cep: String(configAtual.cep || cfgMerged.cep || ''),
    bairro: String(configAtual.bairro || cfgMerged.bairro || ''),
    telefone: String(telefoneFinal || cfgMerged.telefone || ''),
    celularEmpresa: String(configAtual.celular_empresa || cfgMerged.celularEmpresa || telefoneFinal || ''),
    whatsappEmpresa: String(configAtual.whatsapp_empresa || cfgMerged.whatsapp || telefoneFinal || ''),
    telefoneEmpresa: String(configAtual.telefone || cfgMerged.telefoneEmpresa || telefoneFinal || ''),
    email: String(cfgMerged.email || configAtual.email || ''),
    endereco: String(cfgMerged.endereco || configAtual.endereco || ''),
    cidadeUf: String(configAtual.cidade_uf || cfgMerged.cidadeUf || ''),
    responsavel: String(configAtual.responsavel || cfgMerged.responsavel || ''),
    logoUrl: String(cfgMerged.logoUrl || '/logo-connect.png'),
    empresa_logo_og: empresaLogoOg,
    corPrimaria: String(configAtual.cor_primaria || cfgMerged.corPrimaria || '#16a34a'),
    corSecundaria: String(configAtual.cor_secundaria || cfgMerged.corSecundaria || '#dcfce7'),
    tituloPdf: String(configAtual.titulo_pdf || cfgMerged.tituloPdf || 'Orçamento Comercial'),
    rodapePdf: String(configAtual.rodape_pdf || cfgMerged.rodapePdf || 'Obrigado pela preferência.'),
    validadePadrao: String(configAtual.validade_padrao ?? cfgMerged.validadePadrao ?? '7 dias'),
    prazoEntregaPadrao: String(
      configAtual.prazo_entrega_padrao || cfgMerged.prazoEntregaPadrao || '3 dias'
    ),
    formaPagamentoPadrao: String(
      configAtual.forma_pagamento_padrao || cfgMerged.formaPagamentoPadrao || 'PIX'
    ),
    mostrarQuantidade: configAtual.mostrar_quantidade ?? cfgMerged.mostrarQuantidade ?? true,
  }
}

/** Garante que a resposta pública não vaze payload / user_id / campos extras. */
export function sanitizarRespostaConfigPublica(config: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of CAMPOS_CONFIG_PUBLICA_PERMITIDOS) {
    if (key in config) out[key] = config[key]
  }
  return out
}

export function respostaContemPayloadProibido(body: Record<string, unknown>): boolean {
  if ('payload' in body) return true
  if ('user_id' in (body.config as object || {}) || 'owner_user_id' in (body.config as object || {})) {
    return true
  }
  if ('itens' in body || 'cliente' in body) return true
  return false
}

/** /api/config anônimo por userId não é autorização. */
export function acessoConfigPorUserIdAnonimoPermitido(): boolean {
  return false
}

/**
 * URL de logo OG: só token autoriza o endpoint.
 * Sem token → asset estático (sem enumerar userId).
 */
export function montarUrlLogoOgPublica(opts: {
  siteBase: string
  token?: string | null
  v?: string | number
}): string {
  const base = String(opts.siteBase || '').replace(/\/$/, '')
  const v = String(opts.v ?? Date.now())
  const token = tokenPublicoValido(opts.token)
  if (!token) {
    return `${base}/logo-connect.png?v=${encodeURIComponent(v)}`
  }
  const qs = new URLSearchParams()
  qs.set('token', token)
  qs.set('v', v)
  return `${base}/api/og/empresa-logo?${qs.toString()}`
}
