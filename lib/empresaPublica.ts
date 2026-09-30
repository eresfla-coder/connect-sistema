import type { ConfigEmpresaPublica } from '@/lib/documentosPublicos'
import { configEmpresaPadraoPublica, logoUrlAbsolutaPublica, mergeConfigPublicacao } from '@/lib/documentosPublicos'
import { montarUrlLogoOgPublica } from '@/lib/public-docs-auth'

export const CONNECT_OG_FALLBACK_NAME = 'Connect Sistema'

export type EmpresaCamposPublicos = {
  empresa_nome: string
  empresa_logo: string
  empresa_logo_og: string
  empresa_telefone: string
  empresa_email: string
  empresa_endereco: string
}

export function siteUrlPublico() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://appconnectpro.com.br').replace(/\/$/, '')
}

export function timestampVersaoPublica(valor?: string | number | null) {
  if (valor == null || valor === '') return Date.now()
  const n = Number(valor)
  if (!Number.isNaN(n) && n > 0) return n
  const t = new Date(String(valor)).getTime()
  return Number.isNaN(t) ? Date.now() : t
}

/**
 * URL HTTPS estável para crawlers (WhatsApp/Facebook) — nunca data: base64.
 * Capability = token público. userId sozinho não autoriza logo (evita enumeração).
 */
export function urlLogoOgPublica(opts: { token?: string; userId?: string; v?: string | number }) {
  void opts.userId
  return montarUrlLogoOgPublica({
    siteBase: siteUrlPublico(),
    token: opts.token,
    v: opts.v,
  })
}

export function resolverNomeEmpresaPublica(...fontes: Array<Record<string, unknown> | null | undefined>) {
  for (const f of fontes) {
    if (!f) continue
    const nome = String(
      f.empresa_nome ??
        f.nomeEmpresa ??
        f.nome_empresa ??
        f.nome_fantasia ??
        f.nome ??
        ''
    ).trim()
    if (nome && nome.toUpperCase() !== 'LOJA CONNECT') return nome
  }
  return ''
}

export function resolverLogoEmpresaBruta(...fontes: Array<Record<string, unknown> | null | undefined>) {
  for (const f of fontes) {
    if (!f) continue
    const logo = String(f.empresa_logo ?? f.logoUrl ?? f.logo ?? f.logo_url ?? '').trim()
    if (logo && logo !== '/logo-connect.png') return logo
  }
  return ''
}

export function camposEmpresaNoPayload(
  cfg: ConfigEmpresaPublica,
  opts: { token?: string; userId?: string; v?: string | number }
): EmpresaCamposPublicos {
  const nome =
    resolverNomeEmpresaPublica(cfg as unknown as Record<string, unknown>) ||
    String(cfg.nomeEmpresa || '').trim() ||
    CONNECT_OG_FALLBACK_NAME

  const logoBruta = resolverLogoEmpresaBruta(cfg as unknown as Record<string, unknown>) || cfg.logoUrl || ''
  const logoAbsoluta = logoUrlAbsolutaPublica(logoBruta)
  const temLogoEmpresa = Boolean(logoBruta && logoBruta !== '/logo-connect.png')
  const v = opts.v ?? Date.now()

  const empresa_logo_og = temLogoEmpresa && opts.token
    ? urlLogoOgPublica({ token: opts.token, v })
    : `${siteUrlPublico()}/logo-connect.png?v=${v}`

  const tel = String(
    cfg.celularEmpresa || cfg.telefone || cfg.whatsapp || cfg.telefoneEmpresa || ''
  )

  return {
    empresa_nome: nome,
    empresa_logo: logoAbsoluta || logoBruta || '/logo-connect.png',
    empresa_logo_og,
    empresa_telefone: tel,
    empresa_email: String(cfg.email || ''),
    empresa_endereco: [cfg.endereco, cfg.cidadeUf].filter(Boolean).join(' — '),
  }
}

export function enriquecerPayloadDocumentoPublico(
  payloadRecebido: Record<string, unknown>,
  cfg: ConfigEmpresaPublica,
  opts: { token: string; userId?: string; v?: string | number; documentType?: string }
) {
  const empresa = camposEmpresaNoPayload(cfg, opts)
  return deduplicarImagensPayloadPublico(
    {
      ...payloadRecebido,
      ...empresa,
      config: { ...cfg, ...empresa },
      cfg: { ...cfg, ...empresa },
      token: opts.token,
      user_id: opts.userId || payloadRecebido.user_id || null,
      owner_user_id: opts.userId || payloadRecebido.owner_user_id || null,
    },
    opts.documentType
  )
}

const TIPOS_LOGO_EM_CONFIG = new Set(['orcamento', 'recibo'])
const TIPOS_LOGO_EM_CFG = new Set(['ordem_servico', 'os'])

function ehImagemBase64(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.startsWith('data:image')
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)
}

/** Remove de `alvo` só as chaves que repetem exatamente uma imagem base64 mantida em outro caminho. */
function semCopiasBase64(alvo: unknown, chaves: string[], mantidas: Set<string>) {
  if (!ehObjeto(alvo)) return alvo
  let copia: Record<string, unknown> | null = null
  for (const chave of chaves) {
    const valor = alvo[chave]
    if (ehImagemBase64(valor) && mantidas.has(valor)) {
      copia ??= { ...alvo }
      delete copia[chave]
    }
  }
  return copia ?? alvo
}

/**
 * Payload final de public_documents: o logo base64 fica em duas representações lidas pelos readers
 * (empresa_logo para OG/config pública + config.logoUrl; cfg.logoUrl na OS, fallback da página
 * quando /api/public-docs/config falha; empresaPublica.logoUrl no contrato).
 * Cópias idênticas em config/cfg e a assinatura repetida em assinaturaDigital são removidas,
 * inclusive as herdadas do payload anterior. Logos em URL e imagens diferentes permanecem.
 */
export function deduplicarImagensPayloadPublico<T extends Record<string, unknown>>(
  payload: T,
  documentType?: string
): T {
  const tipo = String(documentType || '').trim().toLowerCase()
  const empresaLogo = payload.empresa_logo

  if (tipo === 'contrato') {
    const empresaPublica = payload.empresaPublica
    const mantidas = new Set(
      [empresaLogo, ehObjeto(empresaPublica) ? empresaPublica.logoUrl : undefined].filter(ehImagemBase64)
    )
    const resultado: Record<string, unknown> = {
      ...payload,
      config: semCopiasBase64(payload.config, ['logoUrl', 'empresa_logo'], mantidas),
      cfg: semCopiasBase64(payload.cfg, ['logoUrl', 'empresa_logo'], mantidas),
    }
    const assinatura = payload.assinatura
    const assinaturaDigital = payload.assinaturaDigital
    if (
      ehObjeto(assinatura) &&
      ehObjeto(assinaturaDigital) &&
      ehImagemBase64(assinatura.dataUrl) &&
      assinaturaDigital.dataUrl === assinatura.dataUrl
    ) {
      const { dataUrl: _repetida, ...metadados } = assinaturaDigital
      resultado.assinaturaDigital = metadados
    }
    return resultado as T
  }

  if (TIPOS_LOGO_EM_CONFIG.has(tipo)) {
    const config = payload.config
    const mantidas = new Set(
      [empresaLogo, ehObjeto(config) ? config.logoUrl : undefined].filter(ehImagemBase64)
    )
    return {
      ...payload,
      config: semCopiasBase64(config, ['empresa_logo'], mantidas),
      cfg: semCopiasBase64(payload.cfg, ['logoUrl', 'empresa_logo'], mantidas),
    } as T
  }

  if (TIPOS_LOGO_EM_CFG.has(tipo)) {
    const cfg = payload.cfg
    const mantidas = new Set(
      [empresaLogo, ehObjeto(cfg) ? cfg.logoUrl : undefined].filter(ehImagemBase64)
    )
    return {
      ...payload,
      config: semCopiasBase64(payload.config, ['logoUrl', 'empresa_logo'], mantidas),
      cfg: semCopiasBase64(cfg, ['empresa_logo'], mantidas),
    } as T
  }

  return payload
}

export function mergeConfigDocumentoPublico(
  doc: Record<string, unknown> | null,
  payload: Record<string, unknown>
) {
  const payloadCfg = (payload.config || payload.cfg || {}) as Record<string, unknown>
  const empresaCampos = {
    empresa_nome: payload.empresa_nome,
    empresa_logo: payload.empresa_logo,
    empresa_telefone: payload.empresa_telefone,
    empresa_email: payload.empresa_email,
    empresa_endereco: payload.empresa_endereco,
    nomeEmpresa: payload.empresa_nome ?? payloadCfg.nomeEmpresa,
    logoUrl: payload.empresa_logo ?? payloadCfg.logoUrl,
    telefone: payload.empresa_telefone ?? payloadCfg.telefone,
    email: payload.empresa_email ?? payloadCfg.email,
    endereco: payload.empresa_endereco ?? payloadCfg.endereco,
  }

  return mergeConfigPublicacao(configEmpresaPadraoPublica(), payloadCfg, empresaCampos)
}

export function montarUrlPublicaDocumento(
  pathPrefix: string,
  documentoId: string,
  opts: { token: string; preview?: boolean; v?: string | number }
) {
  const base = siteUrlPublico()
  const v = timestampVersaoPublica(opts.v)
  const token = encodeURIComponent(opts.token)

  if (pathPrefix.includes('impressao-orcamento')) {
    return `${base}${pathPrefix}/${documentoId}?preview=1&p=${token}&v=${v}`
  }
  if (pathPrefix.includes('impressao-ordem-servico')) {
    return `${base}${pathPrefix}/${documentoId}?preview=1&p=${token}&v=${v}`
  }

  return `${base}${pathPrefix}/${documentoId}?token=${token}&v=${v}`
}
