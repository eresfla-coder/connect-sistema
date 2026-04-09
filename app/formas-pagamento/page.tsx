
'use client'

import { useEffect, useMemo, useState } from 'react'

type FormaPagamento = {
  id: number
  nome: string
  ativo: boolean
}

const FORMAS_KEY = 'connect_formas_pagamento'

const PADROES = [
  'PIX',
  'DINHEIRO',
  'CARTÃO CRÉDITO',
  'CARTÃO CRÉDITO PARCELADO',
  'CARTÃO DÉBITO',
]

export default function FormasPagamentoPage() {
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [nome, setNome] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 768)
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    const salvo = localStorage.getItem(FORMAS_KEY)

    if (salvo) {
      try {
        const lista = JSON.parse(salvo)

        if (Array.isArray(lista) && lista.length > 0) {
          if (typeof lista[0] === 'string') {
            const convertida = lista.map((item, index) => ({
              id: Date.now() + index,
              nome: String(item),
              ativo: true,
            }))
            setFormas(convertida)
            localStorage.setItem(FORMAS_KEY, JSON.stringify(convertida))
          } else {
            setFormas(lista)
          }
          return
        }
      } catch {}
    }

    const iniciais = PADROES.map((item, index) => ({
      id: Date.now() + index,
      nome: item,
      ativo: true,
    }))
    setFormas(iniciais)
    localStorage.setItem(FORMAS_KEY, JSON.stringify(iniciais))
  }, [])

  function salvarLista(lista: FormaPagamento[]) {
    setFormas(lista)
    localStorage.setItem(FORMAS_KEY, JSON.stringify(lista))
  }

  function limpar() {
    setNome('')
    setEditandoId(null)
  }

  function salvarForma() {
    const valor = nome.trim()

    if (!valor) {
      alert('Digite o nome da forma de pagamento.')
      return
    }

    const existe = formas.some(
      (item) =>
        item.nome.trim().toLowerCase() === valor.toLowerCase() &&
        item.id !== editandoId,
    )

    if (existe) {
      alert('Essa forma de pagamento já existe.')
      return
    }

    if (editandoId !== null) {
      const atualizada = formas.map((item) =>
        item.id === editandoId ? { ...item, nome: valor } : item,
      )
      salvarLista(atualizada)
      alert('Forma de pagamento atualizada com sucesso.')
    } else {
      const nova: FormaPagamento = {
        id: Date.now(),
        nome: valor,
        ativo: true,
      }
      salvarLista([nova, ...formas])
      alert('Forma de pagamento criada com sucesso.')
    }

    limpar()
  }

  function editarForma(item: FormaPagamento) {
    setNome(item.nome)
    setEditandoId(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function excluirForma(id: number) {
    const confirmar = window.confirm('Deseja excluir esta forma de pagamento?')
    if (!confirmar) return

    const atualizada = formas.filter((item) => item.id !== id)
    salvarLista(atualizada)

    if (editandoId === id) {
      limpar()
    }
  }

  function alternarStatus(id: number) {
    const atualizada = formas.map((item) =>
      item.id === id ? { ...item, ativo: !item.ativo } : item,
    )
    salvarLista(atualizada)
  }

  const formasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return formas

    return formas.filter((item) =>
      item.nome.toLowerCase().includes(termo),
    )
  }, [formas, busca])

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: isMobile ? 14 : 20 }}>
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
          fontSize: isMobile ? 30 : 44,
          lineHeight: 1,
          fontWeight: 900,
          color: '#ffffff',
          textShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        Formas de Pagamento
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
                💳 Nome da forma de pagamento
              </label>

              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: PIX, CARTÃO 1X, BOLETO..."
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
              onClick={salvarForma}
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
              {editandoId !== null ? 'Atualizar' : '+ Nova forma'}
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
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, color: '#111827', width: '100%' }}>
            Lista de Formas
          </h2>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar forma de pagamento..."
            style={{
              width: '100%',
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

        {formasFiltradas.length === 0 ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 18,
              border: '1px solid #e5e7eb',
              color: '#4b5563',
            }}
          >
            Nenhuma forma de pagamento encontrada.
          </div>
        ) : (
          formasFiltradas.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: 16,
                border: '1px solid #e5e7eb',
                marginBottom: 12,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: isMobile ? 16 : 18,
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
                    background: item.ativo ? '#dcfce7' : '#fee2e2',
                    color: item.ativo ? '#166534' : '#991b1b',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {item.ativo ? 'Ativa' : 'Inativa'}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, auto)',
                  gap: 8,
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
                    background: item.ativo ? '#facc15' : '#22c55e',
                    color: '#111827',
                    gridColumn: isMobile ? '1 / -1' : 'auto',
                  }}
                >
                  {item.ativo ? 'Inativar' : 'Ativar'}
                </button>

                <button
                  onClick={() => editarForma(item)}
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
                  onClick={() => excluirForma(item.id)}
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
