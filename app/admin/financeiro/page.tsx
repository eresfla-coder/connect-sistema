'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { carregarDadosAdminAssinatura } from '@/lib/admin-dados-assinatura'
import {
  formatarMoeda,
  montarMensagemCobranca,
  NOME_SISTEMA_COBRANCA,
  type ResumoAssinatura,
} from '@/lib/assinatura-cobranca'
import {
  acaoCobrar,
  acaoRenovar,
  acaoWhatsApp,
  calcularMetricasFinanceiras,
  formatarMetrica,
  type MetricasFinanceiras,
  type RankingCliente,
} from '@/lib/financeiro-admin'
import GraficoMensalFinanceiro from './GraficoMensalFinanceiro'

const ESTILOS_ANIMACAO = `
@keyframes financeiroFadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes financeiroShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes financeiroPulseSoft {
  0%, 100% { box-shadow: 0 14px 32px rgba(0,0,0,0.20); }
  50% { box-shadow: 0 18px 38px rgba(249,115,22,0.18); }
}
`

export default function AdminFinanceiroPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [adminLiberado, setAdminLiberado] = useState(true)
  const [resumos, setResumos] = useState<ResumoAssinatura[]>([])
  const [metricas, setMetricas] = useState<MetricasFinanceiras | null>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<ResumoAssinatura | null>(
    null,
  )

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro('')

      try {
        const dados = await carregarDadosAdminAssinatura()
        if (!ativo) return

        if (dados.erro) {
          setErro(dados.erro)
          setResumos([])
          setMetricas(null)
          return
        }

        setAdminLiberado(dados.souAdmin)
        setResumos(dados.resumos)
        setMetricas(
          calcularMetricasFinanceiras(
            dados.resumos,
            dados.pagamentos,
            dados.assinaturas,
          ),
        )
      } catch {
        if (!ativo) return
        setErro('Erro inesperado ao carregar o painel financeiro.')
        setResumos([])
        setMetricas(null)
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  return (
    <div
      style={{
        color: '#e2e8f0',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <style jsx global>
        {ESTILOS_ANIMACAO}
      </style>

      <div
        style={{
          width: '100%',
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <header
          style={{
            background:
              'linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.92))',
            border: '1px solid rgba(148,163,184,0.16)',
            borderRadius: 24,
            padding: isMobile ? '18px 16px' : '24px 26px',
            boxShadow: '0 20px 44px rgba(0,0,0,0.28)',
            animation: 'financeiroFadeUp .45s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 900, color: '#f8fafc' }}>
                Financeiro Premium
              </div>
              <div style={{ color: '#94a3b8', fontWeight: 600, marginTop: 4 }}>
                Visão executiva — {NOME_SISTEMA_COBRANCA}
              </div>
            </div>
            <Link
              href="/admin/cobranca"
              style={{
                textDecoration: 'none',
                padding: '10px 16px',
                borderRadius: 12,
                background: 'rgba(249,115,22,0.14)',
                border: '1px solid rgba(249,115,22,0.35)',
                color: '#fdba74',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              Ir para Cobrança →
            </Link>
          </div>
          {!adminLiberado ? (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.28)',
                color: '#fde68a',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Modo resumido: exibindo apenas seus dados. Configure admin no perfil para visão
              completa.
            </div>
          ) : null}
        </header>

        {carregando ? (
          <SkeletonPainel isMobile={isMobile} />
        ) : erro ? (
          <div
            style={{
              padding: 20,
              borderRadius: 18,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.10)',
              color: '#fecaca',
              fontWeight: 700,
            }}
          >
            {erro}
          </div>
        ) : metricas ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '1fr'
                  : 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <CardMetrica
                titulo="Faturamento previsto (mês)"
                valor={formatarMetrica(metricas.faturamentoPrevistoMes)}
                gradiente="linear-gradient(135deg,#6366f1,#4338ca)"
                atrasoAnimacao={0}
              />
              <CardMetrica
                titulo="Total recebido"
                valor={formatarMetrica(metricas.totalRecebido)}
                gradiente="linear-gradient(135deg,#22c55e,#15803d)"
                atrasoAnimacao={60}
              />
              <CardMetrica
                titulo="Total atrasado"
                valor={formatarMetrica(metricas.totalAtrasado)}
                gradiente="linear-gradient(135deg,#ef4444,#b91c1c)"
                atrasoAnimacao={120}
              />
              <CardMetrica
                titulo="Vencendo hoje"
                valor={String(metricas.clientesVencendoHoje)}
                gradiente="linear-gradient(135deg,#f59e0b,#d97706)"
                atrasoAnimacao={180}
                suffixo="clientes"
              />
              <CardMetrica
                titulo="MRR estimado"
                valor={formatarMetrica(metricas.mrrEstimado)}
                gradiente="linear-gradient(135deg,#0ea5e9,#0369a1)"
                atrasoAnimacao={240}
              />
              <CardMetrica
                titulo="Ticket médio"
                valor={formatarMetrica(metricas.ticketMedio)}
                gradiente="linear-gradient(135deg,#a855f7,#7e22ce)"
                atrasoAnimacao={300}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
                gap: 14,
              }}
            >
              <section
                style={{
                  borderRadius: 20,
                  border: '1px solid rgba(148,163,184,0.14)',
                  background:
                    'linear-gradient(180deg, rgba(30,41,59,0.72), rgba(15,23,42,0.88))',
                  padding: 18,
                  opacity: 1,
                  animation: 'financeiroFadeUp .5s ease .1s forwards',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 14, color: '#f8fafc' }}>
                  Gráfico mensal
                </div>
                <GraficoMensalFinanceiro
                  pontos={metricas.graficoMensal}
                  isMobile={isMobile}
                />
              </section>

              <section
                style={{
                  borderRadius: 20,
                  border: '1px solid rgba(148,163,184,0.14)',
                  background:
                    'linear-gradient(180deg, rgba(30,41,59,0.72), rgba(15,23,42,0.88))',
                  padding: 18,
                  animation: 'financeiroFadeUp .5s ease .15s forwards',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 14, color: '#f8fafc' }}>
                  Ranking clientes
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {metricas.ranking.map((item) => (
                    <RankingLinha
                      key={item.resumo.perfil.id}
                      item={item}
                      selecionado={clienteSelecionado?.perfil.id === item.resumo.perfil.id}
                      onVer={() => setClienteSelecionado(item.resumo)}
                    />
                  ))}
                  {metricas.ranking.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 13 }}>
                      Sem clientes para ranquear.
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            {clienteSelecionado ? (
              <PainelClienteSelecionado
                resumo={clienteSelecionado}
                onFechar={() => setClienteSelecionado(null)}
                isMobile={isMobile}
              />
            ) : null}

            <section
              style={{
                borderRadius: 20,
                border: '1px solid rgba(148,163,184,0.14)',
                background:
                  'linear-gradient(180deg, rgba(30,41,59,0.72), rgba(15,23,42,0.88))',
                padding: 18,
                animation: 'financeiroFadeUp .5s ease .2s forwards',
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12, color: '#f8fafc' }}>
                Atalhos rápidos — vencendo hoje
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {resumos
                  .filter((item) => item.grupo === 'vencendo_hoje')
                  .map((resumo) => (
                    <AtalhosCliente
                      key={resumo.perfil.id}
                      resumo={resumo}
                      onVer={() => setClienteSelecionado(resumo)}
                    />
                  ))}
                {resumos.filter((item) => item.grupo === 'vencendo_hoje').length === 0 ? (
                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>
                    Nenhum cliente vencendo hoje.
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

function CardMetrica({
  titulo,
  valor,
  gradiente,
  atrasoAnimacao,
  suffixo,
}: {
  titulo: string
  valor: string
  gradiente: string
  atrasoAnimacao: number
  suffixo?: string
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 16,
        background: gradiente,
        color: '#fff',
        boxShadow: '0 14px 32px rgba(0,0,0,0.22)',
        animation: `financeiroFadeUp .45s ease ${atrasoAnimacao}ms both, financeiroPulseSoft 4s ease-in-out infinite`,
        transition: 'transform .18s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.15, marginTop: 8 }}>{valor}</div>
      {suffixo ? (
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginTop: 4 }}>{suffixo}</div>
      ) : null}
    </div>
  )
}

function RankingLinha({
  item,
  selecionado,
  onVer,
}: {
  item: RankingCliente
  selecionado: boolean
  onVer: () => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 12,
        background: selecionado ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.04)',
        border: selecionado
          ? '1px solid rgba(249,115,22,0.35)'
          : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 900,
          background: 'rgba(249,115,22,0.18)',
          color: '#fdba74',
        }}
      >
        {item.posicao}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.resumo.nomeCliente}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
          {formatarMoeda(item.valor)}
          {item.totalPago > 0 ? ` · pago ${formatarMoeda(item.totalPago)}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={onVer}
        style={{
          border: 'none',
          borderRadius: 10,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.08)',
          color: '#e2e8f0',
          fontWeight: 800,
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Ver
      </button>
    </div>
  )
}

function AtalhosCliente({
  resumo,
  onVer,
}: {
  resumo: ResumoAssinatura
  onVer: () => void
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(15,23,42,0.55)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 900 }}>{resumo.nomeCliente}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>
        {formatarMoeda(resumo.valorMensalidade)} · vence {resumo.vencimentoFormatado}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <BotaoAtalho label="Cobrar" onClick={() => acaoCobrar(resumo)} cor="#16a34a" />
        <BotaoAtalho label="Renovar" onClick={() => acaoRenovar(resumo)} cor="#2563eb" />
        <BotaoAtalho label="WhatsApp" onClick={() => acaoWhatsApp(resumo)} cor="#15803d" />
        <BotaoAtalho label="Ver cliente" onClick={onVer} cor="#475569" />
      </div>
    </div>
  )
}

function PainelClienteSelecionado({
  resumo,
  onFechar,
  isMobile,
}: {
  resumo: ResumoAssinatura
  onFechar: () => void
  isMobile: boolean
}) {
  return (
    <section
      style={{
        borderRadius: 20,
        border: '1px solid rgba(249,115,22,0.28)',
        background: 'linear-gradient(180deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
        padding: 18,
        animation: 'financeiroFadeUp .35s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc' }}>
            {resumo.nomeCliente}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{resumo.perfil.email || '—'}</div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          style={{
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'transparent',
            color: '#cbd5e1',
            borderRadius: 10,
            padding: '8px 12px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Fechar
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <MiniInfo titulo="Mensalidade" valor={formatarMoeda(resumo.valorMensalidade)} />
        <MiniInfo titulo="Vencimento" valor={resumo.vencimentoFormatado} />
        <MiniInfo titulo="Status" valor={resumo.statusTexto} />
        <MiniInfo
          titulo="Atraso"
          valor={resumo.diasAtraso > 0 ? `${resumo.diasAtraso} dias` : '0'}
        />
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 12,
          background: 'rgba(0,0,0,0.22)',
          fontSize: 12,
          color: '#cbd5e1',
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        {montarMensagemCobranca(resumo)}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, max-content)',
          gap: 8,
        }}
      >
        <BotaoAtalho label="Cobrar" onClick={() => acaoCobrar(resumo)} cor="#16a34a" />
        <BotaoAtalho label="Renovar" onClick={() => acaoRenovar(resumo)} cor="#2563eb" />
        <BotaoAtalho label="WhatsApp" onClick={() => acaoWhatsApp(resumo)} cor="#15803d" />
      </div>
    </section>
  )
}

function BotaoAtalho({
  label,
  onClick,
  cor,
}: {
  label: string
  onClick: () => void
  cor: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 12,
        padding: '10px 12px',
        background: cor,
        color: '#fff',
        fontWeight: 900,
        fontSize: 12,
        cursor: 'pointer',
        boxShadow: '0 8px 18px rgba(0,0,0,0.18)',
      }}
    >
      {label}
    </button>
  )
}

function MiniInfo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
        {titulo}
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>{valor}</div>
    </div>
  )
}

function SkeletonPainel({ isMobile }: { isMobile: boolean }) {
  const bloco: CSSProperties = {
    borderRadius: 18,
    minHeight: 96,
    background:
      'linear-gradient(90deg, rgba(51,65,85,0.45) 0%, rgba(71,85,105,0.65) 50%, rgba(51,65,85,0.45) 100%)',
    backgroundSize: '200% 100%',
    animation: 'financeiroShimmer 1.4s ease-in-out infinite',
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={bloco} />
        ))}
      </div>
      <div style={{ ...bloco, minHeight: 220 }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 12,
        }}
      >
        <div style={{ ...bloco, minHeight: 260 }} />
        <div style={{ ...bloco, minHeight: 260 }} />
      </div>
    </div>
  )
}
