'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'

type Metricas = {
  mrr: number
  assinantesAtivos: number
  testesGratis: number
  cancelamentos: number
  conversaoTrialPercent: number
  churnPercent: number
  renovacaoAutomatica: number
  porPlano: Record<string, number>
  pagamentos90d: number
  receita90d: number
}

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AdminAssinaturasMetricas() {
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregar() {
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session?.session?.access_token
        if (!token) return

        const res = await fetch('/api/admin/assinaturas/metricas', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok || !payload?.ok) {
          setErro(payload?.message || 'Falha ao carregar métricas SaaS.')
          return
        }
        setMetricas(payload.metricas)
      } catch (e: any) {
        setErro(e?.message || 'Erro de rede.')
      } finally {
        setLoading(false)
      }
    }
    void carregar()
  }, [])

  if (loading) return <div style={{ padding: 16, fontWeight: 800, color: '#64748b' }}>Carregando métricas de assinatura...</div>
  if (erro) return <div style={{ padding: 16, color: '#b45309', fontWeight: 800 }}>{erro}</div>
  if (!metricas) return null

  const cards = [
    { label: 'MRR estimado', value: money(metricas.mrr), color: '#16a34a' },
    { label: 'Assinantes ativos', value: String(metricas.assinantesAtivos), color: '#2563eb' },
    { label: 'Testes grátis', value: String(metricas.testesGratis), color: '#d97706' },
    { label: 'Cancelamentos', value: String(metricas.cancelamentos), color: '#dc2626' },
    { label: 'Conversão trial', value: `${metricas.conversaoTrialPercent}%`, color: '#7c3aed' },
    { label: 'Receita 90 dias', value: money(metricas.receita90d), color: '#0f766e' },
  ]

  return (
    <section style={{ marginTop: 18, borderRadius: 22, padding: 18, background: 'rgba(15,23,42,.55)', border: '1px solid rgba(148,163,184,.25)' }}>
      <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.16em', textTransform: 'uppercase', color: '#93c5fd', marginBottom: 10 }}>
        Assinatura SaaS • Métricas
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ borderRadius: 14, padding: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 950, color: c.color, marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, fontWeight: 800, color: '#cbd5e1' }}>
        <span>Starter: {metricas.porPlano?.starter || 0}</span>
        <span>Pro: {metricas.porPlano?.pro || 0}</span>
        <span>Empresa: {metricas.porPlano?.empresa || 0}</span>
        <span>Renovação auto: {metricas.renovacaoAutomatica}</span>
        <span>Churn risco: {metricas.churnPercent}%</span>
      </div>
    </section>
  )
}
