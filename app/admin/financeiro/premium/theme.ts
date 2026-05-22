export const FINANCEIRO_PREMIUM = {
  bg: '#0b1220',
  grafite: 'linear-gradient(180deg, #1a2332 0%, #0f172a 55%, #0b1220 100%)',
  glass: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glowOrange: '0 0 40px rgba(249,115,22,0.22)',
  glowGreen: '0 0 36px rgba(34,197,94,0.20)',
  glowBlue: '0 0 36px rgba(14,165,233,0.22)',
  heroGradient:
    'linear-gradient(135deg, rgba(249,115,22,0.28) 0%, rgba(99,102,241,0.22) 38%, rgba(14,165,233,0.18) 72%, rgba(15,23,42,0.92) 100%)',
  cardRadius: 22,
  sectionRadius: 24,
} as const

export const ANIMACOES_FINANCEIRO_PREMIUM = `
@keyframes fpFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fpShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes fpGlowPulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.04); }
}
@keyframes fpBadgeFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes fpBarGrow {
  from { transform: scaleY(0.2); opacity: 0.4; }
  to { transform: scaleY(1); opacity: 1; }
}
@keyframes fpSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`

import type { CSSProperties } from 'react'

export function painelGlass(extra?: CSSProperties): CSSProperties {
  return {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: `1px solid ${FINANCEIRO_PREMIUM.glassBorder}`,
    borderRadius: FINANCEIRO_PREMIUM.sectionRadius,
    boxShadow: '0 24px 48px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.08)',
    ...extra,
  }
}
