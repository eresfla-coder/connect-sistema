'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type FormaPagamento = {
  id: number
  nome: string
  ativo: boolean
}

const FORMAS_KEY = 'connect_formas_pagamento'
const PADROES = ['PIX', 'DINHEIRO', 'CARTÃO CRÉDITO', 'CARTÃO CRÉDITO PARCELADO', 'CARTÃO DÉBITO']

const pageBg = 'linear-gradient(180deg,#091223 0%,#0d1a31 100%)'
const shellBg = 'linear-gradient(180deg,rgba(8,15,31,0.96) 0%,rgba(10,20,38,0.98) 100%)'
const cardBg = 'linear-gradient(180deg,rgba(19,31,57,0.98) 0%,rgba(16,25,46,0.98) 100%)'
const border = '1px solid rgba(96,165,250,0.20)'
const inputBorder = '1px solid rgba(148,163,184,0.22)'
const text = '#f8fafc'
const muted = '#8fa5c7'

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
            const convertida = lista.map((item, index) => ({ id: Date.now() + index, nome: String(item), ativo: true }))
            setFormas(convertida)
            localStorage.setItem(FORMAS_KEY, JSON.stringify(convertida))
          } else {
            setFormas(lista)
          }
          return
        }
      } catch {}
    }
    const iniciais = PADROES.map((item, index) => ({ id: Date.now() + index, nome: item, ativo: true }))
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

    const existe = formas.some((item) => item.nome.trim().toLowerCase() === valor.toLowerCase() && item.id !== editandoId)
    if (existe) {
      alert('Essa forma de pagamento já existe.')
      return
    }

    if (editandoId !== null) {
      salvarLista(formas.map((item) => (item.id === editandoId ? { ...item, nome: valor } : item)))
      alert('Forma de pagamento atualizada com sucesso.')
    } else {
      salvarLista([{ id: Date.now(), nome: valor, ativo: true }, ...formas])
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
    if (!window.confirm('Deseja excluir esta forma de pagamento?')) return
    salvarLista(formas.filter((item) => item.id !== id))
    if (editandoId === id) limpar()
  }

  function alternarStatus(id: number) {
    salvarLista(formas.map((item) => (item.id === id ? { ...item, ativo: !item.ativo } : item)))
  }

  const formasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return formas
    return formas.filter((item) => item.nome.toLowerCase().includes(termo))
  }, [formas, busca])

  const inputStyle: CSSProperties = {
    width: '100%', minHeight: 46, borderRadius: 12, border: inputBorder, background: 'rgba(8,15,31,0.88)',
    color: text, padding: '11px 14px', boxSizing: 'border-box', outline: 'none', fontSize: 14,
  }

  return (
    <div style={{ minHeight: '100vh', background: pageBg, paddingBottom: 32 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 20 }}>
        <div style={{ color: muted, fontSize: 13, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
          Painel financeiro blindado
        </div>
        <h1 style={{ margin: '0 0 16px 0', fontSize: isMobile ? 34 : 46, lineHeight: 1, fontWeight: 900, color: text }}>Formas de Pagamento</h1>

        <div style={{ background: shellBg, borderRadius: 24, padding: isMobile ? 14 : 18, border, boxShadow: '0 16px 36px rgba(2,6,23,0.34)', marginBottom: 18 }}>
          <div style={{ background: cardBg, borderRadius: 20, padding: isMobile ? 14 : 18, border }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: muted, fontWeight: 800, fontSize: 13 }}>💳 Nome da forma de pagamento</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: PIX, CARTÃO 1X, BOLETO..." style={inputStyle} />
              </div>
              <button onClick={limpar} style={{ height: 46, border: 'none', borderRadius: 12, padding: '0 16px', fontWeight: 900, cursor: 'pointer', background: '#cbd5e1', color: '#0f172a' }}>Limpar</button>
              <button onClick={salvarForma} style={{ height: 46, border: 'none', borderRadius: 12, padding: '0 18px', fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff' }}>{editandoId !== null ? 'Salvar edição' : '+ Nova forma'}</button>
            </div>
          </div>
        </div>

        <div style={{ background: shellBg, borderRadius: 24, padding: isMobile ? 14 : 18, border, boxShadow: '0 16px 36px rgba(2,6,23,0.34)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 28 : 38, color: '#fff' }}>Lista de formas</h2>
              <div style={{ color: muted, fontWeight: 700, marginTop: 4 }}>{formasFiltradas.length} registro(s)</div>
            </div>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar forma de pagamento..." style={{ ...inputStyle, maxWidth: isMobile ? '100%' : 320 }} />
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {formasFiltradas.map((item) => (
              <div key={item.id} style={{ background: cardBg, borderRadius: 18, border, padding: isMobile ? 14 : 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{item.nome}</div>
                  <div style={{ marginTop: 8, display: 'inline-flex', padding: '6px 10px', borderRadius: 999, fontWeight: 800, fontSize: 11, background: item.ativo ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)', color: item.ativo ? '#86efac' : '#fca5a5', border: '1px solid rgba(255,255,255,0.08)' }}>{item.ativo ? 'Ativa' : 'Inativa'}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, auto)', gap: 10 }}>
                  <button onClick={() => alternarStatus(item.id)} style={{ height: 42, border: 'none', borderRadius: 12, fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#facc15,#eab308)', color: '#111827', minWidth: 94 }}>{item.ativo ? 'Inativar' : 'Ativar'}</button>
                  <button onClick={() => editarForma(item)} style={{ height: 42, border: 'none', borderRadius: 12, fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', minWidth: 88 }}>Editar</button>
                  <button onClick={() => excluirForma(item.id)} style={{ height: 42, border: 'none', borderRadius: 12, fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', minWidth: 88 }}>Excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
