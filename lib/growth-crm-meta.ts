import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'

export type StatusComercial =
  | 'lead'
  | 'trial'
  | 'ativo'
  | 'atrasado'
  | 'cancelado'

export type EventoHistorico = {
  id: string
  data: string
  texto: string
}

export type MetaCrmCliente = {
  observacoes: string
  tags: string[]
  historico: EventoHistorico[]
  previsaoConversao: number
}

const META_KEY = 'connect_growth_crm_meta'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function lerTodas(): Record<string, MetaCrmCliente> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(META_KEY)
    return raw ? (JSON.parse(raw) as Record<string, MetaCrmCliente>) : {}
  } catch {
    return {}
  }
}

function salvarTodas(mapa: Record<string, MetaCrmCliente>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(META_KEY, JSON.stringify(mapa))
}

export function lerMetaCrm(clienteId: string): MetaCrmCliente {
  const mapa = lerTodas()
  return (
    mapa[clienteId] || {
      observacoes: '',
      tags: [],
      historico: [],
      previsaoConversao: 0,
    }
  )
}

export function salvarMetaCrm(clienteId: string, meta: MetaCrmCliente) {
  const mapa = lerTodas()
  mapa[clienteId] = meta
  salvarTodas(mapa)
}

export function adicionarHistoricoCrm(clienteId: string, texto: string) {
  const meta = lerMetaCrm(clienteId)
  meta.historico.unshift({
    id: uid(),
    data: new Date().toISOString(),
    texto,
  })
  meta.historico = meta.historico.slice(0, 30)
  salvarMetaCrm(clienteId, meta)
}

export function tagsAutomaticas(resumo?: ResumoAssinatura | null): string[] {
  if (!resumo) return ['lead']
  const tags: string[] = []
  const status = String(resumo.perfil.status || '').toLowerCase()

  if (status === 'teste') tags.push('trial')
  if (resumo.grupo === 'ativo') tags.push('ativo')
  if (resumo.grupo === 'atrasado') tags.push('atrasado')
  if (resumo.grupo === 'vencendo_hoje') tags.push('vencendo')
  if (resumo.valorMensalidade >= 150) tags.push('alto-ticket')
  if (resumo.perfil.ativo === false || status === 'bloqueado') tags.push('cancelado')

  return tags.length ? tags : ['prospect']
}

export function previsaoConversaoPct(resumo?: ResumoAssinatura | null): number {
  if (!resumo) return 15
  const status = String(resumo.perfil.status || '').toLowerCase()
  if (status === 'ativo') return 95
  if (resumo.grupo === 'atrasado') return 35
  if (status === 'teste') {
    if (resumo.diasParaVencer >= 5) return 72
    if (resumo.diasParaVencer >= 2) return 48
    return 22
  }
  return 55
}

export function statusComercialDeResumo(
  resumo: ResumoAssinatura,
  ehLeadPuro = false,
): StatusComercial {
  if (ehLeadPuro) return 'lead'
  const status = String(resumo.perfil.status || '').toLowerCase()
  if (resumo.perfil.ativo === false || status === 'bloqueado') return 'cancelado'
  if (resumo.grupo === 'atrasado') return 'atrasado'
  if (status === 'teste') return 'trial'
  if (resumo.grupo === 'ativo' || status === 'ativo') return 'ativo'
  if (resumo.grupo === 'vencendo_hoje') return 'atrasado'
  return 'ativo'
}
