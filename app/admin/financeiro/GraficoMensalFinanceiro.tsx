'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  gerarGraficoMensalPadrao,
  graficoSemDadosSuficientes,
  normalizarPontosGrafico,
  type PontoGraficoMensal,
} from '@/lib/financeiro-admin'
import { TooltipPremium } from './premium/TooltipPremium'
import { FINANCEIRO_PREMIUM, painelGlass } from './premium/theme'

type Props = {
  pontos?: PontoGraficoMensal[]
  isMobile?: boolean
  variant?: 'default' | 'hero'
  cardsIntegrados?: Array<{ label: string; valor: string; cor: string }>
}

type DadoGrafico = {
  mes: string
  label: string
  previsto: number
  recebido: number
}

export default function GraficoMensalFinanceiro({
  pontos,
  isMobile,
  variant = 'default',
  cardsIntegrados,
}: Props) {
  const hero = variant === 'hero'
  const altura = hero ? (isMobile ? 340 : 420) : isMobile ? 280 : 320

  const serie = useMemo(() => {
    const normalizados = normalizarPontosGrafico(pontos?.length ? pontos : gerarGraficoMensalPadrao())
    return normalizados.map(
      (ponto): DadoGrafico => ({
        mes: ponto.mes,
        label: ponto.label,
        previsto: Number(ponto.previsto) || 0,
        recebido: Number(ponto.recebido) || 0,
      }),
    )
  }, [pontos])

  const semDados = graficoSemDadosSuficientes(serie)

  const conteudo = (
    <div style={{ position: 'relative', width: '100%' }}>
      {semDados ? (
        <div
          style={{
            position: 'absolute',
            top: hero ? 20 : 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3,
            padding: '10px 16px',
            borderRadius: 999,
            background: 'rgba(15,23,42,0.88)',
            border: '1px dashed rgba(148,163,184,0.35)',
            color: '#cbd5e1',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Sem dados suficientes ainda
        </div>
      ) : null}

      {hero && cardsIntegrados?.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {cardsIntegrados.map((card) => (
            <div
              key={card.label}
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                background: 'rgba(15,23,42,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: `0 0 24px ${card.cor}22`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8' }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: card.cor, marginTop: 4 }}>
                {card.valor}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          width: '100%',
          height: altura,
          minHeight: 280,
          borderRadius: hero ? 18 : 0,
          background: hero
            ? 'radial-gradient(ellipse at 50% 0%, rgba(14,165,233,0.12) 0%, transparent 55%)'
            : 'transparent',
          filter: hero ? 'drop-shadow(0 0 24px rgba(34,197,94,0.12))' : 'none',
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={serie}
            margin={{
              top: hero ? 24 : 16,
              right: isMobile ? 4 : 16,
              left: isMobile ? -6 : 4,
              bottom: 8,
            }}
            barGap={hero ? 6 : 4}
            barCategoryGap={hero ? '28%' : '22%'}
          >
            <defs>
              <linearGradient id="fpGradPrevisto" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#475569" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="fpGradRecebido" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#15803d" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12, fontWeight: 700 }}
              axisLine={{ stroke: 'rgba(148,163,184,0.2)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 54 : 72}
              tickFormatter={(valor) => {
                if (valor >= 1000) return `R$ ${(valor / 1000).toFixed(1)}k`
                return `R$ ${valor}`
              }}
            />
            <Tooltip
              content={<TooltipPremium titulo="Performance mensal" />}
              cursor={{ fill: 'rgba(125,211,252,0.08)' }}
            />
            <Bar
              dataKey="previsto"
              name="previsto"
              fill="url(#fpGradPrevisto)"
              radius={[10, 10, 0, 0]}
              minPointSize={6}
              animationDuration={hero ? 1100 : 800}
            />
            <Bar
              dataKey="recebido"
              name="recebido"
              fill="url(#fpGradRecebido)"
              radius={[10, 10, 0, 0]}
              minPointSize={6}
              animationDuration={hero ? 1200 : 900}
            >
              {serie.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill="url(#fpGradRecebido)"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(74,222,128,0.35))' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 14,
          fontSize: 12,
          fontWeight: 700,
          color: '#94a3b8',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Legenda cor="linear-gradient(180deg,#94a3b8,#475569)" texto="Previsto" />
        <Legenda cor="linear-gradient(180deg,#4ade80,#15803d)" texto="Recebido" glow />
      </div>
    </div>
  )

  if (hero) {
    return (
      <section
        style={painelGlass({
          padding: isMobile ? 16 : 24,
          boxShadow: `${FINANCEIRO_PREMIUM.glowGreen}, 0 28px 56px rgba(0,0,0,0.35)`,
          animation: 'fpFadeUp .55s ease .08s forwards',
        })}
      >
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: '#94a3b8' }}>
            GRÁFICO PRINCIPAL
          </div>
          <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: '#f8fafc' }}>
            Performance financeira mensal
          </div>
        </div>
        {conteudo}
      </section>
    )
  }

  return conteudo
}

function Legenda({
  cor,
  texto,
  glow,
}: {
  cor: string
  texto: string
  glow?: boolean
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 4,
          background: cor,
          boxShadow: glow ? '0 0 12px rgba(74,222,128,0.5)' : 'none',
        }}
      />
      {texto}
    </span>
  )
}
