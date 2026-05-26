'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { emailDoUsuarioAuth, isUsuarioAdmin } from '@/lib/access'
import { useAssinatura } from '@/hooks/useAssinatura'

export default function TrialBanner() {
  const { snapshot, loading } = useAssinatura()
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    let ativo = true
    async function checar() {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!ativo) return
      setAdmin(isUsuarioAdmin({ email: emailDoUsuarioAuth(user) }))
    }
    void checar()
    return () => {
      ativo = false
    }
  }, [])

  if (admin || snapshot?.isAdminMaster) return null
  if (loading || !snapshot) return null
  if (!snapshot.emTrial && snapshot.ativo) return null

  const dias = snapshot.diasRestantesTrial ?? 0
  const urgente = dias <= 3

  if (!snapshot.emTrial && !snapshot.ativo) {
    return (
      <div
        style={{
          margin: '0 0 12px',
          padding: '14px 16px',
          borderRadius: 16,
          background: 'linear-gradient(135deg,#fef2f2,#fee2e2)',
          border: '1px solid #fca5a5',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 800, color: '#991b1b' }}>Sua assinatura precisa de atenção. Renove para continuar sem interrupções.</span>
        <Link href="/assinatura" style={{ padding: '8px 14px', borderRadius: 999, background: '#dc2626', color: '#fff', fontWeight: 900, textDecoration: 'none', fontSize: 13 }}>
          Renovar assinatura
        </Link>
      </div>
    )
  }

  return (
    <div
      style={{
        margin: '0 0 12px',
        padding: '14px 16px',
        borderRadius: 16,
        background: urgente
          ? 'linear-gradient(135deg,#fff7ed,#ffedd5)'
          : 'linear-gradient(135deg,#eff6ff,#dbeafe)',
        border: `1px solid ${urgente ? '#fdba74' : '#93c5fd'}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase', color: urgente ? '#c2410c' : '#1d4ed8' }}>
          Teste grátis
        </div>
        <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 15 }}>
          {dias === 0 ? 'Seu teste termina hoje' : `${dias} dia${dias === 1 ? '' : 's'} restantes no teste`}
        </div>
      </div>
      <Link
        href="/assinatura"
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
          color: '#fff',
          fontWeight: 900,
          textDecoration: 'none',
          fontSize: 13,
          boxShadow: '0 10px 24px rgba(37,99,235,.22)',
        }}
      >
        Escolher plano
      </Link>
    </div>
  )
}
