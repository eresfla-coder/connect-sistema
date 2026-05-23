/** Limites e consumo do plano — baseado em uso local (não altera núcleo). */

export type PlanoComercial = 'teste' | 'profissional' | 'empresa'

export type LimitesPlano = {
  orcamentos: number
  ordensServico: number
  clientes: number
  recibos: number
}

const LIMITES: Record<PlanoComercial, LimitesPlano> = {
  teste: { orcamentos: 30, ordensServico: 20, clientes: 50, recibos: 25 },
  profissional: { orcamentos: 500, ordensServico: 500, clientes: 500, recibos: 500 },
  empresa: { orcamentos: 99999, ordensServico: 99999, clientes: 99999, recibos: 99999 },
}

export function planoDoStatus(status?: string | null): PlanoComercial {
  const s = String(status || '').toLowerCase()
  if (s === 'ativo' || s === 'admin') return 'profissional'
  if (s === 'empresa') return 'empresa'
  return 'teste'
}

function contarStorage(chave: string) {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(chave)
    const lista = raw ? JSON.parse(raw) : []
    return Array.isArray(lista) ? lista.length : 0
  } catch {
    return 0
  }
}

export function lerConsumoPlano() {
  return {
    orcamentos: contarStorage('connect_orcamentos_salvos'),
    ordensServico: contarStorage('connect_ordens_servico_salvas'),
    clientes: contarStorage('connect_clientes'),
    recibos: contarStorage('connect_recibos_salvos'),
  }
}

export function limitesDoPlano(plano: PlanoComercial) {
  return LIMITES[plano]
}

export function percentualUso(usado: number, limite: number) {
  if (limite <= 0) return 0
  return Math.min(100, Math.round((usado / limite) * 100))
}

export function rotuloPlano(plano: PlanoComercial) {
  switch (plano) {
    case 'profissional':
      return 'Profissional'
    case 'empresa':
      return 'Empresa'
    default:
      return 'Teste grátis'
  }
}
