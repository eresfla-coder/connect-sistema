export type LeadGrowth = {
  id: string
  nome: string
  email: string
  telefone?: string
  origem?: string
  criadoEm: string
  convertido?: boolean
}

export type ConfigGrowth = {
  cacManual: number
  metaMrr: number
}

const LEADS_KEY = 'connect_growth_leads'
const CONFIG_KEY = 'connect_growth_config'
const AUTO_LOG_KEY = 'connect_growth_automacao_log'

export type LogAutomacao = {
  id: string
  tipo: string
  cliente: string
  quando: string
  status: 'ok' | 'erro'
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function lerLeads(): LeadGrowth[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LEADS_KEY)
    if (!raw) return []
    const lista = JSON.parse(raw)
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function salvarLead(lead: Omit<LeadGrowth, 'id' | 'criadoEm' | 'convertido'>) {
  const lista = lerLeads()
  const novo: LeadGrowth = {
    id: uid(),
    criadoEm: new Date().toISOString(),
    convertido: false,
    ...lead,
  }
  lista.unshift(novo)
  localStorage.setItem(LEADS_KEY, JSON.stringify(lista.slice(0, 500)))
  localStorage.setItem('connect_growth_lead_pendente', JSON.stringify(novo))
  return novo
}

export function marcarLeadConvertido(email: string) {
  const lista = lerLeads().map((l) =>
    l.email.toLowerCase() === email.toLowerCase() ? { ...l, convertido: true } : l,
  )
  localStorage.setItem(LEADS_KEY, JSON.stringify(lista))
  localStorage.removeItem('connect_growth_lead_pendente')
}

export function lerLeadPendente(): LeadGrowth | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('connect_growth_lead_pendente')
    return raw ? (JSON.parse(raw) as LeadGrowth) : null
  } catch {
    return null
  }
}

export function lerConfigGrowth(): ConfigGrowth {
  if (typeof window === 'undefined') {
    return { cacManual: 0, metaMrr: 0 }
  }
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { cacManual: 0, metaMrr: 0 }
    return { cacManual: 0, metaMrr: 0, ...JSON.parse(raw) }
  } catch {
    return { cacManual: 0, metaMrr: 0 }
  }
}

export function salvarConfigGrowth(config: ConfigGrowth) {
  if (typeof window === 'undefined') return
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function registrarLogAutomacao(
  entrada: Omit<LogAutomacao, 'id' | 'quando'>,
) {
  if (typeof window === 'undefined') return
  const logs = lerLogsAutomacao()
  logs.unshift({
    ...entrada,
    id: uid(),
    quando: new Date().toISOString(),
  })
  localStorage.setItem(AUTO_LOG_KEY, JSON.stringify(logs.slice(0, 200)))
}

export function lerLogsAutomacao(): LogAutomacao[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(AUTO_LOG_KEY)
    if (!raw) return []
    const lista = JSON.parse(raw)
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}
