'use client'

import type { CSSProperties } from 'react'
import { FINANCEIRO_PREMIUM } from './theme'

export default function SkeletonPremium({ isMobile }: { isMobile: boolean }) {
  const bloco: CSSProperties = {
    borderRadius: FINANCEIRO_PREMIUM.cardRadius,
    minHeight: 110,
    background:
      'linear-gradient(90deg, rgba(51,65,85,0.35) 0%, rgba(100,116,139,0.55) 50%, rgba(51,65,85,0.35) 100%)',
    backgroundSize: '200% 100%',
    animation: 'fpShimmer 1.6s ease-in-out infinite',
    border: '1px solid rgba(255,255,255,0.06)',
  }

  return (
    <div style={{ display: 'grid', gap: 16, animation: 'fpFadeUp .4s ease' }}>
      <div style={{ ...bloco, minHeight: isMobile ? 160 : 200, borderRadius: 28 }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...bloco, minHeight: 88 }} />
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={bloco} />
        ))}
      </div>
      <div style={{ ...bloco, minHeight: isMobile ? 300 : 380, borderRadius: 28 }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ ...bloco, minHeight: 200 }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: '3px solid rgba(255,255,255,0.12)',
            borderTopColor: '#f97316',
            animation: 'fpSpin 1s linear infinite',
          }}
        />
        <span style={{ color: '#94a3b8', fontWeight: 700, alignSelf: 'center' }}>
          Carregando painel premium...
        </span>
      </div>
    </div>
  )
}
