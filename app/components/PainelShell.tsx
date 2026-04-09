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

  // 🔥 CORREÇÃO PRINCIPAL (LOGIN FORA DO PAINEL)
  const rotasSemPainel =
    pathname === '/login' ||
    pathname === '/bloqueado' ||
    pathname.startsWith('/publico') ||
    pathname.startsWith('/impressao')

  if (rotasSemPainel) {
    return <>{children}</>
  }

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
          setCarregandoAcesso(false)
          router.replace('/login')
          return
        }

        const { data: perfilData, error } = await supabase
          .from('perfis')
          .select('id, email, ativo, status, vencimento')
          .eq('id', user.id)
          .single()

        if (!componenteAtivo) return

        if (error || !perfilData) {
          setCarregandoAcesso(false)
          router.replace('/bloqueado')
          return
        }

        setPerfil(perfilData)

        const bloqueado =
          perfilData.ativo === false ||
          perfilData.status === 'bloqueado' ||
          venceuPerfil(perfilData.vencimento)

        if (bloqueado) {
          setCarregandoAcesso(false)
          router.replace('/bloqueado')
          return
        }

        setCarregandoAcesso(false)
      } catch {
        setCarregandoAcesso(false)
        router.replace('/login')
      }
    }

    verificarAcesso()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCarregandoAcesso(false)
        router.replace('/login')
      }
    })

    return () => {
      componenteAtivo = false
      subscription.unsubscribe()
    }
  }, [router])

  function abrirWhatsApp() {
    const numero = '5581999999999'
    const mensagem = 'Olá! Gostaria de falar com você.'
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menu: MenuItem[] = useMemo(
    () => [
      { nome: 'Dashboard', href: '/dashboard', icone: '📊' },
      { nome: 'Orçamentos', href: '/orcamentos', icone: '💰', badge: orcamentosBadge },
      { nome: 'OS', href: '/ordens-servico', icone: '🔧', badge: osBadge },
      { nome: 'Clientes', href: '/clientes', icone: '👥' },
      { nome: 'Produtos', href: '/produtos', icone: '📦' },
      { nome: 'Configurações', href: '/configuracoes', icone: '⚙️' },
    ],
    [orcamentosBadge, osBadge]
  )

  if (carregandoAcesso) {
    return <div style={{ padding: 40 }}>Verificando acesso...</div>
  }

  return (
    <div style={{ display: 'flex' }}>
      <aside style={{ width: 250, background: '#1f2937', color: '#fff', padding: 20 }}>
        <h2>Connect Sistema</h2>

        {menu.map((item) => (
          <Link key={item.href} href={item.href} style={{ display: 'block', margin: '10px 0' }}>
            {item.icone} {item.nome}
          </Link>
        ))}

        <button onClick={handleLogout}>Sair</button>
      </aside>

      <main style={{ flex: 1, padding: 20 }}>{children}</main>
    </div>
  )
}