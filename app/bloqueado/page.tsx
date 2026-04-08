'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PerfilInfo = {
  email?: string | null
  status?: string | null
  vencimento?: string | null
  ativo?: boolean | null
}

function formatarData(valor?: string | null) {
  if (!valor) return 'não informado'
  try {
    return new Date(valor).toLocaleDateString('pt-BR')
  } catch {
    return valor
  }
}

export default function BloqueadoPage() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<PerfilInfo | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const user = authData?.user
        if (!user) {
          router.replace('/login')
          return
        }

        const { data } = await supabase
          .from('perfis')
          .select('email, status, vencimento, ativo')
          .eq('id', user.id)
          .single()

        setPerfil(data || null)
      } finally {
        setCarregando(false)
      }
    }

    carregar()
  }, [router])

  function abrirWhatsApp() {
    try {
      const configSalva = localStorage.getItem('connect_configuracoes')
      const config = configSalva ? JSON.parse(configSalva) : {}
      const telefoneBruto = config?.telefone || config?.telefone_empresa || config?.whatsapp || config?.numero_whatsapp || ''
      const numero = String(telefoneBruto).replace(/\D/g, '')
      if (!numero) return alert('Cadastre o número do WhatsApp em Configurações.')
      const numeroFinal = numero.startsWith('55') ? numero : `55${numero}`
      const mensagem = 'Olá! Meu acesso ao sistema foi bloqueado e quero regularizar.'
      window.open(`https://wa.me/${numeroFinal}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener,noreferrer')
    } catch {
      alert('Não foi possível abrir o WhatsApp.')
    }
  }

  async function sair() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top, #0f172a 0%, #020617 55%)', padding: 20, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 560, borderRadius: 28, border: '1px solid rgba(255,255,255,0.10)', background: 'linear-gradient(180deg, #111c31 0%, #0b1426 100%)', boxShadow: '0 22px 55px rgba(0,0,0,0.34)', padding: 28, color: '#fff', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, margin: '0 auto 18px', borderRadius: 999, background: 'linear-gradient(135deg,#dc2626,#ef4444)', display: 'grid', placeItems: 'center', fontSize: 38, boxShadow: '0 18px 34px rgba(239,68,68,0.28)' }}>
          🔒
        </div>

        <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 10 }}>Acesso temporariamente bloqueado</div>
        <div style={{ color: 'rgba(255,255,255,0.76)', fontSize: 16, lineHeight: 1.55 }}>
          Seu acesso foi pausado por vencimento ou bloqueio administrativo.
          Entre em contato para renovar e liberar o sistema novamente.
        </div>

        <div style={{ marginTop: 22, padding: 18, borderRadius: 18, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Resumo do acesso</div>
          {carregando ? (
            <div style={{ color: 'rgba(255,255,255,0.70)' }}>Carregando informações...</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, color: 'rgba(255,255,255,0.82)' }}>
              <div><strong>E-mail:</strong> {perfil?.email || 'não encontrado'}</div>
              <div><strong>Status:</strong> {perfil?.status || 'não informado'}</div>
              <div><strong>Vencimento:</strong> {formatarData(perfil?.vencimento)}</div>
              <div><strong>Ativo:</strong> {perfil?.ativo ? 'Sim' : 'Não'}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
          <button onClick={abrirWhatsApp} style={{ width: '100%', minHeight: 52, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer', boxShadow: '0 12px 24px rgba(34,197,94,0.25)' }}>
            💬 Falar no WhatsApp
          </button>

          <button onClick={sair} style={{ width: '100%', minHeight: 50, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: '#e5e7eb', color: '#111827', fontWeight: 900, fontSize: 15, cursor: 'pointer' }}>
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}
