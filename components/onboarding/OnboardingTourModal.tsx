'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { marcarTourVisto, tourJaVisto } from '@/lib/onboardingChecklist'

const PASSOS = [
  {
    titulo: 'Bem-vindo ao Connect',
    texto: 'Seu painel reúne orçamentos, propostas, OS, clientes e financeiro em um só lugar.',
    icone: '🚀',
  },
  {
    titulo: 'Configure a empresa',
    texto: 'Logo, WhatsApp e segmento entram nos PDFs e mensagens automáticas.',
    icone: '🏢',
  },
  {
    titulo: 'Venda com proposta',
    texto: 'Crie proposta comercial, envie link e receba aprovação digital.',
    icone: '💼',
  },
  {
    titulo: 'Checklist guiado',
    texto: 'Siga os primeiros passos no canto da tela até dominar o fluxo.',
    icone: '✅',
  },
]

export default function OnboardingTourModal() {
  const [visivel, setVisivel] = useState(false)
  const [passo, setPasso] = useState(0)

  useEffect(() => {
    if (!tourJaVisto()) setVisivel(true)
  }, [])

  function fechar() {
    marcarTourVisto()
    setVisivel(false)
  }

  if (!visivel) return null

  const atual = PASSOS[passo]
  const ultimo = passo >= PASSOS.length - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15,23,42,.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          borderRadius: 24,
          background: '#fff',
          padding: 28,
          boxShadow: '0 30px 90px rgba(0,0,0,.35)',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>{atual.icone}</div>
        <div style={{ fontSize: 11, fontWeight: 950, color: '#2563eb', letterSpacing: '.16em', textTransform: 'uppercase' }}>
          Tour inicial · {passo + 1}/{PASSOS.length}
        </div>
        <h2 style={{ margin: '8px 0', fontSize: 26, fontWeight: 950, color: '#0f172a' }}>{atual.titulo}</h2>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>{atual.texto}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!ultimo ? (
            <button
              type="button"
              onClick={() => setPasso((p) => p + 1)}
              style={{ flex: 1, minHeight: 44, border: 'none', borderRadius: 14, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontWeight: 950, cursor: 'pointer' }}
            >
              Próximo
            </button>
          ) : (
            <Link
              href="/dashboard"
              onClick={fechar}
              style={{ flex: 1, minHeight: 44, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', fontWeight: 950, textDecoration: 'none' }}
            >
              Ir para o painel
            </Link>
          )}
          <button
            type="button"
            onClick={fechar}
            style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 900, cursor: 'pointer', color: '#64748b' }}
          >
            Pular
          </button>
        </div>
      </div>
    </div>
  )
}
