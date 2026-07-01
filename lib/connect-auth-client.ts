/**
 * Helpers de auth no client — ponto único para /api/painel/acesso.
 *
 * - consultarAcessoPainel: deduplica chamadas simultâneas (evita loop no login)
 * - resolverDestinoPosLogin: redirect param > admin > /dashboard
 *
 * NÃO chamar /api/assinatura/status aqui. Ver docs/AUTENTICACAO-V1.md
 */
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

const ACESSO_TIMEOUT_MS = 8000

export type AcessoPainelResumo = {
  ok: boolean
  adminLogado?: boolean
  reason?: string
  message?: string
}

let acessoEmVoo: Promise<AcessoPainelResumo> | null = null
let acessoTokenCache = ''

export async function consultarAcessoPainel(token: string, opts?: { forcar?: boolean }): Promise<AcessoPainelResumo> {
  if (!token) return { ok: false, reason: 'sem_sessao' }

  if (!opts?.forcar && acessoEmVoo && acessoTokenCache === token) {
    return acessoEmVoo
  }

  acessoTokenCache = token
  acessoEmVoo = (async () => {
    try {
      const res = await fetchWithTimeout(
        '/api/painel/acesso',
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
        ACESSO_TIMEOUT_MS,
      )
      return (await res.json().catch(() => ({ ok: false, reason: 'erro_parse' }))) as AcessoPainelResumo
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro_rede'
      return { ok: false, reason: 'timeout', message }
    } finally {
      acessoEmVoo = null
    }
  })()

  return acessoEmVoo
}

export function limparCacheAcessoPainel() {
  acessoEmVoo = null
  acessoTokenCache = ''
}

export function resolverDestinoPosLogin(args: {
  redirectParam?: string | null
  adminLogado?: boolean
}): string {
  const redirect = String(args.redirectParam || '').trim()
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect
  }
  if (args.adminLogado) return '/admin'
  return '/dashboard'
}
