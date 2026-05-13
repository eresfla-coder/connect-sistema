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

export type PublicDocumentType = 'orcamento' | 'ordem_servico' | 'recibo'

export type PublicDocumentSnapshot<TDocument = unknown, TConfig = unknown> = {
  document_type: PublicDocumentType
  document_id: string
  document: TDocument
  config?: TConfig
  createdAt: string
}

export type SavePublicDocumentInput<TDocument = unknown, TConfig = unknown> = {
  document_type: PublicDocumentType
  document_id: string | number
  document: TDocument
  config?: TConfig
}

export type SavePublicDocumentResult<TDocument = unknown, TConfig = unknown> = {
  token: string
  document_type: PublicDocumentType
  document_id: string
  payload: PublicDocumentSnapshot<TDocument, TConfig>
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

export function normalizeBrazilWhatsAppNumber(value?: string) {
  let number = onlyNumbers(value)

  if (!number) return ''
  if (!number.startsWith('55')) number = `55${number}`

  return number
}

export function buildPublicReciboPath(id: string | number, token: string) {
  const params = new URLSearchParams({
    preview: '1',
    id: String(id),
    token,
  })

  return `/recibo-avulso?${params.toString()}`
}

export async function savePublicDocument<TDocument, TConfig = unknown>({
  document_type,
  document_id,
  document,
  config,
}: SavePublicDocumentInput<TDocument, TConfig>) {
  const normalizedDocumentId = String(document_id)
  const token = generatePublicDocumentToken()
  const payload: PublicDocumentSnapshot<TDocument, TConfig> = {
    document_type,
    document_id: normalizedDocumentId,
    document,
    config,
    createdAt: new Date().toISOString(),
  }

  const response = await fetch('/api/public-docs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_type,
      document_id: normalizedDocumentId,
      token,
      payload,
    }),
  })

  if (!response.ok) {
    throw new Error('Nao foi possivel publicar o documento.')
  }

  return response.json() as Promise<SavePublicDocumentResult<TDocument, TConfig>>
}

export async function loadPublicDocument<TDocument = unknown, TConfig = unknown>(
  document_type: PublicDocumentType,
  document_id: string | number,
  token?: string | null
) {
  if (!token) return null

  const params = new URLSearchParams({
    document_type,
    document_id: String(document_id),
    token,
  })

  const response = await fetch(`/api/public-docs?${params.toString()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Documento publico nao encontrado.')
  }

  const data = (await response.json()) as SavePublicDocumentResult<TDocument, TConfig>
  return data.payload
}

function generatePublicDocumentToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replaceAll('-', '')
  }

  const bytes = new Uint8Array(24)
  globalThis.crypto?.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
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