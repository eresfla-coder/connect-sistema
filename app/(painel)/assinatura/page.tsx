'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { useAssinatura } from '@/hooks/useAssinatura'
import { parsePlanoPagamento } from '@/lib/assinaturaAcesso'
import { PLANOS_CATALOGO, obterPlanoConfig, type PlanoTier, type RecorrenciaPlano } from '@/lib/planosSaaS'
import ConnectLoading from '@/components/ui/ConnectLoading'
import { showConnectToast } from '@/components/ui/ConnectToast'

const PAGAMENTOS_KEY = 'connect_saas_pagamentos'

type PagamentoHistorico = {
  id: string
  tier: string
  recorrencia: string
  valor: number
  data: string
  status: string
}

function formatarData(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

function formatarPreco(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function lerHistoricoPagamentos(): PagamentoHistorico[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PAGAMENTOS_KEY)
    const lista = raw ? JSON.parse(raw) : []
    return Array.isArray(lista) ? lista.slice(0, 8) : []
  } catch {
    return []
  }
}

function registrarPagamentoLocal(item: Omit<PagamentoHistorico, 'id'>) {
  try {
    const lista = lerHistoricoPagamentos()
    const novo: PagamentoHistorico = { ...item, id: String(Date.now()) }
    localStorage.setItem(PAGAMENTOS_KEY, JSON.stringify([novo, ...lista].slice(0, 12)))
  } catch {}
}

const WHATSAPP_SUPORTE =
  'https://wa.me/5584992181399?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20minha%20assinatura%20no%20Connect%20Sistema.'

export default function AssinaturaPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { snapshot, loading, atualizar } = useAssinatura()
  const [processando, setProcessando] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [historico, setHistorico] = useState<PagamentoHistorico[]>([])
  const [extras, setExtras] = useState<{ ultimoPagamento?: string; planoRaw?: string; valorMensal?: number }>({})
  const checkoutAutoRef = useRef(false)

  const pagamentoOk = params.get('pagamento') === 'aprovado' || params.get('checkout') === 'ok'
  const escolherTier = params.get('escolher') as PlanoTier | null
  const escolherRec = (params.get('recorrencia') as RecorrenciaPlano) || 'mensal'
  const mostrarTroca = params.get('trocar') === '1' || !!escolherTier

  useEffect(() => {
    setHistorico(lerHistoricoPagamentos())
  }, [])

  useEffect(() => {
    async function carregarExtras() {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) return
      const res = await fetch('/api/assinatura/status', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await res.json().catch(() => null)
      if (!payload?.ok) return
      setExtras({
        ultimoPagamento: payload.perfil?.ultimo_pagamento || payload.assinatura?.updated_at,
        planoRaw: payload.assinatura?.plano,
        valorMensal: Number(payload.assinatura?.valor_mensal || payload.perfil?.valor_plano || 0) || undefined,
      })
    }
    void carregarExtras()
  }, [loading, pagamentoOk])

  useEffect(() => {
    if (!pagamentoOk || !snapshot) return
    if (snapshot.tier === 'trial') return
    const tier = snapshot.tier
    const cfg = obterPlanoConfig(tier)
    if (!cfg) return
    registrarPagamentoLocal({
      tier,
      recorrencia: 'mensal',
      valor: cfg.precos.mensal,
      data: new Date().toISOString(),
      status: 'aprovado',
    })
    setHistorico(lerHistoricoPagamentos())
  }, [pagamentoOk, snapshot?.tier])

  useEffect(() => {
    if (!escolherTier || loading || checkoutAutoRef.current) return
    if (!['starter', 'pro', 'empresa'].includes(escolherTier)) return
    checkoutAutoRef.current = true
    void iniciarCheckout(escolherTier, escolherRec)
  }, [escolherTier, escolherRec, loading])

  async function iniciarCheckout(tier: PlanoTier, recorrencia: RecorrenciaPlano) {
    setProcessando(`${tier}_${recorrencia}`)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) {
        router.push(`/login?redirect=${encodeURIComponent(`/assinatura?escolher=${tier}&recorrencia=${recorrencia}`)}`)
        return
      }

      const res = await fetch('/api/pagamentos/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier, recorrencia }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.checkoutUrl) {
        showConnectToast(payload?.message || 'Não foi possível iniciar o checkout.', 'error')
        return
      }
      window.location.href = payload.checkoutUrl
    } catch {
      showConnectToast('Erro ao processar pagamento.', 'error')
    } finally {
      setProcessando(null)
    }
  }

  async function cancelarAssinatura() {
    if (!confirm('Cancelar renovação automática? O acesso continua até o fim do período pago.')) return
    setCancelando(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) return

      const res = await fetch('/api/assinatura/cancelar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        showConnectToast(payload?.message || 'Não foi possível cancelar.', 'error')
        return
      }
      showConnectToast(payload?.message || 'Assinatura cancelada.', 'success')
      await atualizar()
    } finally {
      setCancelando(false)
    }
  }

  const tierAtual = useMemo(() => {
    if (snapshot?.tier === 'trial') return 'starter' as const
    return (snapshot?.tier || 'starter') as keyof typeof PLANOS_CATALOGO
  }, [snapshot?.tier])

  const planoAtual = PLANOS_CATALOGO[tierAtual]
  const parsedPlano = parsePlanoPagamento(extras.planoRaw, extras.valorMensal)
  const mensalidade =
    extras.valorMensal && extras.valorMensal > 0
      ? extras.valorMensal
      : parsedPlano.recorrencia === 'anual'
        ? planoAtual.precos.anual / 12
        : planoAtual.precos.mensal

  const pctDocs =
    snapshot && snapshot.limiteDocumentos > 0
      ? Math.min(100, Math.round((snapshot.documentosUsados / snapshot.limiteDocumentos) * 100))
      : 0

  if (loading) return <ConnectLoading label="Carregando assinatura..." />

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '8px 4px 40px' }}>
      {pagamentoOk ? (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 14, background: '#ecfdf5', border: '1px solid #86efac', fontWeight: 800, color: '#047857' }}>
          Pagamento recebido! Sua assinatura será atualizada em instantes.
        </div>
      ) : null}

      <section style={{ borderRadius: 24, padding: 24, background: 'linear-gradient(135deg,#0f172a,#1d4ed8 55%,#10b981)', color: '#fff', boxShadow: '0 24px 60px rgba(37,99,235,.25)' }}>
        <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .85 }}>Minha assinatura</div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 32, fontWeight: 950 }}>Gestão da sua conta</h1>
        <p style={{ margin: 0, opacity: .88, fontWeight: 700, fontSize: 14 }}>Plano, cobrança, limites e pagamentos em um só lugar.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 18 }}>
          <InfoCard label="Status" value={snapshot?.emTrial ? 'Teste grátis' : snapshot?.status || '—'} />
          <InfoCard label="Plano atual" value={snapshot?.emTrial ? 'Trial' : planoAtual.nome} />
          <InfoCard label="Mensalidade" value={snapshot?.emTrial ? 'Grátis (trial)' : formatarPreco(mensalidade)} />
          <InfoCard label="Próxima cobrança" value={formatarData(snapshot?.proximaCobranca)} />
          <InfoCard label="Válido até" value={formatarData(snapshot?.vencimento)} />
          <InfoCard label="Último pagamento" value={formatarData(extras.ultimoPagamento)} />
        </div>

        {snapshot?.emTrial ? (
          <p style={{ margin: '14px 0 0', fontWeight: 700, color: '#dbeafe' }}>
            {snapshot.diasRestantesTrial ?? 0} dia(s) restantes no teste de 7 dias.
          </p>
        ) : null}

        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <BarraUso titulo="Documentos no mês" usado={snapshot?.documentosUsados ?? 0} limite={snapshot?.limiteDocumentos ?? 0} pct={pctDocs} />
          <BarraUso titulo="Usuários" usado={1} limite={snapshot?.limiteUsuarios ?? 1} pct={Math.min(100, Math.round((1 / (snapshot?.limiteUsuarios || 1)) * 100))} />
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" onClick={() => void iniciarCheckout(tierAtual, 'mensal')} disabled={!!processando} style={btnAcao('#fff', '#0f172a')}>
            {processando?.includes(tierAtual) ? 'Abrindo checkout...' : 'Renovar plano'}
          </button>
          <Link href="/planos" style={{ ...btnAcao('rgba(255,255,255,.12)', '#fff'), textDecoration: 'none', border: '1px solid rgba(255,255,255,.35)' }}>
            Comparar e trocar plano
          </Link>
          <a href={WHATSAPP_SUPORTE} target="_blank" rel="noreferrer" style={{ ...btnAcao('#22c55e', '#fff'), textDecoration: 'none' }}>
            Suporte WhatsApp
          </a>
        </div>

        {!snapshot?.emTrial && snapshot?.renovacaoAutomatica ? (
          <button
            type="button"
            onClick={() => void cancelarAssinatura()}
            disabled={cancelando}
            style={{ marginTop: 14, padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.08)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
          >
            {cancelando ? 'Cancelando...' : 'Cancelar renovação automática'}
          </button>
        ) : null}
      </section>

      {mostrarTroca ? (
        <section style={{ marginTop: 20, borderRadius: 20, padding: 20, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 12px 30px rgba(15,23,42,.06)' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 950, color: '#0f172a' }}>Assinar ou trocar plano</h2>
          <p style={{ margin: '0 0 14px', color: '#64748b', fontWeight: 700, fontSize: 14 }}>
            Checkout Mercado Pago · mensal com renovação automática quando disponível.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {(Object.keys(PLANOS_CATALOGO) as Array<keyof typeof PLANOS_CATALOGO>).map((key) => {
              const plano = PLANOS_CATALOGO[key]
              const ativo = tierAtual === key
              return (
                <div key={key} style={{ borderRadius: 16, padding: 14, border: ativo ? '2px solid #2563eb' : '1px solid #e2e8f0', background: ativo ? '#f8fbff' : '#fff' }}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>{plano.nome}</div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, margin: '6px 0 10px' }}>{formatarPreco(plano.precos.mensal)}/mês</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <button type="button" disabled={!!processando} onClick={() => void iniciarCheckout(key, 'mensal')} style={btnStyle(processando === `${key}_mensal`)}>
                      {processando === `${key}_mensal` ? 'Abrindo...' : 'Mensal'}
                    </button>
                    <button type="button" disabled={!!processando} onClick={() => void iniciarCheckout(key, 'anual')} style={{ ...btnStyle(processando === `${key}_anual`), background: '#0f172a' }}>
                      {processando === `${key}_anual` ? 'Abrindo...' : `Anual ${formatarPreco(plano.precos.anual)}`}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : (
        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#64748b' }}>
          Quer ver todos os recursos antes de trocar?{' '}
          <Link href="/planos" style={{ color: '#2563eb', fontWeight: 900 }}>
            Comparar planos comercialmente →
          </Link>
        </p>
      )}

      <section style={{ marginTop: 20, borderRadius: 20, padding: 20, background: '#fff', border: '1px solid #e2e8f0' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 950, color: '#0f172a' }}>Pagamentos recentes</h2>
        {historico.length === 0 && !extras.ultimoPagamento ? (
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, fontSize: 14 }}>Nenhum pagamento registrado neste dispositivo ainda.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {historico.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: '#f8fafc', fontSize: 14, fontWeight: 700 }}>
                <span>
                  {String(p.tier).toUpperCase()} · {p.recorrencia} · {formatarData(p.data)}
                </span>
                <span style={{ color: '#16a34a' }}>{formatarPreco(p.valor)}</span>
              </div>
            ))}
            {historico.length === 0 && extras.ultimoPagamento ? (
              <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', fontSize: 14, fontWeight: 700, color: '#475569' }}>
                Último pagamento confirmado em {formatarData(extras.ultimoPagamento)}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 14, padding: 12, background: 'rgba(255,255,255,.12)' }}>
      <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', opacity: .8 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 950, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function BarraUso({ titulo, usado, limite, pct }: { titulo: string; usado: number; limite: number; pct: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
        <span>{titulo}</span>
        <span>
          {usado} / {limite}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#93c5fd', borderRadius: 999 }} />
      </div>
    </div>
  )
}

function btnAcao(bg: string, color: string): CSSProperties {
  return {
    minHeight: 42,
    padding: '0 18px',
    borderRadius: 12,
    border: 'none',
    background: bg,
    color,
    fontWeight: 900,
    fontSize: 14,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
  }
}

function btnStyle(loading: boolean): CSSProperties {
  return {
    minHeight: 40,
    border: 'none',
    borderRadius: 10,
    background: loading ? '#94a3b8' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
    color: '#fff',
    fontWeight: 900,
    cursor: loading ? 'wait' : 'pointer',
    fontSize: 13,
  }
}
