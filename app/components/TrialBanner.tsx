'use client'

import Link from 'next/link'
import type { InfoTrial } from '@/lib/acesso-saas'

type Props = {
  info: InfoTrial
  isMobile: boolean
}

export default function TrialBanner({ info, isMobile }: Props) {
  if (!info.textoBanner) return null

  const urgente =
    info.expirado ||
    info.diasRestantes === 0 ||
    (info.diasRestantes !== null && info.diasRestantes <= 2)

  return (
    <div
      style={{
        marginBottom: 14,
        padding: isMobile ? '12px 14px' : '14px 18px',
        borderRadius: 16,
        background: urgente
          ? 'linear-gradient(135deg, rgba(239,68,68,0.22), rgba(249,115,22,0.18))'
          : 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(34,197,94,0.14))',
        border: `1px solid ${urgente ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.14)'}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontWeight: 800, color: '#fff', fontSize: isMobile ? 13 : 14 }}>
        {info.emTrial ? '⏳' : '📅'} {info.textoBanner}
        {info.vencimentoFormatado !== '—' ? (
          <span style={{ opacity: 0.85 }}> · vence {info.vencimentoFormatado}</span>
        ) : null}
      </div>
      <Link
        href="/conta"
        style={{
          textDecoration: 'none',
          padding: '8px 14px',
          borderRadius: 10,
          background: 'rgba(15,23,42,0.55)',
          color: '#fde68a',
          fontWeight: 900,
          fontSize: 12,
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        Minha assinatura →
      </Link>
    </div>
  )
}
