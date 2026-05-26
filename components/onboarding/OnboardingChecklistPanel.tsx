'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  CHECKLIST_ITENS,
  checklistCompleto,
  lerChecklistProgress,
  marcarChecklist,
  mesclarChecklistDetectado,
  progressoChecklistPercent,
  type ChecklistProgress,
} from '@/lib/onboardingChecklist'

export default function OnboardingChecklistPanel() {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(true)
  const [minimizado, setMinimizado] = useState(false)
  const [progress, setProgress] = useState<ChecklistProgress>({})

  function atualizar() {
    setProgress(mesclarChecklistDetectado())
  }

  useEffect(() => {
    atualizar()
    const onChange = () => atualizar()
    window.addEventListener('connect-checklist-change', onChange)
    window.addEventListener('storage', onChange)
    window.addEventListener('connect-data-change', onChange)
    return () => {
      window.removeEventListener('connect-checklist-change', onChange)
      window.removeEventListener('storage', onChange)
      window.removeEventListener('connect-data-change', onChange)
    }
  }, [pathname])

  useEffect(() => {
    if (checklistCompleto(progress)) setMinimizado(true)
  }, [progress])

  if (pathname?.startsWith('/impressao-') || pathname === '/boas-vindas') return null
  if (checklistCompleto(progress) && minimizado) return null

  const pct = progressoChecklistPercent(progress)

  return (
    <aside
      style={{
        position: 'fixed',
        right: 'max(12px, env(safe-area-inset-right))',
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 9000,
        width: minimizado ? 56 : 'min(360px, calc(100vw - 24px))',
        transition: 'width .2s ease',
      }}
    >
      {minimizado ? (
        <button
          type="button"
          onClick={() => setMinimizado(false)}
          title="Abrir checklist"
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            border: 'none',
            background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
            color: '#fff',
            fontWeight: 950,
            cursor: 'pointer',
            boxShadow: '0 16px 40px rgba(37,99,235,.35)',
          }}
        >
          {pct}%
        </button>
      ) : (
        <div
          style={{
            borderRadius: 20,
            border: '1px solid rgba(37,99,235,.22)',
            background: 'rgba(255,255,255,.98)',
            boxShadow: '0 22px 55px rgba(15,23,42,.18)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '12px 14px',
              background: 'linear-gradient(135deg,#0f172a,#1d4ed8)',
              color: '#fff',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .85 }}>
                Primeiros passos
              </div>
              <div style={{ fontSize: 15, fontWeight: 950 }}>Checklist {pct}%</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setMinimizado(true)}
                style={{ border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: '#fff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontWeight: 800, fontSize: 11 }}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                style={{ border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: '#fff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontWeight: 800, fontSize: 11 }}
              >
                {aberto ? '▾' : '▸'}
              </button>
            </div>
          </div>
          {aberto ? (
            <div style={{ padding: 12, maxHeight: 'min(52vh, 420px)', overflowY: 'auto' }}>
              <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#22c55e,#2563eb)', transition: 'width .25s ease' }} />
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {CHECKLIST_ITENS.map((item) => {
                  const done = Boolean(progress[item.id])
                  return (
                    <li
                      key={item.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 1fr auto',
                        gap: 8,
                        alignItems: 'start',
                        padding: 10,
                        borderRadius: 14,
                        border: `1px solid ${done ? 'rgba(34,197,94,.35)' : '#e2e8f0'}`,
                        background: done ? '#f0fdf4' : '#f8fafc',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          marcarChecklist(item.id, !done)
                          setProgress(lerChecklistProgress())
                        }}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 8,
                          border: `2px solid ${done ? '#16a34a' : '#94a3b8'}`,
                          background: done ? '#16a34a' : '#fff',
                          color: '#fff',
                          fontWeight: 900,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {done ? '✓' : ''}
                      </button>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>{item.titulo}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, lineHeight: 1.35, marginTop: 2 }}>{item.descricao}</div>
                      </div>
                      <Link
                        href={item.href}
                        style={{ fontSize: 11, fontWeight: 950, color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        {item.acao} →
                      </Link>
                    </li>
                  )
                })}
              </ul>
              <Link
                href="/boas-vindas"
                style={{ display: 'block', marginTop: 10, textAlign: 'center', fontSize: 12, fontWeight: 900, color: '#64748b', textDecoration: 'none' }}
              >
                Ver tour completo
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  )
}
