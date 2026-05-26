'use client'

import Link from 'next/link'
import {
  mensagemUpgradeModulo,
  tierRecomendadoParaModulo,
  type ModuloPremium,
} from '@/lib/assinaturaAcesso'
import { PLANOS_CATALOGO } from '@/lib/planosSaaS'

type Props = {
  modulo: ModuloPremium
  compact?: boolean
}

export default function UpgradePrompt({ modulo, compact = false }: Props) {
  const tier = tierRecomendadoParaModulo(modulo)
  const plano = PLANOS_CATALOGO[tier]

  return (
    <div
      style={{
        borderRadius: compact ? 16 : 22,
        padding: compact ? 16 : 24,
        background: 'linear-gradient(135deg,#f8fafc,#eff6ff)',
        border: '1px solid #bfdbfe',
        boxShadow: '0 16px 40px rgba(37,99,235,.08)',
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase', color: '#2563eb' }}>
        Upgrade premium
      </div>
      <h3 style={{ margin: '8px 0 6px', fontSize: compact ? 18 : 22, fontWeight: 950, color: '#0f172a' }}>
        Desbloqueie com o plano {plano.nome}
      </h3>
      <p style={{ margin: '0 0 14px', color: '#64748b', fontWeight: 700, lineHeight: 1.45 }}>{mensagemUpgradeModulo(modulo)}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Link
          href={`/planos?tier=${tier}`}
          style={{
            padding: '10px 16px',
            borderRadius: 999,
            background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
            color: '#fff',
            fontWeight: 900,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          Ver plano {plano.nome}
        </Link>
        <Link href="/assinatura" style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid #cbd5e1', color: '#334155', fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>
          Minha assinatura
        </Link>
      </div>
    </div>
  )
}
