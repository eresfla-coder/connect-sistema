/** Exporta dados tabulares para CSV compatível com Excel (UTF-8 BOM). */

function escaparCelula(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  if (/[",\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

export function gerarCsv(linhas: Record<string, unknown>[], colunas?: string[]): string {
  if (!linhas.length) return '\uFEFF'
  const cols = colunas || Object.keys(linhas[0])
  const header = cols.map(escaparCelula).join(',')
  const body = linhas.map((linha) => cols.map((c) => escaparCelula(linha[c])).join(','))
  return '\uFEFF' + [header, ...body].join('\r\n')
}

export function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
