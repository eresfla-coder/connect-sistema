'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import PainelShell from './components/painel/PainelShell'
import ConnectLoading from '@/components/ui/ConnectLoading'
import { acessoBloqueado, avisoTrial, dataMaisDias, emailDoUsuarioAuth, isUsuarioAdmin, normalizarStatus } from '@/lib/access'
import { installDemoGuard, isDemoMode, seedDemoData } from '@/lib/connect-demo'

type PerfilPainel = {
  id: string
  email?: string | null
  ativo?: boolean | null
  status?: string | null
  vencimento?: string | null
  plano_tier?: string | null
  role?: string | null
}

const AVISO_KEY = 'connect_trial_notice'

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [verificando, setVerificando] = useState(true)

  const rotaPublicaImpressao =
    pathname?.startsWith('/impressao-orcamento') ||
    pathname?.startsWith('/impressao-ordem-servico') ||
    pathname?.startsWith('/recibo-avulso')
  const rotaLivreAssinatura =
    pathname?.startsWith('/planos') ||
    pathname?.startsWith('/boas-vindas') ||
    pathname?.startsWith('/assinatura')

  useEffect(() => {
    installDemoGuard()
  }, [])

  useEffect(() => {
    if (rotaPublicaImpressao) {
      setVerificando(false)
      return
    }
    let ativo = true

    async function verificarSessao() {
      if (isDemoMode()) {
        seedDemoData(false)
        setVerificando(false)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!ativo) return

      if (!session?.user) {
        router.replace('/login')
        return
      }

      const user = session.user
      const emailNormalizado = emailDoUsuarioAuth(user)
      const { data: perfilExistente, error } = await supabase
        .from('perfis')
        .select('id,email,ativo,status,vencimento,plano_tier,role')
        .eq('id', user.id)
        .maybeSingle<PerfilPainel>()

      const adminLogado = isUsuarioAdmin({ email: emailNormalizado, perfil: perfilExistente })

      let perfil = perfilExistente

      if (error) {
        console.error('ERRO_PERFIL_PAINEL:', error)
      }

      if (!perfil) {
        const perfilNovo: PerfilPainel = {
          id: user.id,
          email: user.email ?? null,
          ativo: true,
          status: adminLogado ? 'ativo' : 'trial',
          vencimento: adminLogado ? '2099-12-31' : dataMaisDias(7).slice(0, 10),
          plano_tier: adminLogado ? 'empresa' : 'trial',
        }

        const { error: insertError } = await supabase.from('perfis').upsert(
          [perfilNovo],
          { onConflict: 'id' }
        )

        if (insertError) {
          console.error('ERRO_CRIAR_PERFIL_TRIAL:', insertError)
        }

        perfil = perfilNovo
      }

      if (!perfil) {
        router.replace('/bloqueado')
        return
      }

      const statusNormalizado = normalizarStatus(perfil.status)
      if (statusNormalizado !== perfil.status) {
        await supabase
          .from('perfis')
          .update({ status: statusNormalizado })
          .eq('id', user.id)
        perfil.status = statusNormalizado
      }

      if (adminLogado) {
        try {
          sessionStorage.removeItem(AVISO_KEY)
        } catch {}
        if (perfil.status === 'trial' || perfil.plano_tier === 'trial') {
          await supabase
            .from('perfis')
            .update({ status: 'ativo', ativo: true, plano_tier: 'empresa', vencimento: '2099-12-31' })
            .eq('id', user.id)
          perfil.status = 'ativo'
          perfil.ativo = true
        }
      } else {
        const aviso = avisoTrial(perfil, { email: emailNormalizado, perfil })
        if (aviso) {
          try {
            sessionStorage.setItem(AVISO_KEY, aviso)
          } catch {}
        } else {
          try {
            sessionStorage.removeItem(AVISO_KEY)
          } catch {}
        }
      }

      const vencimento = perfil.vencimento ? new Date(perfil.vencimento) : null
      const assinaturaVencida =
        !!vencimento &&
        !Number.isNaN(vencimento.getTime()) &&
        vencimento.getTime() < Date.now()
      const diasVencidos = assinaturaVencida
        ? Math.max(1, Math.ceil((Date.now() - vencimento.getTime()) / 86400000))
        : 0

      if (!adminLogado && assinaturaVencida && !rotaLivreAssinatura) {
        await supabase
          .from('perfis')
          .update({
            status: 'bloqueado',
            ativo: false,
            status_pagamento: 'vencido',
          })
          .eq('id', user.id)
        router.replace(`/bloqueado?status=vencido&dias=${diasVencidos}&vencimento=${encodeURIComponent(perfil.vencimento || '')}`)
        return
      }

      if (!adminLogado && acessoBloqueado(perfil) && !rotaLivreAssinatura) {
        router.replace(`/bloqueado?status=${encodeURIComponent(statusNormalizado)}&vencimento=${encodeURIComponent(perfil.vencimento || '')}`)
        return
      }

      setVerificando(false)
    }

    verificarSessao()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ativo) return

      if (isDemoMode()) {
        seedDemoData(false)
        setVerificando(false)
        return
      }

      if (!session?.user) {
        router.replace('/login')
        return
      }

      setVerificando(false)
    })

    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [router, rotaPublicaImpressao, rotaLivreAssinatura])

  if (rotaPublicaImpressao) {
    return <>{children}</>
  }

  if (verificando) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at top left, rgba(59,130,246,0.10) 0%, #eef4ff 38%, #f8fafc 100%)',
        }}
      >
        <ConnectLoading label="Validando acesso..." />
      </div>
    )
  }

  return (
    <PainelShell>
      {children}
    </PainelShell>
  )
}
