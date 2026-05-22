'use client'

import { formatarMoeda } from '@/lib/assinatura-cobranca'
import { painelGlass } from './theme'

type Props = {
  ativos: number
  atrasados: number
  vencendoHoje: number
  emAberto: number
  isMobile: boolean
}

export default function RadarSaaSPremium({
  ativos,
  atrasados,
  vencendoHoje,
  emAberto,
  isMobile,
}: Props) {
  const itens = [
    {
      label: 'Ativos',
      valor: String(ativos),
      sub: 'assinaturas em dia',
      cor: '#4ade80',
      glow: '0 0 28px rgba(34,197,94,0.35)',
      icon: '✓',
    },
    {
      label: 'Atrasados',
      valor: String(atrasados),
      sub: 'precisam ação',
      cor: '#f87171',
      glow: '0 0 28px rgba(239,68,68,0.32)',
      icon: '!',
    },
    {
      label: 'Vence hoje',
      valor: String(vencendoHoje),
      sub: 'cobrança imediata',
      cor: '#fbbf24',
      glow: '0 0 28px rgba(245,158,11,0.32)',
      icon: '⏱',
    },
    {
      label: 'Em aberto',
      valor: formatarMoeda(emAberto),
      sub: 'hoje + atrasados',
      cor: '#93c5fd',
      glow: '0 0 28px rgba(59,130,246,0.28)',
      icon: '₿',
    },
  ]

  return (
    <section style={painelGlass({ padding: isMobile ? 16 : 20, animation: 'fpFadeUp .5s ease .05s forwards' })}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: '#94a3b8' }}>
            RADAR SAAS
          </div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, color: '#f8fafc' }}>
            Saúde da base em tempo real
          </div>
        </div>
        <span
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(34,197,94,0.2), rgba(14,165,233,0.2))',
            border: '1px solid rgba(255,255,255,0.14)',
            fontSize: 12,
            fontWeight: 900,
            animation: 'fpBadgeFloat 2.8s ease-in-out infinite',
          }}
        >
          Monitoramento ativo
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        {itens.map((item, index) => (
          <div
            key={item.label}
            style={{
              padding: isMobile ? 14 : 18,
              borderRadius: 18,
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: item.glow,
              animation: `fpFadeUp .45s ease ${index * 70}ms forwards`,
              transition: 'transform .2s ease, box-shadow .2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  color: item.cor,
                }}
              >
                LIVE
              </span>
            </div>
            <div
              style={{
                fontSize: isMobile ? 30 : 38,
                fontWeight: 900,
                lineHeight: 1,
                marginTop: 10,
                color: item.cor,
              }}
            >
              {item.valor}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginTop: 8 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
