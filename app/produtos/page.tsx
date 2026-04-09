'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type Categoria = {
  id: number
  nome: string
  ativa: boolean
}

type TipoCalculoProduto = 'unidade' | 'm2'

type Produto = {
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

const CATEGORIAS_KEY = 'connect_categorias'
const PRODUTOS_KEY = 'connect_produtos'

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

export default function ProdutosPage() {
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

  function carregarProdutos() {
    const salvo = localStorage.getItem(PRODUTOS_KEY)

    if (!salvo) {
      setProdutos([])
      return
    }

    try {
      const lista = JSON.parse(salvo)

      if (!Array.isArray(lista)) {
        setProdutos([])
        return
      }

      const normalizados: Produto[] = lista.map((item: any, index: number) => ({
        id: Number(item.id ?? Date.now() + index),
        nome: String(item.nome || ''),
        categoria: String(item.categoria || ''),
        preco: Number(item.preco || 0),
        custo: Number(item.custo || 0),
        estoque: Number(item.estoque || 0),
        descricao: String(item.descricao || ''),
        ativo: Boolean(item.ativo ?? true),
        tipoCalculo: item.tipoCalculo === 'm2' ? 'm2' : 'unidade',
      }))

      setProdutos(normalizados)
    } catch {
      setProdutos([])
    }
  }

  function salvarListaProdutos(lista: Produto[]) {
    setProdutos(lista)
    localStorage.setItem(PRODUTOS_KEY, JSON.stringify(lista))
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

  function salvarProduto() {
    if (!nome.trim()) {
      alert('Digite o nome do produto')
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

    if (editandoId !== null) {
      const atualizada = produtos.map((item) =>
        item.id === editandoId
          ? {
              ...item,
              nome: nome.trim(),
              categoria: categoria.trim(),
              preco: precoNumero,
              custo: custoNumero,
              estoque: estoqueNumero,
              descricao: descricao.trim(),
              tipoCalculo,
            }
          : item,
      )

      salvarListaProdutos(atualizada)
      alert('Produto atualizado com sucesso.')
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

      salvarListaProdutos([novo, ...produtos])
      alert('Produto salvo com sucesso.')
    }

    setSalvando(false)
    limparFormulario()
  }

  function excluirProduto(id: number) {
    const confirmar = window.confirm('Deseja excluir este produto?')
    if (!confirmar) return

    const atualizada = produtos.filter((item) => item.id !== id)
    salvarListaProdutos(atualizada)

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
                  style={{
                    width: '100%',
                    padding: '15px 16px',
                    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 14,
                    cursor: 'pointer',
                    fontWeight: 900,
                    fontSize: 16,
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