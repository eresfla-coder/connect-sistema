'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import PainelShell from './components/painel/PainelShell'
import ConnectLoading from '@/components/ui/ConnectLoading'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { installDemoGuard, isDemoMode, logContextoAcessoSeguro, marcarSessaoReal, sairDemoMode, seedDemoData } from '@/lib/connect-demo'
import { cachearUserIdPainel } from '@/lib/connect-user-storage'
import { limparChavesGlobaisAposMigracao } from '@/lib/orcamentos-local'

const AVISO_KEY = 'connect_trial_notice'
const SESSAO_TIMEOUT_MS = 1500
const ACESSO_API_TIMEOUT_MS = 8000
const SAFETY_TIMEOUT_MS = 10000

type AcessoApiResponse = {
  ok: boolean
  reason?: string
  userId?: string
  email?: string
  adminLogado?: boolean
  avisoTrial?: string | null
  bloqueado?: boolean
  assinaturaVencida?: boolean
  diasVencidos?: number
  statusNormalizado?: string
  perfil?: { vencimento?: string | null; status?: string | null }
  isTrial?: boolean
}

type SessaoRapida = {
  data: { session: { user?: { id: string }; access_token?: string } | null }
  error: { message: string } | null
}

async function getSessionComTimeout(ms: number): Promise<SessaoRapida> {
  return Promise.race([
    supabase.auth.getSession() as Promise<SessaoRapida>,
    new Promise<SessaoRapida>((resolve) => {
      setTimeout(() => resolve({ data: { session: null }, error: { message: 'timeout' } }), ms)
    }),
  ])
}

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [verificando, setVerificando] = useState(true)
  const [avisoLento, setAvisoLento] = useState(false)

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

    const safetyTimer = window.setTimeout(() => {
      if (!ativo) return
      console.warn('[painel] timeout de segurança — liberando painel em modo degradado')
      setAvisoLento(true)
      setVerificando(false)
    }, SAFETY_TIMEOUT_MS)

    async function consultarAcessoApi(token: string) {
      const res = await fetchWithTimeout(
        '/api/painel/acesso',
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
        ACESSO_API_TIMEOUT_MS,
      )
      return (await res.json().catch(() => null)) as AcessoApiResponse | null
    }

    async function verificarSessao() {
      try {
        const { data: { session }, error } = await getSessionComTimeout(SESSAO_TIMEOUT_MS)

        if (!ativo) return

        if (error?.message === 'timeout') {
          router.replace('/manutencao')
          return
        }

        if (session?.user) {
          marcarSessaoReal()
          sairDemoMode()
          cachearUserIdPainel(session.user.id)
          limparChavesGlobaisAposMigracao(session.user.id)

          let acesso: AcessoApiResponse | null = null
          try {
            if (session.access_token) {
              acesso = await consultarAcessoApi(session.access_token)
            }
          } catch (apiError) {
            console.warn('[painel] API de acesso indisponível — modo degradado', apiError)
            setAvisoLento(true)
            setVerificando(false)
            return
          }

          if (!ativo) return

          if (!acesso?.ok) {
            if (acesso?.reason === 'timeout') {
              router.replace('/manutencao')
              return
            }
            if (acesso?.reason === 'sem_sessao' || acesso?.reason === 'sessao_invalida') {
              router.replace('/login')
              return
            }
            setAvisoLento(true)
            setVerificando(false)
            return
          }

          if (acesso.avisoTrial) {
            try {
              sessionStorage.setItem(AVISO_KEY, acesso.avisoTrial)
            } catch {}
          } else {
            try {
              sessionStorage.removeItem(AVISO_KEY)
            } catch {}
          }

          if (acesso.bloqueado && !rotaLivreAssinatura) {
            if (acesso.assinaturaVencida) {
              router.replace(
                `/bloqueado?status=vencido&dias=${acesso.diasVencidos || 1}&vencimento=${encodeURIComponent(acesso.perfil?.vencimento || '')}`,
              )
              return
            }
            router.replace(
              `/bloqueado?status=${encodeURIComponent(acesso.statusNormalizado || 'bloqueado')}&vencimento=${encodeURIComponent(acesso.perfil?.vencimento || '')}`,
            )
            return
          }

          logContextoAcessoSeguro({
            userId: acesso.userId || session.user.id,
            email: acesso.email || null,
            isDemo: false,
            isTrial: Boolean(acesso.isTrial),
            isAdmin: Boolean(acesso.adminLogado),
            perfilStatus: acesso.perfil?.status || null,
          })

          setVerificando(false)
          return
        }

        if (isDemoMode()) {
          seedDemoData(false)
          logContextoAcessoSeguro({
            isDemo: true,
            isTrial: false,
            isAdmin: false,
            perfilStatus: 'demo',
          })
          setVerificando(false)
          return
        }

        setVerificando(false)
        router.replace('/login')
      } catch (error) {
        console.error('ERRO_VERIFICAR_SESSAO_PAINEL:', error)
        if (!ativo) return
        setAvisoLento(true)
        setVerificando(false)
      }
    }

    void verificarSessao()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!ativo) return

      if (session?.user) {
        marcarSessaoReal()
        sairDemoMode()
        cachearUserIdPainel(session.user.id)
        setVerificando(false)
        return
      }

      if (isDemoMode()) {
        seedDemoData(false)
        setVerificando(false)
        return
      }

      router.replace('/login')
    })

    return () => {
      ativo = false
      window.clearTimeout(safetyTimer)
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
    <>
      {avisoLento ? (
        <div
          style={{
            background: '#fff7ed',
            borderBottom: '1px solid #fed7aa',
            color: '#9a3412',
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          Modo degradado: validação completa indisponível. Seus dados locais continuam acessíveis.
        </div>
      ) : null}
      <PainelShell>{children}</PainelShell>
    </>
  )
}
