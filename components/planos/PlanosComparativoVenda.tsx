'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { PLANOS_CATALOGO, type PlanoTier, type RecorrenciaPlano } from '@/lib/planosSaaS'

const RECURSOS_LABEL: { key: keyof typeof PLANOS_CATALOGO.starter.recursos; label: string }[] = [
  { key: 'whatsappIntegrado', label: 'WhatsApp integrado' },
  { key: 'aprovacaoDigital', label: 'Aprovação digital' },
  { key: 'pdfPremium', label: 'PDF premium' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'crm', label: 'CRM' },
  { key: 'connectAi', label: 'Connect AI' },
  { key: 'automacoes', label: 'Automações' },
  { key: 'multiUsuario', label: 'Multiusuário' },
]

function formatarPreco(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Props = {
  tierDestaqueUrl?: string | null
  planoAtual?: string | null
  logado?: boolean
  diasTrial?: number | null
}

export function PlanosComparativoVenda({ tierDestaqueUrl, planoAtual, logado, diasTrial }: Props) {
  const [recorrencia, setRecorrencia] = useState<RecorrenciaPlano>('mensal')
  const tiers = useMemo(() => (['starter', 'pro', 'empresa'] as const), [])

  function hrefCta(tier: PlanoTier) {
    const q = new URLSearchParams({ escolher: tier, recorrencia })
    if (logado) return `/assinatura?${q.toString()}`
    return `/login?redirect=${encodeURIComponent(`/assinatura?${q.toString()}`)}`
  }

  return (
    <div style={{ minHeight: '100%', background: 'radial-gradient(circle at top, #eff6ff 0%, #f8fbff 42%, #fff 100%)', fontFamily: 'system-ui, sans-serif', padding: '28px 20px 48px' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 999, background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 14 }}>
            Planos Connect Sistema
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 950, color: '#0f172a', margin: '0 0 12px', lineHeight: 1.05 }}>
            Escolha o plano ideal para sua operação
          </h1>
          <p style={{ fontSize: 17, color: '#64748b', margin: '0 auto', fontWeight: 700, maxWidth: 640, lineHeight: 1.5 }}>
            Compare recursos, limites e valores. 7 dias grátis para testar sem compromisso.
          </p>
          {diasTrial != null ? (
            <div style={{ marginTop: 16, display: 'inline-block', padding: '10px 18px', borderRadius: 999, background: '#eff6ff', border: '1px solid #93c5fd', fontWeight: 900, color: '#1d4ed8' }}>
              Seu teste: {diasTrial} dia(s) restante(s)
            </div>
          ) : null}
          {planoAtual && planoAtual !== 'trial' ? (
            <p style={{ marginTop: 12, fontSize: 14, fontWeight: 800, color: '#16a34a' }}>
              Plano atual: {String(planoAtual).toUpperCase()} · gestão em <Link href="/assinatura" style={{ color: '#2563eb' }}>Minha assinatura</Link>
            </p>
          ) : null}
          <div style={{ marginTop: 20, display: 'inline-flex', gap: 8, background: '#fff', padding: 6, borderRadius: 999, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,.06)' }}>
            <button type="button" onClick={() => setRecorrencia('mensal')} style={toggleStyle(recorrencia === 'mensal')}>
              Mensal
            </button>
            <button type="button" onClick={() => setRecorrencia('anual')} style={toggleStyle(recorrencia === 'anual')}>
              Anual <span style={{ opacity: 0.85, fontSize: 11 }}>economize</span>
            </button>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {tiers.map((tier) => {
            const plano = PLANOS_CATALOGO[tier]
            const destaque = tier === 'pro' || tierDestaqueUrl === tier
            const preco = recorrencia === 'anual' ? plano.precos.anual : plano.precos.mensal
            const ehAtual = planoAtual === tier
            return (
              <article
                key={tier}
                style={{
                  background: '#fff',
                  borderRadius: 24,
                  padding: '28px 24px',
                  border: destaque ? '2px solid #2563eb' : '1px solid #dbe3ef',
                  boxShadow: destaque ? '0 20px 50px rgba(37,99,235,.18)' : '0 10px 28px rgba(15,23,42,.06)',
                  position: 'relative',
                  transform: destaque ? 'translateY(-4px)' : 'none',
                }}
              >
                {destaque ? (
                  <span style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 950, color: '#fff', background: '#2563eb', padding: '4px 10px', borderRadius: 999 }}>
                    MAIS ESCOLHIDO
                  </span>
                ) : null}
                <h3 style={{ fontSize: 24, fontWeight: 950, margin: '0 0 6px', color: '#0f172a' }}>{plano.nome}</h3>
                <p style={{ color: '#64748b', fontWeight: 700, fontSize: 14, minHeight: 44, lineHeight: 1.45, margin: 0 }}>{plano.descricao}</p>
                <div style={{ margin: '18px 0' }}>
                  <span style={{ fontSize: 40, fontWeight: 950, color: '#0f172a' }}>{formatarPreco(preco)}</span>
                  <span style={{ color: '#64748b', fontWeight: 800, fontSize: 14 }}> /{recorrencia === 'anual' ? 'ano' : 'mês'}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 14, padding: '10px 12px', borderRadius: 12, background: '#f8fafc' }}>
                  Até {plano.limites.usuarios} usuário(s) · {plano.limites.documentosMes.toLocaleString('pt-BR')} documentos/mês
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 8 }}>
                  {RECURSOS_LABEL.map((r) => (
                    <li key={r.key} style={{ fontSize: 13, fontWeight: 700, color: plano.recursos[r.key] ? '#0f172a' : '#94a3b8' }}>
                      {plano.recursos[r.key] ? '✓' : '—'} {r.label}
                    </li>
                  ))}
                </ul>
                <Link
                  href={hrefCta(tier)}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    width: '100%',
                    minHeight: 48,
                    lineHeight: '48px',
                    borderRadius: 14,
                    background: ehAtual ? '#e2e8f0' : destaque ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#0f172a',
                    color: ehAtual ? '#64748b' : '#fff',
                    fontWeight: 950,
                    textDecoration: 'none',
                    fontSize: 15,
                    boxShadow: ehAtual ? 'none' : '0 12px 28px rgba(37,99,235,.2)',
                  }}
                >
                  {ehAtual ? 'Plano atual' : logado ? 'Escolher plano' : 'Começar agora'}
                </Link>
              </article>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', marginTop: 32, color: '#94a3b8', fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
          Pagamento seguro Mercado Pago · PIX ou cartão · Renovação automática no plano mensal
          <br />
          {logado ? (
            <>
              Já é cliente? Acesse <Link href="/assinatura" style={{ color: '#2563eb', fontWeight: 900 }}>Minha assinatura</Link> para renovar ou trocar plano.
            </>
          ) : (
            <>Faça login para assinar e gerenciar cobrança.</>
          )}
        </p>
      </div>
    </div>
  )
}

function toggleStyle(ativo: boolean): React.CSSProperties {
  return {
    border: 'none',
    borderRadius: 999,
    padding: '8px 16px',
    fontWeight: 900,
    cursor: 'pointer',
    background: ativo ? '#2563eb' : 'transparent',
    color: ativo ? '#fff' : '#64748b',
    fontSize: 14,
  }
}
