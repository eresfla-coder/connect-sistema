import { supabase } from '@/lib/supabase-browser'
import { isDemoMode } from '@/lib/connect-demo'

export function storageKeyUsuario(baseKey: string, userId?: string | null) {
  if (!userId) return baseKey
  return `${baseKey}_${userId}`
}

function parseJsonSafe<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function listaPareceDemo(lista: unknown): boolean {
  if (!Array.isArray(lista)) return false
  return lista.some((item) => {
    const id = String((item as { id?: unknown })?.id ?? '')
    return id.startsWith('demo-')
  })
}

export async function obterUserIdPainel(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) return session.user.id
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch {
    return null
  }
}

/** Lê localStorage isolado por usuário; em demo usa chave global. */
export function lerLocalStorageUsuario<T>(baseKey: string, userId: string | null | undefined, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  if (isDemoMode()) {
    return parseJsonSafe(localStorage.getItem(baseKey), fallback)
  }

  if (!userId) return fallback

  const scopedKey = storageKeyUsuario(baseKey, userId)
  const scopedRaw = localStorage.getItem(scopedKey)
  if (scopedRaw) return parseJsonSafe(scopedRaw, fallback)

  const globalRaw = localStorage.getItem(baseKey)
  if (!globalRaw) return fallback

  const globalValue = parseJsonSafe<unknown>(globalRaw, null)
  if (listaPareceDemo(globalValue)) return fallback

  try {
    localStorage.setItem(scopedKey, globalRaw)
  } catch {
    /* quota */
  }

  return parseJsonSafe(globalRaw, fallback)
}

/** Grava localStorage isolado por usuário; em demo usa chave global. */
export function salvarLocalStorageUsuario(baseKey: string, userId: string | null | undefined, value: unknown) {
  if (typeof window === 'undefined') return

  const raw = JSON.stringify(value)
  if (isDemoMode() || !userId) {
    localStorage.setItem(baseKey, raw)
    return
  }

  localStorage.setItem(storageKeyUsuario(baseKey, userId), raw)
}
