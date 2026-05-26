export const CLIENTES_STORAGE_KEY = 'connect_clientes'

export type ClienteCadastro = {
  id: string
  nome: string
  telefone: string
  cpfCnpj?: string
  endereco?: string
  bairro?: string
  cidade?: string
  cep?: string
  email?: string
}

export function normalizarClienteCadastro(item: unknown): ClienteCadastro | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const nome = String(row.nome || '').trim()
  if (!nome) return null
  return {
    id: String(row.id || ''),
    nome,
    telefone: String(row.telefone || row.whatsapp || '').trim(),
    cpfCnpj: String(row.cpfCnpj || row.cpf_cnpj || row.cpf || row.cnpj || '').trim(),
    endereco: String(row.endereco || '').trim(),
    bairro: String(row.bairro || '').trim(),
    cidade: String(row.cidade || '').trim(),
    cep: String(row.cep || '').trim(),
    email: String(row.email || '').trim(),
  }
}

export function lerClientesCadastro(): ClienteCadastro[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CLIENTES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizarClienteCadastro).filter((c): c is ClienteCadastro => Boolean(c))
  } catch {
    return []
  }
}

export function enderecoClienteCompleto(cliente: ClienteCadastro) {
  return [cliente.endereco, cliente.bairro, cliente.cidade, cliente.cep].filter(Boolean).join(' • ')
}
