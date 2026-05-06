'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type Categoria = {
  id: number
  nome: string
  ativa: boolean
}

const CATEGORIAS_KEY = 'connect_categorias'
const PADROES = ['Informática', 'Celulares', 'Acessórios', 'Papelaria', 'Utilidades']
const pageBg = 'linear-gradient(180deg,#091223 0%,#0d1a31 100%)'
const shellBg = 'linear-gradient(180deg,rgba(8,15,31,0.96) 0%,rgba(10,20,38,0.98) 100%)'
const cardBg = 'linear-gradient(180deg,rgba(19,31,57,0.98) 0%,rgba(16,25,46,0.98) 100%)'
const border = '1px solid rgba(96,165,250,0.20)'
const inputBorder = '1px solid rgba(148,163,184,0.22)'
const text = '#f8fafc'
const muted = '#8fa5c7'

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
            const convertida = lista.map((item, index) => ({ id: Date.now() + index, nome: String(item), ativa: true }))
            setCategorias(convertida)
            localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(convertida))
          } else {
            setCategorias(lista)
          }
          return
        }
      } catch {}
    }
    const iniciais = PADROES.map((item, index) => ({ id: Date.now() + index, nome: item, ativa: true }))
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
    const existe = categorias.some((item) => item.nome.trim().toLowerCase() === valor.toLowerCase() && item.id !== editandoId)
    if (existe) {
      alert('Essa categoria já existe.')
      return
    }
    if (editandoId !== null) {
      salvarLista(categorias.map((item) => (item.id === editandoId ? { ...item, nome: valor } : item)))
      alert('Categoria atualizada com sucesso.')
    } else {
      salvarLista([{ id: Date.now(), nome: valor, ativa: true }, ...categorias])
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
    if (!window.confirm('Deseja excluir esta categoria?')) return
    salvarLista(categorias.filter((item) => item.id !== id))
    if (editandoId === id) limpar()
  }

  function alternarStatus(id: number) {
    salvarLista(categorias.map((item) => (item.id === id ? { ...item, ativa: !item.ativa } : item)))
  }

  const categoriasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return categorias
    return categorias.filter((item) => item.nome.toLowerCase().includes(termo))
  }, [categorias, busca])

  const inputStyle: CSSProperties = {
    width: '100%', minHeight: 46, borderRadius: 12, border: inputBorder, background: 'rgba(8,15,31,0.88)',
    color: text, padding: '11px 14px', boxSizing: 'border-box', outline: 'none', fontSize: 14,
  }

  return (
    <div style={{ minHeight: '100vh', background: pageBg, paddingBottom: 32 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 20 }}>
        <div style={{ color: muted, fontSize: 13, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
          Painel estrutural blindado
        </div>
        <h1 style={{ margin: '0 0 16px 0', fontSize: isMobile ? 34 : 46, lineHeight: 1, fontWeight: 900, color: text }}>Categorias</h1>

        <div style={{ background: shellBg, borderRadius: 24, padding: isMobile ? 14 : 18, border, boxShadow: '0 16px 36px rgba(2,6,23,0.34)', marginBottom: 18 }}>
          <div style={{ background: cardBg, borderRadius: 20, padding: isMobile ? 14 : 18, border }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: muted, fontWeight: 800, fontSize: 13 }}>🗂️ Nova categoria</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Fontes, Impressoras, Cabos..." style={inputStyle} />
              </div>
              <button onClick={limpar} style={{ height: 46, border: 'none', borderRadius: 12, padding: '0 16px', fontWeight: 900, cursor: 'pointer', background: '#cbd5e1', color: '#0f172a' }}>Limpar</button>
              <button onClick={salvarCategoria} style={{ height: 46, border: 'none', borderRadius: 12, padding: '0 18px', fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff' }}>'Salvar'</button>
            </div>
          </div>
        </div>

        <div style={{ background: shellBg, borderRadius: 24, padding: isMobile ? 14 : 18, border, boxShadow: '0 16px 36px rgba(2,6,23,0.34)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 28 : 38, color: '#fff' }}>Lista de categorias</h2>
              <div style={{ color: muted, fontWeight: 700, marginTop: 4 }}>{categoriasFiltradas.length} registro(s)</div>
            </div>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar categoria..." style={{ ...inputStyle, maxWidth: isMobile ? '100%' : 280 }} />
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {categoriasFiltradas.map((item) => (
              <div key={item.id} style={{ background: cardBg, borderRadius: 18, border, padding: isMobile ? 14 : 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{item.nome}</div>
                  <div style={{ marginTop: 8, display: 'inline-flex', padding: '6px 10px', borderRadius: 999, fontWeight: 800, fontSize: 11, background: item.ativa ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)', color: item.ativa ? '#86efac' : '#fca5a5', border: '1px solid rgba(255,255,255,0.08)' }}>{item.ativa ? 'Ativa' : 'Inativa'}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, auto)', gap: 10 }}>
                  <button onClick={() => alternarStatus(item.id)} style={{ height: 42, border: 'none', borderRadius: 12, fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#facc15,#eab308)', color: '#111827', minWidth: 94 }}>{item.ativa ? 'Inativar' : 'Ativar'}</button>
                  <button onClick={() => editarCategoria(item)} style={{ height: 42, border: 'none', borderRadius: 12, fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', minWidth: 88 }}>Editar</button>
                  <button onClick={() => excluirCategoria(item.id)} style={{ height: 42, border: 'none', borderRadius: 12, fontWeight: 900, cursor: 'pointer', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', minWidth: 88 }}>Excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
