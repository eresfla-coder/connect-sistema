/**
 * Probe server-only: admin_* pronta vs ausente vs erro real.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  CODIGO_ADMIN_TABLES_NOT_READY,
  MSG_ADMIN_TABLES_NOT_READY,
} from '@/lib/admin-carteira'
import {
  classificarErroAdminTables,
  type AdminTablesProbe,
  type AdminTablesProbeKind,
} from '@/lib/admin-tables-classify'

export type { AdminTablesProbe, AdminTablesProbeKind }
export { classificarErroAdminTables }

let cache: AdminTablesProbe | null = null
let cacheAt = 0
const CACHE_MS = 15_000

export function invalidarCacheAdminTables() {
  cache = null
  cacheAt = 0
}

export async function probeAdminTables(): Promise<AdminTablesProbe> {
  const now = Date.now()
  if (cache && now - cacheAt < CACHE_MS) return cache

  try {
    const { error } = await supabaseAdmin.from('admin_sistemas').select('id').limit(1)
    if (!error) {
      cache = { status: 'ready' }
      cacheAt = now
      return cache
    }
    cache = classificarErroAdminTables(error.message)
    cacheAt = now
    if (cache.status === 'error') {
      console.warn('[ADMIN.2] admin_sistemas probe error:', cache.kind, cache.message)
    }
    return cache
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || '')
    let classified = classificarErroAdminTables(message)
    if (classified.status === 'missing') {
      cache = classified
    } else if (classified.status === 'error') {
      cache = classified
    } else {
      cache = { status: 'error', kind: 'unknown', message: message.slice(0, 200) }
    }
    cacheAt = now
    console.warn('[ADMIN.2] admin_sistemas probe exception:', cache)
    return cache
  }
}

export async function adminTablesReady(): Promise<boolean> {
  const probe = await probeAdminTables()
  return probe.status === 'ready'
}

export function respostaAdminTablesNotReady() {
  return {
    status: 503 as const,
    body: {
      ok: false,
      code: CODIGO_ADMIN_TABLES_NOT_READY,
      error: MSG_ADMIN_TABLES_NOT_READY,
      tablesReady: false,
    },
  }
}

export function respostaAdminTablesProbeError(probe: Extract<AdminTablesProbe, { status: 'error' }>) {
  const code =
    probe.kind === 'permission'
      ? 'ADMIN_TABLES_PERMISSION'
      : probe.kind === 'timeout'
        ? 'ADMIN_TABLES_TIMEOUT'
        : probe.kind === 'network'
          ? 'ADMIN_TABLES_NETWORK'
          : 'ADMIN_TABLES_ERROR'
  return {
    status: 503 as const,
    body: {
      ok: false,
      code,
      error: 'Não foi possível acessar as tabelas administrativas no momento. Tente novamente.',
      tablesReady: false,
    },
  }
}
