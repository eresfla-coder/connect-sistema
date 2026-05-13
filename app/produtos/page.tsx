'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'

type Categoria = {
  id: number
  nome: string
  ativa: boolean
}

type TipoCalculoProduto = 'unidade' | 'm2'

type Produto = {
  id: number
  supabaseId?: string
  nome: string
  categoria: string
  preco: number
  custo: number
  estoque: number
  descricao: string
  ativo: boolean
  tipoCalculo?: TipoCalculoProduto
}

type ProdutoSupabase = {
  id: string
  local_id?: string | null
  nome?: string | null
  categoria?: string | null
  preco?: number | string | null
  custo?: number | string | null
  estoque?: number | string | null
  descricao?: string | null
  ativo?: boolean | null
  tipo_calculo?: string | null
}

const CATEGORIAS_KEY = 'connect_categorias'
const PRODUTOS_KEY = 'connect_produtos'
const PRODUTOS_EXCLUSOES_PENDENTES_KEY = 'connect_produtos_exclusoes_pendentes'

const campo: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#111827',
  outline: 'none',
  fontSize: 14,
  boxSizing: 'border-box',
}

const areaTexto: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#111827',
  outline: 'none',
  fontSize: 14,
  boxSizing: 'border-box',
  minHeight: 96,
  resize: 'vertical',
  fontFamily: 'inherit',
}

function iconeCategoria(nome: string) {
  const texto = (nome || '').toLowerCase()

  if (texto.includes('celular')) return '📱'
  if (texto.includes('informática') || texto.includes('informatica')) return '💻'
  if (texto.includes('papelaria')) return '📝'
  if (texto.includes('utilidade')) return '🧺'
  if (texto.includes('descartável') || texto.includes('descartavel')) return '🥤'
  if (texto.includes('impress')) return '🖨️'
  if (texto.includes('serviço') || texto.includes('servico')) return '🛠️'

  return '📦'
}

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function gerarIdNumerico(texto?: string | null) {
  const valor = String(texto || '')
  if (!valor) return Date.now()

  let hash = 0
  for (let i = 0; i < valor.length; i += 1) {
    hash = (hash * 31 + valor.charCodeAt(i)) % 2147483647
  }

  return hash || Date.now()
}

function paraNumero(valor: unknown) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const numero = Number(String(valor || '').replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

function normalizarTipoCalculo(valor?: string | null): TipoCalculoProduto {
  return valor === 'm2' ? 'm2' : 'unidade'
}

function normalizarProdutoLocal(item: any, index: number): Produto {
  const idNumerico = Number(item?.id)
  const id = Number.isFinite(idNumerico) && idNumerico > 0
    ? idNumerico
    : gerarIdNumerico(item?.local_id || item?.supabaseId || item?.id || `${Date.now()}-${index}`)

  return {
    id,
    supabaseId: item?.supabaseId ? String(item.supabaseId) : undefined,
    nome: String(item?.nome || ''),
    categoria: String(item?.categoria || ''),
    preco: paraNumero(item?.preco ?? item?.valor),
    custo: paraNumero(item?.custo),
    estoque: paraNumero(item?.estoque),
    descricao: String(item?.descricao || ''),
    ativo: item?.ativo !== false,
    tipoCalculo: normalizarTipoCalculo(item?.tipoCalculo || item?.tipo_calculo),
  }
}

function normalizarProdutoSupabase(item: ProdutoSupabase): Produto {
  const localId = item.local_id || ''
  const idNumerico = Number(localId)

  return {
    id: Number.isFinite(idNumerico) && idNumerico > 0 ? idNumerico : gerarIdNumerico(item.id),
    supabaseId: item.id,
    nome: String(item.nome || ''),
    categoria: String(item.categoria || ''),
    preco: paraNumero(item.preco),
    custo: paraNumero(item.custo),
    estoque: paraNumero(item.estoque),
    descricao: String(item.descricao || ''),
    ativo: item.ativo !== false,
    tipoCalculo: normalizarTipoCalculo(item.tipo_calculo),
  }
}

function carregarCacheProdutos() {
  try {
    const salvo = localStorage.getItem(PRODUTOS_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    if (!Array.isArray(lista)) return []
    return lista.map(normalizarProdutoLocal).filter((produto) => Boolean(produto.nome))
  } catch {
    return []
  }
}

function salvarCacheProdutos(lista: Produto[]) {
  localStorage.setItem(PRODUTOS_KEY, JSON.stringify(lista))
}

function carregarExclusoesPendentes(): Produto[] {
  try {
    const salvo = localStorage.getItem(PRODUTOS_EXCLUSOES_PENDENTES_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    if (!Array.isArray(lista)) return []
    return lista.map(normalizarProdutoLocal)
  } catch {
    return []
  }
}

function salvarExclusoesPendentes(lista: Produto[]) {
  localStorage.setItem(PRODUTOS_EXCLUSOES_PENDENTES_KEY, JSON.stringify(lista))
}

function adicionarExclusaoPendente(produto: Produto) {
  const pendentes = carregarExclusoesPendentes()
  const jaExiste = pendentes.some(
    (item) =>
      item.supabaseId === produto.supabaseId ||
      String(item.id) === String(produto.id)
  )

  if (!jaExiste) {
    salvarExclusoesPendentes([produto, ...pendentes])
  }
}

async function obterUsuarioId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.id) {
    throw new Error('Usuario Supabase nao identificado.')
  }

  return data.user.id
}

function produtoParaSupabase(produto: Produto, userId: string) {
  return {
    user_id: userId,
    local_id: String(produto.id),
    nome: produto.nome,
    categoria: produto.categoria,
    preco: produto.preco,
    custo: produto.custo,
    estoque: produto.estoque,
    descricao: produto.descricao || null,
    ativo: produto.ativo !== false,
    tipo_calculo: produto.tipoCalculo === 'm2' ? 'm2' : 'unidade',
  }
}

async function listarProdutosSupabase() {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, local_id, nome, categoria, preco, custo, estoque, descricao, ativo, tipo_calculo')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw error
  return (data || []).map(normalizarProdutoSupabase)
}

async function salvarProdutoSupabase(produto: Produto, userId: string) {
  const registro = produtoParaSupabase(produto, userId)

  if (produto.supabaseId) {
    const { data, error } = await supabase
      .from('produtos')
      .update(registro)
      .eq('id', produto.supabaseId)
      .select('id, local_id, nome, categoria, preco, custo, estoque, descricao, ativo, tipo_calculo')
      .single()

    if (error) throw error
    return normalizarProdutoSupabase(data)
  }

  const { data: existente, error: buscarError } = await supabase
    .from('produtos')
    .select('id')
    .eq('user_id', userId)
    .eq('local_id', String(produto.id))
    .maybeSingle()

  if (buscarError) throw buscarError

  if (existente?.id) {
    const { data, error } = await supabase
      .from('produtos')
      .update(registro)
      .eq('id', existente.id)
      .select('id, local_id, nome, categoria, preco, custo, estoque, descricao, ativo, tipo_calculo')
      .single()

    if (error) throw error
    return normalizarProdutoSupabase(data)
  }

  const { data, error } = await supabase
    .from('produtos')
    .insert(registro)
    .select('id, local_id, nome, categoria, preco, custo, estoque, descricao, ativo, tipo_calculo')
    .single()

  if (error) throw error
  return normalizarProdutoSupabase(data)
}

async function sincronizarProdutosLocais(lista: Produto[], userId: string) {
  const sincronizados: Produto[] = []

  for (const produto of lista) {
    if (!produto.nome.trim() || !produto.categoria.trim()) continue
    sincronizados.push(await salvarProdutoSupabase(produto, userId))
  }

  return sincronizados
}

async function sincronizarExclusoesPendentes(userId: string) {
  const pendentes = carregarExclusoesPendentes()
  if (pendentes.length === 0) return

  const aindaPendentes: Produto[] = []

  for (const produto of pendentes) {
    try {
      const query = supabase.from('produtos').delete()

      const { error } = produto.supabaseId
        ? await query.eq('id', produto.supabaseId)
        : await query.eq('user_id', userId).eq('local_id', String(produto.id))

      if (error) throw error
    } catch {
      aindaPendentes.push(produto)
    }
  }

  salvarExclusoesPendentes(aindaPendentes)
}

export default function ProdutosPage() {
  const nomeInputRef = useRef<HTMLInputElement | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [busca, setBusca] = useState('')

  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [preco, setPreco] = useState('')
  const [custo, setCusto] = useState('')
  const [estoque, setEstoque] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipoCalculo, setTipoCalculo] = useState<TipoCalculoProduto>('unidade')

  useEffect(() => {
    const atualizarTela = () => setIsMobile(window.innerWidth <= 900)
    atualizarTela()
    window.addEventListener('resize', atualizarTela)
    return () => window.removeEventListener('resize', atualizarTela)
  }, [])

  useEffect(() => {
    carregarCategorias()
    carregarProdutos()
  }, [])

  function carregarCategorias() {
    const salvo = localStorage.getItem(CATEGORIAS_KEY)

    if (!salvo) {
      setCategorias([])
      return
    }

    try {
      const lista = JSON.parse(salvo)

      if (!Array.isArray(lista)) {
        setCategorias([])
        return
      }

      const normalizadas: Categoria[] = lista
        .map((item: any, index: number) => {
          if (typeof item === 'string') {
            return {
              id: Date.now() + index,
              nome: item,
              ativa: true,
            }
          }

          return {
            id: Number(item.id ?? Date.now() + index),
            nome: String(item.nome || ''),
            ativa: Boolean(item.ativa ?? true),
          }
        })
        .filter((item: Categoria) => item.nome.trim() !== '')

      setCategorias(normalizadas)
    } catch {
      setCategorias([])
    }
  }

  async function carregarProdutos() {
    const cache = carregarCacheProdutos()
    try {
      const userId = await obterUsuarioId()

      await sincronizarExclusoesPendentes(userId)

      if (cache.length > 0) {
        await sincronizarProdutosLocais(cache, userId)
      }

      const remotos = await listarProdutosSupabase()
      salvarListaProdutos(remotos)
    } catch (error) {
      console.error('Erro ao sincronizar produtos com Supabase:', error)
      salvarListaProdutos(cache)
    }
  }

  function salvarListaProdutos(lista: Produto[]) {
    setProdutos(lista)
    salvarCacheProdutos(lista)
  }

  function limparFormulario() {
    setNome('')
    setCategoria('')
    setPreco('')
    setCusto('')
    setEstoque('')
    setDescricao('')
    setTipoCalculo('unidade')
    setEditandoId(null)
    window.setTimeout(() => nomeInputRef.current?.focus(), 0)
  }

  function editarProduto(produto: Produto) {
    setNome(produto.nome)
    setCategoria(produto.categoria)
    setPreco(String(produto.preco))
    setCusto(String(produto.custo))
    setEstoque(String(produto.estoque))
    setDescricao(produto.descricao)
    setTipoCalculo(produto.tipoCalculo === 'm2' ? 'm2' : 'unidade')
    setEditandoId(produto.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvarProduto() {
    if (salvando) return

    if (!nome.trim()) {
      alert('Digite o nome do produto')
      nomeInputRef.current?.focus()
      return
    }

    if (!categoria.trim()) {
      alert('Selecione a categoria')
      return
    }

    const categoriaExiste = categorias.some(
      (item) => item.nome === categoria && item.ativa,
    )

    if (!categoriaExiste) {
      alert('Selecione uma categoria válida e ativa')
      return
    }

    const precoNumero = Number(String(preco).replace(',', '.')) || 0
    const custoNumero = Number(String(custo).replace(',', '.')) || 0
    const estoqueNumero = Number(String(estoque).replace(',', '.')) || 0

    setSalvando(true)

    try {
      if (editandoId !== null) {
        const atual = produtos.find((item) => item.id === editandoId)
        if (!atual) return

        const produtoAtualizado: Produto = {
          ...atual,
          nome: nome.trim(),
          categoria: categoria.trim(),
          preco: precoNumero,
          custo: custoNumero,
          estoque: estoqueNumero,
          descricao: descricao.trim(),
          tipoCalculo,
          ativo: true,
        }

        const atualizada = produtos.map((item) =>
          item.id === editandoId ? produtoAtualizado : item,
        )

        try {
          const userId = await obterUsuarioId()
          const salvo = await salvarProdutoSupabase(produtoAtualizado, userId)
          salvarListaProdutos(produtos.map((item) => (item.id === editandoId ? salvo : item)))
          alert('Produto atualizado com sucesso.')
        } catch (error) {
          console.error('Erro ao atualizar produto no Supabase:', error)
          salvarListaProdutos(atualizada)
          alert('Produto atualizado no cache local. A sincronização será tentada novamente depois.')
        }
      } else {
        const novo: Produto = {
          id: Date.now(),
          nome: nome.trim(),
          categoria: categoria.trim(),
          preco: precoNumero,
          custo: custoNumero,
          estoque: estoqueNumero,
          descricao: descricao.trim(),
          ativo: true,
          tipoCalculo,
        }

        try {
          const userId = await obterUsuarioId()
          const salvo = await salvarProdutoSupabase(novo, userId)
          salvarListaProdutos([salvo, ...produtos])
          alert('Produto salvo com sucesso.')
        } catch (error) {
          console.error('Erro ao salvar produto no Supabase:', error)
          salvarListaProdutos([novo, ...produtos])
          alert('Produto salvo no cache local. A sincronização será tentada novamente depois.')
        }
      }

      limparFormulario()
    } finally {
      setSalvando(false)
    }
  }

  async function excluirProduto(id: number) {
    const confirmar = window.confirm('Deseja excluir este produto?')
    if (!confirmar) return

    const produtoExcluir = produtos.find((item) => item.id === id)
    const atualizada = produtos.filter((item) => item.id !== id)

    try {
      if (produtoExcluir?.supabaseId) {
        const { error } = await supabase
          .from('produtos')
          .delete()
          .eq('id', produtoExcluir.supabaseId)

        if (error) throw error
      } else if (produtoExcluir) {
        const userId = await obterUsuarioId()
        const { error } = await supabase
          .from('produtos')
          .delete()
          .eq('user_id', userId)
          .eq('local_id', String(produtoExcluir.id))

        if (error) throw error
      }

      salvarListaProdutos(atualizada)
    } catch (error) {
      console.error('Erro ao excluir produto no Supabase:', error)
      if (produtoExcluir) {
        adicionarExclusaoPendente(produtoExcluir)
      }
      salvarListaProdutos(atualizada)
      alert('Produto removido do cache local. A exclusão no Supabase será tentada novamente depois.')
    }

    if (editandoId === id) {
      limparFormulario()
    }
  }

  const categoriasAtivas = useMemo(
    () => categorias.filter((item) => item.ativa),
    [categorias],
  )

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return produtos

    return produtos.filter((produto) => {
      return (
        produto.nome.toLowerCase().includes(termo) ||
        produto.categoria.toLowerCase().includes(termo) ||
        produto.descricao.toLowerCase().includes(termo) ||
        (produto.tipoCalculo || 'unidade').toLowerCase().includes(termo)
      )
    })
  }, [busca, produtos])

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: isMobile ? 12 : 20,
        color: '#111827',
      }}
    >
      <div
        style={{
          color: 'rgba(255,255,255,0.35)',
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        Painel Comercial
      </div>

      <h1
        style={{
          margin: '0 0 16px 0',
          fontSize: isMobile ? 34 : 44,
          lineHeight: 1,
          fontWeight: 900,
          color: '#ffffff',
          textShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        Produtos
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : '220px 220px',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: '#f5f1e8',
            borderRadius: 22,
            padding: 20,
            boxShadow: '0 12px 28px rgba(0,0,0,0.08)',
            border: '1px solid #e5e7eb',
          }}
        >
          <div
            style={{
              color: '#6b7280',
              fontWeight: 800,
              fontSize: 14,
              marginBottom: 8,
            }}
          >
            Total de produtos
          </div>
          <div
            style={{
              fontSize: isMobile ? 28 : 34,
              fontWeight: 900,
              color: '#111827',
            }}
          >
            {produtos.length}
          </div>
        </div>

        <div
          style={{
            background: '#f5f1e8',
            borderRadius: 22,
            padding: 20,
            boxShadow: '0 12px 28px rgba(0,0,0,0.08)',
            border: '1px solid #e5e7eb',
          }}
        >
          <div
            style={{
              color: '#6b7280',
              fontWeight: 800,
              fontSize: 14,
              marginBottom: 8,
            }}
          >
            Categorias disponíveis
          </div>
          <div
            style={{
              fontSize: isMobile ? 28 : 34,
              fontWeight: 900,
              color: '#111827',
            }}
          >
            {categoriasAtivas.length}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <section
          style={{
            background: '#f5f1e8',
            borderRadius: isMobile ? 18 : 28,
            padding: isMobile ? 14 : 24,
            boxShadow: '0 14px 34px rgba(0,0,0,0.10)',
            border: '2px solid #e5e7eb',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: isMobile ? 14 : 20,
              padding: isMobile ? 14 : 18,
              boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
              border: '2px solid #e5e7eb',
            }}
          >
            <div
              style={{
                color: '#f97316',
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              cadastro de produtos
            </div>

            <div
              style={{
                fontSize: isMobile ? 22 : 26,
                fontWeight: 900,
                color: '#111827',
                lineHeight: 1.05,
                marginBottom: 4,
              }}
            >
              {editandoId ? 'Editar produto' : 'Novo produto'}
            </div>

            <div
              style={{
                color: '#6b7280',
                fontSize: 14,
                marginBottom: 18,
              }}
            >
              Connect Sistema
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#374151',
                  }}
                >
                  📦 Nome do produto
                </label>
                <input
                  ref={nomeInputRef}
                  placeholder="Ex: Cabo USB, Mouse, Fonte..."
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  style={campo}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#374151',
                  }}
                >
                  📁 Categoria
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  style={campo}
                >
                  <option value="">Selecione a categoria</option>
                  {categoriasAtivas.map((cat) => (
                    <option key={cat.id} value={cat.nome}>
                      {cat.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#374151',
                  }}
                >
                  📐 Tipo de cálculo
                </label>
                <select
                  value={tipoCalculo}
                  onChange={(e) => setTipoCalculo(e.target.value as TipoCalculoProduto)}
                  style={campo}
                >
                  <option value="unidade">Unidade</option>
                  <option value="m2">Metro quadrado (m²)</option>
                </select>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#374151',
                    }}
                  >
                    💰 {tipoCalculo === 'm2' ? 'Preço por m²' : 'Preço'}
                  </label>
                  <input
                    placeholder="0,00"
                    value={preco}
                    onChange={(e) => setPreco(e.target.value)}
                    style={campo}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#374151',
                    }}
                  >
                    🧾 Custo
                  </label>
                  <input
                    placeholder="0,00"
                    value={custo}
                    onChange={(e) => setCusto(e.target.value)}
                    style={campo}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#374151',
                    }}
                  >
                    📊 Estoque
                  </label>
                  <input
                    placeholder="0"
                    value={estoque}
                    onChange={(e) => setEstoque(e.target.value)}
                    style={campo}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#374151',
                  }}
                >
                  📝 Descrição
                </label>
                <textarea
                  placeholder="Descrição do produto"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  style={areaTexto}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: editandoId ? (isMobile ? '1fr' : '1fr 1fr') : '1fr',
                  gap: 10,
                }}
              >
                <button
                  onClick={salvarProduto}
                  disabled={salvando}
                  style={{
                    width: '100%',
                    padding: '15px 16px',
                    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 14,
                    cursor: salvando ? 'wait' : 'pointer',
                    fontWeight: 900,
                    fontSize: 16,
                    opacity: salvando ? 0.75 : 1,
                    boxShadow: '0 12px 28px rgba(34,197,94,0.22)',
                  }}
                >
                  {salvando
                    ? 'Salvando...'
                    : editandoId
                    ? 'Atualizar produto'
                    : 'Salvar produto'}
                </button>

                {editandoId && (
                  <button
                    onClick={limparFormulario}
                    style={{
                      width: '100%',
                      padding: '15px 16px',
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: 14,
                      cursor: 'pointer',
                      fontWeight: 900,
                      fontSize: 16,
                    }}
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            background: '#f5f1e8',
            borderRadius: isMobile ? 18 : 28,
            padding: isMobile ? 14 : 24,
            boxShadow: '0 14px 34px rgba(0,0,0,0.10)',
            border: '2px solid #e5e7eb',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: isMobile ? 14 : 20,
              padding: isMobile ? 14 : 18,
              boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
              border: '2px solid #e5e7eb',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'stretch' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: isMobile ? 22 : 28,
                    fontWeight: 900,
                    color: '#111827',
                    marginBottom: 4,
                  }}
                >
                  Lista de produtos
                </div>
                <div
                  style={{
                    color: '#6b7280',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {produtosFiltrados.length} registro(s)
                </div>
              </div>

              <input
                placeholder="Buscar produto, categoria, descrição ou tipo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{
                  ...campo,
                  width: isMobile ? '100%' : 320,
                }}
              />
            </div>

            {produtosFiltrados.length === 0 ? (
              <div
                style={{
                  color: '#6b7280',
                  padding: 26,
                  border: '1px dashed #d1d5db',
                  borderRadius: 14,
                  textAlign: 'center',
                  background: '#f9fafb',
                }}
              >
                Nenhum produto cadastrado ainda
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {produtosFiltrados.map((produto) => (
                  <div
                    key={produto.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 16,
                      padding: 16,
                      boxShadow: '0 8px 20px rgba(0,0,0,0.04)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'stretch' : 'center',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gap: 6,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          color: '#111827',
                          fontSize: 17,
                          wordBreak: 'break-word',
                        }}
                      >
                        {produto.nome}
                      </div>

                      <div style={{ color: '#4b5563', fontSize: 14 }}>
                        {iconeCategoria(produto.categoria)} {produto.categoria || 'Sem categoria'}
                      </div>

                      <div style={{ color: '#4b5563', fontSize: 14 }}>
                        Tipo: {produto.tipoCalculo === 'm2' ? 'Metro quadrado (m²)' : 'Unidade'}
                      </div>

                      <div style={{ color: '#4b5563', fontSize: 14 }}>
                        {produto.tipoCalculo === 'm2' ? 'Preço por m²' : 'Preço'}: {moeda(produto.preco)}
                      </div>

                      <div style={{ color: '#4b5563', fontSize: 14 }}>
                        Custo: {moeda(produto.custo)}
                      </div>

                      <div style={{ color: '#4b5563', fontSize: 14 }}>
                        Estoque: {Number(produto.estoque || 0)}
                      </div>

                      {produto.descricao && (
                        <div
                          style={{
                            color: '#4b5563',
                            fontSize: 14,
                            wordBreak: 'break-word',
                          }}
                        >
                          {produto.descricao}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                        width: isMobile ? '100%' : 120,
                      }}
                    >
                      <button
                        onClick={() => editarProduto(produto)}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: 'none',
                          background: '#2563eb',
                          color: 'white',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => excluirProduto(produto.id)}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: 'none',
                          background: '#dc2626',
                          color: 'white',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}