'use client'

import {
  formatarMoeda,
  montarMensagemCobranca,
  type ResumoAssinatura,
} from '@/lib/assinatura-cobranca'
import {
  acaoCobrar,
  acaoRenovar,
  acaoWhatsApp,
  formatarMetrica,
  type MetricasFinanceiras,
} from '@/lib/financeiro-admin'
import GraficoMensalFinanceiro from '../GraficoMensalFinanceiro'
import { FINANCEIRO_PREMIUM, painelGlass } from './theme'
import HeroFinanceiroPremium from './HeroFinanceiroPremium'
import RadarSaaSPremium from './RadarSaaSPremium'
import CardsMetricasPremium from './CardsMetricasPremium'
import GraficoReceitaMensal from './GraficoReceitaMensal'
import GraficoCrescimentoClientes from './GraficoCrescimentoClientes'
import MiniGraficoMrr from './MiniGraficoMrr'
import RankingTopClientesPremium from './RankingTopClientesPremium'
import SkeletonPremium from './SkeletonPremium'

export type FinanceiroPremiumPainelProps = {
  isMobile: boolean
  carregando: boolean
  erro: string
  adminLiberado: boolean
  resumos: ResumoAssinatura[]
  metricas: MetricasFinanceiras
  clienteSelecionado: ResumoAssinatura | null
  onSelecionarCliente: (resumo: ResumoAssinatura | null) => void
}

export default function FinanceiroPremiumPainel({
  isMobile,
  carregando,
  erro,
  adminLiberado,
  resumos,
  metricas,
  clienteSelecionado,
  onSelecionarCliente,
}: FinanceiroPremiumPainelProps) {
  const radar = {
    ativos: resumos.filter((r) => r.grupo === 'ativo').length,
    atrasados: resumos.filter((r) => r.grupo === 'atrasado').length,
    vencendoHoje: resumos.filter((r) => r.grupo === 'vencendo_hoje').length,
    emAberto: resumos
      .filter((r) => r.grupo !== 'ativo')
      .reduce((t, r) => t + r.valorMensalidade, 0),
  }

  const cardsGraficoPrincipal = [
    {
      label: 'Previsto mês',
      valor: formatarMetrica(metricas.faturamentoPrevistoMes),
      cor: '#a5b4fc',
    },
    {
      label: 'Recebido',
      valor: formatarMetrica(metricas.totalRecebido),
      cor: '#4ade80',
    },
    {
      label: 'Atrasado',
      valor: formatarMetrica(metricas.totalAtrasado),
      cor: '#f87171',
    },
  ]

  if (carregando) {
    return (
      <div className="fp-page-inner" style={{ gap: isMobile ? 14 : 20, padding: isMobile ? '4px 2px' : '0 4px' }}>
        <SkeletonPremium isMobile={isMobile} />
      </div>
    )
  }

  return (
    <div
      className="fp-page-inner fp-animate-in"
      style={{
        gap: isMobile ? 14 : 20,
        padding: isMobile ? '8px 4px 28px' : '0 4px 40px',
      }}
    >
      {erro ? (
        <div
          role="alert"
          style={{
            padding: 16,
            borderRadius: 16,
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.12)',
            color: '#fecaca',
            fontWeight: 700,
          }}
        >
          {erro}
        </div>
      ) : null}

      <HeroFinanceiroPremium
        mrr={metricas.mrrEstimado}
        recebido={metricas.totalRecebido}
        vencendoHoje={metricas.clientesVencendoHoje}
        totalClientes={resumos.length}
        isMobile={isMobile}
        adminLiberado={adminLiberado}
      />

      <RadarSaaSPremium
        ativos={radar.ativos}
        atrasados={radar.atrasados}
        vencendoHoje={radar.vencendoHoje}
        emAberto={radar.emAberto}
        isMobile={isMobile}
      />

      <CardsMetricasPremium metricas={metricas} isMobile={isMobile} />

      <GraficoMensalFinanceiro
        pontos={metricas.graficoMensal}
        isMobile={isMobile}
        variant="hero"
        cardsIntegrados={cardsGraficoPrincipal}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 14,
        }}
      >
        <GraficoReceitaMensal pontos={metricas.graficoMensal} isMobile={isMobile} />
        <GraficoCrescimentoClientes
          pontos={metricas.graficoMensal}
          resumos={resumos}
          isMobile={isMobile}
        />
        <MiniGraficoMrr pontos={metricas.graficoMensal} mrrAtual={metricas.mrrEstimado} isMobile={isMobile} />
      </div>

      <RankingTopClientesPremium
        ranking={metricas.ranking}
        selecionadoId={clienteSelecionado?.perfil.id}
        onVer={(id) => {
          const encontrado = resumos.find((r) => r.perfil.id === id)
          onSelecionarCliente(encontrado || null)
        }}
        isMobile={isMobile}
      />

      {clienteSelecionado ? (
        <PainelClienteSelecionado
          resumo={clienteSelecionado}
          onFechar={() => onSelecionarCliente(null)}
          isMobile={isMobile}
        />
      ) : null}

      <section className="fp-animate-in" style={painelGlass({ padding: isMobile ? 16 : 22 })}>
        <div style={{ fontWeight: 900, fontSize: isMobile ? 18 : 22, color: '#f8fafc', marginBottom: 14 }}>
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
              <AtalhosClientePremium
                key={resumo.perfil.id}
                resumo={resumo}
                onVer={() => onSelecionarCliente(resumo)}
              />
            ))}
          {resumos.filter((item) => item.grupo === 'vencendo_hoje').length === 0 ? (
            <div style={{ color: '#94a3b8', fontWeight: 600 }}>Nenhum cliente vencendo hoje.</div>
          ) : null}
        </div>
      </section>

      <div
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'rgba(148,163,184,0.65)',
          fontWeight: 700,
          letterSpacing: 0.6,
        }}
      >
        Connect Financeiro AAA · interface v2 integrada
      </div>
    </div>
  )
}

function AtalhosClientePremium({
  resumo,
  onVer,
}: {
  resumo: ResumoAssinatura
  onVer: () => void
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(15,23,42,0.55)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16 }}>{resumo.nomeCliente}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>
        {formatarMoeda(resumo.valorMensalidade)} · vence {resumo.vencimentoFormatado}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <BotaoPremium label="Cobrar" onClick={() => acaoCobrar(resumo)} tipo="verde" />
        <BotaoPremium label="Renovar" onClick={() => acaoRenovar(resumo)} tipo="azul" />
        <BotaoPremium label="WhatsApp" onClick={() => acaoWhatsApp(resumo)} tipo="verde" />
        <BotaoPremium label="Ver cliente" onClick={onVer} tipo="grafite" />
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
      className="fp-animate-in"
      style={painelGlass({
        padding: 20,
        border: '1px solid rgba(249,115,22,0.35)',
        boxShadow: `${FINANCEIRO_PREMIUM.glowOrange}, 0 24px 48px rgba(0,0,0,0.32)`,
      })}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#f8fafc' }}>{resumo.nomeCliente}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{resumo.perfil.email || '—'}</div>
        </div>
        <button type="button" onClick={onFechar} style={botaoGhost()}>
          Fechar
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <MiniInfo titulo="Mensalidade" valor={formatarMoeda(resumo.valorMensalidade)} />
        <MiniInfo titulo="Vencimento" valor={resumo.vencimentoFormatado} />
        <MiniInfo titulo="Status" valor={resumo.statusTexto} />
        <MiniInfo titulo="Atraso" valor={resumo.diasAtraso > 0 ? `${resumo.diasAtraso} dias` : '0'} />
      </div>
      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: 'rgba(0,0,0,0.25)',
          fontSize: 12,
          color: '#cbd5e1',
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        {montarMensagemCobranca(resumo)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <BotaoPremium label="Cobrar" onClick={() => acaoCobrar(resumo)} tipo="verde" />
        <BotaoPremium label="Renovar" onClick={() => acaoRenovar(resumo)} tipo="azul" />
        <BotaoPremium label="WhatsApp" onClick={() => acaoWhatsApp(resumo)} tipo="verde" />
      </div>
    </section>
  )
}

function BotaoPremium({
  label,
  onClick,
  tipo,
}: {
  label: string
  onClick: () => void
  tipo: 'verde' | 'azul' | 'grafite'
}) {
  const cores = {
    verde: 'linear-gradient(135deg,#22c55e,#16a34a)',
    azul: 'linear-gradient(135deg,#3b82f6,#2563eb)',
    grafite: 'linear-gradient(135deg,#64748b,#475569)',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 12,
        padding: '11px 12px',
        background: cores[tipo],
        color: '#fff',
        fontWeight: 900,
        fontSize: 12,
        cursor: 'pointer',
        boxShadow: '0 10px 22px rgba(0,0,0,0.22)',
      }}
    >
      {label}
    </button>
  )
}

function botaoGhost() {
  return {
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'transparent',
    color: '#cbd5e1',
    borderRadius: 12,
    padding: '10px 14px',
    fontWeight: 800,
    cursor: 'pointer',
  } as const
}

function MiniInfo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
        {titulo}
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4 }}>{valor}</div>
    </div>
  )
}
