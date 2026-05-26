'use client'

import { useCallback, useEffect, useState } from 'react'

export type ToastTipo = 'success' | 'error' | 'info'

type ToastItem = {
  id: string
  mensagem: string
  tipo: ToastTipo
}

export function showConnectToast(mensagem: string, tipo: ToastTipo = 'success') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('connect-toast', { detail: { mensagem, tipo } }))
}

const CORES: Record<ToastTipo, { bg: string; border: string; icone: string }> = {
  success: { bg: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', border: '#86efac', icone: '✓' },
  error: { bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '#fca5a5', icone: '!' },
  info: { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '#93c5fd', icone: 'i' },
}

export default function ConnectToastProvider() {
  const [itens, setItens] = useState<ToastItem[]>([])

  const remover = useCallback((id: string) => {
    setItens((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<{ mensagem: string; tipo?: ToastTipo }>).detail
      const mensagem = String(detail?.mensagem || '').trim()
      if (!mensagem) return
      const tipo = detail?.tipo || 'success'
      const id = `${Date.now()}-${Math.random()}`
      setItens((prev) => [...prev.slice(-4), { id, mensagem, tipo }])
      window.setTimeout(() => remover(id), 4200)
    }
    window.addEventListener('connect-toast', onToast)
    return () => window.removeEventListener('connect-toast', onToast)
  }, [remover])

  if (!itens.length) return null

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'max(12px, env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 11000,
        display: 'grid',
        gap: 8,
        width: 'min(420px, calc(100vw - 24px))',
        pointerEvents: 'none',
      }}
    >
      {itens.map((t) => {
        const c = CORES[t.tipo]
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              borderRadius: 16,
              border: `1px solid ${c.border}`,
              background: c.bg,
              boxShadow: '0 18px 45px rgba(15,23,42,.14)',
              fontWeight: 800,
              color: '#0f172a',
              fontSize: 14,
              animation: 'landing-fade-up 0.35s ease both',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                background: '#fff',
                fontWeight: 950,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              {c.icone}
            </span>
            {t.mensagem}
          </div>
        )
      })}
    </div>
  )
}
