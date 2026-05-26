export type TipoDocumentoWhatsapp = 'orcamento' | 'proposta_comercial' | 'os' | 'cobranca'

function saudacaoPorHorario(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function saudacaoCliente(nome?: string | null): string {
  const nomeLimpo = String(nome || '').trim() || 'cliente'
  return `${saudacaoPorHorario()}, ${nomeLimpo}!`
}

export function rotuloDocumentoWhatsapp(tipo?: string | null): string {
  return String(tipo || '').toLowerCase() === 'proposta_comercial' ? 'proposta comercial' : 'orçamento'
}

export function mensagemDocumentoComercial(params: {
  nomeEmpresa?: string
  nomeCliente?: string | null
  tipoDocumento?: string | null
  numero: string
  totalFormatado: string
  link: string
  validade?: string
  prazoEntrega?: string
  formaPagamento?: string
  observacao?: string
}): string {
  const empresa = String(params.nomeEmpresa || 'nossa equipe').trim()
  const rotulo = rotuloDocumentoWhatsapp(params.tipoDocumento)
  const linhas: string[] = [
    saudacaoCliente(params.nomeCliente),
    '',
    `A *${empresa}* preparou sua ${rotulo} *${params.numero}* no valor de *${params.totalFormatado}*.`,
  ]

  if (params.validade?.trim()) linhas.push(`Validade: ${params.validade.trim()}.`)
  if (params.prazoEntrega?.trim()) linhas.push(`Prazo de entrega: ${params.prazoEntrega.trim()}.`)
  if (params.formaPagamento?.trim()) linhas.push(`Pagamento: ${params.formaPagamento.trim()}.`)
  if (params.observacao?.trim()) linhas.push(`Obs.: ${params.observacao.trim()}`)

  linhas.push(
    '',
    'Acesse o documento completo pelo link abaixo:',
    params.link,
    '',
    'Se estiver de acordo, responda por aqui que seguimos com o próximo passo.',
    'Qualquer dúvida, estou à disposição.',
  )

  return linhas.join('\n')
}

export function mensagemOrdemServico(params: {
  nomeEmpresa?: string
  nomeCliente?: string | null
  numero: string
  equipamento?: string
  status?: string
  valorFormatado: string
  saldoFormatado: string
  link: string
}): string {
  const empresa = String(params.nomeEmpresa || 'nossa equipe').trim()
  const linhas: string[] = [
    saudacaoCliente(params.nomeCliente),
    '',
    `A *${empresa}* enviou sua *ordem de serviço ${params.numero}*.`,
  ]

  if (params.equipamento?.trim()) linhas.push(`Equipamento: ${params.equipamento.trim()}.`)
  if (params.status?.trim()) linhas.push(`Status: ${params.status.trim()}.`)

  linhas.push(
    `Valor: ${params.valorFormatado}`,
    `Saldo: ${params.saldoFormatado}`,
    '',
    'Acompanhe todos os detalhes aqui:',
    params.link,
    '',
    'Ficamos no aguardo do seu retorno.',
  )

  return linhas.join('\n')
}

export function mensagemCobranca(params: {
  nomeEmpresa?: string
  nomeCliente?: string | null
  descricao: string
  valorFormatado: string
  vencimentoFormatado: string
  atrasado?: boolean
  venceHoje?: boolean
}): string {
  const empresa = String(params.nomeEmpresa || 'nossa equipe').trim()
  const base = [
    saudacaoCliente(params.nomeCliente),
    '',
    `A *${empresa}* entra em contato sobre: *${params.descricao}*.`,
    `Valor em aberto: *${params.valorFormatado}*.`,
    `Vencimento: ${params.vencimentoFormatado}.`,
  ]

  if (params.atrasado) {
    base.push('', 'Identificamos pendência em atraso. Pode nos informar uma previsão de pagamento? Agradecemos a atenção.')
  } else if (params.venceHoje) {
    base.push('', 'O vencimento é hoje. Caso já tenha pago, desconsidere esta mensagem.')
  } else {
    base.push('', 'Caso já tenha quitado, por favor nos avise. Estamos à disposição para ajudar.')
  }

  return base.join('\n')
}

export function urlWhatsapp(telefone: string, mensagem: string): string {
  let numero = String(telefone || '').replace(/\D/g, '')
  while (numero.startsWith('00')) numero = numero.slice(2)
  if (numero.startsWith('55')) numero = numero.slice(2)
  numero = numero.replace(/^0+/, '')
  if (numero.length > 11) numero = numero.slice(-11)
  const texto = encodeURIComponent(mensagem)
  if (numero.length >= 10) {
    return `https://wa.me/55${numero}?text=${texto}`
  }
  return `https://wa.me/?text=${texto}`
}
