'use client'

import Link from 'next/link'
import { formatarMetrica } from '@/lib/financeiro-admin'
import { NOME_SISTEMA_COBRANCA } from '@/lib/assinatura-cobranca'
import { FINANCEIRO_PREMIUM } from './theme'

type Props = {
  mrr: number
  recebido: number
  vencendoHoje: number
  totalClientes: number
  isMobile: boolean
  adminLiberado: boolean
}

export default function HeroFinanceiroPremium({
  mrr,
  recebido,
  vencendoHoje,
  totalClientes,
  isMobile,
  adminLiberado,
}: Props) {
  return (
    <header
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 28,
        padding: isMobile ? '22px 18px' : '32px 34px',
        background: FINANCEIRO_PREMIUM.heroGradient,
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: `${FINANCEIRO_PREMIUM.glowOrange}, 0 28px 60px rgba(0,0,0,0.35)`,
        animation: 'fpFadeUp .55s ease forwards',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -80,
          right: -40,
          width: 280,
          height: 280,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%)',
          animation: 'fpGlowPulse 5s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -60,
          left: -20,
          width: 220,
          height: 220,
          borderRadius: 999,
          background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <span
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              animation: 'fpBadgeFloat 3s ease-in-out infinite',
            }}
          >
            AAA Premium
          </span>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(34,197,94,0.18)',
              border: '1px solid rgba(34,197,94,0.35)',
              color: '#bbf7d0',
              fontSize: 11,
              fontWeight: 900,
              animation: 'fpBadgeFloat 3.2s ease-in-out infinite',
            }}
          >
            SaaS Live
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: isMobile ? 13 : 14,
                fontWeight: 800,
                color: 'rgba(255,255,255,0.72)',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Command Center · {NOME_SISTEMA_COBRANCA}
            </div>
            <div
              style={{
                fontSize: isMobile ? 30 : 44,
                fontWeight: 900,
                lineHeight: 1.05,
                marginTop: 8,
                background: 'linear-gradient(90deg, #fff 0%, #fde68a 45%, #7dd3fc 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Financeiro Premium
            </div>
          </div>

          <Link
            href="/admin/cobranca"
            style={{
              textDecoration: 'none',
              padding: '12px 18px',
              borderRadius: 14,
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#fdba74',
              fontWeight: 900,
              fontSize: 13,
              backdropFilter: 'blur(8px)',
            }}
          >
            Cobrança →
          </Link>
        </div>

        <div
          style={{
            marginTop: 22,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              padding: isMobile ? 18 : 22,
              borderRadius: 20,
              background: 'rgba(15,23,42,0.45)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: FINANCEIRO_PREMIUM.glowBlue,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: 1 }}>
              MRR ESTIMADO
            </div>
            <div
              style={{
                fontSize: isMobile ? 36 : 52,
                fontWeight: 900,
                lineHeight: 1,
                marginTop: 8,
                color: '#f8fafc',
                textShadow: '0 0 30px rgba(125,211,252,0.35)',
              }}
            >
              {formatarMetrica(mrr)}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
              Recebido no mês:{' '}
              <strong style={{ color: '#4ade80' }}>{formatarMetrica(recebido)}</strong>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            <HeroStat label="Clientes" valor={String(totalClientes)} cor="#a5b4fc" />
            <HeroStat label="Vence hoje" valor={String(vencendoHoje)} cor="#fde68a" />
          </div>
        </div>

        {!adminLiberado ? (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.3)',
              color: '#fde68a',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Modo resumido ativo — configure admin para visão completa.
          </div>
        ) : null}
      </div>
    </header>
  )
}

function HeroStat({
  label,
  valor,
  cor,
}: {
  label: string
  valor: string
  cor: string
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: cor }}>{valor}</div>
    </div>
  )
}
