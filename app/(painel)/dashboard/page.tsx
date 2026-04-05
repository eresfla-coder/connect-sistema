'use client'

import { useEffect, useMemo, useState } from 'react'

type Orcamento = {
  id?: number | string
  numero?: number | string
  valor?: number | string
  total?: number | string
  valorTotal?: number | string
  data?: string
  createdAt?: string
  updatedAt?: string
  status?: string
  nomeCliente?: string
}

function lerStorage<T>(chave: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const valor = localStorage.getItem(chave)
    if (!valor) return fallback
    return JSON.parse(valor) as T
  } catch {
    return fallback
  }
}

function paraNumero(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0

  if (typeof valor === 'string') {
    const limpo = valor
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')

    const numero = Number(limpo)
    return Number.isFinite(numero) ? numero : 0
  }

  return 0
}

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor || 0)
}

export default function DashboardPage() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    const dados = lerStorage<Orcamento[]>('connect_orcamentos_salvos', [])
    setOrcamentos(Array.isArray(dados) ? dados : [])
    setCarregado(true)
  }, [])

  const totalOrcamentos = useMemo(() => orcamentos.length, [orcamentos])

  const valorTotal = useMemo(() => {
    return orcamentos.reduce((acc, item) => {
      return acc + paraNumero(item.total ?? item.valorTotal ?? item.valor)
    }, 0)
  }, [orcamentos])

  const aprovados = useMemo(() => {
    return orcamentos.filter((item) =>
      String(item.status || '').toLowerCase().includes('aprov')
    ).length
  }, [orcamentos])

  const taxaAprovacao = useMemo(() => {
    if (totalOrcamentos <= 0) return 0
    const taxa = Math.round((aprovados / totalOrcamentos) * 100)
    return Math.max(0, Math.min(100, taxa))
  }, [aprovados, totalOrcamentos])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#fff',
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <div
          style={{
            background: '#0f172a',
            borderRadius: 20,
            padding: 20,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            Dashboard
          </h1>
          <p
            style={{
              marginTop: 8,
              color: '#cbd5e1',
              fontWeight: 600,
            }}
          >
            Painel principal do sistema
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              borderRadius: 18,
              padding: 18,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800 }}>
              TOTAL DE ORÇAMENTOS
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              {carregado ? totalOrcamentos : '...'}
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              borderRadius: 18,
              padding: 18,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800 }}>
              VALOR TOTAL
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              {carregado ? formatarMoeda(valorTotal) : '...'}
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              borderRadius: 18,
              padding: 18,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800 }}>
              APROVADOS
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              {carregado ? aprovados : '...'}
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              borderRadius: 18,
              padding: 18,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800 }}>
              TAXA DE APROVAÇÃO
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              {carregado ? `${taxaAprovacao}%` : '...'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}