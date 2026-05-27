export const OBSERVACAO_PADRAO_ORCAMENTO = `Para darmos início aos trabalhos, solicitamos um sinal de 50% do valor como entrada, e os 50% restantes serão pagos na entrega e conclusão do projeto.

Fico à disposição para esclarecer qualquer dúvida e definir os próximos passos.

Atenciosamente,
LOJA CONNECT.`

export const PAGAMENTO_PADRAO_ORCAMENTO =
  '50% de entrada na aprovação e 50% na entrega/conclusão do projeto.'

export function itemOrcamentoOcultarDetalheClienteM2(item: { tipoCalculo?: string }) {
  return item?.tipoCalculo === 'm2'
}

export function orcamentoDeveOcultarM2Cliente(
  itens: Array<{ tipoCalculo?: string }>,
  flagManual?: boolean,
) {
  if (flagManual) return true
  return itens.some((item) => itemOrcamentoOcultarDetalheClienteM2(item))
}

/** Corrige "% duplicado" e parágrafos colados ao exibir observação no PDF. */
export function normalizarTextoObservacao(texto: string) {
  const saida = String(texto || '')
    .replace(/\r\n/g, '\n')
    .replace(/(\d+(?:[.,]\d+)?)\s*%{2,}/g, '$1%')
    .replace(/\s+%/g, '%')
    .replace(/projeto\.\s*Fico/gi, 'projeto.\n\nFico')
    .replace(/passos\.\s*Atenciosamente/gi, 'passos.\n\nAtenciosamente')
    .replace(/Atenciosamente,?\s*LOJA/gi, 'Atenciosamente,\nLOJA')
    .replace(/\.([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, '.\n\n$1')

  return saida.replace(/\n{3,}/g, '\n\n').trim()
}
