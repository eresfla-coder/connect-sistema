import type { AssinaturaAdmin, PagamentoAdmin } from '@/lib/admin-dados-assinatura'
import {
  calcularMetricasFinanceiras,
  type MetricasFinanceiras,
} from '@/lib/financeiro-admin'
import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'
import type { ConfigGrowth } from '@/lib/growth-store'
import type { PainelCrm } from '@/lib/growth-crm'

export type AnalyticsSaaS = {
  mrrReal: number
  mrrEstimado: number
  churnRate: number
  arpa: number
  cacManual: number
  ltvCacRatio: number
  crescimentoMensalPct: number
  receitaPrevista: number
  clientesAtivos: number
  clientesPerdidos: number
  metricas: MetricasFinanceiras
}

function lerValorPagamento(item: PagamentoAdmin) {
  const bruto = item.valor
  if (typeof bruto === 'number') return bruto
  const n = Number(String(bruto || '').replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function calcularAnalyticsSaaS(
  resumos: ResumoAssinatura[],
  pagamentos: PagamentoAdmin[],
  assinaturas: AssinaturaAdmin[],
  crm: PainelCrm,
  config: ConfigGrowth,
): AnalyticsSaaS {
  const metricas = calcularMetricasFinanceiras(resumos, pagamentos, assinaturas)
  const ativos = resumos.filter((r) => r.grupo === 'ativo')
  const mrrReal = ativos.reduce((t, r) => t + r.valorMensalidade, 0)
  const mrrEstimado = metricas.mrrEstimado
  const clientesAtivos = ativos.length
  const clientesPerdidos = crm.totais.cancelado + crm.totais.recuperacao
  const baseChurn = clientesAtivos + clientesPerdidos
  const churnRate =
    baseChurn > 0 ? Math.round((clientesPerdidos / baseChurn) * 100) : 0
  const arpa = clientesAtivos > 0 ? mrrReal / clientesAtivos : 0
  const cacManual = config.cacManual || 0
  const ltvEstimado = arpa * 12
  const ltvCacRatio = cacManual > 0 ? Math.round((ltvEstimado / cacManual) * 10) / 10 : 0

  const grafico = metricas.graficoMensal
  const ultimo = grafico[grafico.length - 1]?.recebido || 0
  const anterior = grafico[grafico.length - 2]?.recebido || 0
  const crescimentoMensalPct =
    anterior > 0 ? Math.round(((ultimo - anterior) / anterior) * 100) : 0

  const receitaPrevista =
    config.metaMrr > 0 ? config.metaMrr : metricas.faturamentoPrevistoMes

  return {
    mrrReal,
    mrrEstimado,
    churnRate,
    arpa,
    cacManual,
    ltvCacRatio,
    crescimentoMensalPct,
    receitaPrevista,
    clientesAtivos,
    clientesPerdidos,
    metricas,
  }
}

export function totalRecebidoPagamentos(pagamentos: PagamentoAdmin[]) {
  return pagamentos.reduce((t, p) => t + lerValorPagamento(p), 0)
}
