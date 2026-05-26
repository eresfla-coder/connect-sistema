'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'

const WHATSAPP = '5584992181399'
const WHATSAPP_MSG = encodeURIComponent('Olá! Quero testar o Connect Sistema.')

const BENEFICIOS = [
  { icone: '⚡', titulo: 'Orçamentos rápidos', texto: 'Monte propostas em minutos com modelos prontos.' },
  { icone: '🔧', titulo: 'OS automática', texto: 'Aprovação digital gera ordem de serviço no painel.' },
  { icone: '📱', titulo: 'Sync celular + PC', texto: 'Mesmo login, mesmos dados em qualquer aparelho.' },
  { icone: '📄', titulo: 'PDF premium', texto: 'Documentos profissionais com QR e assinatura.' },
  { icone: '✅', titulo: 'Aprovação online', texto: 'Cliente aprova pelo link sem instalar nada.' },
  { icone: '💸', titulo: 'Financeiro integrado', texto: 'Cobranças, vencimentos e lembretes.' },
  { icone: '💬', titulo: 'WhatsApp integrado', texto: 'Envie orçamento, OS e cobrança em um clique.' },
]

const NICHOS = [
  'Assistência técnica',
  'Gráfica rápida',
  'Papelaria',
  'Móveis planejados',
  'Informática',
  'Serviços técnicos',
]

const PLANOS = [
  {
    nome: 'Starter',
    preco: '49,90',
    periodo: '/mês',
    destaque: false,
    itens: ['Orçamentos e propostas', 'OS e recibos', 'Sync nuvem', 'Suporte WhatsApp'],
  },
  {
    nome: 'Pro',
    preco: '89,90',
    periodo: '/mês',
    destaque: true,
    badge: 'Mais popular',
    itens: ['Tudo do Starter', 'PDF premium + QR', 'Aprovação digital', 'Financeiro + CRM'],
  },
  {
    nome: 'Empresa',
    preco: '149,90',
    periodo: '/mês',
    destaque: false,
    itens: ['Multiusuário em breve', 'Prioridade suporte', 'Onboarding dedicado', 'Personalização visual'],
  },
]

function Btn({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'whatsapp'
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
      color: '#fff',
      boxShadow: '0 14px 32px rgba(37,99,235,.28)',
    },
    ghost: {
      background: 'rgba(255,255,255,.08)',
      color: 'inherit',
      border: '1px solid rgba(148,163,184,.35)',
    },
    whatsapp: {
      background: 'linear-gradient(135deg,#16a34a,#15803d)',
      color: '#fff',
      boxShadow: '0 14px 32px rgba(22,163,74,.28)',
    },
  }
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        padding: '0 22px',
        borderRadius: 999,
        fontWeight: 950,
        fontSize: 15,
        textDecoration: 'none',
        transition: 'transform .15s ease, box-shadow .15s ease',
        ...styles[variant],
      }}
    >
      {children}
    </Link>
  )
}

function MockCard({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children?: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid rgba(148,163,184,.22)',
        background: 'linear-gradient(180deg,#fff,#f8fafc)',
        padding: 14,
        boxShadow: '0 18px 45px rgba(15,23,42,.08)',
        minHeight: 160,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 950, color: '#2563eb', letterSpacing: '.12em', textTransform: 'uppercase' }}>{subtitulo}</div>
      <div style={{ fontSize: 16, fontWeight: 950, color: '#0f172a', marginTop: 4 }}>{titulo}</div>
      {children}
    </div>
  )
}

export default function LandingPage() {
  const [tema, setTema] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) setTema('dark')
  }, [])

  return (
    <div className="landing-root landing-animate" data-theme={tema}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(148,163,184,.18)',
          background: tema === 'dark' ? 'rgba(2,6,23,.85)' : 'rgba(248,250,252,.9)',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <img src="/logo-connect.png" alt="Connect" width={44} height={44} style={{ borderRadius: 12 }} />
            <span style={{ fontWeight: 950, fontSize: 18 }}>Connect Sistema</span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a href="#beneficios" style={{ color: 'var(--landing-muted)', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>Benefícios</a>
            <a href="#planos" style={{ color: 'var(--landing-muted)', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>Planos</a>
            <Btn href="/login">Entrar</Btn>
          </nav>
        </div>
      </header>

      <section
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '48px 20px 56px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 32,
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '.2em', textTransform: 'uppercase', color: '#2563eb' }}>SaaS para negócios brasileiros</div>
          <h1 style={{ margin: '12px 0 16px', fontSize: 'clamp(34px, 6vw, 52px)', lineHeight: 1.02, fontWeight: 950, letterSpacing: '-.03em' }}>
            Controle total de orçamentos, OS, clientes e vendas.
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 18, lineHeight: 1.55, color: 'var(--landing-muted)', fontWeight: 700, maxWidth: 520 }}>
            O Connect Sistema une proposta comercial, aprovação digital, ordem de serviço e financeiro — com visual premium e sync entre celular e computador.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Btn href="/login">Teste grátis</Btn>
            <Btn href={`https://wa.me/${WHATSAPP}?text=${WHATSAPP_MSG}`} variant="whatsapp">WhatsApp</Btn>
          </div>
        </div>
        <div className="landing-float" style={{ position: 'relative' }}>
          <div
            style={{
              borderRadius: 24,
              padding: 16,
              background: 'linear-gradient(145deg,#0f172a 0%,#1d4ed8 55%,#10b981 100%)',
              boxShadow: '0 28px 70px rgba(37,99,235,.35)',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 950 }}>Painel Connect</span>
              <span style={{ fontSize: 11, opacity: .8 }}>Ao vivo</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['Dashboard', 'Proposta', 'OS', 'Mobile'].map((label) => (
                <div key={label} style={{ borderRadius: 12, background: 'rgba(255,255,255,.12)', padding: 12, minHeight: 72 }}>
                  <div style={{ fontSize: 10, opacity: .75, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>●</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.1)', fontSize: 13, fontWeight: 800 }}>
              Proposta aprovada → OS gerada automaticamente
            </div>
          </div>
        </div>
      </section>

      <section id="beneficios" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 48px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 950, marginBottom: 8 }}>Tudo para vender mais</h2>
        <p style={{ textAlign: 'center', color: 'var(--landing-muted)', fontWeight: 700, marginBottom: 28 }}>Ferramentas que parecem software de empresa grande.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {BENEFICIOS.map((b) => (
            <article key={b.titulo} style={{ borderRadius: 20, padding: 18, border: '1px solid rgba(148,163,184,.2)', background: tema === 'dark' ? '#0f172a' : '#fff', boxShadow: '0 12px 30px rgba(15,23,42,.06)' }}>
              <div style={{ fontSize: 28 }}>{b.icone}</div>
              <h3 style={{ margin: '10px 0 6px', fontSize: 17, fontWeight: 950 }}>{b.titulo}</h3>
              <p style={{ margin: 0, color: 'var(--landing-muted)', fontSize: 14, fontWeight: 700, lineHeight: 1.45 }}>{b.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ background: tema === 'dark' ? '#0f172a' : 'linear-gradient(180deg,#eff6ff,#f8fafc)', padding: '48px 20px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 30, fontWeight: 950, marginBottom: 24 }}>Feito para o seu nicho</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {NICHOS.map((n) => (
              <span key={n} style={{ padding: '10px 18px', borderRadius: 999, background: '#fff', border: '1px solid #dbeafe', fontWeight: 900, fontSize: 14, color: '#1e40af', boxShadow: '0 8px 20px rgba(37,99,235,.1)' }}>
                {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 20px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 30, fontWeight: 950, marginBottom: 24 }}>Veja o sistema em ação</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <MockCard titulo="Dashboard" subtitulo="Visão geral">
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div style={{ height: 8, borderRadius: 999, background: '#dbeafe', width: '90%' }} />
              <div style={{ height: 8, borderRadius: 999, background: '#86efac', width: '70%' }} />
              <div style={{ height: 8, borderRadius: 999, background: '#fde68a', width: '55%' }} />
            </div>
          </MockCard>
          <MockCard titulo="Proposta comercial" subtitulo="Documento">
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 950, color: '#16a34a' }}>R$ 2.450,00</div>
          </MockCard>
          <MockCard titulo="Ordem de serviço" subtitulo="Técnico">
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: '#64748b' }}>Status: Em andamento</div>
          </MockCard>
          <MockCard titulo="Mobile" subtitulo="Celular + PC">
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, height: 48, borderRadius: 10, background: '#1d4ed8' }} />
              <div style={{ flex: 1, height: 48, borderRadius: 10, background: '#e2e8f0' }} />
            </div>
          </MockCard>
        </div>
      </section>

      <section id="planos" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 56px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 950 }}>Planos simples</h2>
        <p style={{ textAlign: 'center', color: 'var(--landing-muted)', fontWeight: 700, marginBottom: 28 }}>Escolha e comece hoje. Upgrade quando crescer.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, alignItems: 'stretch' }}>
          {PLANOS.map((plano) => (
            <article
              key={plano.nome}
              style={{
                borderRadius: 24,
                padding: 24,
                border: plano.destaque ? '2px solid #2563eb' : '1px solid rgba(148,163,184,.25)',
                background: tema === 'dark' ? '#0f172a' : '#fff',
                boxShadow: plano.destaque ? '0 24px 50px rgba(37,99,235,.2)' : '0 12px 28px rgba(15,23,42,.06)',
                transform: plano.destaque ? 'scale(1.02)' : 'none',
              }}
            >
              {'badge' in plano && plano.badge ? (
                <span style={{ display: 'inline-block', marginBottom: 10, padding: '4px 10px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 950 }}>{plano.badge}</span>
              ) : null}
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>{plano.nome}</h3>
              <div style={{ margin: '12px 0 16px' }}>
                <span style={{ fontSize: 36, fontWeight: 950 }}>R$ {plano.preco}</span>
                <span style={{ color: 'var(--landing-muted)', fontWeight: 800 }}>{plano.periodo}</span>
              </div>
              <ul style={{ margin: '0 0 20px', paddingLeft: 18, color: 'var(--landing-muted)', fontWeight: 700, fontSize: 14, lineHeight: 1.6 }}>
                {plano.itens.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Btn href="/login">Começar agora</Btn>
            </article>
          ))}
        </div>
      </section>

      <section
        style={{
          margin: '0 20px 40px',
          maxWidth: 1140,
          marginLeft: 'auto',
          marginRight: 'auto',
          borderRadius: 28,
          padding: '40px 28px',
          textAlign: 'center',
          background: 'linear-gradient(135deg,#0f172a,#1d4ed8 50%,#10b981)',
          color: '#fff',
          boxShadow: '0 28px 70px rgba(37,99,235,.3)',
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 950 }}>Comece agora mesmo</h2>
        <p style={{ margin: '0 0 24px', opacity: .9, fontWeight: 700, fontSize: 17 }}>Teste o Connect e profissionalize orçamentos, OS e cobranças hoje.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          <Btn href="/login">Teste grátis</Btn>
          <Btn href={`https://wa.me/${WHATSAPP}?text=${WHATSAPP_MSG}`} variant="whatsapp">Falar no WhatsApp</Btn>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid rgba(148,163,184,.2)', padding: '24px 20px', textAlign: 'center', color: 'var(--landing-muted)', fontSize: 13, fontWeight: 700 }}>
        © {new Date().getFullYear()} Connect Sistema · <Link href="/login" style={{ color: '#2563eb', fontWeight: 900 }}>Acessar painel</Link>
      </footer>
    </div>
  )
}
