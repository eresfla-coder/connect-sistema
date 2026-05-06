'use client'

import { useEffect, useMemo, useState } from 'react'

type Cliente = {
  id?: number
  nome?: string
  telefone?: string
  email?: string
  endereco?: string
}

type ItemVenda = {
  id: number
  nome: string
  quantidade: number
  valor: number
}

type VendaSalva = {
  id: number
  numero: string
  orcamentoId?: number
  cliente: Cliente | null
  itens: ItemVenda[]
  subtotal: number
  desconto: number
  total: number
  formaPagamento: string
  observacao: string
  status: string
  data: string
  origem: string
}

const VENDAS_KEY = 'connect_vendas_salvas'

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function VendasPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [vendas, setVendas] = useState<VendaSalva[]>([])
  const [busca, setBusca] = useState('')

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    const salvas = localStorage.getItem(VENDAS_KEY)
    if (salvas) {
      try {
        const lista = JSON.parse(salvas)
        if (Array.isArray(lista)) setVendas(lista)
      } catch {}
    }
  }, [])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return vendas
    return vendas.filter((item) => `${item.numero} ${item.cliente?.nome || ''} ${item.formaPagamento || ''} ${item.origem || ''}`.toLowerCase().includes(termo))
  }, [vendas, busca])

  const resumo = useMemo(() => {
    const total = vendas.length
    const valor = vendas.reduce((acc, item) => acc + Number(item.total || 0), 0)
    const ticket = total > 0 ? valor / total : 0
    return { total, valor, ticket }
  }, [vendas])

  const shellStyle: React.CSSProperties = { background: 'linear-gradient(180deg, rgba(12,18,40,0.96), rgba(9,14,34,0.96))', borderRadius: isMobile ? 18 : 24, padding: isMobile ? 14 : 24, boxShadow: '0 18px 50px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)' }
  const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', borderRadius: isMobile ? 14 : 18, padding: isMobile ? 12 : 16, boxShadow: '0 10px 26px rgba(0,0,0,0.10)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 20, color: '#f8fafc' }}>
      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Painel Comercial</div>
      <h1 style={{ margin: '0 0 16px 0', fontSize: isMobile ? 34 : 44, lineHeight: 1, fontWeight: 900, color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>Vendas</h1>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
        <ResumoCard titulo="Vendas" valor={String(resumo.total)} />
        <ResumoCard titulo="Faturado" valor={moeda(resumo.valor)} />
        <ResumoCard titulo="Ticket médio" valor={moeda(resumo.ticket)} />
      </div>

      <div style={shellStyle}>
        <div style={{ ...cardStyle, marginBottom: 14, background: 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05))' }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, cliente ou forma de pagamento..." style={{ width: '100%', minHeight: 44, borderRadius: 10, border: '1px solid #e5e7eb', background: '#ffffff', color: '#f8fafc', padding: '10px 12px', boxSizing: 'border-box', outline: 'none', fontSize: 13 }} />
        </div>

        {filtradas.length === 0 ? <div style={cardStyle}>Nenhuma venda encontrada.</div> : filtradas.map((item) => (
          <div key={item.id} style={{ ...cardStyle, marginBottom: 10, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>Venda #{item.numero}</div>
                <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>{item.status || 'Concluída'}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Cliente:</strong> {item.cliente?.nome || '-'}</div>
              <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Pagamento:</strong> {item.formaPagamento || '-'}</div>
              <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Origem:</strong> {item.origem || '-'}</div>
              <div style={{ fontSize: 13 }}><strong>Data:</strong> {item.data || '-'}</div>
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'right', fontWeight: 900, fontSize: 20 }}>{moeda(item.total)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResumoCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div style={{ background: '#ffffff', borderRadius: 18, padding: 18, border: '2px solid #e5e7eb', boxShadow: '0 10px 26px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>{valor}</div>
    </div>
  )
}
