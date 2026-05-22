import {
  formatarMoeda,
  inicioDoDia,
  montarMensagemCobranca,
  normalizarTelefoneWhatsApp,
  parseDataLocal,
  type ResumoAssinatura,
} from '@/lib/assinatura-cobranca'
import type { AssinaturaAdmin, PagamentoAdmin } from '@/lib/admin-dados-assinatura'
import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'

export type PontoGraficoMensal = {
  mes: string
  label: string
  recebido: number
  previsto: number
}

export type RankingCliente = {
  resumo: ResumoAssinatura
  valor: number
  totalPago: number
  posicao: number
}

export type MetricasFinanceiras = {
  faturamentoPrevistoMes: number
  totalRecebido: number
  totalAtrasado: number
  clientesVencendoHoje: number
  mrrEstimado: number
  ticketMedio: number
  graficoMensal: PontoGraficoMensal[]
  ranking: RankingCliente[]
}

const STATUS_PAGO = new Set([
  'pago',
  'paid',
  'confirmado',
  'aprovado',
  'concluido',
  'concluído',
])

function lerValorNumerico(bruto?: number | string | null) {
  if (typeof bruto === 'number') return bruto
  const texto = String(bruto || '')
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.')
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function dataPagamento(item: PagamentoAdmin) {
  return (
    parseDataLocal(item.pago_em) ||
    parseDataLocal(item.data_pagamento) ||
    parseDataLocal(item.created_at)
  )
}

function pagamentoEhPago(item: PagamentoAdmin) {
  const status = String(item.status || '').trim().toLowerCase()
  if (!status) return true
  return STATUS_PAGO.has(status)
}

function chaveMes(data: Date) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  return `${ano}-${mes}`
}

function labelMes(chave: string) {
  const [ano, mes] = chave.split('-').map(Number)
  const data = new Date(ano, (mes || 1) - 1, 1)
  return data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

export function gerarGraficoMensalPadrao(): PontoGraficoMensal[] {
  const hoje = inicioDoDia()
  const pontos: PontoGraficoMensal[] = []

  for (let i = 5; i >= 0; i -= 1) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const chave = chaveMes(data)
    pontos.push({
      mes: chave,
      label: labelMes(chave),
      recebido: 0,
      previsto: 0,
    })
  }

  return pontos
}

export function graficoSemDadosSuficientes(pontos: PontoGraficoMensal[]) {
  if (!pontos.length) return true
  return pontos.every((p) => p.recebido <= 0 && p.previsto <= 0)
}

export function normalizarPontosGrafico(pontos?: PontoGraficoMensal[]) {
  const base = pontos?.length ? [...pontos] : gerarGraficoMensalPadrao()
  const padrao = gerarGraficoMensalPadrao()
  const mapa = new Map(base.map((p) => [p.mes, p]))

  return padrao.map((mesPadrao) => {
    const existente = mapa.get(mesPadrao.mes)
    return {
      mes: mesPadrao.mes,
      label: existente?.label || mesPadrao.label,
      recebido: Number(existente?.recebido) || 0,
      previsto: Number(existente?.previsto) || 0,
    }
  })
}

function enrichirMensalidadeComAssinaturas(
  resumos: ResumoAssinatura[],
  assinaturas: AssinaturaAdmin[],
) {
  if (!assinaturas.length) return resumos

  const mapa = new Map<string, number>()
  for (const item of assinaturas) {
    const id = item.perfil_id || item.user_id
    if (!id) continue
    const valor = lerValorNumerico(item.valor ?? item.mensalidade)
    if (valor > 0) mapa.set(id, valor)
  }

  return resumos.map((resumo) => {
    const extra = mapa.get(resumo.perfil.id)
    if (!extra || resumo.valorMensalidade > 0) return resumo
    return {
      ...resumo,
      valorMensalidade: extra,
    }
  })
}

export function calcularMetricasFinanceiras(
  resumosBase: ResumoAssinatura[],
  pagamentos: PagamentoAdmin[],
  assinaturas: AssinaturaAdmin[],
): MetricasFinanceiras {
  const resumos = enrichirMensalidadeComAssinaturas(resumosBase, assinaturas)
  const hoje = inicioDoDia()
  const mesAtual = chaveMes(hoje)

  const ativos = resumos.filter((item) => item.grupo === 'ativo')
  const atrasados = resumos.filter((item) => item.grupo === 'atrasado')
  const vencendoHoje = resumos.filter((item) => item.grupo === 'vencendo_hoje')

  const somaMensalidade = (lista: ResumoAssinatura[]) =>
    lista.reduce((total, item) => total + item.valorMensalidade, 0)

  const mrrEstimado = somaMensalidade(ativos)
  const pagantesAtivos = ativos.filter((item) => item.valorMensalidade > 0)
  const ticketMedio =
    pagantesAtivos.length > 0 ? mrrEstimado / pagantesAtivos.length : 0

  const faturamentoPrevistoMes = somaMensalidade([
    ...ativos,
    ...vencendoHoje,
    ...atrasados,
  ])

  const totalAtrasado = somaMensalidade(atrasados)

  let totalRecebido = 0
  const pagosPorPerfil = new Map<string, number>()
  const recebidoPorMes = new Map<string, number>()

  for (const pagamento of pagamentos) {
    if (!pagamentoEhPago(pagamento)) continue
    const valor = lerValorNumerico(pagamento.valor)
    if (valor <= 0) continue

    const data = dataPagamento(pagamento)
    if (!data) continue

    const mes = chaveMes(data)
    recebidoPorMes.set(mes, (recebidoPorMes.get(mes) || 0) + valor)

    if (mes === mesAtual) {
      totalRecebido += valor
    }

    const perfilId =
      pagamento.perfil_id || pagamento.user_id || pagamento.assinatura_id || ''
    if (perfilId) {
      pagosPorPerfil.set(perfilId, (pagosPorPerfil.get(perfilId) || 0) + valor)
    }
  }

  if (totalRecebido <= 0 && pagantesAtivos.length > 0) {
    totalRecebido = pagantesAtivos.reduce((total, item) => {
      const pagoPerfil = pagosPorPerfil.get(item.perfil.id) || 0
      if (pagoPerfil > 0) return total + pagoPerfil
      return total + item.valorMensalidade
    }, 0)
  }

  const previstoPorMes = new Map<string, number>()
  for (let i = 5; i >= 0; i -= 1) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    previstoPorMes.set(chaveMes(data), mrrEstimado)
  }

  const graficoMensal: PontoGraficoMensal[] = []
  for (let i = 5; i >= 0; i -= 1) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const chave = chaveMes(data)
    const recebido = recebidoPorMes.get(chave) || 0
    const previsto = previstoPorMes.get(chave) || mrrEstimado
    graficoMensal.push({
      mes: chave,
      label: labelMes(chave),
      recebido,
      previsto: i === 0 ? faturamentoPrevistoMes : previsto,
    })
  }

  if (graficoMensal.every((p) => p.recebido <= 0) && mrrEstimado > 0) {
    graficoMensal[graficoMensal.length - 1].recebido = totalRecebido
  }

  const rankingBase = [...resumos].sort((a, b) => {
    const pagoA = pagosPorPerfil.get(a.perfil.id) || 0
    const pagoB = pagosPorPerfil.get(b.perfil.id) || 0
    const scoreA = Math.max(a.valorMensalidade, pagoA)
    const scoreB = Math.max(b.valorMensalidade, pagoB)
    return scoreB - scoreA
  })

  const ranking: RankingCliente[] = rankingBase.slice(0, 8).map((resumo, index) => ({
    resumo,
    valor: resumo.valorMensalidade,
    totalPago: pagosPorPerfil.get(resumo.perfil.id) || 0,
    posicao: index + 1,
  }))

  return {
    faturamentoPrevistoMes,
    totalRecebido,
    totalAtrasado,
    clientesVencendoHoje: vencendoHoje.length,
    mrrEstimado,
    ticketMedio,
    graficoMensal: normalizarPontosGrafico(graficoMensal),
    ranking,
  }
}

export function formatarMetrica(valor: number) {
  return formatarMoeda(valor)
}

export function montarMensagemRenovacao(resumo: ResumoAssinatura) {
  const valor =
    resumo.valorMensalidade > 0
      ? formatarMoeda(resumo.valorMensalidade)
      : 'consulte o suporte'

  const base = parseDataLocal(resumo.perfil.vencimento) || inicioDoDia()
  const sugerida = new Date(base)
  sugerida.setMonth(sugerida.getMonth() + 1)

  const dataSugerida = sugerida.toLocaleDateString('pt-BR')

  return `Olá ${resumo.nomeCliente}, vamos renovar sua assinatura do Connect Sistema. Valor: ${valor}. Próximo vencimento sugerido: ${dataSugerida}.`
}

export function abrirWhatsAppMensagem(resumo: ResumoAssinatura, mensagem: string) {
  abrirWhatsAppComTelefone(resumo.telefone, mensagem)
}

export function acaoCobrar(resumo: ResumoAssinatura) {
  abrirWhatsAppMensagem(resumo, montarMensagemCobranca(resumo))
}

export function acaoRenovar(resumo: ResumoAssinatura) {
  abrirWhatsAppMensagem(resumo, montarMensagemRenovacao(resumo))
}

export function acaoWhatsApp(resumo: ResumoAssinatura) {
  abrirWhatsAppMensagem(
    resumo,
    `Olá ${resumo.nomeCliente}, tudo bem? Estamos à disposição pelo Connect Sistema.`,
  )
}
