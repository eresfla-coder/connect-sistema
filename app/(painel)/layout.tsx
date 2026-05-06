'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import PainelShell from './components/painel/PainelShell'
import { acessoBloqueado, avisoTrial, dataMaisDias, isAdminEmail, normalizarStatus } from '@/lib/access'
import { isDemoMode, seedDemoData } from '@/lib/connect-demo'

type PerfilPainel = {
  id: string
  email?: string | null
  ativo?: boolean | null
  status?: string | null
  vencimento?: string | null
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
      const emailNormalizado = String(user.email || '').trim().toLowerCase()

      if (isAdminEmail(emailNormalizado)) {
        router.replace('/admin')
        return
      }

      const { data: perfilExistente, error } = await supabase
        .from('perfis')
        .select('id,email,ativo,status,vencimento')
        .eq('id', user.id)
        .maybeSingle<PerfilPainel>()

      let perfil = perfilExistente

      if (error) {
        console.error('ERRO_PERFIL_PAINEL:', error)
      }

      if (!perfil) {
        const perfilNovo: PerfilPainel = {
          id: user.id,
          email: user.email ?? null,
          ativo: true,
          status: 'trial',
          vencimento: dataMaisDias(7),
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

      const aviso = avisoTrial(perfil)
      if (aviso) {
        try {
          sessionStorage.setItem(AVISO_KEY, aviso)
        } catch {}
      } else {
        try {
          sessionStorage.removeItem(AVISO_KEY)
        } catch {}
      }

      if (acessoBloqueado(perfil)) {
        router.replace('/bloqueado')
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
  }, [router, rotaPublicaImpressao])

  if (rotaPublicaImpressao) {
    return <>{children}</>
  }

  if (verificando) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at top left, rgba(59,130,246,0.10) 0%, #eef4ff 38%, #f8fbff 100%)',
          color: '#0f172a',
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        Validando acesso...
      </div>
    )
  }

  return (
    <PainelShell>
      {children}
    </PainelShell>
  )
}
