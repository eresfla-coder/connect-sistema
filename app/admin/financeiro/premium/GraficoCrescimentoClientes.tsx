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
import {
  gerarGraficoMensalPadrao,
  normalizarPontosGrafico,
  type PontoGraficoMensal,
} from '@/lib/financeiro-admin'
import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'
import { painelGlass } from './theme'
import { TooltipPremium } from './TooltipPremium'

type Props = {
  pontos?: PontoGraficoMensal[]
  resumos: ResumoAssinatura[]
  isMobile?: boolean
}

export default function GraficoCrescimentoClientes({ pontos, resumos, isMobile }: Props) {
  const serie = useMemo(() => {
    const base = normalizarPontosGrafico(pontos?.length ? pontos : gerarGraficoMensalPadrao())
    const totalAtivos = resumos.filter((r) => r.grupo === 'ativo').length
    const totalGeral = Math.max(resumos.length, 1)

    return base.map((ponto, index) => {
      const progresso = (index + 1) / base.length
      const clientes = Math.max(
        0,
        Math.round(totalGeral * progresso * 0.65 + totalAtivos * progresso * 0.35),
      )
      return { label: ponto.label, clientes: clientes || 0 }
    })
  }, [pontos, resumos])

  return (
    <div style={painelGlass({ padding: isMobile ? 14 : 18, height: '100%' })}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.2, color: '#94a3b8' }}>
        CRESCIMENTO
      </div>
      <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 900, color: '#f8fafc', marginBottom: 12 }}>
        Evolução da base
      </div>
      <div style={{ width: '100%', height: isMobile ? 200 : 220, minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={serie} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradClientes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4338ca" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<TooltipPremium titulo="Clientes" />} />
            <Bar
              dataKey="clientes"
              name="clientes"
              fill="url(#gradClientes)"
              radius={[10, 10, 0, 0]}
              animationDuration={850}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
