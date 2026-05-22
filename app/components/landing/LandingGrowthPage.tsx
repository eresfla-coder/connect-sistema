'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { salvarLead } from '@/lib/growth-store'
import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'
import { supabase } from '@/lib/supabase'
import './landing-growth.css'

const PLANOS = [
  {
    nome: 'Teste grátis',
    preco: 'R$ 0',
    periodo: '7 dias',
    destaque: false,
    itens: ['Orçamentos ilimitados', 'OS e recibos', 'WhatsApp integrado', 'Suporte por chat'],
  },
  {
    nome: 'Profissional',
    preco: 'R$ 97',
    periodo: '/mês',
    destaque: true,
    itens: [
      'Tudo do teste',
      'Dashboard gerencial',
      'Cobrança SaaS',
      'Área do cliente',
      'Onboarding premium',
    ],
  },
  {
    nome: 'Empresa',
    preco: 'Sob consulta',
    periodo: '',
    destaque: false,
    itens: ['Multiusuário', 'CRM Growth', 'Analytics avançado', 'Automação comercial'],
  },
]

const FAQ = [
  {
    q: 'Preciso instalar algo?',
    a: 'Não. O Connect roda no navegador e pode ser instalado como PWA no celular.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. Layout premium responsivo para Android, iPhone e desktop.',
  },
  {
    q: 'Como funciona o teste grátis?',
    a: 'Você cria a conta e recebe 7 dias para usar orçamentos, OS e cobrança.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim. Sem fidelidade. Renovação via suporte WhatsApp.',
  },
]

const DEPOIMENTOS = [
  {
    nome: 'Eres — Loja Connect',
    texto: 'Orçamento + WhatsApp em um clique. O time vende mais rápido.',
  },
  {
    nome: 'Marcos — Serviços',
    texto: 'OS e recibo no mesmo fluxo. Cliente recebe tudo profissional.',
  },
  {
    nome: 'Ana — Gráfica',
    texto: 'Painel SaaS mostra quem está em teste e quem precisa renovar.',
  },
]

const SUPORTE_WA =
  process.env.NEXT_PUBLIC_CONNECT_SUPORTE_WHATSAPP || '5584992181399'

export default function LandingGrowthPage() {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [faqAberto, setFaqAberto] = useState<number | null>(0)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let ativo = true
    async function checarSessao() {
      const { data } = await supabase.auth.getUser()
      if (!ativo) return
      if (data?.user) router.replace('/dashboard')
    }
    checarSessao()
    return () => {
      ativo = false
    }
  }, [router])

  function handleLead(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      alert('Informe seu e-mail.')
      return
    }
    salvarLead({
      nome: nome.trim() || email.split('@')[0],
      email: email.trim(),
      telefone: telefone.trim(),
      origem: 'landing-hero',
    })
    router.push(`/login?criar=1&email=${encodeURIComponent(email.trim())}`)
  }

  function abrirWhatsApp() {
    abrirWhatsAppComTelefone(
      SUPORTE_WA,
      'Olá! Quero conhecer o Connect Sistema e iniciar o teste grátis.',
    )
  }

  return (
    <div className="lg-page">
      <header
        className="lg-section lg-animate-in"
        style={{
          paddingTop: 24,
          paddingBottom: 24,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo-connect.png" alt="Connect" width={48} height={48} />
          <strong style={{ fontSize: 18 }}>Connect Sistema</strong>
        </div>
        <nav style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/login" style={linkNav}>
            Entrar
          </Link>
          <Link href="/login?criar=1" style={linkCta}>
            Teste grátis
          </Link>
        </nav>
      </header>

      <section className="lg-section lg-animate-in">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr',
            gap: 28,
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(249,115,22,0.18)',
                border: '1px solid rgba(249,115,22,0.35)',
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              SaaS para prestadores e lojas
            </div>
            <h1
              style={{
                fontSize: isMobile ? 34 : 52,
                fontWeight: 900,
                lineHeight: 1.05,
                margin: '0 0 16px',
              }}
            >
              Orçamento, OS e cobrança no{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg,#f97316,#22c55e)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                mesmo painel
              </span>
            </h1>
            <p style={{ color: '#cbd5e1', fontSize: 17, lineHeight: 1.6, maxWidth: 520 }}>
              Máquina de captação e retenção: trial automático, CRM SaaS, analytics
              e automação WhatsApp — sem planilha.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
              <Link href="/login?criar=1" style={{ ...linkCta, padding: '14px 22px', fontSize: 15 }}>
                Começar teste grátis →
              </Link>
              <button type="button" onClick={abrirWhatsApp} style={btnOutline}>
                Falar no WhatsApp
              </button>
            </div>
            <form onSubmit={handleLead} style={{ marginTop: 20, display: 'grid', gap: 8, maxWidth: 420 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#94a3b8' }}>
                Captação rápida (lead → trial)
              </div>
              <input
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="E-mail profissional"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="WhatsApp (opcional)"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={{ ...linkCta, border: 'none', cursor: 'pointer' }}>
                Ativar trial automático
              </button>
            </form>
          </div>

          <div className="lg-glow-card lg-float" style={mockupCard}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Demo em 90 segundos</div>
            <div
              style={{
                position: 'relative',
                paddingBottom: '56.25%',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#0f172a',
              }}
            >
              {process.env.NEXT_PUBLIC_CONNECT_DEMO_VIDEO ? (
                <iframe
                  title="Demo Connect Sistema"
                  src={process.env.NEXT_PUBLIC_CONNECT_DEMO_VIDEO}
                  loading="lazy"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'linear-gradient(135deg,#1e293b,#0f172a)',
                    fontWeight: 800,
                    padding: 20,
                    textAlign: 'center',
                  }}
                >
                  ▶ Configure NEXT_PUBLIC_CONNECT_DEMO_VIDEO com o link do seu vídeo
                </div>
              )}
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 10 }}>
              Substitua o link do vídeo pela sua demo real em produção.
            </p>
          </div>
        </div>
      </section>

      <section className="lg-section">
        <h2 style={tituloSecao}>Prints do sistema</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 14,
          }}
        >
          {[
            { t: 'Orçamentos + WhatsApp', c: 'linear-gradient(135deg,#f97316,#ea580c)' },
            { t: 'Ordem de Serviço', c: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
            { t: 'Painel SaaS / Cobrança', c: 'linear-gradient(135deg,#22c55e,#16a34a)' },
          ].map((card) => (
            <div
              key={card.t}
              className="lg-animate-in"
              style={{
                borderRadius: 18,
                padding: 20,
                minHeight: 160,
                background: card.c,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
                textAlign: 'center',
                boxShadow: '0 16px 36px rgba(0,0,0,0.25)',
              }}
            >
              {card.t}
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>
                preview premium
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lg-section">
        <h2 style={tituloSecao}>Planos</h2>
        <div className="lg-grid-plans">
          {PLANOS.map((plano) => (
            <div
              key={plano.nome}
              style={{
                borderRadius: 20,
                padding: 22,
                border: plano.destaque
                  ? '2px solid rgba(249,115,22,0.6)'
                  : '1px solid rgba(255,255,255,0.12)',
                background: plano.destaque
                  ? 'linear-gradient(180deg, rgba(249,115,22,0.12), rgba(15,23,42,0.9))'
                  : 'rgba(255,255,255,0.04)',
              }}
            >
              {plano.destaque ? (
                <span style={{ fontSize: 11, fontWeight: 900, color: '#fdba74' }}>
                  MAIS ESCOLHIDO
                </span>
              ) : null}
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8 }}>{plano.nome}</div>
              <div style={{ fontSize: 32, fontWeight: 900, margin: '8px 0' }}>
                {plano.preco}
                <span style={{ fontSize: 14, fontWeight: 600 }}>{plano.periodo}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', lineHeight: 1.8 }}>
                {plano.itens.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <Link
                href="/login?criar=1"
                style={{
                  ...linkCta,
                  display: 'inline-block',
                  marginTop: 16,
                  width: '100%',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              >
                {plano.nome === 'Empresa' ? 'Falar com vendas' : 'Teste grátis'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="lg-section">
        <h2 style={tituloSecao}>Depoimentos</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {DEPOIMENTOS.map((d) => (
            <blockquote
              key={d.nome}
              style={{
                margin: 0,
                padding: 18,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <p style={{ color: '#e2e8f0', lineHeight: 1.55 }}>&ldquo;{d.texto}&rdquo;</p>
              <footer style={{ marginTop: 12, fontWeight: 800, color: '#7dd3fc' }}>
                {d.nome}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="lg-section">
        <h2 style={tituloSecao}>FAQ</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {FAQ.map((item, idx) => (
            <button
              key={item.q}
              type="button"
              onClick={() => setFaqAberto(faqAberto === idx ? null : idx)}
              style={{
                textAlign: 'left',
                padding: 16,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800 }}>{item.q}</div>
              {faqAberto === idx ? (
                <div style={{ marginTop: 8, color: '#94a3b8', lineHeight: 1.5 }}>{item.a}</div>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <footer
        className="lg-section"
        style={{ paddingBottom: 100, textAlign: 'center', color: '#64748b', fontSize: 13 }}
      >
        Connect Sistema · Growth + Conversão ·{' '}
        <Link href="/login" style={{ color: '#7dd3fc' }}>
          Acessar painel
        </Link>
      </footer>

      <button
        type="button"
        className="lg-wa-fixo"
        aria-label="WhatsApp"
        onClick={abrirWhatsApp}
      >
        💬
      </button>
    </div>
  )
}

const tituloSecao: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  marginBottom: 20,
}

const linkNav: React.CSSProperties = {
  textDecoration: 'none',
  color: '#e2e8f0',
  fontWeight: 700,
  padding: '10px 14px',
}

const linkCta: React.CSSProperties = {
  textDecoration: 'none',
  color: '#fff',
  fontWeight: 900,
  padding: '10px 16px',
  borderRadius: 12,
  background: 'linear-gradient(135deg,#f97316,#ea580c)',
  boxShadow: '0 10px 24px rgba(249,115,22,0.28)',
}

const btnOutline: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'transparent',
  color: '#fff',
  fontWeight: 800,
  padding: '14px 18px',
  borderRadius: 12,
  cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  height: 44,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(15,23,42,0.6)',
  color: '#fff',
  padding: '0 12px',
}

const mockupCard: React.CSSProperties = {
  borderRadius: 22,
  padding: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(15,23,42,0.95))',
  border: '1px solid rgba(255,255,255,0.12)',
}
