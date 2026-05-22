'use client'

import { useMemo } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts'
import {
  gerarGraficoMensalPadrao,
  normalizarPontosGrafico,
  type PontoGraficoMensal,
} from '@/lib/financeiro-admin'
import { formatarMoeda } from '@/lib/assinatura-cobranca'
import { painelGlass } from './theme'
import { TooltipPremium } from './TooltipPremium'

type Props = {
  pontos?: PontoGraficoMensal[]
  mrrAtual: number
  isMobile?: boolean
}

export default function MiniGraficoMrr({ pontos, mrrAtual, isMobile }: Props) {
  const serie = useMemo(() => {
    return normalizarPontosGrafico(pontos?.length ? pontos : gerarGraficoMensalPadrao()).map(
      (p) => ({
        label: p.label,
        mrr: Number(p.previsto) || 0,
      }),
    )
  }, [pontos])

  return (
    <div style={painelGlass({ padding: isMobile ? 14 : 18, height: '100%' })}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.2, color: '#94a3b8' }}>
        MINI MRR
      </div>
      <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: '#7dd3fc', marginTop: 4 }}>
        {formatarMoeda(mrrAtual)}
      </div>
      <div style={{ width: '100%', height: isMobile ? 120 : 140, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip content={<TooltipPremium titulo="MRR" />} />
            <Line
              type="monotone"
              dataKey="mrr"
              name="mrr"
              stroke="#38bdf8"
              strokeWidth={3}
              dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#7dd3fc', stroke: '#fff', strokeWidth: 2 }}
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
