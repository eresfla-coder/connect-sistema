/**
 * Server-only admin access. Never import from client components.
 * Configure ADMIN_EMAILS (comma-separated) in .env.local / Vercel.
 */
import type { PerfilAdminCheck } from '@/lib/access'
import { isPerfilRoleAdmin } from '@/lib/access'

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

export function isUsuarioAdminServer(args?: { email?: string | null; perfil?: PerfilAdminCheck | null }) {
  if (isAdminMasterServer(args?.email)) return true
  return isPerfilRoleAdmin(args?.perfil)
}
