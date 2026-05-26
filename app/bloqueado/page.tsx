'use client'

import { useEffect, useState } from 'react'

export default function BloqueadoPage() {
  const [dadosBloqueio, setDadosBloqueio] = useState({
    status: 'bloqueado',
    dias: 0,
    vencimento: '',
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDadosBloqueio({
      status: params.get('status') || 'bloqueado',
      dias: Number(params.get('dias') || 0),
      vencimento: params.get('vencimento') || '',
    })
  }, [])

  const { status, dias, vencimento } = dadosBloqueio
  const diasTexto = dias > 0 ? `${dias} dia${dias === 1 ? '' : 's'} vencido${dias === 1 ? '' : 's'}` : 'Acesso pendente de regularização'

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'radial-gradient(circle at top left, rgba(249,115,22,0.18), transparent 28%), radial-gradient(circle at top right, rgba(59,130,246,0.16), transparent 32%), linear-gradient(180deg, #0b1220 0%, #020617 100%)' }}>
      <div style={{ width: '100%', maxWidth: 760, borderRadius: 30, padding: 28, border: '1px solid rgba(255,255,255,0.10)', background: 'linear-gradient(180deg, rgba(15,23,42,0.94), rgba(2,6,23,0.96))', boxShadow: '0 28px 70px rgba(0,0,0,0.30)', color: '#fff', textAlign: 'center' }}>
        <div style={{ width: 92, height: 92, borderRadius: 28, margin: '0 auto 18px', background: 'linear-gradient(135deg, rgba(249,115,22,0.20), rgba(59,130,246,0.18))', display: 'grid', placeItems: 'center', fontSize: 44 }}>🔒</div>
        <div style={{ color: '#93c5fd', fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', fontWeight: 900 }}>Connect Sistemas</div>
        <h1 style={{ margin: '10px 0 12px', fontSize: 38, lineHeight: 1.02, fontWeight: 900 }}>Seu acesso está bloqueado</h1>
        <p style={{ margin: '0 auto', maxWidth: 580, color: '#cbd5e1', lineHeight: 1.7, fontSize: 16 }}>Seu período de teste expirou, sua assinatura venceu ou a conta foi desativada. Fale com a Connect Sistemas para renovar e voltar a usar orçamento, OS e recibos normalmente.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginTop: 22, textAlign: 'left' }}>
          <div style={{ borderRadius: 18, padding: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.1 }}>Status</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 18, textTransform: 'capitalize' }}>{status}</strong>
          </div>
          <div style={{ borderRadius: 18, padding: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.1 }}>Assinatura</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 18 }}>{diasTexto}</strong>
          </div>
          <div style={{ borderRadius: 18, padding: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.1 }}>Vencimento</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 18 }}>{vencimento ? new Date(vencimento).toLocaleDateString('pt-BR') : '-'}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
          <a href="/assinatura" style={{ textDecoration: 'none', padding: '14px 20px', borderRadius: 18, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontWeight: 900, boxShadow: '0 14px 30px rgba(37,99,235,0.24)' }}>Renovar agora</a>
          <a href="https://wa.me/5584992181399?text=Ol%C3%A1!%20Quero%20renovar%20meu%20acesso%20ao%20Connect%20Sistemas." target="_blank" rel="noreferrer" style={{ textDecoration: 'none', padding: '14px 20px', borderRadius: 18, background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', fontWeight: 900, boxShadow: '0 14px 30px rgba(34,197,94,0.24)' }}>Falar no WhatsApp</a>
          <a href="/login" style={{ textDecoration: 'none', padding: '14px 20px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontWeight: 900 }}>Voltar ao login</a>
        </div>
      </div>
    </div>
  )
}
