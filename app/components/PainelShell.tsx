'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type MenuItem = {
  nome: string
  href: string
  icone: string
  destaque?: boolean
  badge?: string
}

type PerfilAcesso = {
  id: string
  email?: string | null
  ativo?: boolean | null
  status?: string | null
  vencimento?: string | null
}

function venceuPerfil(vencimento?: string | null) {
  if (!vencimento) return false
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dataVencimento = new Date(vencimento)
  dataVencimento.setHours(0, 0, 0, 0)
  return dataVencimento < hoje
}

export default function PainelShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const [menuAberto, setMenuAberto] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [itemPressionado, setItemPressionado] = useState<string | null>(null)
  const [orcamentosBadge, setOrcamentosBadge] = useState('0')
  const [osBadge, setOsBadge] = useState('0')
  const [carregandoAcesso, setCarregandoAcesso] = useState(true)
  const [perfil, setPerfil] = useState<PerfilAcesso | null>(null)

  useEffect(() => {
    const verificarTela = () => setIsMobile(window.innerWidth <= 900)
    verificarTela()
    window.addEventListener('resize', verificarTela)
    return () => window.removeEventListener('resize', verificarTela)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isMobile && menuAberto ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobile, menuAberto])

  useEffect(() => {
    function atualizarBadges() {
      try {
        const salvosOrc = localStorage.getItem('connect_orcamentos_salvos')
        const listaOrc = salvosOrc ? JSON.parse(salvosOrc) : []
        setOrcamentosBadge(String(Array.isArray(listaOrc) ? listaOrc.length : 0))
      } catch {
        setOrcamentosBadge('0')
      }

      try {
        const salvosOs = localStorage.getItem('connect_ordens_servico_salvas')
        const listaOs = salvosOs ? JSON.parse(salvosOs) : []
        setOsBadge(String(Array.isArray(listaOs) ? listaOs.length : 0))
      } catch {
        setOsBadge('0')
      }
    }

    atualizarBadges()
    window.addEventListener('storage', atualizarBadges)
    return () => window.removeEventListener('storage', atualizarBadges)
  }, [])

  useEffect(() => {
    let componenteAtivo = true

    async function verificarAcesso() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const user = authData?.user

        if (!user) {
          router.replace('/login')
          return
        }

        const { data: perfilData, error } = await supabase
          .from('perfis')
          .select('id, email, ativo, status, vencimento')
          .eq('id', user.id)
          .single()

        if (error || !perfilData) {
          router.replace('/bloqueado')
          return
        }

        if (!componenteAtivo) return

        setPerfil(perfilData)

        const bloqueado =
          perfilData.ativo === false ||
          perfilData.status === 'bloqueado' ||
          venceuPerfil(perfilData.vencimento)

        if (bloqueado) {
          router.replace('/bloqueado')
          return
        }

        setCarregandoAcesso(false)
      } catch {
        router.replace('/bloqueado')
      }
    }

    verificarAcesso()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace('/login')
    })

    return () => {
      componenteAtivo = false
      subscription.unsubscribe()
    }
  }, [router])

  function abrirWhatsApp() {
    try {
      const configSalva = localStorage.getItem('connect_configuracoes')
      const config = configSalva ? JSON.parse(configSalva) : {}
      const telefoneBruto =
        config?.telefone ||
        config?.telefone_empresa ||
        config?.whatsapp ||
        config?.numero_whatsapp ||
        ''

      const numero = String(telefoneBruto).replace(/\D/g, '')
      if (!numero) {
        alert('Cadastre o número do WhatsApp em Configurações.')
        return
      }

      const numeroFinal = numero.startsWith('55') ? numero : `55${numero}`
      const mensagem = 'Olá! Gostaria de falar com você.'

      window.open(
        `https://wa.me/${numeroFinal}?text=${encodeURIComponent(mensagem)}`,
        '_blank',
        'noopener,noreferrer'
      )
    } catch (error) {
      console.error('Erro ao abrir WhatsApp:', error)
      alert('Não foi possível abrir o WhatsApp.')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menu: MenuItem[] = useMemo(
    () => [
      { nome: 'Dashboard Gerencial', href: '/dashboard', icone: '📊' },
      { nome: 'Orçamentos', href: '/orcamentos', icone: '💰', destaque: true, badge: orcamentosBadge },
      { nome: 'Ordem de Serviço', href: '/ordens-servico', icone: '🔧', badge: osBadge },
      { nome: 'Cadastro de Clientes', href: '/clientes', icone: '👥' },
      { nome: 'Cadastro de Produtos', href: '/produtos', icone: '📦' },
      { nome: 'Formas de Pagamento', href: '/formas-pagamento', icone: '💳' },
      { nome: 'Categorias', href: '/categorias', icone: '📂' },
      { nome: 'Configurações', href: '/configuracoes', icone: '⚙️' },
    ],
    [orcamentosBadge, osBadge]
  )

  function corItem(item: MenuItem, ativo: boolean) {
    if (ativo) return 'linear-gradient(135deg,#f97316,#ea580c)'
    if (item.destaque) return 'linear-gradient(135deg,#22c55e,#16a34a)'
    return 'rgba(255,255,255,0.10)'
  }

  function sombraItem(item: MenuItem, ativo: boolean) {
    if (itemPressionado === item.href) return '0 2px 8px rgba(0,0,0,0.24)'
    if (ativo) return '0 8px 20px rgba(249,115,22,0.32)'
    if (item.destaque) return '0 8px 20px rgba(34,197,94,0.28)'
    return 'none'
  }

  if (carregandoAcesso) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#020617',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: 'linear-gradient(180deg, #12203a 0%, #0f1b31 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 22,
            padding: 24,
            color: '#fff',
            textAlign: 'center',
            boxShadow: '0 20px 48px rgba(0,0,0,0.30)',
          }}
        >
          <div
            style={{
              width: 58,
              height: 58,
              margin: '0 auto 14px',
              borderRadius: 999,
              border: '4px solid rgba(255,255,255,0.14)',
              borderTopColor: '#22c55e',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
            Verificando acesso
          </div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 600 }}>
            Carregando seu painel com segurança...
          </div>
          <style jsx>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#020617' }}>
      <button
        onClick={() => setMenuAberto(!menuAberto)}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 60,
          width: 46,
          height: 46,
          borderRadius: 14,
          border: 'none',
          background: '#e5e7eb',
          color: '#111827',
          fontSize: 24,
          cursor: 'pointer',
          display: isMobile ? 'block' : 'none',
          boxShadow: '0 10px 22px rgba(0,0,0,0.25)',
        }}
      >
        ☰
      </button>

      {menuAberto && isMobile && (
        <div
          onClick={() => setMenuAberto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 40,
            backdropFilter: 'blur(3px)',
          }}
        />
      )}

      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside
          style={{
            width: 280,
            background: 'linear-gradient(180deg, #2b4467 0%, #1f3554 100%)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '8px 0 24px rgba(0,0,0,0.18)',
            position: isMobile ? 'fixed' : 'relative',
            top: 0,
            left: 0,
            transform: isMobile ? (menuAberto ? 'translateX(0)' : 'translateX(-105%)') : 'translateX(0)',
            height: '100vh',
            zIndex: 50,
            transition: 'transform 0.28s ease',
            overflowY: 'auto',
            willChange: 'transform',
          }}
        >
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img src="/logo-connect.png" style={{ width: 100 }} alt="Logo Connect" />
              <div style={{ color: '#fff', fontWeight: 800 }}>CONNECT SISTEMA</div>

              {perfil?.email ? (
                <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 6 }}>
                  {perfil.email}
                </div>
              ) : null}

              {perfil?.status ? (
                <div
                  style={{
                    display: 'inline-flex',
                    marginTop: 8,
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 900,
                    background:
                      perfil.status === 'ativo'
                        ? 'rgba(34,197,94,0.18)'
                        : perfil.status === 'teste'
                        ? 'rgba(59,130,246,0.18)'
                        : 'rgba(239,68,68,0.18)',
                    color:
                      perfil.status === 'ativo'
                        ? '#dcfce7'
                        : perfil.status === 'teste'
                        ? '#dbeafe'
                        : '#fee2e2',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                >
                  {perfil.status === 'ativo'
                    ? 'Plano ativo'
                    : perfil.status === 'teste'
                    ? 'Teste grátis'
                    : 'Acesso bloqueado'}
                </div>
              ) : null}
            </div>

            <nav style={{ display: 'grid', gap: 10 }}>
              {menu.map((item) => {
                const ativo = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setMenuAberto(false)}
                    onMouseDown={() => setItemPressionado(item.href)}
                    onMouseUp={() => setItemPressionado(null)}
                    onMouseLeave={() => setItemPressionado(null)}
                    onTouchStart={() => setItemPressionado(item.href)}
                    onTouchEnd={() => setItemPressionado(null)}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: corItem(item, ativo),
                        color: '#fff',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        boxShadow: sombraItem(item, ativo),
                        border: ativo
                          ? '1px solid rgba(255,255,255,0.26)'
                          : item.destaque
                          ? '1px solid rgba(255,255,255,0.16)'
                          : '1px solid rgba(255,255,255,0.06)',
                        transform: itemPressionado === item.href ? 'scale(0.98)' : 'scale(1)',
                        transition: 'transform .14s ease, box-shadow .18s ease, background .18s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span>{item.icone}</span>
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.nome}
                        </span>
                      </span>

                      {item.badge && item.badge !== '0' ? (
                        <span
                          style={{
                            minWidth: 24,
                            height: 24,
                            padding: '0 8px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.18)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 900,
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                          }}
                        >
                          {item.badge}
                        </span>
                      ) : item.destaque ? (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: '#ffffff',
                            boxShadow: '0 0 12px rgba(255,255,255,0.85)',
                          }}
                        />
                      ) : null}
                    </div>
                  </Link>
                )
              })}
            </nav>

            <button
              onClick={abrirWhatsApp}
              style={{
                width: '100%',
                marginTop: 18,
                padding: 14,
                borderRadius: 12,
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(34,197,94,0.28)',
                transition: 'transform .14s ease, box-shadow .18s ease',
              }}
            >
              💬 Falar no WhatsApp
            </button>

            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
                opacity: 0.92,
              }}
            >
              <img
                src="/logo-connect.png"
                alt="Connect Sistema"
                style={{
                  width: 54,
                  height: 54,
                  objectFit: 'contain',
                  marginBottom: 8,
                  filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.22))',
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.62)',
                  fontWeight: 700,
                  letterSpacing: 0.4,
                }}
              >
                Desenvolvido por
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#dcfce7',
                  fontWeight: 900,
                  letterSpacing: 0.5,
                }}
              >
                Connect Sistema
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 12,
              border: 'none',
              background: '#f3f4f6',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Sair
          </button>
        </aside>

        <main style={{ flex: 1, padding: 20 }}>{children}</main>
      </div>
    </div>
  )
}