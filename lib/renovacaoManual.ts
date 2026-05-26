import { PLANOS_CATALOGO, type PlanoTier } from '@/lib/planosSaaS'

export type PlanoRenovacaoManual = Exclude<PlanoTier, 'trial'>

export type ReciboRenovacaoManual = {
  numero: string
  clienteNome: string
  clienteEmail: string
  plano: string
  planoTier: PlanoRenovacaoManual
  valor: number
  formaPagamento: string
  dataPagamento: string
  validadeAte: string
  observacao: string
  emitidoEm: string
  status: string
}

export function nomePlanoRenovacao(tier: PlanoRenovacaoManual) {
  return PLANOS_CATALOGO[tier]?.nome || tier
}

export function formatarDataBr(iso?: string | null) {
  if (!iso) return '-'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}

export function formatarMoedaBr(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function montarMensagemRenovacaoWhatsapp(input: {
  nomeCliente: string
  plano: string
  valor: number
  validadeAte: string
}) {
  const nome = String(input.nomeCliente || 'cliente').trim()
  return [
    `Olá ${nome}, seu acesso ao Connect Sistema foi renovado com sucesso.`,
    `Plano: ${input.plano}`,
    `Valor: ${formatarMoedaBr(input.valor)}`,
    `Validade até: ${formatarDataBr(input.validadeAte)}`,
    'Obrigado pela confiança.',
  ].join('\n')
}

export function montarReciboRenovacaoManual(input: {
  numero: string
  clienteNome: string
  clienteEmail: string
  plano: string
  planoTier: PlanoRenovacaoManual
  valor: number
  formaPagamento: string
  dataPagamento: string
  validadeAte: string
  observacao?: string
}): ReciboRenovacaoManual {
  return {
    numero: input.numero,
    clienteNome: input.clienteNome,
    clienteEmail: input.clienteEmail,
    plano: input.plano,
    planoTier: input.planoTier,
    valor: input.valor,
    formaPagamento: input.formaPagamento,
    dataPagamento: input.dataPagamento,
    validadeAte: input.validadeAte,
    observacao: String(input.observacao || '').trim(),
    emitidoEm: new Date().toISOString(),
    status: 'Renovado com sucesso',
  }
}
