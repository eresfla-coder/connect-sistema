/**
 * Classificação pura de erros do probe admin_* (sem deps de runtime).
 */

export type AdminTablesProbeKind = 'network' | 'permission' | 'timeout' | 'unknown'

export type AdminTablesProbe =
  | { status: 'ready' }
  | { status: 'missing' }
  | { status: 'error'; kind: AdminTablesProbeKind; message: string }

export function classificarErroAdminTables(message: unknown): AdminTablesProbe {
  const msg = String(message || '')
  const lower = msg.toLowerCase()

  const missing =
    lower.includes('does not exist') ||
    lower.includes('schema cache') ||
    lower.includes('could not find the table') ||
    (lower.includes('relation') && lower.includes('does not exist')) ||
    lower.includes('pgrst205')

  if (missing) return { status: 'missing' }

  if (
    lower.includes('permission') ||
    lower.includes('not authorized') ||
    lower.includes('jwt') ||
    lower.includes('rls') ||
    lower.includes('42501')
  ) {
    return { status: 'error', kind: 'permission', message: msg.slice(0, 200) }
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return { status: 'error', kind: 'timeout', message: msg.slice(0, 200) }
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('socket')
  ) {
    return { status: 'error', kind: 'network', message: msg.slice(0, 200) }
  }

  return { status: 'error', kind: 'unknown', message: msg.slice(0, 200) }
}
