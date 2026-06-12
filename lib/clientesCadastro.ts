import { CLIENTES_KEY, carregarClientesPainel, normalizarClientePainel, type ClientePainel } from '@/lib/clientes-painel'
import { lerLocalStorageUsuario } from '@/lib/connect-user-storage'

export const CLIENTES_STORAGE_KEY = CLIENTES_KEY

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

function painelParaCadastro(item: ClientePainel): ClienteCadastro {
  return {
    id: item.id,
    nome: item.nome,
    telefone: item.telefone,
    cpfCnpj: item.cpfCnpj,
    endereco: item.endereco,
    bairro: item.bairro,
    cidade: item.cidade,
    cep: item.cep,
    email: item.email,
  }
}

export function normalizarClienteCadastro(item: unknown): ClienteCadastro | null {
  return painelParaCadastro(normalizarClientePainel(item))
}

/** Leitura síncrona do cache scoped (fallback quando Supabase ainda não respondeu). */
export function lerClientesCadastro(userId?: string | null): ClienteCadastro[] {
  if (typeof window === 'undefined') return []

  try {
    const cache = lerLocalStorageUsuario<unknown[]>(CLIENTES_STORAGE_KEY, userId ?? null, [])
    if (Array.isArray(cache) && cache.length > 0) {
      return cache.map(normalizarClienteCadastro).filter((c): c is ClienteCadastro => Boolean(c))
    }
  } catch {
    /* ignore */
  }

  return []
}

/** Fonte completa: Supabase + cache scoped. */
export async function carregarClientesCadastro(): Promise<ClienteCadastro[]> {
  const lista = await carregarClientesPainel()
  return lista
    .map((item) => painelParaCadastro(item))
    .filter((c): c is ClienteCadastro => Boolean(c))
}

export function enderecoClienteCompleto(cliente: ClienteCadastro) {
  return [cliente.endereco, cliente.bairro, cliente.cidade, cliente.cep].filter(Boolean).join(' • ')
}
