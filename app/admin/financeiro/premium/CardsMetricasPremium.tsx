'use client'

import { formatarMetrica } from '@/lib/financeiro-admin'
import type { MetricasFinanceiras } from '@/lib/financeiro-admin'

type Props = {
  metricas: MetricasFinanceiras
  isMobile: boolean
}

const CARDS = [
  {
    key: 'faturamentoPrevistoMes',
    titulo: 'Faturamento previsto',
    icon: '📈',
    glow: '0 0 32px rgba(99,102,241,0.35)',
    corIcon: '#a5b4fc',
  },
  {
    key: 'totalRecebido',
    titulo: 'Total recebido',
    icon: '💰',
    glow: '0 0 32px rgba(34,197,94,0.35)',
    corIcon: '#4ade80',
  },
  {
    key: 'totalAtrasado',
    titulo: 'Total atrasado',
    icon: '⚠️',
    glow: '0 0 32px rgba(239,68,68,0.32)',
    corIcon: '#f87171',
  },
  {
    key: 'clientesVencendoHoje',
    titulo: 'Vencendo hoje',
    icon: '⏰',
    glow: '0 0 32px rgba(245,158,11,0.32)',
    corIcon: '#fbbf24',
    suffixo: 'clientes',
  },
  {
    key: 'mrrEstimado',
    titulo: 'MRR estimado',
    icon: '🚀',
    glow: '0 0 32px rgba(14,165,233,0.35)',
    corIcon: '#7dd3fc',
  },
  {
    key: 'ticketMedio',
    titulo: 'Ticket médio',
    icon: '🎯',
    glow: '0 0 32px rgba(168,85,247,0.32)',
    corIcon: '#d8b4fe',
  },
] as const

export default function CardsMetricasPremium({ metricas, isMobile }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
      }}
    >
      {CARDS.map((card, index) => {
        const bruto = metricas[card.key as keyof MetricasFinanceiras]
        const valor =
          card.key === 'clientesVencendoHoje'
            ? String(bruto)
            : formatarMetrica(Number(bruto) || 0)

        return (
          <div
            key={card.key}
            className="fp-animate-in"
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 20,
              padding: isMobile ? 16 : 20,
              background:
                'linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: `${card.glow}, 0 16px 36px rgba(0,0,0,0.28)`,
              transition: 'transform .22s ease, box-shadow .22s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)'
              e.currentTarget.style.boxShadow = `${card.glow}, 0 24px 48px rgba(0,0,0,0.38)`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)'
              e.currentTarget.style.boxShadow = `${card.glow}, 0 16px 36px rgba(0,0,0,0.28)`
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -30,
                right: -30,
                width: 100,
                height: 100,
                borderRadius: 999,
                background: `radial-gradient(circle, ${card.corIcon}33 0%, transparent 70%)`,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 20,
                  background: 'rgba(15,23,42,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {card.icon}
              </span>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: 0.4 }}>
                {card.titulo}
              </div>
            </div>
            <div
              style={{
                fontSize: isMobile ? 28 : 34,
                fontWeight: 900,
                lineHeight: 1.1,
                marginTop: 14,
                color: '#f8fafc',
                position: 'relative',
              }}
            >
              {valor}
            </div>
            {'suffixo' in card && card.suffixo ? (
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginTop: 6 }}>
                {card.suffixo}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
