import { supabase } from '@/lib/supabase-browser'
import { isDemoMode } from '@/lib/connect-demo'

const PAINEL_USER_ID_KEY = 'connect_painel_user_id'

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
    const sessionWrap = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    if (sessionWrap?.data?.session?.user?.id) {
      cachearUserIdPainel(sessionWrap.data.session.user.id)
      return sessionWrap.data.session.user.id
    }
    const userWrap = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    if (userWrap?.data?.user?.id) {
      cachearUserIdPainel(userWrap.data.user.id)
      return userWrap.data.user.id
    }
    return obterUserIdPainelSync()
  } catch {
    return obterUserIdPainelSync()
  }
}

export function cachearUserIdPainel(userId: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PAINEL_USER_ID_KEY, userId)
  } catch {
    /* private mode */
  }
}

export function obterUserIdPainelSync(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(PAINEL_USER_ID_KEY) || null
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
