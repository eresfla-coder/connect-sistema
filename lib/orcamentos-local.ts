import { isDemoMode } from '@/lib/connect-demo'
import {
  lerLocalStorageUsuario,
  obterUserIdPainel,
  obterUserIdPainelSync,
  salvarLocalStorageUsuario,
  storageKeyUsuario,
} from '@/lib/connect-user-storage'

export const ORCAMENTOS_PAINEL_KEY = 'connect_orcamentos_salvos'
export const ORDENS_PAINEL_KEY = 'connect_ordens_servico_salvas'
export const ORCAMENTOS_DELETED_PREFIX = 'connect_orcamentos_deleted_'

export type ItemComId = { id?: unknown }

export function chaveOrcamentosDeleted(userId?: string | null) {
  return `${ORCAMENTOS_DELETED_PREFIX}${userId || 'anon'}`
}

export function lerDeletedOrcamentosIds(userId?: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(chaveOrcamentosDeleted(userId))
    const lista = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(lista.map((item) => String(item)))
  } catch {
    return new Set<string>()
  }
}

export function deduplicarPorId<T extends ItemComId>(lista: T[]): T[] {
  const mapa = new Map<string, T>()
  for (const item of lista) {
    const id = String(item?.id ?? '')
    if (!id) continue
    mapa.set(id, item)
  }
  return Array.from(mapa.values())
}

export function lerOrcamentosPainelSync(userId?: string | null): Record<string, unknown>[] {
  const deletedIds = lerDeletedOrcamentosIds(userId)
  const raw = lerLocalStorageUsuario<Record<string, unknown>[]>(ORCAMENTOS_PAINEL_KEY, userId, [])
  const lista = Array.isArray(raw) ? raw : []
  return deduplicarPorId(lista).filter((item) => {
    const id = String(item.id ?? '')
    return id && !deletedIds.has(id)
  })
}

export function lerOrdensPainelSync(userId?: string | null): Record<string, unknown>[] {
  const raw = lerLocalStorageUsuario<Record<string, unknown>[]>(ORDENS_PAINEL_KEY, userId, [])
  const lista = Array.isArray(raw) ? raw : []
  return deduplicarPorId(lista)
}

export function contarOrcamentosPainelSync(userId?: string | null): number {
  return lerOrcamentosPainelSync(userId).length
}

export function contarOrdensPainelSync(userId?: string | null): number {
  return lerOrdensPainelSync(userId).length
}

export function contarDocumentosPainelSync(userId?: string | null): number {
  const resolved = userId ?? obterUserIdPainelSync()
  return contarOrcamentosPainelSync(resolved) + contarOrdensPainelSync(resolved)
}

export async function lerOrcamentosPainel(): Promise<Record<string, unknown>[]> {
  const userId = await obterUserIdPainel()
  return lerOrcamentosPainelSync(userId)
}

export async function lerOrdensPainel(): Promise<Record<string, unknown>[]> {
  const userId = await obterUserIdPainel()
  return lerOrdensPainelSync(userId)
}

export function salvarOrcamentosPainel(userId: string | null | undefined, lista: unknown[]) {
  salvarLocalStorageUsuario(ORCAMENTOS_PAINEL_KEY, userId, lista)
}

export function salvarOrdensPainel(userId: string | null | undefined, lista: unknown[]) {
  salvarLocalStorageUsuario(ORDENS_PAINEL_KEY, userId, lista)
}

/** Remove chaves globais legadas quando o usuário já tem dados scoped. */
export function limparChavesGlobaisAposMigracao(userId?: string | null) {
  if (typeof window === 'undefined' || !userId || isDemoMode()) return

  for (const baseKey of [ORCAMENTOS_PAINEL_KEY, ORDENS_PAINEL_KEY]) {
    const scopedKey = storageKeyUsuario(baseKey, userId)
    if (!localStorage.getItem(scopedKey)) continue
    try {
      localStorage.removeItem(baseKey)
    } catch {
      /* quota */
    }
  }
}
