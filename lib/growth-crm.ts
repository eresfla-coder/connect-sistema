import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'
import type { LeadGrowth } from '@/lib/growth-store'

export type EstagioCrm =
  | 'lead'
  | 'trial'
  | 'convertido'
  | 'cancelado'
  | 'recuperacao'

export type ItemCrm = {
  id: string
  nome: string
  email: string
  telefone: string
  estagio: EstagioCrm
  valor: number
  vencimento: string
  origem: string
  resumo?: ResumoAssinatura
}

export type PainelCrm = {
  leads: ItemCrm[]
  trials: ItemCrm[]
  convertidos: ItemCrm[]
  cancelados: ItemCrm[]
  recuperacao: ItemCrm[]
  totais: Record<EstagioCrm, number>
}

function itemDeResumo(resumo: ResumoAssinatura, estagio: EstagioCrm): ItemCrm {
  return {
    id: resumo.perfil.id,
    nome: resumo.nomeCliente,
    email: String(resumo.perfil.email || ''),
    telefone: resumo.telefone,
    estagio,
    valor: resumo.valorMensalidade,
    vencimento: resumo.vencimentoFormatado,
    origem: 'assinatura',
    resumo,
  }
}

function itemDeLead(lead: LeadGrowth): ItemCrm {
  return {
    id: lead.id,
    nome: lead.nome || lead.email.split('@')[0],
    email: lead.email,
    telefone: lead.telefone || '',
    estagio: lead.convertido ? 'convertido' : 'lead',
    valor: 0,
    vencimento: '—',
    origem: lead.origem || 'landing',
  }
}

export function montarPainelCrm(
  resumos: ResumoAssinatura[],
  leads: LeadGrowth[],
): PainelCrm {
  const emailsPerfis = new Set(
    resumos.map((r) => String(r.perfil.email || '').toLowerCase()).filter(Boolean),
  )

  const leadsPuros = leads
    .filter((l) => !l.convertido && !emailsPerfis.has(l.email.toLowerCase()))
    .map(itemDeLead)

  const trials: ItemCrm[] = []
  const convertidos: ItemCrm[] = []
  const cancelados: ItemCrm[] = []
  const recuperacao: ItemCrm[] = []

  for (const resumo of resumos) {
    const status = String(resumo.perfil.status || '').toLowerCase()
    const bloqueado =
      resumo.perfil.ativo === false || status === 'bloqueado'

    if (bloqueado) {
      cancelados.push(itemDeResumo(resumo, 'cancelado'))
      continue
    }

    if (resumo.grupo === 'atrasado') {
      recuperacao.push(itemDeResumo(resumo, 'recuperacao'))
      continue
    }

    if (status === 'teste') {
      trials.push(itemDeResumo(resumo, 'trial'))
      continue
    }

    if (resumo.grupo === 'ativo' || status === 'ativo') {
      convertidos.push(itemDeResumo(resumo, 'convertido'))
      continue
    }

    if (resumo.grupo === 'vencendo_hoje') {
      recuperacao.push(itemDeResumo(resumo, 'recuperacao'))
      continue
    }

    convertidos.push(itemDeResumo(resumo, 'convertido'))
  }

  const totais: Record<EstagioCrm, number> = {
    lead: leadsPuros.length,
    trial: trials.length,
    convertido: convertidos.length,
    cancelado: cancelados.length,
    recuperacao: recuperacao.length,
  }

  return {
    leads: leadsPuros,
    trials,
    convertidos,
    cancelados,
    recuperacao,
    totais,
  }
}

export type FunilConversao = {
  leads: number
  trials: number
  convertidos: number
  taxaLeadTrial: number
  taxaTrialPago: number
  taxaLeadPago: number
}

export function calcularFunil(crm: PainelCrm): FunilConversao {
  const leads = crm.totais.lead + crm.totais.trial + crm.totais.convertido
  const trials = crm.totais.trial + crm.totais.convertido
  const convertidos = crm.totais.convertido

  const taxa = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

  return {
    leads,
    trials,
    convertidos,
    taxaLeadTrial: taxa(crm.totais.trial, crm.totais.lead || 1),
    taxaTrialPago: taxa(crm.totais.convertido, trials || 1),
    taxaLeadPago: taxa(crm.totais.convertido, leads || 1),
  }
}
