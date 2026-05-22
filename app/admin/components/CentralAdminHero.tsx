'use client'

import type { CSSProperties } from 'react'
import { NOME_SISTEMA_COBRANCA } from '@/lib/assinatura-cobranca'

type Props = {
  isMobile: boolean
  carregando: boolean
  onNovoCliente: () => void
  onAtualizarPainel: () => void
  onCopiarResumo: () => void
}

const btnBase: CSSProperties = {
  border: 'none',
  borderRadius: 14,
  padding: '12px 18px',
  fontWeight: 900,
  fontSize: 13,
  cursor: 'pointer',
  minHeight: 48,
  transition: 'transform .15s ease, box-shadow .15s ease',
}

export default function CentralAdminHero({
  isMobile,
  carregando,
  onNovoCliente,
  onAtualizarPainel,
  onCopiarResumo,
}: Props) {
  return (
    <header
      style={{
        background:
          'linear-gradient(135deg, rgba(249,115,22,0.22) 0%, rgba(99,102,241,0.18) 50%, rgba(15,23,42,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 24,
        padding: isMobile ? '20px 16px' : '28px 30px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.32)',
      }}
    >
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2 }}>
        CONNECT · ADMIN
      </div>
      <div style={{ fontSize: isMobile ? 28 : 40, fontWeight: 900, lineHeight: 1.05, marginBottom: 8 }}>
        Central Admin
      </div>
      <div style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 20, fontSize: isMobile ? 14 : 16 }}>
        Gestão SaaS — {NOME_SISTEMA_COBRANCA}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        <button
          type="button"
          disabled={carregando}
          onClick={onNovoCliente}
          style={{
            ...btnBase,
            flex: isMobile ? '1 1 100%' : '1 1 auto',
            background: 'linear-gradient(135deg,#22c55e,#16a34a)',
            color: '#052e16',
            boxShadow: '0 10px 24px rgba(34,197,94,0.28)',
            opacity: carregando ? 0.7 : 1,
          }}
        >
          Novo cliente
        </button>
        <button
          type="button"
          disabled={carregando}
          onClick={onAtualizarPainel}
          style={{
            ...btnBase,
            flex: isMobile ? '1 1 calc(50% - 5px)' : '1 1 auto',
            background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
            color: '#fff',
            boxShadow: '0 10px 24px rgba(59,130,246,0.28)',
            opacity: carregando ? 0.7 : 1,
          }}
        >
          Atualizar painel
        </button>
        <button
          type="button"
          disabled={carregando}
          onClick={onCopiarResumo}
          style={{
            ...btnBase,
            flex: isMobile ? '1 1 calc(50% - 5px)' : '1 1 auto',
            background: 'rgba(255,255,255,0.10)',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(8px)',
            opacity: carregando ? 0.7 : 1,
          }}
        >
          Copiar resumo
        </button>
      </div>
    </header>
  )
}
