import type { ConfigEmpresaPublica } from '@/lib/documentosPublicos'
import { configEmpresaPadraoPublica, logoUrlAbsolutaPublica, mergeConfigPublicacao } from '@/lib/documentosPublicos'

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

/** URL HTTPS estável para crawlers (WhatsApp/Facebook) — nunca data: base64. */
export function urlLogoOgPublica(opts: { token?: string; userId?: string; v?: string | number }) {
  const base = siteUrlPublico()
  const qs = new URLSearchParams()
  if (opts.token) qs.set('token', opts.token)
  if (opts.userId) qs.set('userId', opts.userId)
  qs.set('v', String(opts.v ?? Date.now()))
  return `${base}/api/og/empresa-logo?${qs.toString()}`
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

  const empresa_logo_og = temLogoEmpresa
    ? urlLogoOgPublica({ token: opts.token, userId: opts.userId, v })
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
  opts: { token: string; userId?: string; v?: string | number }
) {
  const empresa = camposEmpresaNoPayload(cfg, opts)
  return {
    ...payloadRecebido,
    ...empresa,
    config: { ...cfg, ...empresa },
    cfg: { ...cfg, ...empresa },
    token: opts.token,
    user_id: opts.userId || payloadRecebido.user_id || null,
    owner_user_id: opts.userId || payloadRecebido.owner_user_id || null,
  }
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
