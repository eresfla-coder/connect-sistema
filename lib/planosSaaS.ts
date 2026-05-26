export type PlanoTier = 'trial' | 'starter' | 'pro' | 'empresa'
export type RecorrenciaPlano = 'mensal' | 'anual'

export type RecursosPlano = {
  connectAi: boolean
  financeiro: boolean
  crm: boolean
  automacoes: boolean
  multiUsuario: boolean
  pdfPremium: boolean
  aprovacaoDigital: boolean
  whatsappIntegrado: boolean
}

export type PlanoConfig = {
  tier: PlanoTier
  nome: string
  descricao: string
  limites: {
    usuarios: number
    documentosMes: number
  }
  recursos: RecursosPlano
  precos: {
    mensal: number
    anual: number
  }
  diasRecorrencia: {
    mensal: number
    anual: number
  }
}

export const TRIAL_DIAS = 7

export const PLANOS_CATALOGO: Record<Exclude<PlanoTier, 'trial'>, PlanoConfig> = {
  starter: {
    tier: 'starter',
    nome: 'Starter',
    descricao: 'Ideal para começar com orçamentos, OS e clientes.',
    limites: { usuarios: 1, documentosMes: 80 },
    recursos: {
      connectAi: false,
      financeiro: false,
      crm: false,
      automacoes: false,
      multiUsuario: false,
      pdfPremium: false,
      aprovacaoDigital: true,
      whatsappIntegrado: true,
    },
    precos: { mensal: 49.9, anual: 479 },
    diasRecorrencia: { mensal: 30, anual: 365 },
  },
  pro: {
    tier: 'pro',
    nome: 'Pro',
    descricao: 'Financeiro, CRM, PDF premium e Connect AI.',
    limites: { usuarios: 3, documentosMes: 400 },
    recursos: {
      connectAi: true,
      financeiro: true,
      crm: true,
      automacoes: false,
      multiUsuario: false,
      pdfPremium: true,
      aprovacaoDigital: true,
      whatsappIntegrado: true,
    },
    precos: { mensal: 89.9, anual: 859 },
    diasRecorrencia: { mensal: 30, anual: 365 },
  },
  empresa: {
    tier: 'empresa',
    nome: 'Empresa',
    descricao: 'Multiusuário, automações e prioridade de suporte.',
    limites: { usuarios: 10, documentosMes: 5000 },
    recursos: {
      connectAi: true,
      financeiro: true,
      crm: true,
      automacoes: true,
      multiUsuario: true,
      pdfPremium: true,
      aprovacaoDigital: true,
      whatsappIntegrado: true,
    },
    precos: { mensal: 149.9, anual: 1439 },
    diasRecorrencia: { mensal: 30, anual: 365 },
  },
}

export function normalizarTier(input?: string | null): PlanoTier {
  const valor = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (valor === 'starter' || valor === 'pro' || valor === 'empresa' || valor === 'trial') {
    return valor
  }

  if (valor.includes('empresa')) return 'empresa'
  if (valor.includes('pro')) return 'pro'
  if (valor.includes('starter') || valor === 'mensal' || valor === 'anual') return 'starter'

  return 'trial'
}

export function normalizarRecorrencia(input?: string | null): RecorrenciaPlano {
  return String(input || '').trim().toLowerCase() === 'anual' ? 'anual' : 'mensal'
}

export function obterPlanoConfig(tier: PlanoTier): PlanoConfig | null {
  if (tier === 'trial') return null
  return PLANOS_CATALOGO[tier]
}

export function valorPlano(tier: PlanoTier, recorrencia: RecorrenciaPlano): number {
  const cfg = obterPlanoConfig(tier)
  if (!cfg) return 0
  return recorrencia === 'anual' ? cfg.precos.anual : cfg.precos.mensal
}

export function diasPlano(tier: PlanoTier, recorrencia: RecorrenciaPlano): number {
  const cfg = obterPlanoConfig(tier)
  if (!cfg) return TRIAL_DIAS
  return recorrencia === 'anual' ? cfg.diasRecorrencia.anual : cfg.diasRecorrencia.mensal
}

export function tierPorValor(valor: number): PlanoTier {
  const v = Number(valor || 0)
  if (v >= PLANOS_CATALOGO.empresa.precos.mensal - 0.5) return 'empresa'
  if (v >= PLANOS_CATALOGO.pro.precos.mensal - 0.5) return 'pro'
  if (v > 0) return 'starter'
  return 'trial'
}

export function chaveCheckout(tier: PlanoTier, recorrencia: RecorrenciaPlano) {
  return `${tier}_${recorrencia}`
}

/** Compatibilidade com checkout antigo mensal/anual → starter. */
export function resolverCheckout(input: { tier?: string; plano?: string; recorrencia?: string }) {
  const planoLegado = String(input.plano || '').trim().toLowerCase()
  if (planoLegado === 'mensal' || planoLegado === 'anual') {
    return { tier: 'starter' as PlanoTier, recorrencia: planoLegado as RecorrenciaPlano }
  }
  const tier = normalizarTier(input.tier || input.plano)
  const recorrencia = normalizarRecorrencia(input.recorrencia || 'mensal')
  if (tier === 'trial') return { tier: 'starter' as PlanoTier, recorrencia }
  return { tier, recorrencia }
}
