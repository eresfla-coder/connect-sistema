'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  avancarPassoOnboarding,
  dispensarOnboarding,
  marcarPassoOnboarding,
  progressoOnboarding,
} from '@/lib/onboarding'

export default function OnboardingPremium() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [progresso, setProgresso] = useState(progressoOnboarding())

  const atualizar = useCallback(() => {
    setProgresso(progressoOnboarding())
  }, [])

  useEffect(() => {
    atualizar()
    const id = window.setInterval(atualizar, 2500)
    return () => window.clearInterval(id)
  }, [atualizar])

  useEffect(() => {
    if (progresso.deveExibir) setAberto(true)
  }, [progresso.deveExibir])

  if (!progresso.deveExibir && !aberto) return null

  const passoAtual = progresso.itens[progresso.passoAtual] || progresso.itens[0]

  function irParaPasso() {
    if (!passoAtual) return
    router.push(passoAtual.rota)
    setAberto(false)
  }

  function marcarWhatsApp() {
    marcarPassoOnboarding('whatsapp')
    atualizar()
  }

  return (
    <>
      {!aberto && progresso.deveExibir ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 45,
            border: 'none',
            borderRadius: 999,
            padding: '14px 18px',
            background: 'linear-gradient(135deg,#f97316,#ea580c)',
            color: '#fff',
            fontWeight: 900,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: '0 14px 32px rgba(249,115,22,0.35)',
          }}
        >
          🚀 Continuar onboarding ({progresso.percentual}%)
        </button>
      ) : null}

      {aberto ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(2,6,23,0.72)',
            backdropFilter: 'blur(6px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'linear-gradient(180deg, #132238 0%, #0b1426 100%)',
              color: '#fff',
              padding: 24,
              boxShadow: '0 28px 60px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2 }}>
              ONBOARDING PREMIUM
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8 }}>
              Configure seu Connect em minutos
            </div>
            <div style={{ color: '#cbd5e1', marginTop: 8, lineHeight: 1.5 }}>
              Siga o passo a passo para colocar sua operação no ar com experiência SaaS.
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: 8,
                }}
              >
                <span>Progresso</span>
                <span>
                  {progresso.feitos}/{progresso.total} · {progresso.percentual}%
                </span>
              </div>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progresso.percentual}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg,#22c55e,#16a34a)',
                    transition: 'width .35s ease',
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
              {progresso.itens.map((item) => (
                <div
                  key={item.passo}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: item.feito
                      ? 'rgba(34,197,94,0.12)'
                      : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${item.feito ? 'rgba(34,197,94,0.28)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{item.feito ? '✓' : '○'}</span>
                  <span style={{ fontWeight: 700, flex: 1 }}>{item.label}</span>
                </div>
              ))}
            </div>

            {passoAtual && !passoAtual.feito ? (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 14,
                  background: 'rgba(249,115,22,0.12)',
                  border: '1px solid rgba(249,115,22,0.28)',
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Próximo passo</div>
                <div style={{ color: '#fde68a' }}>{passoAtual.label}</div>
              </div>
            ) : null}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 20,
              }}
            >
              <button
                type="button"
                onClick={irParaPasso}
                style={btnPrimario}
              >
                Ir para o passo
              </button>
              {passoAtual?.passo === 'whatsapp' ? (
                <button type="button" onClick={marcarWhatsApp} style={btnSecundario}>
                  Marquei WhatsApp enviado
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  avancarPassoOnboarding()
                  atualizar()
                }}
                style={btnSecundario}
              >
                Próximo
              </button>
              <button
                type="button"
                onClick={() => {
                  dispensarOnboarding()
                  setAberto(false)
                  atualizar()
                }}
                style={btnSecundario}
              >
                Depois
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const btnPrimario: React.CSSProperties = {
  border: 'none',
  borderRadius: 12,
  padding: '12px 16px',
  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
}

const btnSecundario: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 12,
  padding: '12px 16px',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}
