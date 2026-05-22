'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
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
import { painelGlass } from './theme'
import { TooltipPremium } from './TooltipPremium'

type Props = {
  pontos?: PontoGraficoMensal[]
  isMobile?: boolean
}

export default function GraficoReceitaMensal({ pontos, isMobile }: Props) {
  const serie = useMemo(() => {
    return normalizarPontosGrafico(pontos?.length ? pontos : gerarGraficoMensalPadrao()).map(
      (p) => ({
        label: p.label,
        receita: Number(p.recebido) || 0,
      }),
    )
  }, [pontos])

  return (
    <div style={painelGlass({ padding: isMobile ? 14 : 18, height: '100%' })}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.2, color: '#94a3b8' }}>
        RECEITA MENSAL
      </div>
      <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 900, color: '#f8fafc', marginBottom: 12 }}>
        Entrada de caixa
      </div>
      <div style={{ width: '100%', height: isMobile ? 200 : 220, minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ade80" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<TooltipPremium titulo="Receita" />} />
            <Area
              type="monotone"
              dataKey="receita"
              name="receita"
              stroke="#4ade80"
              strokeWidth={3}
              fill="url(#gradReceita)"
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
