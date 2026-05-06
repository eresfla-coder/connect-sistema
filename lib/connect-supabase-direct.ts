import { supabase } from './supabase'
import { FINANCEIRO_STORAGE_KEY, type FinanceiroTitulo, normalizeStatus } from './financeiro'

export type ClienteConnect = {
  id?: string | number | null
  nome?: string | null
  nomeCompleto?: string | null
  cliente?: string | null
  telefone?: string | null
  whatsapp?: string | null
  celular?: string | null
  email?: string | null
  documento?: string | null
  cpf?: string | null
  cnpj?: string | null
  [key: string]: any
}

export const CLIENTES_STORAGE_KEY = 'connect_clientes'

type StorageRow = {
  storage_key: string
  payload: any
}

function normalizarTitulos(lista: any[]): FinanceiroTitulo[] {
  return (Array.isArray(lista) ? lista : [])
    .map((item) => ({
      ...item,
      valor: Number(item?.valor || 0),
      valor_pago: Number(item?.valor_pago ?? item?.valor_recebido ?? 0),
      status: normalizeStatus(item),
    }))
    .sort((a, b) => String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || '')))
}

export function nomeCliente(cliente: ClienteConnect) {
  return String(cliente?.nome || cliente?.nomeCompleto || cliente?.cliente || '').trim()
}

export function telefoneCliente(cliente: ClienteConnect) {
  return String(cliente?.telefone || cliente?.whatsapp || cliente?.celular || '').trim()
}

export function idCliente(cliente: ClienteConnect) {
  return cliente?.id ?? cliente?.documento ?? cliente?.cpf ?? cliente?.cnpj ?? telefoneCliente(cliente) ?? nomeCliente(cliente)
}

export function normalizarClientes(lista: any[]): ClienteConnect[] {
  return (Array.isArray(lista) ? lista : [])
    .map((cliente, index) => ({
      ...cliente,
      id: idCliente(cliente) || `cliente-${index + 1}`,
      nome: nomeCliente(cliente),
      telefone: telefoneCliente(cliente),
    }))
    .filter((cliente) => nomeCliente(cliente))
}

async function getUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user?.id) return null
  return data.user.id
}

export async function puxarStorageDireto(keys: string[]) {
  const userId = await getUserId()
  if (!userId) throw new Error('Faça login para usar o banco.')

  const { data, error } = await supabase
    .from('connect_storage')
    .select('storage_key,payload')
    .eq('user_id', userId)
    .in('storage_key', keys)

  if (error) throw error

  const payload: Record<string, any> = {}
  ;((data || []) as StorageRow[]).forEach((row) => {
    payload[row.storage_key] = row.payload
  })

  return payload
}

export async function salvarStorageDireto(key: string, payload: any) {
  const userId = await getUserId()
  if (!userId) throw new Error('Faça login para salvar no banco.')

  const { error } = await supabase
    .from('connect_storage')
    .upsert(
      {
        user_id: userId,
        storage_key: key,
        payload: payload ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,storage_key' }
    )

  if (error) throw error
}

export async function carregarFinanceiroEClientesDireto() {
  const dados = await puxarStorageDireto([FINANCEIRO_STORAGE_KEY, CLIENTES_STORAGE_KEY])

  let clientesBanco: any[] = []
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true })

    if (!error && Array.isArray(data)) clientesBanco = data
  } catch {}

  return {
    titulos: normalizarTitulos(dados[FINANCEIRO_STORAGE_KEY] || []),
    clientes: normalizarClientes(clientesBanco.length ? clientesBanco : dados[CLIENTES_STORAGE_KEY] || []),
  }
}

export async function salvarFinanceiroDireto(lista: FinanceiroTitulo[]) {
  const normalizados = normalizarTitulos(lista).map((item) => ({
    ...item,
    updated_at: new Date().toISOString(),
  }))
  await salvarStorageDireto(FINANCEIRO_STORAGE_KEY, normalizados)
  return normalizados
}
