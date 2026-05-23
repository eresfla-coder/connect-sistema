import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'
import type { LeadGrowth } from '@/lib/growth-store'
import {
  lerMetaCrm,
  previsaoConversaoPct,
  statusComercialDeResumo,
  tagsAutomaticas,
  type StatusComercial,
} from '@/lib/growth-crm-meta'

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
  statusComercial: StatusComercial
  valor: number
  vencimento: string
  origem: string
  tags: string[]
  previsaoConversao: number
  observacoes: string
  resumo?: ResumoAssinatura
}

export type PainelCrm = {
  leads: ItemCrm[]
  trials: ItemCrm[]
  convertidos: ItemCrm[]
  ativos: ItemCrm[]
  atrasados: ItemCrm[]
  cancelados: ItemCrm[]
  recuperacao: ItemCrm[]
  totais: Record<EstagioCrm, number>
  totaisComercial: Record<StatusComercial, number>
  todos: ItemCrm[]
}

function itemDeResumo(resumo: ResumoAssinatura, estagio: EstagioCrm): ItemCrm {
  const meta = lerMetaCrm(resumo.perfil.id)
  const statusComercial = statusComercialDeResumo(resumo)
  return {
    id: resumo.perfil.id,
    nome: resumo.nomeCliente,
    email: String(resumo.perfil.email || ''),
    telefone: resumo.telefone,
    estagio,
    statusComercial,
    valor: resumo.valorMensalidade,
    vencimento: resumo.vencimentoFormatado,
    origem: 'assinatura',
    tags: [...new Set([...tagsAutomaticas(resumo), ...meta.tags])],
    previsaoConversao: meta.previsaoConversao || previsaoConversaoPct(resumo),
    observacoes: meta.observacoes,
    resumo,
  }
}

function itemDeLead(lead: LeadGrowth): ItemCrm {
  const meta = lerMetaCrm(lead.id)
  return {
    id: lead.id,
    nome: lead.nome || lead.email.split('@')[0],
    email: lead.email,
    telefone: lead.telefone || '',
    estagio: lead.convertido ? 'convertido' : 'lead',
    statusComercial: lead.convertido ? 'ativo' : 'lead',
    valor: 0,
    vencimento: '—',
    origem: lead.origem || 'landing',
    tags: ['lead', ...(meta.tags || [])],
    previsaoConversao: meta.previsaoConversao || 20,
    observacoes: meta.observacoes,
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
  const ativos: ItemCrm[] = []
  const atrasados: ItemCrm[] = []
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

    if (resumo.grupo === 'atrasado' || resumo.grupo === 'vencendo_hoje') {
      const item = itemDeResumo(resumo, 'recuperacao')
      recuperacao.push(item)
      atrasados.push(item)
      continue
    }

    if (status === 'teste') {
      trials.push(itemDeResumo(resumo, 'trial'))
      continue
    }

    if (resumo.grupo === 'ativo' || status === 'ativo') {
      const item = itemDeResumo(resumo, 'convertido')
      convertidos.push(item)
      ativos.push(item)
      continue
    }

    const item = itemDeResumo(resumo, 'convertido')
    convertidos.push(item)
    ativos.push(item)
  }

  const todos = [...leadsPuros, ...trials, ...ativos, ...atrasados, ...cancelados]

  const totais: Record<EstagioCrm, number> = {
    lead: leadsPuros.length,
    trial: trials.length,
    convertido: convertidos.length,
    cancelado: cancelados.length,
    recuperacao: recuperacao.length,
  }

  const totaisComercial: Record<StatusComercial, number> = {
    lead: todos.filter((i) => i.statusComercial === 'lead').length,
    trial: todos.filter((i) => i.statusComercial === 'trial').length,
    ativo: todos.filter((i) => i.statusComercial === 'ativo').length,
    atrasado: todos.filter((i) => i.statusComercial === 'atrasado').length,
    cancelado: todos.filter((i) => i.statusComercial === 'cancelado').length,
  }

  return {
    leads: leadsPuros,
    trials,
    convertidos,
    ativos,
    atrasados,
    cancelados,
    recuperacao,
    totais,
    totaisComercial,
    todos,
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
