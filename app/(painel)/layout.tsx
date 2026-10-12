'use client'

/**
 * Layout do painel — valida sessão + /api/painel/acesso (decisão em lib/painel-acesso-guard).
 * Conteúdo protegido só renderiza com confirmação positiva; falha técnica mostra "Tentar novamente".
 * onAuthStateChange: redirecionar /login SOMENTE em SIGNED_OUT (evita loop no TOKEN_REFRESHED).
 * @see docs/AUTENTICACAO-V1.md
 */
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import PainelShell from './components/painel/PainelShell'
import ConnectStartupSplash from '@/components/ui/ConnectStartupSplash'
import SessionControl from '@/app/components/SessionControl'
import { consultarAcessoPainel } from '@/lib/connect-auth-client'
import { installDemoGuard, isDemoMode, logContextoAcessoSeguro, marcarSessaoReal, sairDemoMode, seedDemoData } from '@/lib/connect-demo'
import { cachearUserIdPainel } from '@/lib/connect-user-storage'
import { limparChavesGlobaisAposMigracao } from '@/lib/orcamentos-local'
import {
  MENSAGEM_ACESSO_INDISPONIVEL,
  SESSAO_TIMEOUT_MS,
  executarVerificacaoPainel,
  type RespostaAcessoPainel,
  type SessaoPainel,
} from '@/lib/painel-acesso-guard'

const AVISO_KEY = 'connect_trial_notice'

async function getSessionComTimeout(ms: number): Promise<SessaoPainel> {
  return Promise.race([
    supabase.auth.getSession() as Promise<SessaoPainel>,
    new Promise<SessaoPainel>((resolve) => {
      setTimeout(() => resolve({ data: { session: null }, error: { message: 'timeout' } }), ms)
    }),
  ])
}

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [verificando, setVerificando] = useState(true)
  const [erroValidacao, setErroValidacao] = useState('')
  const [tentativaVerificacao, setTentativaVerificacao] = useState(0)

  const rotaPublicaImpressao =
    pathname?.startsWith('/impressao-orcamento') ||
    pathname?.startsWith('/impressao-ordem-servico')
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
    // Toda (re)verificação começa fechada: navegação de rota livre para protegida não mostra conteúdo antes da decisão.
    setVerificando(true)
    setErroValidacao('')

    async function verificarSessao() {
      const decisao = await executarVerificacaoPainel({
        obterSessao: () => getSessionComTimeout(SESSAO_TIMEOUT_MS),
        consultar: (token, opts) => consultarAcessoPainel(token, opts) as Promise<RespostaAcessoPainel>,
        esperar: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        demo: isDemoMode,
        rotaLivreAssinatura: Boolean(rotaLivreAssinatura),
        forcar: tentativaVerificacao > 0,
        aoObterSessao: (userId) => {
          marcarSessaoReal()
          sairDemoMode()
          cachearUserIdPainel(userId)
          limparChavesGlobaisAposMigracao(userId)
        },
      })

      if (!ativo) return

      switch (decisao.acao) {
        case 'liberar': {
          const acesso = decisao.acesso!
          try {
            if (acesso.avisoTrial) sessionStorage.setItem(AVISO_KEY, acesso.avisoTrial)
            else sessionStorage.removeItem(AVISO_KEY)
          } catch {}
          logContextoAcessoSeguro({
            userId: acesso.userId,
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
        case 'liberar_demo':
          seedDemoData(false)
          logContextoAcessoSeguro({ isDemo: true, isTrial: false, isAdmin: false, perfilStatus: 'demo' })
          setVerificando(false)
          return
        case 'bloquear':
          router.replace(decisao.destino!)
          return
        case 'login':
          console.log('[PAINEL_REDIRECT]', { destino: '/login', reason: decisao.motivo })
          router.replace('/login')
          return
        case 'manutencao':
          router.replace('/manutencao')
          return
        default:
          console.warn('[painel] acesso não confirmado — painel mantido fechado', decisao.motivo)
          setErroValidacao(decisao.mensagem || MENSAGEM_ACESSO_INDISPONIVEL)
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
      subscription.unsubscribe()
    }
  }, [router, rotaPublicaImpressao, rotaLivreAssinatura, tentativaVerificacao])

  if (rotaPublicaImpressao) {
    return <>{children}</>
  }

  if (verificando) {
    return (
      <>
        <ConnectStartupSplash
          primaryMessage={erroValidacao ? erroValidacao : 'Preparando seu ambiente...'}
          secondaryMessage={
            erroValidacao ? 'Toque em "Tentar novamente" para verificar outra vez.' : 'Carregando seus dados e configurações...'
          }
        />
        {erroValidacao ? (
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 'max(24px, env(safe-area-inset-bottom))',
              transform: 'translateX(-50%)',
              zIndex: 2,
              textAlign: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setTentativaVerificacao((n) => n + 1)}
              style={{
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
      </>
    )
  }

  return (
    <>
      {!isDemoMode() ? <SessionControl /> : null}
      <PainelShell>{children}</PainelShell>
    </>
  )
}
