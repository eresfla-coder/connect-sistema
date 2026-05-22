'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { infoTrialAssinatura } from '@/lib/acesso-saas'
import {
  formatarMoeda,
  montarResumoAssinatura,
  type PerfilAssinatura,
} from '@/lib/assinatura-cobranca'
import { lerConfigEmpresaLocal } from '@/lib/connect-public'
import { montarMensagemRenovacao } from '@/lib/financeiro-admin'
import { carregarPerfilUsuario } from '@/lib/sync-perfil'
import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'
import { supabase } from '@/lib/supabase'

export default function BloqueadoPage() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<PerfilAssinatura | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      const { perfil: p } = await carregarPerfilUsuario({ forcar: true })
      if (!p) {
        router.replace('/login')
        return
      }
      setPerfil(p)
      setCarregando(false)
    }
    carregar()
  }, [router])

  const resumo = useMemo(
    () => (perfil ? montarResumoAssinatura(perfil) : null),
    [perfil],
  )

  const trial = useMemo(() => infoTrialAssinatura(perfil), [perfil])

  function telefoneSuporte() {
    const config = lerConfigEmpresaLocal()
    return (
      config.telefone ||
      process.env.NEXT_PUBLIC_CONNECT_SUPORTE_WHATSAPP ||
      ''
    )
  }

  function renovarSistema() {
    if (!resumo) return
    const msg = montarMensagemRenovacao(resumo)
    const tel = telefoneSuporte()
    if (tel) {
      abrirWhatsAppComTelefone(tel, msg)
      return
    }
    abrirWhatsAppComTelefone(resumo.telefone, msg)
  }

  function abrirWhatsApp() {
    const tel = telefoneSuporte()
    if (!tel) {
      alert('Configure o WhatsApp de suporte em Configurações (antes do bloqueio) ou contate o administrador.')
      return
    }
    const msg = `Olá! Minha assinatura do Connect Sistema está vencida/bloqueada (${perfil?.email || ''}). Quero renovar.`
    abrirWhatsAppComTelefone(tel, msg)
  }

  async function sair() {
    await supabase.auth.signOut()
    document.cookie = 'connect_auth=; path=/; max-age=0; samesite=lax'
    router.replace('/login')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #1e1b4b 0%, #020617 58%)',
        padding: 20,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'linear-gradient(180deg, #151f36 0%, #0b1224 100%)',
          boxShadow: '0 28px 60px rgba(0,0,0,0.42)',
          padding: 28,
          color: '#fff',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            margin: '0 auto 16px',
            borderRadius: 999,
            background: 'linear-gradient(135deg,#f97316,#dc2626)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 42,
            boxShadow: '0 20px 40px rgba(249,115,22,0.28)',
          }}
        >
          ⏳
        </div>

        <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1 }}>
          Assinatura vencida
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.78)',
            fontSize: 16,
            lineHeight: 1.55,
            marginTop: 12,
          }}
        >
          Seu período de uso encerrou. Renove para voltar ao painel premium com
          orçamentos, OS e cobrança integrada.
        </div>

        <div
          style={{
            marginTop: 22,
            padding: 18,
            borderRadius: 18,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Resumo da assinatura</div>
          {carregando || !resumo ? (
            <div style={{ color: 'rgba(255,255,255,0.70)' }}>Carregando...</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, color: 'rgba(255,255,255,0.88)' }}>
              <div>
                <strong>Cliente:</strong> {resumo.nomeCliente}
              </div>
              <div>
                <strong>E-mail:</strong> {perfil?.email || '—'}
              </div>
              <div>
                <strong>Status:</strong> {resumo.statusTexto}
              </div>
              <div>
                <strong>Vencimento:</strong> {resumo.vencimentoFormatado}
              </div>
              <div>
                <strong>Valor:</strong>{' '}
                {resumo.valorMensalidade > 0
                  ? formatarMoeda(resumo.valorMensalidade)
                  : 'consulte o suporte'}
              </div>
              {trial.emTrial ? (
                <div style={{ color: '#fde68a' }}>Conta em teste — renovação libera o plano completo.</div>
              ) : null}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            onClick={renovarSistema}
            style={{
              width: '100%',
              minHeight: 54,
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              color: '#fff',
              fontWeight: 900,
              fontSize: 16,
              cursor: 'pointer',
              boxShadow: '0 14px 28px rgba(249,115,22,0.28)',
            }}
          >
            🔄 Renovar sistema
          </button>

          <button
            type="button"
            onClick={abrirWhatsApp}
            style={{
              width: '100%',
              minHeight: 52,
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg,#22c55e,#16a34a)',
              color: '#fff',
              fontWeight: 900,
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            💬 Falar no WhatsApp
          </button>

          <button
            type="button"
            onClick={sair}
            style={{
              width: '100%',
              minHeight: 50,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: '#e5e7eb',
              color: '#111827',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}
