export const ADMIN_EMAILS = [
  'eresfla@gmail.com',
]

export function isAdminEmail(email?: string | null) {
  if (!email) return false

  return ADMIN_EMAILS.includes(
    String(email).trim().toLowerCase()
  )
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

export function avisoTrial(entrada?: string | null | any) {
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