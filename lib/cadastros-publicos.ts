import { diaVencimento } from './vigencia.ts'

export const FILTROS_CADASTRO = [
  'todos',
  'teste_ativo',
  'teste_vencido',
  'convertido',
  'pagante',
  'fora_de_teste',
] as const

export type FiltroCadastro = (typeof FILTROS_CADASTRO)[number]

export type CadastroBruto = {
  userId: string
  criadoEm: string
  email: string | null
  status: string | null
  ativo: boolean | null
  vencimento: string | null
  naCarteira: boolean
  paganteConfirmado: boolean
}

export type CadastroClassificado = CadastroBruto & {
  testeAtivo: boolean
  testeVencido: boolean
  convertido: boolean
  pagante: boolean
  rotulo: string
}

export type ResumoCadastros = {
  total: number
  testesAtivos: number
  testesVencidos: number
  convertidos: number
  pagantes: number
}

export type OrdemCadastro = {
  criadoEm: string
  userId: string
}

/** Página abaixo do teto padrão de 1000 linhas do PostgREST. */
export const TAMANHO_PAGINA_PAGAMENTOS = 500

export function compararCadastroPublico(a: OrdemCadastro, b: OrdemCadastro): number {
  if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? 1 : -1
  if (a.userId !== b.userId) return a.userId < b.userId ? -1 : 1
  return 0
}

export function ordenarCadastrosPublicos<T extends OrdemCadastro>(lista: T[]): T[] {
  return [...lista].sort(compararCadastroPublico)
}

export function acumularPagantes(destino: Set<string>, linhas: Array<{ user_id?: string | null }>) {
  for (const linha of linhas) {
    const id = String(linha.user_id || '').trim()
    if (id) destino.add(id)
  }
}

export function leituraTemContinuacao(quantidade: number, tamanhoPagina: number): boolean {
  return quantidade >= tamanhoPagina
}

export function deduplicarCadastros(lista: CadastroBruto[]): CadastroBruto[] {
  const mapa = new Map<string, CadastroBruto>()
  for (const item of lista) {
    const id = String(item.userId || '').trim()
    if (!id || mapa.has(id)) continue
    mapa.set(id, { ...item, userId: id })
  }
  return Array.from(mapa.values())
}

export function classificarCadastro(item: CadastroBruto, hoje: string): CadastroClassificado {
  const status = String(item.status || '').trim().toLowerCase()
  const vencimento = diaVencimento(item.vencimento)
  const pagante = item.paganteConfirmado === true
  const convertido = item.naCarteira === true
  const emTeste = !pagante && !convertido && status === 'teste' && item.ativo !== false
  const testeAtivo = emTeste && vencimento !== null && vencimento >= hoje
  const testeVencido = emTeste && (vencimento === null || vencimento < hoje)
  const rotulos = [
    testeAtivo ? 'Teste ativo' : '',
    testeVencido ? 'Teste vencido' : '',
    convertido ? 'Na carteira' : '',
    pagante ? 'Pagante' : '',
  ].filter(Boolean)

  return {
    ...item,
    vencimento,
    testeAtivo,
    testeVencido,
    convertido,
    pagante,
    rotulo: rotulos.join(' · ') || 'Fora do teste',
  }
}

export function resumirCadastros(lista: CadastroClassificado[]): ResumoCadastros {
  return {
    total: lista.length,
    testesAtivos: lista.filter((item) => item.testeAtivo).length,
    testesVencidos: lista.filter((item) => item.testeVencido).length,
    convertidos: lista.filter((item) => item.convertido).length,
    pagantes: lista.filter((item) => item.pagante).length,
  }
}

export function filtrarCadastros(lista: CadastroClassificado[], filtro: FiltroCadastro, busca = ''): CadastroClassificado[] {
  const termo = busca.trim().toLowerCase()
  return lista.filter((item) => {
    const bateFiltro =
      filtro === 'todos' ||
      (filtro === 'teste_ativo' && item.testeAtivo) ||
      (filtro === 'teste_vencido' && item.testeVencido) ||
      (filtro === 'convertido' && item.convertido) ||
      (filtro === 'pagante' && item.pagante) ||
      (filtro === 'fora_de_teste' && item.rotulo === 'Fora do teste')
    if (!bateFiltro) return false
    if (!termo) return true
    return String(item.email || '').toLowerCase().includes(termo)
  })
}

export function paginarCadastros<T>(lista: T[], page: number, pageSize: number): {
  page: number
  pageSize: number
  total: number
  pages: number
  itens: T[]
} {
  const tamanho = Math.min(50, Math.max(1, Math.trunc(pageSize) || 20))
  const pages = Math.max(1, Math.ceil(lista.length / tamanho))
  const atual = Math.min(pages, Math.max(1, Math.trunc(page) || 1))
  const inicio = (atual - 1) * tamanho
  return {
    page: atual,
    pageSize: tamanho,
    total: lista.length,
    pages,
    itens: lista.slice(inicio, inicio + tamanho),
  }
}

export function normalizarFiltroCadastro(valor: string | null): FiltroCadastro {
  const texto = String(valor || '').trim() as FiltroCadastro
  return FILTROS_CADASTRO.includes(texto) ? texto : 'todos'
}
