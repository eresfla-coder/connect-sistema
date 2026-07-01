'use client'

/**
 * Layout do painel — valida sessão + /api/painel/acesso (1×).
 * onAuthStateChange: redirecionar /login SOMENTE em SIGNED_OUT (evita loop no TOKEN_REFRESHED).
 * @see docs/AUTENTICACAO-V1.md
 */
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import PainelShell from './components/painel/PainelShell'
import ConnectLoading from '@/components/ui/ConnectLoading'
import { consultarAcessoPainel } from '@/lib/connect-auth-client'
import { installDemoGuard, isDemoMode, logContextoAcessoSeguro, marcarSessaoReal, sairDemoMode, seedDemoData } from '@/lib/connect-demo'
import { cachearUserIdPainel } from '@/lib/connect-user-storage'
import { limparChavesGlobaisAposMigracao } from '@/lib/orcamentos-local'

const AVISO_KEY = 'connect_trial_notice'
const SESSAO_TIMEOUT_MS = 2500
const ACESSO_RETRY_MS = 900
const ACESSO_MAX_TENTATIVAS = 3
const SAFETY_TIMEOUT_MS = 20000

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

async function consultarAcessoComRetry(token: string): Promise<AcessoApiResponse> {
  let ultimo: AcessoApiResponse = { ok: false, reason: 'erro_rede' }

  for (let tentativa = 0; tentativa < ACESSO_MAX_TENTATIVAS; tentativa += 1) {
    ultimo = (await consultarAcessoPainel(token, { forcar: tentativa > 0 })) as AcessoApiResponse
    if (ultimo.ok) return ultimo

    const fatal = ultimo.reason === 'sem_sessao' || ultimo.reason === 'sessao_invalida'
    if (fatal) return ultimo

    if (tentativa < ACESSO_MAX_TENTATIVAS - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, ACESSO_RETRY_MS * (tentativa + 1)))
    }
  }

  return ultimo
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
  const [erroValidacao, setErroValidacao] = useState('')
  const validacaoConcluidaRef = useRef(false)

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
    validacaoConcluidaRef.current = false

    const safetyTimer = window.setTimeout(() => {
      if (!ativo || validacaoConcluidaRef.current) return
      console.warn('[painel] timeout de segurança — liberando painel sem bloquear')
      setVerificando(false)
    }, SAFETY_TIMEOUT_MS)

    async function verificarSessao() {
      setErroValidacao('')
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
          if (session.access_token) {
            acesso = await consultarAcessoComRetry(session.access_token)
          }

          if (!ativo) return

          if (!acesso?.ok) {
            if (acesso?.reason === 'timeout') {
              setErroValidacao('Validação demorou demais. Tente novamente.')
              setVerificando(false)
              return
            }
            if (acesso?.reason === 'sem_sessao' || acesso?.reason === 'sessao_invalida') {
              console.log('[PAINEL_REDIRECT]', { destino: '/login', reason: acesso?.reason })
              router.replace('/login')
              return
            }
            console.warn('[painel] validação parcial — sessão ok, API indisponível', acesso?.reason)
            validacaoConcluidaRef.current = true
            setVerificando(false)
            return
          }

          validacaoConcluidaRef.current = true

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
          console.log('[PAINEL_READY]', { userId: acesso.userId, admin: acesso.adminLogado })
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
          validacaoConcluidaRef.current = true
          setVerificando(false)
          return
        }

        validacaoConcluidaRef.current = true
        setVerificando(false)
        console.log('[PAINEL_REDIRECT]', { destino: '/login', motivo: 'sem_sessao' })
        router.replace('/login')
      } catch (error) {
        console.error('ERRO_VERIFICAR_SESSAO_PAINEL:', error)
        if (!ativo) return
        setErroValidacao('Não foi possível validar o acesso. Tente novamente.')
        validacaoConcluidaRef.current = true
        setVerificando(false)
      }
    }

    void verificarSessao()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!ativo) return

      if (event === 'SIGNED_OUT') {
        if (isDemoMode()) {
          setVerificando(false)
          return
        }
        console.log('[PAINEL_REDIRECT]', { destino: '/login', event })
        router.replace('/login')
      }
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
        {erroValidacao ? (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <p style={{ color: '#b91c1c', fontWeight: 700 }}>{erroValidacao}</p>
            <button
              type="button"
              onClick={() => {
                setVerificando(true)
                window.location.reload()
              }}
              style={{
                marginTop: 8,
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#0ea5e9',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return <PainelShell>{children}</PainelShell>
}
