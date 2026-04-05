'use client'

import { useEffect, useMemo, useState } from 'react'

type Categoria = {
  id: number
  nome: string
  ativa: boolean
}

const CATEGORIAS_KEY = 'connect_categorias'

const PADROES = [
  'Informática',
  'Celulares',
  'Acessórios',
  'Papelaria',
  'Utilidades',
]

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nome, setNome] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const atualizarTela = () => setIsMobile(window.innerWidth <= 768)
    atualizarTela()
    window.addEventListener('resize', atualizarTela)
    return () => window.removeEventListener('resize', atualizarTela)
  }, [])

  useEffect(() => {
    const salvo = localStorage.getItem(CATEGORIAS_KEY)

    if (salvo) {
      try {
        const lista = JSON.parse(salvo)

        if (Array.isArray(lista) && lista.length > 0) {
          if (typeof lista[0] === 'string') {
            const convertida = lista.map((item, index) => ({
              id: Date.now() + index,
              nome: String(item),
              ativa: true,
            }))
            setCategorias(convertida)
            localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(convertida))
          } else {
            setCategorias(lista)
          }
          return
        }
      } catch {}
    }

    const iniciais = PADROES.map((item, index) => ({
      id: Date.now() + index,
      nome: item,
      ativa: true,
    }))

    setCategorias(iniciais)
    localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(iniciais))
  }, [])

  function salvarLista(lista: Categoria[]) {
    setCategorias(lista)
    localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(lista))
  }

  function limpar() {
    setNome('')
    setEditandoId(null)
  }

  function salvarCategoria() {
    const valor = nome.trim()

    if (!valor) {
      alert('Digite o nome da categoria.')
      return
    }

    const existe = categorias.some(
      (item) =>
        item.nome.trim().toLowerCase() === valor.toLowerCase() &&
        item.id !== editandoId,
    )

    if (existe) {
      alert('Essa categoria já existe.')
      return
    }

    if (editandoId !== null) {
      const atualizada = categorias.map((item) =>
        item.id === editandoId ? { ...item, nome: valor } : item,
      )
      salvarLista(atualizada)
      alert('Categoria atualizada com sucesso.')
    } else {
      const nova: Categoria = {
        id: Date.now(),
        nome: valor,
        ativa: true,
      }
      salvarLista([nova, ...categorias])
      alert('Categoria criada com sucesso.')
    }

    limpar()
  }

  function editarCategoria(item: Categoria) {
    setNome(item.nome)
    setEditandoId(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function excluirCategoria(id: number) {
    const confirmar = window.confirm('Deseja excluir esta categoria?')
    if (!confirmar) return

    const atualizada = categorias.filter((item) => item.id !== id)
    salvarLista(atualizada)

    if (editandoId === id) {
      limpar()
    }
  }

  function alternarStatus(id: number) {
    const atualizada = categorias.map((item) =>
      item.id === id ? { ...item, ativa: !item.ativa } : item,
    )
    salvarLista(atualizada)
  }

  const categoriasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return categorias

    return categorias.filter((item) =>
      item.nome.toLowerCase().includes(termo),
    )
  }, [categorias, busca])

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
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
          fontSize: isMobile ? 36 : 44,
          lineHeight: 1,
          fontWeight: 900,
          color: '#ffffff',
          textShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        Categorias
      </h1>

      <div
        style={{
          background: '#f7f3ea',
          borderRadius: 24,
          padding: isMobile ? 14 : 20,
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 20,
            padding: isMobile ? 14 : 18,
            border: '1px solid #e5e7eb',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto',
              gap: 12,
              alignItems: 'end',
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
                📁 Nome da categoria
              </label>

              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Fontes, Impressoras, Cabos..."
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  color: '#111827',
                  padding: '0 12px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontSize: 14,
                }}
              />
            </div>

            <button
              onClick={limpar}
              style={{
                height: 44,
                border: 'none',
                borderRadius: 10,
                padding: '0 16px',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: 14,
                background: '#d1d5db',
                color: '#111827',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              Limpar
            </button>

            <button
              onClick={salvarCategoria}
              style={{
                height: 44,
                border: 'none',
                borderRadius: 10,
                padding: '0 16px',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: 14,
                background: '#f97316',
                color: '#fff',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              {editandoId !== null ? 'Atualizar' : '+ Nova categoria'}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#f7f3ea',
          borderRadius: 24,
          padding: isMobile ? 14 : 20,
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, color: '#111827' }}>
            Lista de Categorias
          </h2>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar categoria..."
            style={{
              width: isMobile ? '100%' : 280,
              maxWidth: '100%',
              height: 42,
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              color: '#111827',
              padding: '0 12px',
              boxSizing: 'border-box',
              outline: 'none',
              fontSize: 14,
            }}
          />
        </div>

        {categoriasFiltradas.length === 0 ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 18,
              border: '1px solid #e5e7eb',
              color: '#4b5563',
            }}
          >
            Nenhuma categoria encontrada.
          </div>
        ) : (
          categoriasFiltradas.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: 16,
                border: '1px solid #e5e7eb',
                marginBottom: 12,
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 18,
                    color: '#111827',
                    marginBottom: 6,
                  }}
                >
                  {item.nome}
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: item.ativa ? '#dcfce7' : '#fee2e2',
                    color: item.ativa ? '#166534' : '#991b1b',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {item.ativa ? 'Ativa' : 'Inativa'}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'flex-start',
                }}
              >
                <button
                  onClick={() => alternarStatus(item.id)}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: item.ativa ? '#facc15' : '#22c55e',
                    color: '#111827',
                  }}
                >
                  {item.ativa ? 'Inativar' : 'Ativar'}
                </button>

                <button
                  onClick={() => editarCategoria(item)}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: '#2563eb',
                    color: '#fff',
                  }}
                >
                  Editar
                </button>

                <button
                  onClick={() => excluirCategoria(item.id)}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: '#dc2626',
                    color: '#fff',
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}