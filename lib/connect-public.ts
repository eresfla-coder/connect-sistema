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