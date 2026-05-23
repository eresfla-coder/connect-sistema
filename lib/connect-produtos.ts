export type TipoCalculoProduto = 'unidade' | 'm2'

export type ProdutoCatalogo = {
  id: number
  nome: string
  categoria: string
  preco: number
  custo: number
  estoque: number
  descricao: string
  ativo: boolean
  tipoCalculo?: TipoCalculoProduto
}

export type ProdutoOrcamento = {
  id: number
  nome: string
  valor: number
  tipoCalculo?: TipoCalculoProduto
}

export const PRODUTOS_STORAGE_KEY = 'connect_produtos'
const CATEGORIA_PADRAO = 'Diversos'

export function normalizarNomeProduto(nome: string) {
  return String(nome || '')
    .trim()
    .toLowerCase()
}

function podeUsarStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

export function lerProdutosCatalogo(): ProdutoCatalogo[] {
  if (!podeUsarStorage()) return []

  const salvo = localStorage.getItem(PRODUTOS_STORAGE_KEY)
  if (!salvo) return []

  try {
    const lista = JSON.parse(salvo)
    if (!Array.isArray(lista)) return []

    return lista
      .map((item: Record<string, unknown>, index: number) => ({
        id: Number(item.id ?? Date.now() + index),
        nome: String(item.nome ?? '').trim(),
        categoria: String(item.categoria ?? CATEGORIA_PADRAO),
        preco: Number(item.preco ?? item.valor ?? 0),
        custo: Number(item.custo ?? 0),
        estoque: Number(item.estoque ?? 0),
        descricao: String(item.descricao ?? ''),
        ativo: item.ativo !== false,
        tipoCalculo: item.tipoCalculo === 'm2' ? 'm2' : 'unidade',
      }))
      .filter((item) => item.nome)
  } catch {
    return []
  }
}

export function gravarProdutosCatalogo(lista: ProdutoCatalogo[]) {
  if (!podeUsarStorage()) return
  localStorage.setItem(PRODUTOS_STORAGE_KEY, JSON.stringify(lista))
}

export function catalogoParaOrcamento(lista: ProdutoCatalogo[]): ProdutoOrcamento[] {
  return lista
    .filter((item) => item.ativo !== false)
    .map((item) => ({
      id: item.id,
      nome: item.nome,
      valor: Number(item.preco || 0),
      tipoCalculo: item.tipoCalculo === 'm2' ? 'm2' : 'unidade',
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function lerProdutosParaOrcamento(): ProdutoOrcamento[] {
  return catalogoParaOrcamento(lerProdutosCatalogo())
}

export function registrarProdutoNoCatalogo(dados: {
  nome: string
  valor: number
  tipoCalculo?: TipoCalculoProduto
}): ProdutoCatalogo {
  const nome = String(dados.nome || '').trim()
  const valor = Number(dados.valor || 0)
  const tipoCalculo: TipoCalculoProduto = dados.tipoCalculo === 'm2' ? 'm2' : 'unidade'
  const chave = normalizarNomeProduto(nome)

  const atual = lerProdutosCatalogo()
  const indice = atual.findIndex((item) => normalizarNomeProduto(item.nome) === chave)

  if (indice >= 0) {
    const existente = atual[indice]
    const atualizado: ProdutoCatalogo = {
      ...existente,
      nome: existente.nome || nome,
      preco: valor > 0 ? valor : existente.preco,
      tipoCalculo: tipoCalculo || existente.tipoCalculo,
      ativo: true,
    }
    const lista = [...atual]
    lista[indice] = atualizado
    gravarProdutosCatalogo(lista)
    return atualizado
  }

  const novo: ProdutoCatalogo = {
    id: Date.now(),
    nome,
    categoria: CATEGORIA_PADRAO,
    preco: valor,
    custo: 0,
    estoque: 0,
    descricao: '',
    ativo: true,
    tipoCalculo,
  }

  gravarProdutosCatalogo([novo, ...atual])
  return novo
}

type ItemOrcamentoLike = {
  nome: string
  valor?: number
  valorM2?: number
  tipoCalculo?: TipoCalculoProduto
}

export function importarProdutosDeItensOrcamento(itens: ItemOrcamentoLike[]): boolean {
  let alterou = false

  for (const item of itens) {
    const nome = String(item.nome || '').trim()
    if (!nome) continue

    const tipoCalculo: TipoCalculoProduto = item.tipoCalculo === 'm2' ? 'm2' : 'unidade'
    const valor =
      tipoCalculo === 'm2'
        ? Number(item.valorM2 ?? item.valor ?? 0)
        : Number(item.valor ?? 0)

    if (valor <= 0) continue

    const antes = lerProdutosCatalogo()
    registrarProdutoNoCatalogo({ nome, valor, tipoCalculo })
    const depois = lerProdutosCatalogo()
    if (depois.length !== antes.length) alterou = true
    else {
      const chave = normalizarNomeProduto(nome)
      const antigo = antes.find((p) => normalizarNomeProduto(p.nome) === chave)
      const novo = depois.find((p) => normalizarNomeProduto(p.nome) === chave)
      if (antigo && novo && (antigo.preco !== novo.preco || antigo.tipoCalculo !== novo.tipoCalculo)) {
        alterou = true
      }
    }
  }

  return alterou
}
