import { mergeConnectValue } from '@/lib/connect-cloud-storage'
import {
  lerLocalStorageUsuario,
  obterUserIdPainel,
  obterUserIdPainelSync,
  salvarLocalStorageUsuario,
} from '@/lib/connect-user-storage'
import { supabase } from '@/lib/supabase-browser'
import { parseNumeroMonetario } from '@/lib/numero-monetario'

export const PRODUTOS_KEY = 'connect_produtos'

export type ProdutoPainel = {
  id: number
  nome: string
  categoria: string
  preco: number
  custo: number
  estoque: number
  descricao: string
  codigoBarras?: string
  ativo: boolean
  tipoCalculo?: 'unidade' | 'm2' | 'peso'
  tipoCadastro?: 'produto' | 'servico'
  impostoPct?: number
  taxaCartaoPct?: number
  despesasPct?: number
  comissaoPct?: number
  lucroDesejadoPct?: number
  precoSugerido?: number
  lucroEstimado?: number
  margemRealPct?: number
  markup?: number
  statusMargem?: 'saudavel' | 'apertada' | 'risco'
  atualizadoEm?: number
}

export type ProdutosLoadOrigem =
  | 'supabase'
  | 'connect_storage'
  | 'localStorage_scoped'
  | 'vazio'
  | 'supabase_erro'

export type ProdutosLoadResult = {
  produtos: ProdutoPainel[]
  origem: ProdutosLoadOrigem
  userId: string | null
  detalhe?: string
}

function logProdutosLoad(
  modulo: string,
  origem: ProdutosLoadOrigem | string,
  quantidade: number,
  userId: string | null,
  detalhe?: string,
) {
  console.info('[PRODUTOS_LOAD]', { modulo, origem, quantidade, userId, detalhe })
}

async function obterTokenSessao() {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  } catch {
    return ''
  }
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

  return obterUserIdPainelSync()
}

export function normalizarProdutoPainel(item: unknown, index = 0): ProdutoPainel | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const nome = String(row.nome || '').trim()
  if (!nome) return null

  return {
    id: Number(row.id ?? Date.now() + index),
    nome,
    categoria: String(row.categoria || ''),
    preco: parseNumeroMonetario(
      row.preco ??
      row.valor ??
      row.precoVenda ??
      row.preco_venda ??
      row.valorServico ??
      row.valor_servico ??
      0,
    ),
    custo: Number(row.custo || 0),
    estoque: Number(row.estoque || 0),
    descricao: String(row.descricao || ''),
    codigoBarras: String(row.codigoBarras || row.codigo || row.ean || row.gtin || '').trim() || undefined,
    ativo: row.ativo !== false,
    tipoCalculo: row.tipoCalculo === 'm2' ? 'm2' : row.tipoCalculo === 'peso' ? 'peso' : 'unidade',
    tipoCadastro: row.tipoCadastro === 'servico' ? 'servico' : 'produto',
    impostoPct: row.impostoPct != null ? Number(row.impostoPct) : undefined,
    taxaCartaoPct: row.taxaCartaoPct != null ? Number(row.taxaCartaoPct) : undefined,
    despesasPct: row.despesasPct != null ? Number(row.despesasPct) : undefined,
    comissaoPct: row.comissaoPct != null ? Number(row.comissaoPct) : undefined,
    lucroDesejadoPct: row.lucroDesejadoPct != null ? Number(row.lucroDesejadoPct) : undefined,
    precoSugerido: row.precoSugerido != null ? Number(row.precoSugerido) : undefined,
    lucroEstimado: row.lucroEstimado != null ? Number(row.lucroEstimado) : undefined,
    margemRealPct: row.margemRealPct != null ? Number(row.margemRealPct) : undefined,
    markup: row.markup != null ? Number(row.markup) : undefined,
    statusMargem:
      row.statusMargem === 'risco' || row.statusMargem === 'apertada' || row.statusMargem === 'saudavel'
        ? row.statusMargem
        : undefined,
    atualizadoEm: Number(row.atualizadoEm || row.updated_at || row.updatedAt || 0) || undefined,
  }
}

function mapearListaProdutos(lista: unknown[]): ProdutoPainel[] {
  return lista
    .map((item, index) => normalizarProdutoPainel(item, index))
    .filter((item): item is ProdutoPainel => Boolean(item && item.ativo !== false))
}

function lerCacheLocalProdutos(uid: string | null): ProdutoPainel[] {
  const cache = lerLocalStorageUsuario<unknown[]>(PRODUTOS_KEY, uid, [])
  if (!Array.isArray(cache)) return []
  return mapearListaProdutos(cache)
}

function rowSupabaseParaProduto(row: Record<string, unknown>): ProdutoPainel | null {
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}
  return normalizarProdutoPainel(
    {
      ...payload,
      id: Number(row.local_id || payload.id || 0),
      nome: row.nome || payload.nome,
      ativo: row.ativo ?? payload.ativo,
    },
    0,
  )
}

async function carregarProdutosSupabase(uid: string): Promise<ProdutoPainel[] | null> {
  const { data, error } = await supabase
    .from('produtos')
    .select('local_id,nome,ativo,payload,updated_at')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false })

  if (error) {
    const msg = String(error.message || '').toLowerCase()
    if (msg.includes('relation') || msg.includes('schema') || msg.includes('does not exist')) {
      return null
    }
    throw error
  }

  return (data || [])
    .map((row) => rowSupabaseParaProduto(row as Record<string, unknown>))
    .filter((item): item is ProdutoPainel => Boolean(item))
}

async function carregarProdutosConnectStorage(token: string): Promise<ProdutoPainel[] | null> {
  if (!token) return null

  const resposta = await fetch('/api/connect-storage', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!resposta.ok) return null

  const json = await resposta.json().catch(() => null)
  const lista = json?.data?.[PRODUTOS_KEY]
  if (!Array.isArray(lista)) return null
  return mapearListaProdutos(lista)
}

async function salvarProdutosConnectStorage(token: string, lista: ProdutoPainel[]) {
  if (!token) throw new Error('Sessão inválida para sincronizar produtos.')

  const resposta = await fetch('/api/connect-storage', {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        [PRODUTOS_KEY]: lista,
      },
    }),
  })

  if (!resposta.ok) {
    const json = await resposta.json().catch(() => ({}))
    throw new Error(String(json?.message || 'Falha ao sincronizar produtos na nuvem.'))
  }
}

async function salvarProdutosSupabase(uid: string, lista: ProdutoPainel[]) {
  const idsAtuais = new Set(lista.map((item) => String(item.id)))

  const { data: existentes, error: erroLista } = await supabase
    .from('produtos')
    .select('local_id')
    .eq('user_id', uid)

  if (erroLista) {
    const msg = String(erroLista.message || '').toLowerCase()
    if (msg.includes('relation') || msg.includes('schema') || msg.includes('does not exist')) {
      return false
    }
    throw erroLista
  }

  const paraRemover = (existentes || [])
    .map((row) => String((row as { local_id?: string }).local_id || ''))
    .filter((localId) => localId && !idsAtuais.has(localId))

  if (paraRemover.length > 0) {
    const { error: erroDelete } = await supabase
      .from('produtos')
      .delete()
      .eq('user_id', uid)
      .in('local_id', paraRemover)
    if (erroDelete) throw erroDelete
  }

  if (!lista.length) return true

  const agora = new Date().toISOString()
  const rows = lista.map((item) => ({
    user_id: uid,
    local_id: String(item.id),
    nome: item.nome,
    ativo: item.ativo !== false,
    payload: { ...item, atualizadoEm: item.atualizadoEm || Date.now() },
    updated_at: agora,
  }))

  const { error } = await supabase.from('produtos').upsert(rows, { onConflict: 'user_id,local_id' })
  if (error) throw error
  return true
}

function mesclarProdutos(local: ProdutoPainel[], remoto: ProdutoPainel[]): ProdutoPainel[] {
  return mapearListaProdutos(mergeConnectValue(local, remoto) as unknown[])
}

function cachearProdutosLocal(uid: string | null, lista: ProdutoPainel[]) {
  try {
    salvarLocalStorageUsuario(PRODUTOS_KEY, uid, lista)
  } catch {
    /* quota */
  }
}

/** Fonte única: Supabase produtos → connect_storage → cache local. */
export async function carregarProdutosPainelDetalhado(modulo = 'produtos'): Promise<ProdutosLoadResult> {
  const uid = await resolverUserIdComRetry()
  const local = lerCacheLocalProdutos(uid)

  if (!uid) {
    logProdutosLoad(modulo, local.length ? 'localStorage_scoped' : 'vazio', local.length, null, 'sem_sessao')
    return {
      produtos: local,
      origem: local.length ? 'localStorage_scoped' : 'vazio',
      userId: null,
    }
  }

  const token = await obterTokenSessao()
  let remoto: ProdutoPainel[] = []
  let origem: ProdutosLoadOrigem = 'localStorage_scoped'
  let detalhe: string | undefined

  try {
    const supabaseLista = await carregarProdutosSupabase(uid)
    if (supabaseLista) {
      remoto = supabaseLista
      origem = 'supabase'
    } else {
      const storageLista = await carregarProdutosConnectStorage(token)
      if (storageLista) {
        remoto = storageLista
        origem = 'connect_storage'
      }
    }
  } catch (error) {
    detalhe = error instanceof Error ? error.message : 'erro_desconhecido'
    logProdutosLoad(modulo, 'supabase_erro', local.length, uid, detalhe)
    return {
      produtos: local,
      origem: local.length ? 'localStorage_scoped' : 'vazio',
      userId: uid,
      detalhe,
    }
  }

  const merged = remoto.length || local.length ? mesclarProdutos(local, remoto) : []
  cachearProdutosLocal(uid, merged)

  if (merged.length > remoto.length && token) {
    try {
      await salvarProdutosConnectStorage(token, merged)
      await salvarProdutosSupabase(uid, merged).catch(() => false)
    } catch (error) {
      console.warn('[PRODUTOS_SYNC_PUSH]', error)
    }
  }

  logProdutosLoad(modulo, origem, merged.length, uid, detalhe)
  return { produtos: merged, origem: merged.length ? origem : 'vazio', userId: uid, detalhe }
}

export async function carregarProdutosPainel(modulo = 'produtos'): Promise<ProdutoPainel[]> {
  const result = await carregarProdutosPainelDetalhado(modulo)
  return result.produtos
}

export async function salvarProdutosPainel(
  uid: string | null | undefined,
  lista: ProdutoPainel[],
  modulo = 'produtos',
): Promise<void> {
  const userId = uid || (await resolverUserIdComRetry())
  if (!userId) throw new Error('Sessão inválida. Faça login novamente.')

  const comTimestamp = lista.map((item) => ({
    ...item,
    atualizadoEm: Date.now(),
  }))

  const okLocal = salvarLocalStorageUsuario(PRODUTOS_KEY, userId, comTimestamp)
  if (!okLocal) {
    throw new Error('Não foi possível salvar os produtos neste aparelho. O armazenamento pode estar cheio.')
  }

  const token = await obterTokenSessao()
  let sincronizado = false

  try {
    await salvarProdutosSupabase(userId, comTimestamp)
    sincronizado = true
  } catch (error) {
    console.warn('[PRODUTOS_SAVE_SUPABASE]', error)
  }

  if (token) {
    await salvarProdutosConnectStorage(token, comTimestamp)
    sincronizado = true
  }

  if (!sincronizado) {
    throw new Error('Produtos salvos no aparelho, mas não foi possível sincronizar na nuvem.')
  }

  console.info('[PRODUTOS_SAVE]', { modulo, quantidade: comTimestamp.length, userId })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('connect-data-change'))
  }
}
