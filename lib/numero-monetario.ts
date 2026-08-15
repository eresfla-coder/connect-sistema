/** Converte números e valores pt-BR legados ("R$ 1.234,56") sem perder o preço. */
export function parseNumeroMonetario(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const texto = String(valor ?? '').trim()
  if (!texto) return 0
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto
  const numero = Number(normalizado.replace(/[^\d.-]/g, ''))
  return Number.isFinite(numero) ? numero : 0
}
