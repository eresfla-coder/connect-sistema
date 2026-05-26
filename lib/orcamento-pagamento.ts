export const OPCOES_PAGAMENTO_ORCAMENTO = [
  { id: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { id: 'pix', label: 'Pix', icon: '📲' },
  { id: 'credito', label: 'Cartão crédito', icon: '💳' },
  { id: 'debito', label: 'Cartão débito', icon: '💳' },
  { id: 'parcelado', label: 'Parcelado', icon: '📅' },
  { id: 'boleto', label: 'Boleto', icon: '🧾' },
  { id: 'personalizado', label: 'Personalizado', icon: '✏️' },
] as const

export type OrcamentoPagamentoPayload = {
  formaPagamento?: string
  formasPagamentoLista?: string[]
  observacaoPagamento?: string
}

export function montarFormasPagamentoOrcamento(
  formas: string[],
  observacao?: string,
  parcelasBoleto?: string,
): string {
  const lista = formas.map((f) => String(f || '').trim()).filter(Boolean)
  if (!lista.length) return 'A combinar'

  const partes = lista.map((forma) => {
    if (forma.toLowerCase().includes('boleto') && String(parcelasBoleto || '').trim()) {
      return `${forma} (${String(parcelasBoleto).trim()})`
    }
    return forma
  })

  let texto = partes.join(' • ')
  const obs = String(observacao || '').trim()
  if (obs) texto += `\n${obs}`
  return texto
}

export function extrairFormasPagamentoOrcamento(orc: OrcamentoPagamentoPayload) {
  if (Array.isArray(orc.formasPagamentoLista) && orc.formasPagamentoLista.length) {
    return {
      formas: orc.formasPagamentoLista.filter(Boolean),
      observacao: String(orc.observacaoPagamento || '').trim(),
    }
  }

  const fp = String(orc.formaPagamento || '').trim()
  if (!fp) return { formas: [] as string[], observacao: '' }

  const [linha1, ...resto] = fp.split('\n')
  const formas = linha1
    .split(' • ')
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    formas,
    observacao: resto.join('\n').trim(),
  }
}

export function iconeFormaPagamento(label: string) {
  const valor = String(label || '').toLowerCase()
  if (valor.includes('pix')) return '📲'
  if (valor.includes('crédito') || valor.includes('credito')) return '💳'
  if (valor.includes('débito') || valor.includes('debito')) return '💳'
  if (valor.includes('boleto')) return '🧾'
  if (valor.includes('parcel')) return '📅'
  if (valor.includes('dinheiro')) return '💵'
  if (valor.includes('personal')) return '✏️'
  return '💳'
}

export function textoPagamentoOrcamento(orc: OrcamentoPagamentoPayload & { formaPagamento?: string; condicoesPagamento?: string }) {
  const condicoes = String(orc.condicoesPagamento || '').trim()
  if (condicoes) return condicoes
  return montarFormasPagamentoOrcamento(
    extrairFormasPagamentoOrcamento(orc).formas.length
      ? extrairFormasPagamentoOrcamento(orc).formas
      : [String(orc.formaPagamento || '').split('\n')[0] || 'A combinar'],
    extrairFormasPagamentoOrcamento(orc).observacao,
  )
}

export function listaFormasPagamentoOrcamento(orc: OrcamentoPagamentoPayload) {
  const { formas, observacao } = extrairFormasPagamentoOrcamento(orc)
  if (formas.length) return { formas, observacao }
  const legado = String(orc.formaPagamento || '').split('\n')[0].trim()
  return { formas: legado ? [legado] : ['A combinar'], observacao }
}
