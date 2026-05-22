'use client'

import { useEffect, useMemo, useState } from 'react'
import { carregarDadosAdminAssinatura } from '@/lib/admin-dados-assinatura'
import {
  formatarMoeda,
  montarMensagemCobranca,
  type ResumoAssinatura,
} from '@/lib/assinatura-cobranca'
import {
  acaoCobrar,
  acaoRenovar,
  acaoWhatsApp,
  calcularMetricasFinanceiras,
  formatarMetrica,
  type MetricasFinanceiras,
} from '@/lib/financeiro-admin'
import GraficoMensalFinanceiro from './GraficoMensalFinanceiro'
import { ANIMACOES_FINANCEIRO_PREMIUM, FINANCEIRO_PREMIUM, painelGlass } from './premium/theme'
import SkeletonPremium from './premium/SkeletonPremium'
import HeroFinanceiroPremium from './premium/HeroFinanceiroPremium'
import RadarSaaSPremium from './premium/RadarSaaSPremium'
import CardsMetricasPremium from './premium/CardsMetricasPremium'
import GraficoReceitaMensal from './premium/GraficoReceitaMensal'
import GraficoCrescimentoClientes from './premium/GraficoCrescimentoClientes'
import MiniGraficoMrr from './premium/MiniGraficoMrr'
import RankingTopClientesPremium from './premium/RankingTopClientesPremium'

export default function AdminFinanceiroPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [adminLiberado, setAdminLiberado] = useState(true)
  const [resumos, setResumos] = useState<ResumoAssinatura[]>([])
  const [metricas, setMetricas] = useState<MetricasFinanceiras | null>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<ResumoAssinatura | null>(null)

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

  const radar = useMemo(() => {
    const ativos = resumos.filter((r) => r.grupo === 'ativo').length
    const atrasados = resumos.filter((r) => r.grupo === 'atrasado').length
    const vencendoHoje = resumos.filter((r) => r.grupo === 'vencendo_hoje').length
    const emAberto = resumos
      .filter((r) => r.grupo !== 'ativo')
      .reduce((t, r) => t + r.valorMensalidade, 0)
    return { ativos, atrasados, vencendoHoje, emAberto }
  }, [resumos])

  const cardsGraficoPrincipal = useMemo(() => {
    if (!metricas) return []
    return [
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
  }, [metricas])

  function selecionarCliente(id: string) {
    const encontrado = resumos.find((r) => r.perfil.id === id)
    if (encontrado) setClienteSelecionado(encontrado)
  }

  return (
    <div
      style={{
        color: '#e2e8f0',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        background: FINANCEIRO_PREMIUM.grafite,
        minHeight: '100%',
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: isMobile ? 28 : 40,
      }}
    >
      <style jsx global>
        {ANIMACOES_FINANCEIRO_PREMIUM}
      </style>

      <div
        style={{
          width: '100%',
          maxWidth: 1440,
          margin: '0 auto',
          display: 'grid',
          gap: isMobile ? 14 : 20,
          padding: isMobile ? '4px 2px' : '0 4px',
        }}
      >
        {carregando ? (
          <SkeletonPremium isMobile={isMobile} />
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
              <MiniGraficoMrr
                pontos={metricas.graficoMensal}
                mrrAtual={metricas.mrrEstimado}
                isMobile={isMobile}
              />
            </div>

            <RankingTopClientesPremium
              ranking={metricas.ranking}
              selecionadoId={clienteSelecionado?.perfil.id}
              onVer={selecionarCliente}
              isMobile={isMobile}
            />

            {clienteSelecionado ? (
              <PainelClienteSelecionado
                resumo={clienteSelecionado}
                onFechar={() => setClienteSelecionado(null)}
                isMobile={isMobile}
              />
            ) : null}

            <section style={painelGlass({ padding: isMobile ? 16 : 22, animation: 'fpFadeUp .5s ease .18s forwards' })}>
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
                      onVer={() => setClienteSelecionado(resumo)}
                    />
                  ))}
                {resumos.filter((item) => item.grupo === 'vencendo_hoje').length === 0 ? (
                  <div style={{ color: '#94a3b8', fontWeight: 600 }}>Nenhum cliente vencendo hoje.</div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
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
        transition: 'transform .2s ease, box-shadow .2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 16px 32px rgba(0,0,0,0.28)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
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
      style={painelGlass({
        padding: 20,
        border: '1px solid rgba(249,115,22,0.35)',
        boxShadow: `${FINANCEIRO_PREMIUM.glowOrange}, 0 24px 48px rgba(0,0,0,0.32)`,
        animation: 'fpFadeUp .35s ease',
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
        transition: 'transform .15s ease',
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.97)'
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
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
