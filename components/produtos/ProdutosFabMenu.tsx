'use client'

import { useState, type CSSProperties } from 'react'

type Props = {
  isMobile: boolean
  visivel: boolean
  onNovoProduto: () => void
  onCalcularPrecoM2: () => void
}

export function ProdutosFabMenu({ isMobile, visivel, onNovoProduto, onCalcularPrecoM2 }: Props) {
  const [aberto, setAberto] = useState(false)

  if (!visivel) return null

  const fab: CSSProperties = {
    width: isMobile ? 52 : 56,
    height: isMobile ? 52 : 56,
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
    color: '#fff',
    fontWeight: 950,
    fontSize: 24,
    cursor: 'pointer',
    boxShadow: '0 14px 36px rgba(37,99,235,.35)',
    display: 'grid',
    placeItems: 'center',
    transition: 'transform .2s ease',
  }

  const itemBtn: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 900,
    fontSize: 12,
    padding: '0 12px',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(15,23,42,.12)',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: isMobile ? 14 : 22,
        bottom: isMobile ? 'calc(14px + env(safe-area-inset-bottom, 0px))' : 22,
        zIndex: 850,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
      }}
    >
      {aberto ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <button
            type="button"
            style={itemBtn}
            onClick={() => {
              setAberto(false)
              onNovoProduto()
            }}
          >
            <span>➕</span> Novo produto
          </button>
          <button
            type="button"
            style={{ ...itemBtn, borderColor: '#bfdbfe', background: '#eff6ff' }}
            onClick={() => {
              setAberto(false)
              onCalcularPrecoM2()
            }}
          >
            <span>💡</span> Calcular preço m²
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={aberto ? 'Fechar menu' : 'Abrir menu de ações'}
        aria-expanded={aberto}
        style={{ ...fab, transform: aberto ? 'rotate(45deg)' : 'none' }}
        onClick={() => setAberto((v) => !v)}
      >
        +
      </button>
    </div>
  )
}
