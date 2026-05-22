'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatarMoeda } from '@/lib/assinatura-cobranca'
import {
  gerarGraficoMensalPadrao,
  graficoSemDadosSuficientes,
  normalizarPontosGrafico,
  type PontoGraficoMensal,
} from '@/lib/financeiro-admin'

type Props = {
  pontos?: PontoGraficoMensal[]
  isMobile?: boolean
}

type DadoGrafico = {
  mes: string
  label: string
  previsto: number
  recebido: number
}

function TooltipFinanceiro({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number; name?: string; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div
      style={{
        background: 'rgba(15,23,42,0.96)',
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 12,
        padding: '10px 12px',
        color: '#f8fafc',
        fontSize: 12,
        fontWeight: 700,
        boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ marginBottom: 6, color: '#94a3b8' }}>{label}</div>
      {payload.map((item) => (
        <div key={String(item.name)} style={{ marginTop: 4 }}>
          {item.name === 'previsto' ? 'Previsto' : 'Recebido'}:{' '}
          {formatarMoeda(Number(item.value) || 0)}
        </div>
      ))}
    </div>
  )
}

export default function GraficoMensalFinanceiro({ pontos, isMobile }: Props) {
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

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {semDados ? (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            zIndex: 2,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(15,23,42,0.82)',
            border: '1px dashed rgba(148,163,184,0.35)',
            color: '#cbd5e1',
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          Sem dados suficientes ainda
        </div>
      ) : null}

      <div
        style={{
          width: '100%',
          height: isMobile ? 280 : 320,
          minHeight: 280,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={serie}
            margin={{
              top: 16,
              right: isMobile ? 4 : 12,
              left: isMobile ? -8 : 0,
              bottom: 4,
            }}
            barGap={4}
            barCategoryGap="22%"
          >
            <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12, fontWeight: 700 }}
              axisLine={{ stroke: 'rgba(148,163,184,0.25)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 52 : 64}
              tickFormatter={(valor) => {
                if (valor >= 1000) return `R$ ${(valor / 1000).toFixed(1)}k`
                return `R$ ${valor}`
              }}
            />
            <Tooltip content={<TooltipFinanceiro />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar
              dataKey="previsto"
              name="previsto"
              fill="rgba(148,163,184,0.55)"
              radius={[8, 8, 0, 0]}
              minPointSize={4}
            />
            <Bar
              dataKey="recebido"
              name="recebido"
              fill="#22c55e"
              radius={[8, 8, 0, 0]}
              minPointSize={4}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 12,
          fontSize: 12,
          fontWeight: 700,
          color: '#94a3b8',
          justifyContent: 'center',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: 'rgba(148,163,184,0.55)',
            }}
          />
          Previsto
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: '#22c55e',
            }}
          />
          Recebido
        </span>
      </div>
    </div>
  )
}
