import { lerLocalStorageUsuario, obterUserIdPainel, salvarLocalStorageUsuario } from '@/lib/connect-user-storage'
import { supabase } from '@/lib/supabase'

export const CLIENTES_KEY = 'connect_clientes'

export type ClientePainel = {
  id: string
  nome: string
  telefone: string
  email: string
  endereco: string
  cpfCnpj?: string
  bairro?: string
  cidade?: string
  cep?: string
  tipoPessoa?: 'PF' | 'PJ'
  cpf?: string
  cnpj?: string
  razaoSocial?: string
  nomeFantasia?: string
  whatsapp?: string
  ativo?: boolean
}

export type ClientesLoadOrigem =
  | 'supabase'
  | 'localStorage_scoped'
  | 'vazio'
  | 'supabase_erro'

export type ClientesLoadResult = {
  clientes: ClientePainel[]
  origem: ClientesLoadOrigem
  userId: string | null
  detalhe?: string
}

/** Log temporário de diagnóstico — remover após estabilizar produção. */
export function logClientesLoad(
  modulo: string,
  origem: ClientesLoadOrigem | string,
  quantidade: number,
  userId: string | null,
  detalhe?: string,
) {
  console.info('[CLIENTES_LOAD]', { modulo, origem, quantidade, userId, detalhe })
}

function enderecoCompleto(item: Record<string, unknown>): string {
  const partes = [item.endereco, item.bairro, item.cidade, item.cep].map((v) => String(v || '').trim()).filter(Boolean)
  return partes.join(' • ')
}

export function normalizarClientePainel(item: unknown, index = 0): ClientePainel | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const nome = String(row.nome || '').trim()
  if (!nome) return null

  const cpfCnpj = String(row.cpfCnpj || row.cpf_cnpj || row.cpf || row.cnpj || '').trim()
  const digits = cpfCnpj.replace(/\D/g, '')
  const isPJ = row.tipoPessoa === 'PJ' || digits.length > 11

  return {
    id: String(row.id || `local-${index + 1}`),
    nome,
    telefone: String(row.telefone || row.whatsapp || '').trim(),
    email: String(row.email || '').trim(),
    endereco: enderecoCompleto(row) || String(row.endereco || '').trim(),
    cpfCnpj,
    bairro: String(row.bairro || '').trim(),
    cidade: String(row.cidade || '').trim(),
    cep: String(row.cep || '').trim(),
    tipoPessoa: isPJ ? 'PJ' : 'PF',
    cpf: isPJ ? String(row.cpf || '') : cpfCnpj,
    cnpj: isPJ ? cpfCnpj || String(row.cnpj || '') : String(row.cnpj || ''),
    razaoSocial: String(row.razaoSocial || '').trim(),
    nomeFantasia: String(row.nomeFantasia || '').trim(),
    whatsapp: String(row.whatsapp || row.telefone || '').trim(),
    ativo: row.ativo !== false,
  }
}

function mapearListaClientes(lista: unknown[]): ClientePainel[] {
  return lista
    .map((item, index) => normalizarClientePainel(item, index))
    .filter((item): item is ClientePainel => Boolean(item && item.ativo !== false))
}

export function hashIdCliente(id: string, fallbackIndex: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  const positivo = Math.abs(hash)
  return positivo > 0 ? positivo : fallbackIndex + 1
}

async function resolverUserIdComRetry(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) return user.id
  } catch {
    /* ignore */
  }

  for (const delay of [0, 250, 700, 1500]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const uid = await obterUserIdPainel()
    if (uid) return uid
  }

  return null
}

function lerCacheLocalClientes(uid: string | null): ClientePainel[] {
  const cache = lerLocalStorageUsuario<unknown[]>(CLIENTES_KEY, uid, [])
  if (!Array.isArray(cache)) return []
  return mapearListaClientes(cache)
}

/** Fonte única: Supabase clientes (user_id) + cache scoped localStorage — espelha /clientes. */
export async function carregarClientesPainelDetalhado(modulo = 'painel'): Promise<ClientesLoadResult> {
  const uid = await resolverUserIdComRetry()

  if (!uid) {
    const cache = lerCacheLocalClientes(null)
    logClientesLoad(modulo, 'localStorage_scoped', cache.length, null, 'sem_sessao')
    return { clientes: cache, origem: cache.length ? 'localStorage_scoped' : 'vazio', userId: null }
  }

  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('user_id', uid)
      .order('nome', { ascending: true })

    if (error) {
      const cache = lerCacheLocalClientes(uid)
      logClientesLoad(modulo, 'supabase_erro', cache.length, uid, error.message)
      return {
        clientes: cache,
        origem: cache.length ? 'localStorage_scoped' : 'vazio',
        userId: uid,
        detalhe: error.message,
      }
    }

    const normalizados = mapearListaClientes(Array.isArray(data) ? data : [])

    try {
      salvarLocalStorageUsuario(CLIENTES_KEY, uid, normalizados)
    } catch {
      /* quota */
    }

    logClientesLoad(modulo, 'supabase', normalizados.length, uid)
    return { clientes: normalizados, origem: 'supabase', userId: uid }
  } catch (err) {
    const cache = lerCacheLocalClientes(uid)
    const detalhe = err instanceof Error ? err.message : 'erro_desconhecido'
    logClientesLoad(modulo, 'supabase_erro', cache.length, uid, detalhe)
    return {
      clientes: cache,
      origem: cache.length ? 'localStorage_scoped' : 'vazio',
      userId: uid,
      detalhe,
    }
  }
}

export async function carregarClientesPainel(modulo = 'painel'): Promise<ClientePainel[]> {
  const result = await carregarClientesPainelDetalhado(modulo)
  return result.clientes
}

export type ClienteOrcamentoModulo = {
  id: number
  nome: string
  telefone: string
  email: string
  endereco: string
  tipoPessoa?: 'PF' | 'PJ'
  cpf?: string
  cnpj?: string
  razaoSocial?: string
  nomeFantasia?: string
}

export function clientePainelParaOrcamento(cliente: ClientePainel, index = 0): ClienteOrcamentoModulo {
  const parsed = Number(cliente.id)
  const id =
    Number.isFinite(parsed) && parsed > 0 && String(parsed) === cliente.id ? parsed : hashIdCliente(cliente.id, index)

  return {
    id,
    nome: cliente.nome,
    telefone: cliente.telefone,
    email: cliente.email,
    endereco: cliente.endereco,
    tipoPessoa: cliente.tipoPessoa,
    cpf: cliente.cpf,
    cnpj: cliente.cnpj,
    razaoSocial: cliente.razaoSocial,
    nomeFantasia: cliente.nomeFantasia,
  }
}
