'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalculadoraPrecoM2Modal } from '@/components/produtos/CalculadoraPrecoM2Modal'
import { ProdutosFabMenu } from '@/components/produtos/ProdutosFabMenu'
import {
  lerLocalStorageUsuario,
  obterUserIdPainel,
  salvarLocalStorageUsuario,
} from '@/lib/connect-user-storage'

type Categoria = { id: number; nome: string; ativa: boolean }
type TipoCalculoProduto = 'unidade' | 'm2' | 'peso'
type TipoCadastroProduto = 'produto' | 'servico'
type StatusMargem = 'saudavel' | 'apertada' | 'risco'

type Produto = {
  id: number
  nome: string
  categoria: string
  preco: number
  custo: number
  estoque: number
  descricao: string
  codigoBarras?: string
  ativo: boolean
  tipoCalculo?: TipoCalculoProduto
  tipoCadastro?: TipoCadastroProduto
  impostoPct?: number
  taxaCartaoPct?: number
  despesasPct?: number
  comissaoPct?: number
  lucroDesejadoPct?: number
  precoSugerido?: number
  lucroEstimado?: number
  margemRealPct?: number
  markup?: number
  statusMargem?: StatusMargem
}

const CATEGORIAS_KEY = 'connect_categorias'
const PRODUTOS_KEY = 'connect_produtos'
const DEFAULT_IMPOSTO = 6
const DEFAULT_TAXA = 5
const DEFAULT_DESPESAS = 0
const DEFAULT_COMISSAO = 0
const DEFAULT_LUCRO = 30

const categoriasPadrao: Categoria[] = [
  { id: 1, nome: 'Informática', ativa: true },
  { id: 2, nome: 'Celulares', ativa: true },
  { id: 3, nome: 'Papelaria', ativa: true },
  { id: 4, nome: 'Serviços', ativa: true },
]

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function percentual(valor: number) {
  return `${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function formatarDecimalVisual(valor?: number, casas = 2) {
  if (valor === undefined || valor === null || Number(valor) === 0) return ''
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function formatarPesoVisual(valor?: number) {
  if (valor === undefined || valor === null || Number(valor) === 0) return ''
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function aplicarMascaraDecimal(valor: string) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '')
  if (!somenteDigitos) return ''
  const inteiro = somenteDigitos.slice(0, -2) || '0'
  const decimal = somenteDigitos.slice(-2).padStart(2, '0')
  return Number(`${inteiro}.${decimal}`).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function textoDecimalParaNumero(valor: string) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '')
  if (!somenteDigitos) return 0
  return Number(somenteDigitos) / 100
}

function textoPercentualParaNumero(valor: string) {
  const texto = String(valor || '').trim().replace('%', '').replace(/\./g, '').replace(',', '.')
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function formatarPercentualVisual(valor?: number) {
  if (valor === undefined || valor === null) return ''
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function textoPesoParaNumero(valor: string) {
  const texto = String(valor || '').trim()
  if (!texto) return 0
  const numero = Number(texto.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

function normalizarInteiroTexto(valor: string) {
  return String(valor || '').replace(/\D/g, '')
}

function normalizarCodigoBarras(valor: string) {
  return String(valor || '').replace(/\D/g, '').slice(0, 48)
}

function iconeCategoria(nome: string) {
  const texto = (nome || '').toLowerCase()
  if (texto.includes('celular')) return '📱'
  if (texto.includes('informática') || texto.includes('informatica')) return '💻'
  if (texto.includes('papelaria')) return '📝'
  if (texto.includes('utilidade')) return '🧺'
  if (texto.includes('descart')) return '🥤'
  if (texto.includes('impress')) return '🖨️'
  if (texto.includes('serv')) return '🛠️'
  return '📦'
}

function badgeTipo(tipo?: TipoCalculoProduto, cadastro?: TipoCadastroProduto) {
  if (cadastro === 'servico') return 'Serviço'
  if (tipo === 'm2') return 'm²'
  if (tipo === 'peso') return 'Kg'
  return 'Unid.'
}

function calcularPrecoInteligente(custo: number, impostoPct: number, taxaCartaoPct: number, despesasPct: number, comissaoPct: number, lucroDesejadoPct: number, precoAtual?: number) {
  const cargaTotal = (Number(impostoPct || 0) + Number(taxaCartaoPct || 0) + Number(despesasPct || 0) + Number(comissaoPct || 0) + Number(lucroDesejadoPct || 0)) / 100
  const divisor = 1 - cargaTotal
  const markup = divisor > 0 ? 1 / divisor : 0
  const precoSugerido = custo > 0 && divisor > 0 ? custo * markup : 0
  const precoBase = Number(precoAtual || 0) > 0 ? Number(precoAtual || 0) : precoSugerido
  const imposto = precoBase * Number(impostoPct || 0) / 100
  const taxa = precoBase * Number(taxaCartaoPct || 0) / 100
  const despesas = precoBase * Number(despesasPct || 0) / 100
  const comissao = precoBase * Number(comissaoPct || 0) / 100
  const lucroEstimado = precoBase - custo - imposto - taxa - despesas - comissao
  const margemRealPct = precoBase > 0 ? (lucroEstimado / precoBase) * 100 : 0
  const statusMargem: StatusMargem = margemRealPct >= lucroDesejadoPct ? 'saudavel' : margemRealPct >= 15 ? 'apertada' : 'risco'
  return { precoSugerido, lucroEstimado, margemRealPct, markup, statusMargem }
}

export default function ProdutosPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [userIdPainel, setUserIdPainel] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [calculadoraM2Aberta, setCalculadoraM2Aberta] = useState(false)

  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [preco, setPreco] = useState('')
  const [custo, setCusto] = useState('')
  const [estoque, setEstoque] = useState('')
  const [descricao, setDescricao] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [tipoCalculo, setTipoCalculo] = useState<TipoCalculoProduto>('unidade')
  const [tipoCadastro, setTipoCadastro] = useState<TipoCadastroProduto>('produto')
  const [impostoPct, setImpostoPct] = useState(String(DEFAULT_IMPOSTO))
  const [taxaCartaoPct, setTaxaCartaoPct] = useState(String(DEFAULT_TAXA))
  const [despesasPct, setDespesasPct] = useState(String(DEFAULT_DESPESAS))
  const [comissaoPct, setComissaoPct] = useState(String(DEFAULT_COMISSAO))
  const [lucroDesejadoPct, setLucroDesejadoPct] = useState(String(DEFAULT_LUCRO))

  useEffect(() => {
    const atualizarTela = () => setIsMobile(window.innerWidth <= 900)
    atualizarTela()
    window.addEventListener('resize', atualizarTela)
    return () => window.removeEventListener('resize', atualizarTela)
  }, [])

  useEffect(() => {
    let ativo = true
    obterUserIdPainel().then((id) => {
      if (!ativo) return
      setUserIdPainel(id)
      carregarCategorias(id)
      carregarProdutos(id)
    })
    return () => {
      ativo = false
    }
  }, [])

  function carregarCategorias(userId?: string | null) {
    const salvo = lerLocalStorageUsuario<Categoria[] | null>(CATEGORIAS_KEY, userId ?? userIdPainel, null)
    if (!salvo) {
      setCategorias(categoriasPadrao)
      return
    }
    try {
      const lista = salvo
      const normalizadas: Categoria[] = Array.isArray(lista)
        ? lista
            .map((item: any, index: number) => typeof item === 'string'
              ? { id: Date.now() + index, nome: item, ativa: true }
              : { id: Number(item.id ?? Date.now() + index), nome: String(item.nome || ''), ativa: Boolean(item.ativa ?? true) })
            .filter((item: Categoria) => item.nome.trim() !== '')
        : []
      setCategorias(normalizadas.length ? normalizadas : categoriasPadrao)
    } catch {
      setCategorias(categoriasPadrao)
    }
  }

  function enriquecerProduto(item: any, index: number): Produto {
    const custoNumero = Number(item.custo || 0)
    const precoNumero = Number(item.preco ?? item.valor ?? 0)
    const imposto = Number(item.impostoPct ?? DEFAULT_IMPOSTO)
    const taxa = Number(item.taxaCartaoPct ?? DEFAULT_TAXA)
    const despesas = Number(item.despesasPct ?? DEFAULT_DESPESAS)
    const comissao = Number(item.comissaoPct ?? DEFAULT_COMISSAO)
    const lucroDesejado = Number(item.lucroDesejadoPct ?? DEFAULT_LUCRO)
    const calculo = calcularPrecoInteligente(custoNumero, imposto, taxa, despesas, comissao, lucroDesejado, precoNumero)
    return {
      id: Number(item.id ?? Date.now() + index),
      nome: String(item.nome || ''),
      categoria: String(item.categoria || ''),
      preco: precoNumero,
      custo: custoNumero,
      estoque: Number(item.estoque || 0),
      descricao: String(item.descricao || ''),
      codigoBarras: normalizarCodigoBarras(String(item.codigoBarras || item.codigo || item.ean || item.gtin || '')),
      ativo: Boolean(item.ativo ?? true),
      tipoCalculo: item.tipoCalculo === 'm2' ? 'm2' : item.tipoCalculo === 'peso' ? 'peso' : 'unidade',
      tipoCadastro: item.tipoCadastro === 'servico' ? 'servico' : 'produto',
      impostoPct: imposto,
      taxaCartaoPct: taxa,
      despesasPct: despesas,
      comissaoPct: comissao,
      lucroDesejadoPct: lucroDesejado,
      precoSugerido: calculo.precoSugerido,
      lucroEstimado: calculo.lucroEstimado,
      margemRealPct: calculo.margemRealPct,
      markup: calculo.markup,
      statusMargem: calculo.statusMargem,
    }
  }

  function carregarProdutos(userId?: string | null) {
    const lista = lerLocalStorageUsuario<Produto[]>(PRODUTOS_KEY, userId ?? userIdPainel, [])
    setProdutos(Array.isArray(lista) ? lista.map(enriquecerProduto) : [])
  }

  function salvarListaProdutos(lista: Produto[]) {
    setProdutos(lista)
    salvarLocalStorageUsuario(PRODUTOS_KEY, userIdPainel, lista)
  }

  function limparFormulario() {
    setNome('')
    setCategoria('')
    setPreco('')
    setCusto('')
    setEstoque('')
    setDescricao('')
    setCodigoBarras('')
    setTipoCalculo('unidade')
    setTipoCadastro('produto')
    setImpostoPct(String(DEFAULT_IMPOSTO))
    setTaxaCartaoPct(String(DEFAULT_TAXA))
    setDespesasPct(String(DEFAULT_DESPESAS))
    setComissaoPct(String(DEFAULT_COMISSAO))
    setLucroDesejadoPct(String(DEFAULT_LUCRO))
    setEditandoId(null)
  }

  function novoProduto() {
    limparFormulario()
    setDrawerAberto(true)
  }

  function fecharDrawer() {
    setDrawerAberto(false)
    limparFormulario()
  }

  function editarProduto(produto: Produto) {
    setNome(produto.nome)
    setCategoria(produto.categoria)
    setPreco(formatarDecimalVisual(produto.preco))
    setCusto(formatarDecimalVisual(produto.custo))
    setEstoque(produto.tipoCalculo === 'peso' ? formatarPesoVisual(produto.estoque) : String(Math.trunc(Number(produto.estoque || 0))))
    setDescricao(produto.descricao)
    setCodigoBarras(produto.codigoBarras || '')
    setTipoCalculo(produto.tipoCalculo === 'm2' ? 'm2' : produto.tipoCalculo === 'peso' ? 'peso' : 'unidade')
    setTipoCadastro(produto.tipoCadastro === 'servico' ? 'servico' : 'produto')
    setImpostoPct(formatarPercentualVisual(produto.impostoPct ?? DEFAULT_IMPOSTO))
    setTaxaCartaoPct(formatarPercentualVisual(produto.taxaCartaoPct ?? DEFAULT_TAXA))
    setDespesasPct(formatarPercentualVisual(produto.despesasPct ?? DEFAULT_DESPESAS))
    setComissaoPct(formatarPercentualVisual(produto.comissaoPct ?? DEFAULT_COMISSAO))
    setLucroDesejadoPct(formatarPercentualVisual(produto.lucroDesejadoPct ?? DEFAULT_LUCRO))
    setEditandoId(produto.id)
    setDrawerAberto(true)
  }

  const calculoAtual = useMemo(() => calcularPrecoInteligente(
    textoDecimalParaNumero(custo),
    textoPercentualParaNumero(impostoPct),
    textoPercentualParaNumero(taxaCartaoPct),
    textoPercentualParaNumero(despesasPct),
    textoPercentualParaNumero(comissaoPct),
    textoPercentualParaNumero(lucroDesejadoPct),
    textoDecimalParaNumero(preco),
  ), [custo, impostoPct, taxaCartaoPct, despesasPct, comissaoPct, lucroDesejadoPct, preco])

  function aplicarPrecoSugerido() {
    if (calculoAtual.precoSugerido <= 0) return
    setPreco(formatarDecimalVisual(calculoAtual.precoSugerido))
  }

  function abrirCalculadoraM2() {
    if (!drawerAberto) {
      if (!editandoId) {
        limparFormulario()
        setTipoCadastro('produto')
        setTipoCalculo('m2')
      }
      setDrawerAberto(true)
    }
    setCalculadoraM2Aberta(true)
  }

  function aplicarPrecoCalculadoM2(valor: number) {
    setPreco(formatarDecimalVisual(Number(valor.toFixed(2))))
    if (tipoCadastro !== 'servico') setTipoCalculo('m2')
  }

  const labelPrecoVenda = tipoCalculo === 'm2' ? 'Preço de venda por m²' : 'Preço de venda'

  function salvarProduto() {
    if (!nome.trim()) return alert('Digite o nome do produto ou serviço.')
    const categoriaFinal = categoria.trim() || (tipoCadastro === 'servico' ? 'Serviços' : 'Produtos')
    const precoNumero = textoDecimalParaNumero(preco)
    const custoNumero = textoDecimalParaNumero(custo)
    const estoqueNumero = tipoCadastro === 'servico' ? 0 : tipoCalculo === 'peso' ? textoPesoParaNumero(estoque) : Number(normalizarInteiroTexto(estoque) || 0)
    const imposto = textoPercentualParaNumero(impostoPct)
    const taxa = textoPercentualParaNumero(taxaCartaoPct)
    const despesas = textoPercentualParaNumero(despesasPct)
    const comissao = textoPercentualParaNumero(comissaoPct)
    const lucroDesejado = textoPercentualParaNumero(lucroDesejadoPct)
    const calculo = calcularPrecoInteligente(custoNumero, imposto, taxa, despesas, comissao, lucroDesejado, precoNumero)
    const produtoBase = {
      nome: nome.trim(),
      categoria: categoriaFinal,
      preco: precoNumero,
      custo: custoNumero,
      estoque: estoqueNumero,
      descricao: descricao.trim(),
      codigoBarras: normalizarCodigoBarras(codigoBarras),
      ativo: true,
      tipoCalculo: tipoCadastro === 'servico' ? 'unidade' as TipoCalculoProduto : tipoCalculo,
      tipoCadastro,
      impostoPct: imposto,
      taxaCartaoPct: taxa,
      despesasPct: despesas,
      comissaoPct: comissao,
      lucroDesejadoPct: lucroDesejado,
      precoSugerido: calculo.precoSugerido,
      lucroEstimado: calculo.lucroEstimado,
      margemRealPct: calculo.margemRealPct,
      markup: calculo.markup,
      statusMargem: calculo.statusMargem,
    }

    setSalvando(true)
    if (editandoId !== null) {
      salvarListaProdutos(produtos.map((item) => item.id === editandoId ? { ...item, ...produtoBase } : item))
    } else {
      salvarListaProdutos([{ id: Date.now(), ...produtoBase }, ...produtos])
    }
    setSalvando(false)
    fecharDrawer()
  }

  function excluirProduto(id: number) {
    if (!window.confirm('Deseja excluir este produto/serviço?')) return
    salvarListaProdutos(produtos.filter((item) => item.id !== id))
    if (editandoId === id) limparFormulario()
  }

  const categoriasAtivas = useMemo(() => categorias.filter((item) => item.ativa), [categorias])

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return produtos
    return produtos.filter((produto) => [produto.nome, produto.categoria, produto.descricao, produto.codigoBarras || '', produto.tipoCalculo || 'unidade', produto.tipoCadastro || 'produto', produto.statusMargem || '']
      .join(' ').toLowerCase().includes(termo))
  }, [busca, produtos])

  const totalEstoque = useMemo(() => produtos.reduce((acc, item) => acc + Number(item.estoque || 0), 0), [produtos])
  const valorEstoque = useMemo(() => produtos.reduce((acc, item) => acc + Number(item.preco || 0) * Number(item.estoque || 0), 0), [produtos])
  const servicos = produtos.filter((p) => p.tipoCadastro === 'servico').length
  const produtosVenda = produtos.length - servicos
  const lucroPotencial = useMemo(() => produtos.reduce((acc, item) => acc + Number(item.lucroEstimado || 0) * Math.max(Number(item.estoque || 0), item.tipoCadastro === 'servico' ? 1 : 0), 0), [produtos])
  const margemMedia = useMemo(() => {
    const comPreco = produtos.filter((p) => Number(p.preco || 0) > 0)
    return comPreco.length ? comPreco.reduce((acc, p) => acc + Number(p.margemRealPct || 0), 0) / comPreco.length : 0
  }, [produtos])
  const produtosRisco = produtos.filter((p) => p.statusMargem === 'risco').length

  const input: CSSProperties = { width: '100%', height: 38, borderRadius: 12, border: '1px solid #dbe4ef', background: '#fff', color: '#0f172a', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontSize: 13 }
  const label: CSSProperties = { display: 'block', color: '#475569', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, marginBottom: 5 }
  const btn: CSSProperties = { height: 36, borderRadius: 11, border: '1px solid #dbe4ef', padding: '0 12px', cursor: 'pointer', fontWeight: 900, fontSize: 12, background: '#fff', color: '#0f172a' }
  const card: CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 22, boxShadow: '0 14px 34px rgba(15,23,42,.05)' }

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: isMobile ? 12 : 24, color: '#0f172a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.4 }}>Cadastro Connect</div>
          <h1 style={{ margin: '4px 0 0', fontSize: isMobile ? 32 : 44, lineHeight: 1, fontWeight: 950 }}>Produtos e Serviços</h1>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontWeight: 700 }}>Cadastro com precificação inteligente, margem real e alerta de risco.</p>
        </div>
        <button onClick={novoProduto} style={{ ...btn, height: 44, padding: '0 18px', color: '#fff', background: 'linear-gradient(135deg,#f97316,#fb923c)', border: '0', boxShadow: '0 14px 26px rgba(249,115,22,.20)' }}>+ Novo produto</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6,1fr)', gap: 12, marginBottom: 16 }}>
        <Metric title="Produtos" value={String(produtosVenda)} />
        <Metric title="Serviços" value={String(servicos)} />
        <Metric title="Estoque" value={String(totalEstoque)} />
        <Metric title="Valor estimado" value={moeda(valorEstoque)} />
        <Metric title="Margem média" value={percentual(margemMedia)} tone={margemMedia >= 30 ? 'green' : margemMedia >= 15 ? 'yellow' : 'red'} />
        <Metric title="Risco" value={String(produtosRisco)} tone={produtosRisco ? 'red' : 'green'} />
      </div>

      <section className="connect-pricing-hero" style={{ ...card, padding: isMobile ? 14 : 18, marginBottom: 16, background: 'linear-gradient(135deg,#ffffff,#f8fafc)', overflow: 'hidden' }}>
        <div className="connect-pricing-hero-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : '1.2fr .8fr', gap: isMobile ? 10 : 14, alignItems: 'stretch' }}>
          <div className="connect-pricing-hero-copy">
            <div style={{ fontSize: isMobile ? 11 : 12, fontWeight: 950, letterSpacing: isMobile ? .9 : 1.2, textTransform: 'uppercase', color: '#2563eb' }}>Precificação inteligente</div>
            <h2 style={{ margin: '4px 0 6px', fontSize: isMobile ? 22 : 24, lineHeight: 1.12 }}>Venda sem perder margem</h2>
            <p style={{ margin: 0, color: '#64748b', fontWeight: 700, lineHeight: 1.45, fontSize: isMobile ? 14 : 15 }}>O Connect calcula preço sugerido usando custo, imposto, taxa do cartão, despesas, comissão e lucro desejado. A dashboard passa a mostrar margem média e produtos em risco.</p>
          </div>
          <div className="connect-pricing-profit-card" style={{ borderRadius: 18, background: '#ecfdf5', border: '1px solid #bbf7d0', padding: isMobile ? 12 : 14, minWidth: 0 }}>
            <div style={{ color: '#047857', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Lucro potencial do cadastro</div>
            <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6, color: '#065f46' }}>{moeda(lucroPotencial)}</div>
            <div style={{ fontSize: 12, color: '#047857', fontWeight: 800, marginTop: 5 }}>Baseado no estoque atual e lucro estimado por item.</div>
          </div>
        </div>
      </section>

      <section style={{ ...card, padding: isMobile ? 12 : 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, serviço, categoria, kg, m², risco..." style={{ ...input, flex: 1, minWidth: 260 }} />
        </div>
        {produtosFiltrados.length === 0 ? <div style={{ padding: 22, border: '1px dashed #cbd5e1', borderRadius: 16, color: '#64748b' }}>Nenhum produto ou serviço encontrado.</div> : (
          <div className="connect-mobile-scroll" data-scroll-hint="true" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1080 }}>
              <thead><tr style={{ background: '#f8fafc' }}>{['Item', 'Tipo', 'Categoria', 'Preço de venda', 'Preço de custo', 'Margem', 'Lucro', 'Estoque', 'Ações'].map((h, i) => <th key={h} style={{ textAlign: i === 8 ? 'right' : 'left', padding: '12px 10px', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: .8, borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}</tr></thead>
              <tbody>{produtosFiltrados.map((produto) => <tr key={produto.id}>
                <td style={td}><b>{produto.nome}</b><div style={{ color: '#64748b', fontSize: 12 }}>{produto.descricao || 'Sem descrição'}</div></td>
                <td style={td}><span style={badgeStyle(produto.tipoCadastro, produto.tipoCalculo)}>{badgeTipo(produto.tipoCalculo, produto.tipoCadastro)}</span></td>
                <td style={td}>{iconeCategoria(produto.categoria)} {produto.categoria || '-'}</td>
                <td style={td}><b>{moeda(produto.preco)}</b><div style={{ color: '#64748b', fontSize: 11 }}>Sug.: {moeda(produto.precoSugerido || 0)}</div></td>
                <td style={td}>{moeda(produto.custo)}</td>
                <td style={td}><span style={statusMargemStyle(produto.statusMargem)}>{percentual(produto.margemRealPct || 0)}</span></td>
                <td style={td}><b style={{ color: Number(produto.lucroEstimado || 0) >= 0 ? '#15803d' : '#dc2626' }}>{moeda(produto.lucroEstimado || 0)}</b></td>
                <td style={td}>{produto.tipoCadastro === 'servico' ? '-' : produto.tipoCalculo === 'peso' ? `${formatarPesoVisual(produto.estoque) || '0,000'} kg` : produto.estoque}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => editarProduto(produto)} style={{ ...btn, marginRight: 6 }}>Editar</button><button onClick={() => excluirProduto(produto.id)} style={{ ...btn, color: '#dc2626', borderColor: '#fecaca', background: '#fff7f7' }}>Excluir</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {drawerAberto && <div onClick={fecharDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(4px)', zIndex: 900 }} />}
      <aside style={drawerAberto ? {
        position: 'fixed',
        left: isMobile ? 8 : '50%',
        right: isMobile ? 8 : 'auto',
        top: isMobile ? 'calc(max(env(safe-area-inset-top, 0px), 48px) + 56px)' : '50%',
        bottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 8px)' : 'auto',
        transform: isMobile ? 'none' : 'translate(-50%, -50%)',
        width: isMobile ? 'auto' : 760,
        maxWidth: isMobile ? 'none' : 'calc(100vw - 32px)',
        maxHeight: isMobile ? 'calc(100dvh - max(env(safe-area-inset-top, 0px), 48px) - env(safe-area-inset-bottom, 0px) - 68px)' : '88vh',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: isMobile ? 22 : 28,
        boxShadow: '0 34px 90px rgba(15,23,42,.30)',
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000
      } : { display: 'none' }}>
        <div style={{ padding: isMobile ? '16px 14px 12px' : '18px 20px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', background: '#fff', position: 'sticky', top: 0, zIndex: 5 }}>
          <div><h2 style={{ margin: 0, fontSize: isMobile ? 22 : 26, lineHeight: 1 }}>{editandoId ? 'Editar produto/serviço' : 'Novo produto/serviço'}</h2><p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 700, fontSize: 13 }}>Produto, serviço, kg ou m² com cálculo de preço sugerido.</p></div>
          <button onClick={fecharDrawer} style={{ ...btn, background: '#f8fafc', height: 42, minWidth: 86, padding: '0 14px', fontSize: 13, flexShrink: 0, position: 'relative', zIndex: 6 }}>Fechar</button>
        </div>
        <div style={{ padding: isMobile ? 14 : 18, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><label style={label}>Nome do item</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Cabo USB, troca de tela, box banheiro..." style={input} /></div>
            <div><label style={label}>Código de barras / EAN</label><input value={codigoBarras} onChange={(e) => setCodigoBarras(normalizarCodigoBarras(e.target.value))} placeholder="Bipe ou digite o código do produto" inputMode="numeric" style={input} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><button onClick={() => setTipoCadastro('produto')} style={{ ...btn, background: tipoCadastro === 'produto' ? '#f97316' : '#f8fafc', color: tipoCadastro === 'produto' ? '#fff' : '#0f172a', borderColor: tipoCadastro === 'produto' ? '#f97316' : '#dbe4ef' }}>Produto</button><button onClick={() => setTipoCadastro('servico')} style={{ ...btn, background: tipoCadastro === 'servico' ? '#2563eb' : '#f8fafc', color: tipoCadastro === 'servico' ? '#fff' : '#0f172a', borderColor: tipoCadastro === 'servico' ? '#2563eb' : '#dbe4ef' }}>Serviço</button></div>
            {tipoCadastro === 'produto' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}><button onClick={() => setTipoCalculo('unidade')} style={{ ...btn, background: tipoCalculo === 'unidade' ? '#16a34a' : '#f8fafc', color: tipoCalculo === 'unidade' ? '#fff' : '#0f172a' }}>Unid.</button><button onClick={() => setTipoCalculo('peso')} style={{ ...btn, background: tipoCalculo === 'peso' ? '#16a34a' : '#f8fafc', color: tipoCalculo === 'peso' ? '#fff' : '#0f172a' }}>Kg</button><button onClick={() => setTipoCalculo('m2')} style={{ ...btn, background: tipoCalculo === 'm2' ? '#16a34a' : '#f8fafc', color: tipoCalculo === 'm2' ? '#fff' : '#0f172a' }}>m²</button></div>}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}><div><label style={label}>Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={input}><option value="">Selecione</option>{categoriasAtivas.map((item) => <option key={item.id} value={item.nome}>{item.nome}</option>)}</select></div><div><label style={label}>Estoque {tipoCalculo === 'peso' ? 'kg' : ''}</label><input value={estoque} onChange={(e) => setEstoque(tipoCadastro === 'servico' ? '' : tipoCalculo === 'peso' ? e.target.value : normalizarInteiroTexto(e.target.value))} placeholder={tipoCadastro === 'servico' ? 'Sem estoque' : tipoCalculo === 'peso' ? 'Ex: 1,250' : '0'} inputMode={tipoCalculo === 'peso' ? 'decimal' : 'numeric'} style={input} disabled={tipoCadastro === 'servico'} /></div></div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>{labelPrecoVenda}</label>
                  <input value={preco} onChange={(e) => setPreco(aplicarMascaraDecimal(e.target.value))} placeholder="0,00" style={input} />
                </div>
                <div>
                  <label style={label}>Preço de custo</label>
                  <input value={custo} onChange={(e) => setCusto(aplicarMascaraDecimal(e.target.value))} placeholder="0,00" style={input} />
                </div>
              </div>
              {tipoCalculo === 'm2' || tipoCadastro === 'produto' ? (
                <button
                  type="button"
                  onClick={abrirCalculadoraM2}
                  style={{
                    ...btn,
                    width: '100%',
                    minHeight: 40,
                    justifyContent: 'center',
                    background: tipoCalculo === 'm2' ? 'linear-gradient(135deg,#eff6ff,#f0fdf4)' : '#f8fafc',
                    borderColor: tipoCalculo === 'm2' ? '#93c5fd' : '#dbe4ef',
                    color: '#1d4ed8',
                    fontSize: 13,
                  }}
                >
                  💡 Não sabe quanto cobrar? Calcular meu preço ideal
                </button>
              ) : null}
            </div>
            <section style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 18, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}><div><div style={{ color: '#047857', fontWeight: 950, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Precificação automática</div><div style={{ color: '#065f46', fontSize: 12, fontWeight: 700, marginTop: 3 }}>Base: preço de venda = preço de custo × markup. Markup = 1 ÷ (1 - impostos - taxas - despesas - comissão - lucro desejado).</div></div><button onClick={aplicarPrecoSugerido} style={{ ...btn, background: '#16a34a', color: '#fff', borderColor: '#16a34a' }}>Aplicar sugerido</button></div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5,1fr)', gap: 8 }}><PercentInput label="Imposto %" value={impostoPct} setValue={setImpostoPct} /><PercentInput label="Cartão %" value={taxaCartaoPct} setValue={setTaxaCartaoPct} /><PercentInput label="Despesa %" value={despesasPct} setValue={setDespesasPct} /><PercentInput label="Comissão %" value={comissaoPct} setValue={setComissaoPct} /><PercentInput label="Lucro desejado %" value={lucroDesejadoPct} setValue={setLucroDesejadoPct} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 8, marginTop: 12 }}><PriceCard title="Preço sugerido" value={moeda(calculoAtual.precoSugerido)} /><PriceCard title="Lucro líquido" value={moeda(calculoAtual.lucroEstimado)} tone={calculoAtual.lucroEstimado >= 0 ? 'green' : 'red'} /><PriceCard title="Margem real" value={percentual(calculoAtual.margemRealPct)} tone={calculoAtual.statusMargem === 'saudavel' ? 'green' : calculoAtual.statusMargem === 'apertada' ? 'yellow' : 'red'} /><PriceCard title="Markup" value={`${Number(calculoAtual.markup || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`} /></div>
            </section>
            <div><label style={label}>Descrição</label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição rápida do item" style={{ ...input, minHeight: 68, resize: 'vertical', paddingTop: 10, fontFamily: 'inherit' }} /></div>
            <div style={{ marginTop: 6, background: '#fff', padding: 0, display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button onClick={fecharDrawer} style={{ ...btn, background: '#f1f5f9', minWidth: 94 }}>Cancelar</button><button onClick={salvarProduto} disabled={salvando} style={{ ...btn, color: '#fff', background: '#2563eb', borderColor: '#2563eb', minWidth: 138 }}>{salvando ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar produto'}</button></div>
          </div>
        </div>
      </aside>

      <CalculadoraPrecoM2Modal
        aberto={calculadoraM2Aberta}
        isMobile={isMobile}
        onFechar={() => setCalculadoraM2Aberta(false)}
        onUsarPreco={aplicarPrecoCalculadoM2}
      />

      <ProdutosFabMenu
        isMobile={isMobile}
        visivel={!drawerAberto}
        onNovoProduto={novoProduto}
        onCalcularPrecoM2={abrirCalculadoraM2}
      />
    </div>
  )
}

const td: CSSProperties = { padding: '12px 10px', borderBottom: '1px solid #eef2f7', verticalAlign: 'middle', fontSize: 13 }

function Metric({ title, value, tone = 'default' }: { title: string; value: string; tone?: 'default' | 'green' | 'yellow' | 'red' }) {
  const colors = tone === 'green' ? ['#ecfdf5', '#15803d'] : tone === 'yellow' ? ['#fffbeb', '#b45309'] : tone === 'red' ? ['#fef2f2', '#dc2626'] : ['#fff', '#0f172a']
  return <div style={{ border: '1px solid #e2e8f0', borderRadius: 18, background: colors[0], padding: 16, boxShadow: '0 10px 24px rgba(15,23,42,.04)' }}><div style={{ color: '#64748b', fontSize: 12, fontWeight: 900 }}>{title}</div><div style={{ fontSize: 26, fontWeight: 950, marginTop: 4, color: colors[1] }}>{value}</div></div>
}

function PercentInput({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <div><label style={{ display: 'block', color: '#047857', fontWeight: 900, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>{label}</label><input value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9,.]/g, ''))} style={{ width: '100%', height: 34, borderRadius: 10, border: '1px solid #86efac', padding: '0 9px', fontWeight: 800, outline: 'none' }} /></div>
}

function PriceCard({ title, value, tone = 'default' }: { title: string; value: string; tone?: 'default' | 'green' | 'yellow' | 'red' }) {
  const color = tone === 'green' ? '#15803d' : tone === 'yellow' ? '#b45309' : tone === 'red' ? '#dc2626' : '#0f172a'
  return <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 14, padding: 10 }}><div style={{ fontSize: 10, color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>{title}</div><div style={{ marginTop: 4, fontSize: 16, fontWeight: 950, color }}>{value}</div></div>
}

function badgeStyle(cadastro?: TipoCadastroProduto, tipo?: TipoCalculoProduto): CSSProperties {
  const isServico = cadastro === 'servico'
  const isPeso = tipo === 'peso'
  const isM2 = tipo === 'm2'
  return { display: 'inline-flex', padding: '5px 9px', borderRadius: 999, fontSize: 11, fontWeight: 900, color: isServico ? '#1d4ed8' : isPeso ? '#166534' : isM2 ? '#7c2d12' : '#334155', background: isServico ? '#dbeafe' : isPeso ? '#dcfce7' : isM2 ? '#ffedd5' : '#f1f5f9' }
}

function statusMargemStyle(status?: StatusMargem): CSSProperties {
  const cfg = status === 'saudavel' ? ['#dcfce7', '#166534', 'Saudável'] : status === 'apertada' ? ['#fef3c7', '#92400e', 'Apertada'] : ['#fee2e2', '#991b1b', 'Risco']
  return { display: 'inline-flex', padding: '5px 9px', borderRadius: 999, fontSize: 11, fontWeight: 950, background: cfg[0], color: cfg[1] }
}
