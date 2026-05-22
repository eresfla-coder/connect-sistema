// lib/connect-public.ts

export type ConnectConfiguracoes = {
  nomeSistema?: string
  nomeEmpresa?: string
  telefone?: string
  whatsapp?: string
  telefoneWhatsApp?: string
  corPrimaria?: string
  cidade?: string
  endereco?: string
}

export type ConnectItem = {
  id?: string | number
  codigo?: string
  descricao?: string
  nome?: string
  quantidade?: number
  valor?: number
  subtotal?: number
}

export type ConnectOrcamento = {
  id: string
  numero?: string
  data?: string
  validade?: string
  status?: string
  nomeCliente?: string
  telefoneCliente?: string
  cpfCnpjCliente?: string
  enderecoCliente?: string
  observacoes?: string
  formaPagamento?: string
  desconto?: number
  acrescimo?: number
  total?: number
  itens?: ConnectItem[]
}

export const STORAGE_ORCAMENTOS = 'connect_orcamentos_salvos'
export const STORAGE_CONFIG = 'connect_configuracoes'
export const DEFAULT_LOGO_PATH = '/logo-connect.png'

export type ConfigEmpresaCompleta = {
  nomeEmpresa: string
  telefone: string
  email: string
  endereco: string
  cidadeUf: string
  responsavel: string
  logoUrl: string
  corPrimaria: string
  corSecundaria: string
}

export function salvarConfigEmpresaLocal(config: ConfigEmpresaCompleta) {
  if (typeof window === 'undefined') return

  localStorage.setItem(
    STORAGE_CONFIG,
    JSON.stringify({
      ...config,
      whatsapp: config.telefone,
      telefoneWhatsApp: config.telefone,
    }),
  )
}

export function lerConfigEmpresaLocal(): Partial<ConfigEmpresaCompleta> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = localStorage.getItem(STORAGE_CONFIG)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<ConfigEmpresaCompleta>
  } catch {
    return {}
  }
}

export function mesclarConfigEmpresa(
  base: ConfigEmpresaCompleta,
  patch: Partial<ConfigEmpresaCompleta>,
): ConfigEmpresaCompleta {
  return {
    nomeEmpresa: patch.nomeEmpresa || base.nomeEmpresa,
    telefone: patch.telefone || base.telefone,
    email: patch.email || base.email,
    endereco: patch.endereco || base.endereco,
    cidadeUf: patch.cidadeUf || base.cidadeUf,
    responsavel: patch.responsavel || base.responsavel,
    logoUrl:
      patch.logoUrl === '/logo-connect.png'
        ? DEFAULT_LOGO_PATH
        : patch.logoUrl || base.logoUrl,
    corPrimaria: patch.corPrimaria || base.corPrimaria,
    corSecundaria: patch.corSecundaria || base.corSecundaria,
  }
}

type PerfilConfigEmpresa = {
  nome_empresa?: string | null
  telefone?: string | null
  email?: string | null
  nome?: string | null
  whatsapp?: string | null
  config_empresa?: unknown
}

export function configEmpresaFromPerfil(
  perfil: PerfilConfigEmpresa,
): Partial<ConfigEmpresaCompleta> {
  const patch: Partial<ConfigEmpresaCompleta> = {}

  if (perfil.nome_empresa) patch.nomeEmpresa = String(perfil.nome_empresa)
  if (perfil.telefone || perfil.whatsapp) {
    patch.telefone = String(perfil.telefone || perfil.whatsapp)
  }
  if (perfil.email) patch.email = String(perfil.email)
  if (perfil.nome) patch.responsavel = String(perfil.nome)

  const extra = perfil.config_empresa
  if (!extra) return patch

  try {
    const dados =
      typeof extra === 'string'
        ? (JSON.parse(extra) as Partial<ConfigEmpresaCompleta>)
        : (extra as Partial<ConfigEmpresaCompleta>)

    return mesclarConfigEmpresa(
      {
        nomeEmpresa: '',
        telefone: '',
        email: '',
        endereco: '',
        cidadeUf: '',
        responsavel: '',
        logoUrl: DEFAULT_LOGO_PATH,
        corPrimaria: '#f97316',
        corSecundaria: '#e5e7eb',
      },
      { ...patch, ...dados },
    )
  } catch {
    return patch
  }
}

export function payloadPerfilConfigEmpresa(config: ConfigEmpresaCompleta) {
  return {
    nome_empresa: config.nomeEmpresa,
    telefone: config.telefone,
    whatsapp: config.telefone,
    email: config.email,
    nome: config.responsavel,
    config_empresa: {
      endereco: config.endereco,
      cidadeUf: config.cidadeUf,
      logoUrl: config.logoUrl,
      corPrimaria: config.corPrimaria,
      corSecundaria: config.corSecundaria,
    },
  }
}

export function getPublicOrigin() {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

export function onlyNumbers(value?: string) {
  return (value || '').replace(/\D/g, '')
}

export function getWhatsAppNumber(config?: ConnectConfiguracoes) {
  const raw =
    config?.whatsapp ||
    config?.telefoneWhatsApp ||
    config?.telefone ||
    ''

  let number = onlyNumbers(raw)

  if (!number) return ''

  if (!number.startsWith('55')) {
    number = `55${number}`
  }

  return number
}

export function money(value?: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

export function loadConfig(): ConnectConfiguracoes {
  if (typeof window === 'undefined') return {}

  try {
    const raw = localStorage.getItem(STORAGE_CONFIG)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function loadOrcamentos(): ConnectOrcamento[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(STORAGE_ORCAMENTOS)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function findOrcamentoById(id: string) {
  const lista = loadOrcamentos()
  return lista.find((item) => String(item.id) === String(id)) || null
}

export function buildWhatsAppMessage(
  orcamento: ConnectOrcamento,
  origin: string
) {
  const numero = orcamento.numero || orcamento.id
  const cliente = orcamento.nomeCliente || 'cliente'
  const link = origin ? `${origin}/orcamentos/${orcamento.id}` : ''

  return `Olá, tenho interesse no orçamento ${numero} (${cliente}). ${link}`
}