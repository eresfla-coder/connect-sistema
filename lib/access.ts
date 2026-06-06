/**
 * Client-safe admin hints. Authoritative admin list lives server-side (lib/access-server.ts + ADMIN_EMAILS env).
 * On the client, only perfil role/tier flags are trusted locally; use /api/assinatura/status for isAdminMaster.
 */
export function isAdminEmail(_email?: string | null) {
  return false
}

/** @deprecated Client-side email check disabled — use API isAdminMaster flag. */
export function isAdminMaster(_email?: string | null) {
  return false
}

export type PerfilAdminCheck = {
  email?: string | null
  role?: string | null
  status?: string | null
  plano_tier?: string | null
}

/** Perfil com role/tier admin ou master (campos opcionais no Supabase). */
export function isPerfilRoleAdmin(perfil?: PerfilAdminCheck | null) {
  if (!perfil) return false
  const role = String((perfil as { role?: string }).role || (perfil as { perfil_role?: string }).perfil_role || '')
    .trim()
    .toLowerCase()
  if (['admin', 'master', 'owner', 'superadmin', 'saas_master'].includes(role)) return true
  const tier = String(perfil.plano_tier || '').trim().toLowerCase()
  if (tier === 'admin' || tier === 'master') return true
  const status = String(perfil.status || '').trim().toLowerCase()
  if (status === 'admin' || status === 'master') return true
  return false
}

/** Admin master: perfil role/tier on client; e-mail master only on server (access-server). */
export function isUsuarioAdmin(args?: { email?: string | null; perfil?: PerfilAdminCheck | null }) {
  return isPerfilRoleAdmin(args?.perfil)
}

/** E-mail do usuário Supabase (campo principal ou metadata OAuth). */
export function emailDoUsuarioAuth(
  user?: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null
) {
  if (!user) return ''

  const direto = String(user.email || '').trim().toLowerCase()
  if (direto) return direto

  const meta = (user.user_metadata || {}) as Record<string, unknown>
  const metaEmail = String(meta.email || meta.user_email || meta.preferred_username || '').trim().toLowerCase()

  return metaEmail
}

export function normalizarStatus(status?: string | null) {
  const valor = String(status || '').trim().toLowerCase()

  if (!valor) return 'teste'

  if (
    valor === 'ativo' ||
    valor === 'active' ||
    valor === 'liberado' ||
    valor === 'pago' ||
    valor === 'assinante'
  ) {
    return 'ativo'
  }

  if (
    valor === 'bloqueado' ||
    valor === 'blocked' ||
    valor === 'inativo' ||
    valor === 'cancelado' ||
    valor === 'expirado'
  ) {
    return 'bloqueado'
  }

  if (
    valor === 'teste' ||
    valor === 'trial' ||
    valor === 'demo' ||
    valor === 'demonstracao' ||
    valor === 'demonstração'
  ) {
    return 'teste'
  }

  return valor
}

export function acessoBloqueado(entrada?: boolean | null | any) {
  if (typeof entrada === 'boolean') {
    return entrada === false
  }

  if (entrada && typeof entrada === 'object') {
    if (entrada.ativo === false) return true

    const status = normalizarStatus(
      entrada.status ||
      entrada.situacao ||
      entrada.plano_status ||
      entrada.status_assinatura
    )

    return status === 'bloqueado'
  }

  return false
}

export function dataMaisDias(dias: number) {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return data.toISOString()
}

export function avisoTrial(entrada?: string | null | any, opts?: { email?: string | null; perfil?: PerfilAdminCheck | null }) {
  if (isUsuarioAdmin({ email: opts?.email, perfil: opts?.perfil })) return null
  if (entrada && typeof entrada === 'object' && isPerfilRoleAdmin(entrada as PerfilAdminCheck)) return null

  let dataFim: string | null | undefined = null

  if (typeof entrada === 'string') {
    dataFim = entrada
  } else if (entrada && typeof entrada === 'object') {
    dataFim =
      entrada.trial_fim ||
      entrada.trialFim ||
      entrada.teste_ate ||
      entrada.data_trial_fim ||
      entrada.dataFimTeste ||
      entrada.data_fim_teste ||
      entrada.validade ||
      null
  }

  if (!dataFim) return null

  const hoje = new Date()
  const fim = new Date(dataFim)

  if (Number.isNaN(fim.getTime())) return null

  const diff = Math.ceil(
    (fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diff < 0) return 'Seu período de teste expirou.'
  if (diff === 0) return 'Seu período de teste termina hoje.'
  if (diff <= 3) return `Seu período de teste termina em ${diff} dias.`

  return null
}