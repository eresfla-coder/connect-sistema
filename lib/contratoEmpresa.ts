import type { ConfigEmpresaPublica } from '@/lib/documentosPublicos'
import {
  configEmpresaPadraoPublica,
  logoUrlAbsolutaPublica,
  mergeConfigPublicacao,
  normalizarLogoEmpresaPublica,
} from '@/lib/documentosPublicos'
import { camposEmpresaNoPayload, CONNECT_OG_FALLBACK_NAME } from '@/lib/empresaPublica'

export type EmpresaContratoView = {
  nome: string
  telefone: string
  email: string
  endereco: string
  cidadeUf: string
  logoUrl: string
  cnpj: string
  cpf: string
  responsavel: string
}

export type AssinaturaContrato = {
  status: string
  dataUrl?: string
  assinadoEm?: string
  nome?: string
}

export function empresaContratoPadrao(): EmpresaContratoView {
  return {
    nome: CONNECT_OG_FALLBACK_NAME,
    telefone: '',
    email: '',
    endereco: '',
    cidadeUf: '',
    logoUrl: '/logo-connect.png',
    cnpj: '',
    cpf: '',
    responsavel: '',
  }
}

export function empresaContratoFromConfig(cfg: Partial<ConfigEmpresaPublica> & Record<string, unknown>): EmpresaContratoView {
  const merged = mergeConfigPublicacao(configEmpresaPadraoPublica(), cfg)
  const logoRaw = String(cfg.logoUrl ?? cfg.logo ?? cfg.empresa_logo ?? merged.logoUrl ?? '')
  const logoUrl = logoUrlAbsolutaPublica(logoRaw) || normalizarLogoEmpresaPublica(logoRaw) || '/logo-connect.png'
  const nome = String(
    cfg.empresa_nome ?? cfg.nomeEmpresa ?? cfg.nome_empresa ?? merged.nomeEmpresa ?? CONNECT_OG_FALLBACK_NAME
  ).trim()

  return {
    nome: nome || CONNECT_OG_FALLBACK_NAME,
    telefone: String(
      cfg.empresa_telefone ?? cfg.telefone ?? cfg.celularEmpresa ?? cfg.whatsapp ?? merged.telefone ?? ''
    ),
    email: String(cfg.empresa_email ?? cfg.email ?? merged.email ?? ''),
    endereco: String(cfg.empresa_endereco ?? cfg.endereco ?? merged.endereco ?? ''),
    cidadeUf: String(cfg.cidadeUf ?? cfg.cidade_uf ?? merged.cidadeUf ?? ''),
    logoUrl: logoUrl && logoUrl !== '/logo-connect.png' ? logoUrl : '/logo-connect.png',
    cnpj: String(cfg.cnpj ?? cfg.cnpjEmpresa ?? ''),
    cpf: String(cfg.cpf ?? cfg.cpfEmpresa ?? ''),
    responsavel: String(cfg.responsavel ?? merged.responsavel ?? ''),
  }
}

export function empresaContratoFromPayload(payload: Record<string, unknown> | null | undefined): EmpresaContratoView {
  if (!payload) return empresaContratoPadrao()
  const ep = (payload.empresaPublica || payload.config || payload.cfg || {}) as Record<string, unknown>
  return empresaContratoFromConfig({
    ...ep,
    empresa_nome: payload.empresa_nome ?? ep.nome ?? ep.nomeEmpresa,
    empresa_logo: payload.empresa_logo ?? ep.logoUrl ?? ep.logo,
    empresa_telefone: payload.empresa_telefone ?? ep.telefone,
    empresa_email: payload.empresa_email ?? ep.email,
    empresa_endereco: payload.empresa_endereco ?? ep.endereco,
  })
}

export function payloadContratoPublico(
  contrato: Record<string, unknown>,
  cfg: Partial<ConfigEmpresaPublica> | EmpresaContratoView,
  opts: { token: string; userId?: string; assinatura?: AssinaturaContrato | null; v?: number }
) {
  const empresaView =
    'logoUrl' in cfg && typeof (cfg as EmpresaContratoView).nome === 'string'
      ? (cfg as EmpresaContratoView)
      : empresaContratoFromConfig(cfg as Partial<ConfigEmpresaPublica>)
  const cfgMerge = {
    nomeEmpresa: empresaView.nome,
    logoUrl: empresaView.logoUrl,
    telefone: empresaView.telefone,
    email: empresaView.email,
    endereco: empresaView.endereco,
    cidadeUf: empresaView.cidadeUf,
    responsavel: empresaView.responsavel,
  }
  const empresaCampos = camposEmpresaNoPayload(mergeConfigPublicacao(cfgMerge), {
    token: opts.token,
    userId: opts.userId,
    v: opts.v ?? Date.now(),
  })

  return {
    contrato,
    empresaPublica: {
      nome: empresaView.nome,
      telefone: empresaView.telefone,
      email: empresaView.email,
      endereco: empresaView.endereco,
      cidadeUf: empresaView.cidadeUf,
      logoUrl: empresaView.logoUrl,
      cnpj: empresaView.cnpj,
      cpf: empresaView.cpf,
      responsavel: empresaView.responsavel,
    },
    ...empresaCampos,
    config: empresaCampos,
    cfg: empresaCampos,
    assinatura: opts.assinatura || undefined,
    assinaturaDigital: opts.assinatura || undefined,
    assinado: opts.assinatura?.status === 'assinado' ? true : undefined,
  }
}

export function parseAssinaturaPayload(payload: Record<string, unknown> | null | undefined): AssinaturaContrato | null {
  const raw = (payload?.assinatura || payload?.assinaturaDigital) as AssinaturaContrato | undefined
  if (!raw || typeof raw !== 'object') return null
  const dataUrl = String(raw.dataUrl || '').trim()
  if (raw.status === 'assinado' || dataUrl) {
    return {
      status: 'assinado',
      dataUrl: dataUrl || undefined,
      assinadoEm: String(raw.assinadoEm || ''),
      nome: String(raw.nome || ''),
    }
  }
  return null
}

/** Exibe logo da empresa ou fallback Connect (`/logo-connect.png`). */
export function logoContratoVisivel(logoUrl?: string) {
  return Boolean(String(logoUrl || '').trim())
}
