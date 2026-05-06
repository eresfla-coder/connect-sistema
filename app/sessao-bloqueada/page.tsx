'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SessaoBloqueadaPage() {
  const router = useRouter()
  const [motivo, setMotivo] = useState('Sua conta foi acessada em outro dispositivo. Por segurança, esta sessão foi encerrada.')

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem('connect_sessao_motivo')
      if (salvo) setMotivo(salvo)
    } catch {}
  }, [])

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: 'radial-gradient(circle at top left, rgba(59,130,246,0.18), #020617 42%, #000 100%)', color: '#fff' }}>
      <section style={{ width: '100%', maxWidth: 480, borderRadius: 30, padding: 30, background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 30px 90px rgba(0,0,0,0.48)', textAlign: 'center' }}>
        <div style={{ width: 86, height: 86, margin: '0 auto 18px', borderRadius: 26, background: 'linear-gradient(135deg, #2563eb, #06b6d4, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, boxShadow: '0 20px 44px rgba(37,99,235,0.32)' }}>🔐</div>
        <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12, letterSpacing: 2.5, fontWeight: 900, textTransform: 'uppercase' }}>Controle de Sessão Premium</p>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 950, letterSpacing: -0.8 }}>Sessão encerrada</h1>
        <p style={{ color: '#cbd5e1', lineHeight: 1.55, fontSize: 16, margin: '16px 0 22px' }}>{motivo}</p>
        <div style={{ padding: 14, borderRadius: 18, background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(147,197,253,0.18)', color: '#bfdbfe', fontSize: 13, lineHeight: 1.45, marginBottom: 22 }}>
          Por padrão, cada conta permite apenas uma sessão ativa. Se precisar usar em mais dispositivos, solicite upgrade do plano.
        </div>
        <button type="button" onClick={() => router.replace('/login')} style={{ width: '100%', height: 54, border: 'none', borderRadius: 18, background: 'linear-gradient(90deg, #2563eb, #16a34a)', color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer', boxShadow: '0 18px 36px rgba(37,99,235,0.28)' }}>
          Entrar novamente
        </button>
      </section>
    </main>
  )
}
