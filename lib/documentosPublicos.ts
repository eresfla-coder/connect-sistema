/** Logo e config para links públicos (orçamento, OS, recibo). */

export type ConfigEmpresaPublica = {
  nomeEmpresa: string
  telefone: string
  whatsapp: string
  celularEmpresa: string
  telefoneEmpresa: string
  email: string
  endereco: string
  cidadeUf: string
  logoUrl: string
  responsavel?: string
  tituloPdf?: string
  rodapePdf?: string
}

export function normalizarLogoEmpresaPublica(logo?: string | null): string {
  const valor = String(logo || '').trim()
  if (!valor) return ''
  if (valor.startsWith('http://') || valor.startsWith('https://')) return valor
  if (valor.startsWith('/')) return valor
  if (valor.startsWith('data:image')) return valor
  return `/${valor.replace(/^\//, '')}`
}

export function configEmpresaPadraoPublica(): ConfigEmpresaPublica {
  return {
    nomeEmpresa: '',
    telefone: '',
    whatsapp: '',
    celularEmpresa: '',
    telefoneEmpresa: '',
    email: '',
    endereco: '',
    cidadeUf: '',
    logoUrl: '/logo-connect.png',
    responsavel: '',
    tituloPdf: '',
    rodapePdf: '',
  }
}

export function configEmpresaFromLocalStorage(): ConfigEmpresaPublica {
  const padrao: ConfigEmpresaPublica = configEmpresaPadraoPublica()

  if (typeof window === 'undefined') return padrao

  try {
    const raw = localStorage.getItem('connect_configuracoes')
    const cfg = raw ? JSON.parse(raw) : {}
    const tel =
      cfg?.celularEmpresa ||
      cfg?.celular ||
      cfg?.whatsappEmpresa ||
      cfg?.whatsapp ||
      cfg?.telefoneEmpresa ||
      cfg?.telefone ||
      ''

    const logoRaw = cfg?.logoUrl || cfg?.logo_url || cfg?.logo || ''
    const logoUrl = normalizarLogoEmpresaPublica(logoRaw)

    return {
      nomeEmpresa: String(cfg?.nomeEmpresa || cfg?.nome_empresa || padrao.nomeEmpresa),
      telefone: String(tel),
      whatsapp: String(cfg?.whatsappEmpresa || cfg?.whatsapp || tel),
      celularEmpresa: String(cfg?.celularEmpresa || cfg?.celular || tel),
      telefoneEmpresa: String(cfg?.telefoneEmpresa || cfg?.telefone || tel),
      email: String(cfg?.email || ''),
      endereco: String(cfg?.endereco || ''),
      cidadeUf: String(cfg?.cidadeUf || cfg?.cidade_uf || ''),
      logoUrl: logoUrl || '/logo-connect.png',
      responsavel: String(cfg?.responsavel || ''),
      tituloPdf: String(cfg?.tituloPdf || cfg?.titulo_pdf || ''),
      rodapePdf: String(cfg?.rodapePdf || cfg?.rodape_pdf || ''),
    }
  } catch {
    return { ...padrao, logoUrl: '/logo-connect.png' }
  }
}

export function baseUrlDocumentoPublico() {
  if (typeof window !== 'undefined') return window.location.origin
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://appconnectpro.com.br').replace(/\/$/, '')
}

/** URL da logo acessível no link público (relativa vira absoluta no domínio do app). */
export function logoUrlAbsolutaPublica(logo?: string | null): string {
  const valor = normalizarLogoEmpresaPublica(logo)
  if (!valor) return ''
  if (valor.startsWith('data:') || valor.startsWith('http://') || valor.startsWith('https://')) {
    return valor
  }
  const base = baseUrlDocumentoPublico()
  return `${base}${valor.startsWith('/') ? valor : `/${valor}`}`
}

export function configRowSupabaseToPublica(row: Record<string, unknown>): ConfigEmpresaPublica {
  const tel = String(
    row.celular_empresa ||
      row.whatsapp_empresa ||
      row.telefone ||
      ''
  )
  const logoRaw = String(row.logo_url || '')
  return {
    nomeEmpresa: String(row.nome_empresa || row.nome_fantasia || ''),
    telefone: tel,
    whatsapp: String(row.whatsapp_empresa || tel),
    celularEmpresa: String(row.celular_empresa || tel),
    telefoneEmpresa: String(row.telefone || tel),
    email: String(row.email || ''),
    endereco: String(row.endereco || ''),
    cidadeUf: String(row.cidade_uf || ''),
    logoUrl: logoUrlAbsolutaPublica(logoRaw) || normalizarLogoEmpresaPublica(logoRaw),
    responsavel: String(row.responsavel || ''),
    tituloPdf: String(row.titulo_pdf || ''),
    rodapePdf: String(row.rodape_pdf || ''),
  }
}

export function mergeConfigPublicacao(
  ...fontes: Array<Partial<ConfigEmpresaPublica> | Record<string, unknown> | null | undefined>
): ConfigEmpresaPublica {
  const base =
    typeof window === 'undefined' ? configEmpresaPadraoPublica() : configEmpresaFromLocalStorage()
  const merged: ConfigEmpresaPublica = { ...base }

  for (const fonte of fontes) {
    if (!fonte || typeof fonte !== 'object') continue
    const f = fonte as Record<string, unknown>
    const logoCand = f.empresa_logo ?? f.logoUrl ?? f.logo ?? f.logo_url
    if (f.empresa_nome != null || f.nomeEmpresa != null || f.nome_empresa != null || f.nome_fantasia != null) {
      merged.nomeEmpresa = String(
        f.empresa_nome ?? f.nomeEmpresa ?? f.nome_empresa ?? f.nome_fantasia ?? merged.nomeEmpresa
      )
    }
    if (f.empresa_telefone != null) merged.telefone = String(f.empresa_telefone)
    if (f.empresa_email != null) merged.email = String(f.empresa_email)
    if (f.empresa_endereco != null) merged.endereco = String(f.empresa_endereco)
    if (logoCand != null && String(logoCand).trim()) {
      merged.logoUrl = logoUrlAbsolutaPublica(String(logoCand)) || normalizarLogoEmpresaPublica(String(logoCand))
    }
    if (f.email != null) merged.email = String(f.email)
    if (f.endereco != null) merged.endereco = String(f.endereco)
    if (f.cidadeUf != null || f.cidade_uf != null) {
      merged.cidadeUf = String(f.cidadeUf ?? f.cidade_uf ?? merged.cidadeUf)
    }
    if (f.responsavel != null) merged.responsavel = String(f.responsavel)
    if (f.tituloPdf != null || f.titulo_pdf != null) {
      merged.tituloPdf = String(f.tituloPdf ?? f.titulo_pdf ?? merged.tituloPdf)
    }
    if (f.rodapePdf != null || f.rodape_pdf != null) {
      merged.rodapePdf = String(f.rodapePdf ?? f.rodape_pdf ?? merged.rodapePdf)
    }
    const tel = String(
      f.celularEmpresa ??
        f.celular ??
        f.whatsappEmpresa ??
        f.whatsapp ??
        f.telefoneEmpresa ??
        f.telefone ??
        f.celular_empresa ??
        f.whatsapp_empresa ??
        ''
    )
    if (tel) {
      merged.telefone = tel
      merged.celularEmpresa = String(f.celularEmpresa ?? f.celular ?? f.celular_empresa ?? tel)
      merged.telefoneEmpresa = String(f.telefoneEmpresa ?? f.telefone ?? tel)
      merged.whatsapp = String(f.whatsapp ?? f.whatsappEmpresa ?? f.whatsapp_empresa ?? tel)
    }
  }

  if (!merged.logoUrl || merged.logoUrl === '/logo-connect.png') {
    const comLogo = fontes.find((f) => {
      if (!f || typeof f !== 'object') return false
      const l = (f as Record<string, unknown>).logoUrl ?? (f as Record<string, unknown>).logo ?? (f as Record<string, unknown>).logo_url
      return l && String(l).trim() && String(l) !== '/logo-connect.png'
    }) as Record<string, unknown> | undefined
    if (comLogo) {
      const l = comLogo.logoUrl ?? comLogo.logo ?? comLogo.logo_url
      merged.logoUrl = logoUrlAbsolutaPublica(String(l)) || normalizarLogoEmpresaPublica(String(l))
    }
  }

  return merged
}
