'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { carregarDadosAdminAssinatura } from '@/lib/admin-dados-assinatura'
import { formatarMoeda, type ResumoAssinatura } from '@/lib/assinatura-cobranca'
import type { AssinaturaAdmin, PagamentoAdmin } from '@/lib/admin-dados-assinatura'
import { calcularFunil, montarPainelCrm, type ItemCrm } from '@/lib/growth-crm'
import { calcularAnalyticsSaaS } from '@/lib/growth-analytics'
import {
  executarAutomacao,
  executarTodasAutomacoes,
  listarAutomacoesPendentes,
} from '@/lib/growth-automacao'
import {
  lerConfigGrowth,
  lerLeads,
  lerLogsAutomacao,
  salvarConfigGrowth,
} from '@/lib/growth-store'
import { lerConfigEmpresaLocal } from '@/lib/connect-public'
import './growth-admin.css'

type Aba = 'funil' | 'crm' | 'analytics' | 'automacao'

export default function AdminGrowthPage() {
  const [aba, setAba] = useState<Aba>('funil')
  const [carregando, setCarregando] = useState(true)
  const [resumos, setResumos] = useState<ResumoAssinatura[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoAdmin[]>([])
  const [assinaturas, setAssinaturas] = useState<AssinaturaAdmin[]>([])
  const [leads, setLeads] = useState(lerLeads())
  const [cac, setCac] = useState(0)
  const [metaMrr, setMetaMrr] = useState(0)
  const [logs, setLogs] = useState(lerLogsAutomacao())

  const carregar = useCallback(async () => {
    setCarregando(true)
    const dados = await carregarDadosAdminAssinatura()
    setResumos(dados.resumos)
    setPagamentos(dados.pagamentos)
    setAssinaturas(dados.assinaturas)
    setLeads(lerLeads())
    const cfg = lerConfigGrowth()
    setCac(cfg.cacManual)
    setMetaMrr(cfg.metaMrr)
    setLogs(lerLogsAutomacao())
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const crm = useMemo(() => montarPainelCrm(resumos, leads), [resumos, leads])
  const funil = useMemo(() => calcularFunil(crm), [crm])
  const analytics = useMemo(
    () =>
      calcularAnalyticsSaaS(resumos, pagamentos, assinaturas, crm, {
        cacManual: cac,
        metaMrr,
      }),
    [resumos, pagamentos, assinaturas, crm, cac, metaMrr],
  )
  const automacoes = useMemo(
    () => listarAutomacoesPendentes(resumos),
    [resumos],
  )

  function salvarCacMeta() {
    salvarConfigGrowth({ cacManual: cac, metaMrr })
    alert('Configuração de CAC e meta MRR salva.')
  }

  function telefoneSuporte() {
    const c = lerConfigEmpresaLocal()
    return c.telefone || process.env.NEXT_PUBLIC_CONNECT_SUPORTE_WHATSAPP || ''
  }

  return (
    <div style={{ color: '#fff', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2 }}>
        GROWTH · CONVERSÃO
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 900, margin: '8px 0 20px' }}>
        Máquina de captação e retenção
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {(
          [
            ['funil', 'Funil'],
            ['crm', 'CRM SaaS'],
            ['analytics', 'Analytics'],
            ['automacao', 'Automação'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={aba === id ? 'ga-tab ga-tab-ativo' : 'ga-tab'}
            onClick={() => setAba(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="ga-tab"
          onClick={carregar}
          style={{ marginLeft: 'auto' }}
        >
          Atualizar
        </button>
      </div>

      {carregando ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Carregando growth...</div>
      ) : null}

      {!carregando && aba === 'funil' ? (
        <section>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <FunilCard label="Leads" valor={funil.leads} />
            <FunilCard label="Trials" valor={funil.trials} />
            <FunilCard label="Convertidos" valor={funil.convertidos} />
            <FunilCard label="Lead → Trial" valor={`${funil.taxaLeadTrial}%`} />
            <FunilCard label="Trial → Pago" valor={`${funil.taxaTrialPago}%`} />
            <FunilCard label="Lead → Pago" valor={`${funil.taxaLeadPago}%`} />
          </div>
          <BarraFunil
            etapas={[
              { nome: 'Leads', qtd: crm.totais.lead },
              { nome: 'Trials', qtd: crm.totais.trial },
              { nome: 'Clientes', qtd: crm.totais.convertido },
            ]}
          />
        </section>
      ) : null}

      {!carregando && aba === 'crm' ? (
        <section style={{ display: 'grid', gap: 16 }}>
          <CrmBloco titulo="Leads" itens={crm.leads} />
          <CrmBloco titulo="Trials" itens={crm.trials} />
          <CrmBloco titulo="Convertidos" itens={crm.convertidos} />
          <CrmBloco titulo="Cancelados" itens={crm.cancelados} />
          <CrmBloco titulo="Recuperação" itens={crm.recuperacao} />
        </section>
      ) : null}

      {!carregando && aba === 'analytics' ? (
        <section>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <MetricaCard titulo="MRR real" valor={formatarMoeda(analytics.mrrReal)} />
            <MetricaCard titulo="MRR estimado" valor={formatarMoeda(analytics.mrrEstimado)} />
            <MetricaCard titulo="Churn" valor={`${analytics.churnRate}%`} />
            <MetricaCard titulo="ARPA" valor={formatarMoeda(analytics.arpa)} />
            <MetricaCard
              titulo="Crescimento mensal"
              valor={`${analytics.crescimentoMensalPct}%`}
            />
            <MetricaCard
              titulo="Receita prevista"
              valor={formatarMoeda(analytics.receitaPrevista)}
            />
          </div>
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.05)',
              display: 'grid',
              gap: 10,
              maxWidth: 420,
            }}
          >
            <label style={{ fontWeight: 800, fontSize: 13 }}>CAC manual (R$)</label>
            <input
              type="number"
              value={cac}
              onChange={(e) => setCac(Number(e.target.value))}
              style={inputAdmin}
            />
            <label style={{ fontWeight: 800, fontSize: 13 }}>Meta MRR (R$)</label>
            <input
              type="number"
              value={metaMrr}
              onChange={(e) => setMetaMrr(Number(e.target.value))}
              style={inputAdmin}
            />
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              LTV/CAC (estimado 12x ARPA): {analytics.ltvCacRatio || '—'}
            </div>
            <button type="button" onClick={salvarCacMeta} style={btnAcao}>
              Salvar parâmetros
            </button>
          </div>
          <GraficoBarras pontos={analytics.metricas.graficoMensal} />
        </section>
      ) : null}

      {!carregando && aba === 'automacao' ? (
        <section>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <button
              type="button"
              style={btnAcao}
              onClick={() => {
                const r = executarTodasAutomacoes(resumos, telefoneSuporte(), 1)
                alert(`Automação: ${r.enviados}/${r.total} abertura(s) WhatsApp.`)
                setLogs(lerLogsAutomacao())
              }}
            >
              Executar próxima automação
            </button>
            <button
              type="button"
              style={btnAcao}
              onClick={() => {
                const r = executarTodasAutomacoes(resumos, telefoneSuporte(), 8)
                alert(`Processadas ${r.enviados} de ${r.total} mensagens.`)
                setLogs(lerLogsAutomacao())
              }}
            >
              Executar lote (máx. 8)
            </button>
          </div>
          <p style={{ color: '#94a3b8', marginBottom: 12 }}>
            Trial vencendo → WhatsApp · Cobrança atrasada → lembrete · Renovação → mensagem
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {automacoes.length === 0 ? (
              <div style={{ color: '#64748b' }}>Nenhuma automação pendente.</div>
            ) : (
              automacoes.map((a, i) => (
                <div
                  key={`${a.tipo}-${a.cliente}-${i}`}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>{a.cliente}</strong>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{a.tipo}</div>
                  </div>
                  <button
                    type="button"
                    style={btnAcao}
                    onClick={() => {
                      executarAutomacao(a, telefoneSuporte())
                      setLogs(lerLogsAutomacao())
                    }}
                  >
                    Enviar WhatsApp
                  </button>
                </div>
              ))
            )}
          </div>
          <h3 style={{ marginTop: 24, fontWeight: 900 }}>Log recente</h3>
          {logs.slice(0, 10).map((l) => (
            <div key={l.id} style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>
              {new Date(l.quando).toLocaleString('pt-BR')} — {l.tipo} — {l.cliente} — {l.status}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}

function FunilCard({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div className="ga-funil-step">
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{valor}</div>
    </div>
  )
}

function BarraFunil({
  etapas,
}: {
  etapas: { nome: string; qtd: number }[]
}) {
  const max = Math.max(...etapas.map((e) => e.qtd), 1)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {etapas.map((e) => (
        <div key={e.nome}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 800 }}>{e.nome}</span>
            <span>{e.qtd}</span>
          </div>
          <div className="ga-bar">
            <div
              className="ga-bar-fill"
              style={{ width: `${Math.round((e.qtd / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function CrmBloco({ titulo, itens }: { titulo: string; itens: ItemCrm[] }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        {titulo} ({itens.length})
      </div>
      {itens.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>Vazio</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {itens.slice(0, 20).map((item) => (
            <div
              key={item.id}
              style={{
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <strong>{item.nome}</strong> · {item.email}
              {item.valor > 0 ? ` · ${formatarMoeda(item.valor)}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MetricaCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(15,23,42,0.8))',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{valor}</div>
    </div>
  )
}

function GraficoBarras({
  pontos,
}: {
  pontos: { label: string; recebido: number; previsto: number }[]
}) {
  const max = Math.max(...pontos.map((p) => Math.max(p.recebido, p.previsto)), 1)
  return (
    <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 900 }}>Crescimento mensal (recebido)</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          height: 140,
        }}
      >
        {pontos.map((p) => (
          <div key={p.label} style={{ flex: 1, textAlign: 'center' }}>
            <div
              style={{
                height: `${Math.round((p.recebido / max) * 120)}px`,
                minHeight: 4,
                borderRadius: 8,
                background: 'linear-gradient(180deg,#22c55e,#16a34a)',
              }}
            />
            <div style={{ fontSize: 11, marginTop: 6, color: '#94a3b8' }}>{p.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const inputAdmin: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(15,23,42,0.5)',
  color: '#fff',
  padding: '0 10px',
}

const btnAcao: React.CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '10px 16px',
  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
}
