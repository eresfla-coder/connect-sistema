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

export type PublicDocumentType = 'quotation' | 'ordem_servico'

export type PublicDocumentSnapshot<TDocument = unknown, TConfig = unknown> = {
  documentType: PublicDocumentType
  documentId: string
  document: TDocument
  config?: TConfig
  createdAt: string
}

export type SavePublicDocumentInput<TDocument = unknown, TConfig = unknown> = {
  documentType: PublicDocumentType
  documentId: string | number
  document: TDocument
  config?: TConfig
}

export type SavePublicDocumentResult<TDocument = unknown, TConfig = unknown> = {
  token: string
  documentType: PublicDocumentType
  documentId: string
  payload: PublicDocumentSnapshot<TDocument, TConfig>
}

export const STORAGE_ORCAMENTOS = 'connect_orcamentos_salvos'
export const STORAGE_CONFIG = 'connect_configuracoes'
export const DEFAULT_LOGO_PATH = '/logo-connect.svg'

export function getPublicOrigin() {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

export function onlyNumbers(value?: string) {
  return (value || '').replace(/\D/g, '')
}

export function normalizeBrazilWhatsAppNumber(value?: string) {
  let number = onlyNumbers(value)

  if (!number) return ''
  if (!number.startsWith('55')) number = `55${number}`

  return number
}

export function getWhatsAppNumber(config?: ConnectConfiguracoes) {
  const raw =
    config?.whatsapp ||
    config?.telefoneWhatsApp ||
    config?.telefone ||
    ''

  return normalizeBrazilWhatsAppNumber(raw)
}

export function buildPublicOrcamentoPath(id: string | number) {
  return `/publico/orcamento/${encodeURIComponent(String(id))}`
}

export function buildPublicServiceOrderPath(id: string | number) {
  return `/view/os/${encodeURIComponent(String(id))}`
}

export function buildPrintOrcamentoPath(id: string | number) {
  return `/impressao-orcamento/${encodeURIComponent(String(id))}`
}

export function withPublicToken(path: string, token?: string) {
  if (!token) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}token=${encodeURIComponent(token)}`
}

export function buildAbsoluteUrl(path: string, origin = getPublicOrigin()) {
  if (!origin) return path
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildPublicDocumentPath(
  documentType: PublicDocumentType,
  id: string | number,
  token?: string
) {
  const base =
    documentType === 'quotation'
      ? buildPublicOrcamentoPath(id)
      : buildPublicServiceOrderPath(id)

  return withPublicToken(base, token)
}

export function buildPublicPrintDocumentPath(
  documentType: PublicDocumentType,
  id: string | number,
  token?: string
) {
  const base =
    documentType === 'quotation'
      ? buildPrintOrcamentoPath(id)
      : buildPublicServiceOrderPath(id)

  return withPublicToken(base, token)
}

export async function savePublicDocument<TDocument, TConfig = unknown>({
  documentType,
  documentId,
  document,
  config,
}: SavePublicDocumentInput<TDocument, TConfig>) {
  const response = await fetch('/api/public-docs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      documentType,
      documentId: String(documentId),
      payload: {
        documentType,
        documentId: String(documentId),
        document,
        config,
        createdAt: new Date().toISOString(),
      },
    }),
  })

  if (!response.ok) {
    throw new Error('Nao foi possivel publicar o documento.')
  }

  return response.json() as Promise<SavePublicDocumentResult<TDocument, TConfig>>
}

export async function loadPublicDocument<TDocument = unknown, TConfig = unknown>(
  documentType: PublicDocumentType,
  documentId: string | number,
  token?: string | null
) {
  if (!token) return null

  const params = new URLSearchParams({
    type: documentType,
    id: String(documentId),
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
  const link = buildAbsoluteUrl(buildPublicOrcamentoPath(orcamento.id), origin)

  return `Olá, tenho interesse no orçamento ${numero} (${cliente}). ${link}`
}