/**
 * Fonte única de totais/desconto do orçamento (editor → publicação → visualização).
 * O desconto canônico persistido é sempre em R$ (valorDesconto efetivo).
 */

export type ItemTotaisOrcamento = {
  total?: number
  quantidade?: number
  valor?: number
  tipoCalculo?: string
  metragem?: number
  valorM2?: number
  largura?: number
  altura?: number
  mostrarCliente?: boolean
}

export type TotaisOrcamentoInput = {
  itens?: ItemTotaisOrcamento[] | null
  subtotal?: number | null
  desconto?: number | null
  entrega?: number | null
  total?: number | null
}

export type TotaisOrcamentoCliente = {
  itens: ItemTotaisOrcamento[]
  subtotal: number
  desconto: number
  entrega: number
  total: number
}

export type DescontoEditorEstado = {
  descontoTipo: 'valor' | 'percentual'
  descontoInput: string
}

export function arredondarMoeda(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function totalItemOrcamento(item: ItemTotaisOrcamento): number {
  const totalSalvo = Number(item.total || 0)
  if (totalSalvo > 0) return totalSalvo

  if (item.tipoCalculo === 'm2') {
    const metragem =
      Number(item.metragem || 0) ||
      (Number(item.largura || 0) > 0 && Number(item.altura || 0) > 0
        ? Number(item.largura) * Number(item.altura)
        : 0)
    const valorM2 = Number(item.valorM2 ?? item.valor ?? 0)
    const quantidade = Math.max(0.01, Number(item.quantidade || 1))
    return arredondarMoeda(metragem * valorM2 * quantidade)
  }

  return arredondarMoeda(Number(item.quantidade || 0) * Number(item.valor || 0))
}

/** Converte input do editor (R$ ou %) no desconto efetivo em reais. */
export function calcularDescontoEmReais(params: {
  subtotal: number
  descontoTipo: 'valor' | 'percentual'
  descontoInput: number
}): number {
  const subtotal = Math.max(0, Number(params.subtotal) || 0)
  const numero = Math.max(0, Number(params.descontoInput) || 0)

  if (params.descontoTipo === 'percentual') {
    const percentual = Math.max(0, Math.min(100, numero))
    return arredondarMoeda((percentual * subtotal) / 100)
  }

  return arredondarMoeda(numero)
}

export function calcularTotalFinalOrcamento(params: {
  subtotal: number
  entrega?: number
  desconto?: number
}): number {
  const subtotal = Math.max(0, Number(params.subtotal) || 0)
  const entrega = Math.max(0, Number(params.entrega) || 0)
  const desconto = Math.max(0, Number(params.desconto) || 0)
  return arredondarMoeda(Math.max(0, subtotal + entrega - desconto))
}

/**
 * Hidrata o editor a partir do desconto canônico salvo (sempre R$).
 * Nunca interpreta R$ persistido como percentual.
 */
export function hidratarDescontoEditor(descontoSalvo: number | null | undefined): DescontoEditorEstado {
  const valor = arredondarMoeda(Math.max(0, Number(descontoSalvo) || 0))
  return {
    descontoTipo: 'valor',
    descontoInput:
      valor > 0
        ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
  }
}

/** Parse do input brasileiro do editor (ex.: "100,00" / "1.000,50"). */
export function parseDescontoInputEditor(valor: string): number {
  const texto = String(valor || '').trim()
  if (!texto) return 0
  const normalizado = texto.replace(/\./g, '').replace(',', '.')
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}

/**
 * Monta o bloco financeiro para CREATE/UPDATE a partir do estado do editor.
 * Fonte: formulário atual — NÃO o orçamento antigo no spread.
 */
export function montarTotaisParaSalvar(params: {
  itens: ItemTotaisOrcamento[]
  entrega?: number
  descontoTipo: 'valor' | 'percentual'
  descontoInput: string | number
  /** Se passado, NÃO deve prevalecer sobre o desconto do formulário. */
  descontoAntigo?: number
}): {
  subtotal: number
  desconto: number
  entrega: number
  total: number
} {
  const subtotal = arredondarMoeda(
    (params.itens || []).reduce((acc, item) => acc + totalItemOrcamento(item), 0),
  )
  const descontoInputNumero =
    typeof params.descontoInput === 'number'
      ? params.descontoInput
      : parseDescontoInputEditor(params.descontoInput)

  const desconto = calcularDescontoEmReais({
    subtotal,
    descontoTipo: params.descontoTipo,
    descontoInput: descontoInputNumero,
  })

  // Guarda explícita: desconto antigo NUNCA substitui o do formulário.
  void params.descontoAntigo

  const entrega = arredondarMoeda(Math.max(0, Number(params.entrega) || 0))
  const total = calcularTotalFinalOrcamento({ subtotal, entrega, desconto })

  return { subtotal, desconto, entrega, total }
}

/**
 * Simula o ciclo: salvo → editar → alterar desconto → salvar → reabrir → visualizar.
 * Usado em regressão do relato do cliente (edição vs novo).
 */
export function cicloEditarDescontoOrcamento(params: {
  orcamentoSalvo: TotaisOrcamentoInput & { itens: ItemTotaisOrcamento[] }
  novoDescontoTipo: 'valor' | 'percentual'
  novoDescontoInput: string | number
}): {
  hidratado: DescontoEditorEstado
  aposSalvar: ReturnType<typeof montarTotaisParaSalvar>
  aposReabrir: DescontoEditorEstado
  aposVisualizar: TotaisOrcamentoCliente
} {
  const hidratado = hidratarDescontoEditor(params.orcamentoSalvo.desconto)
  const aposSalvar = montarTotaisParaSalvar({
    itens: params.orcamentoSalvo.itens,
    entrega: Number(params.orcamentoSalvo.entrega || 0),
    descontoTipo: params.novoDescontoTipo,
    descontoInput: params.novoDescontoInput,
    descontoAntigo: Number(params.orcamentoSalvo.desconto || 0),
  })
  const entidadeAposSalvar = {
    ...params.orcamentoSalvo,
    ...aposSalvar,
  }
  const aposReabrir = hidratarDescontoEditor(entidadeAposSalvar.desconto)
  const aposVisualizar = prepararTotaisOrcamentoCliente(entidadeAposSalvar)

  return { hidratado, aposSalvar, aposReabrir, aposVisualizar }
}

/**
 * Prepara totais para o cliente (PDF / link / visualização).
 * Usa APENAS os dados do orçamento — nunca o estado do formulário aberto.
 * Se houver itens internos (mostrarCliente === false), rateia o desconto
 * proporcionalmente ao subtotal visível.
 */
export function prepararTotaisOrcamentoCliente(
  dados: TotaisOrcamentoInput,
): TotaisOrcamentoCliente {
  const itensTodos = Array.isArray(dados.itens) ? dados.itens : []
  const itensVisiveis = itensTodos.filter((item) => item.mostrarCliente !== false)

  const subtotalVisivel = arredondarMoeda(
    itensVisiveis.reduce((acc, item) => acc + totalItemOrcamento(item), 0),
  )

  const subtotalTodos = arredondarMoeda(
    itensTodos.reduce((acc, item) => acc + totalItemOrcamento(item), 0),
  )

  const subtotalOriginal =
    Number(dados.subtotal) > 0 ? arredondarMoeda(Number(dados.subtotal)) : subtotalTodos

  const descontoOriginal = arredondarMoeda(Math.max(0, Number(dados.desconto) || 0))
  const entrega = arredondarMoeda(Math.max(0, Number(dados.entrega) || 0))

  const descontoVisivel =
    subtotalOriginal > 0
      ? arredondarMoeda((descontoOriginal * subtotalVisivel) / subtotalOriginal)
      : 0

  const total = calcularTotalFinalOrcamento({
    subtotal: subtotalVisivel,
    entrega,
    desconto: descontoVisivel,
  })

  return {
    itens: itensVisiveis,
    subtotal: subtotalVisivel,
    desconto: descontoVisivel,
    entrega,
    total,
  }
}

/**
 * Merge seguro update: campos financeiros do formulário vencem o registro antigo.
 * Protege contra `{ desconto: valorNovo, ...orcamentoExistente }`.
 */
export function mesclarOrcamentoAposEdicao<T extends Record<string, unknown>>(params: {
  existente: T
  patchFinanceiro: {
    subtotal: number
    desconto: number
    entrega: number
    total: number
    itens: unknown
  }
}): T {
  return {
    ...params.existente,
    ...params.patchFinanceiro,
    desconto: params.patchFinanceiro.desconto,
    total: params.patchFinanceiro.total,
    subtotal: params.patchFinanceiro.subtotal,
    entrega: params.patchFinanceiro.entrega,
  }
}
