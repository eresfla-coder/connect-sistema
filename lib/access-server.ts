/**
 * Admin master — server only. Nunca importar em componentes client.
 * Admin = e-mail em ADMIN_EMAILS / CONNECT_ADMIN_EMAILS (vírgula).
 * Campos de public.perfis (role, plano_tier, status) NÃO concedem admin.
 * @see docs/AUTENTICACAO-V1.md
 */

function parseAdminEmails(): string[] {
  const raw = String(process.env.ADMIN_EMAILS || process.env.CONNECT_ADMIN_EMAILS || '').trim()
  if (!raw) return []
  return raw
    .split(/[,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function getAdminEmailsServer(): string[] {
  return parseAdminEmails()
}

export function isAdminEmailServer(email?: string | null): boolean {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return false
  return getAdminEmailsServer().includes(normalized)
}

export function isAdminMasterServer(email?: string | null): boolean {
  return isAdminEmailServer(email)
}

export function isUsuarioAdminServer(args?: { email?: string | null }) {
  return isAdminMasterServer(args?.email)
}
