'use client'

import { formatarMoeda } from '@/lib/assinatura-cobranca'

export function TooltipPremium({
  active,
  payload,
  label,
  titulo,
}: {
  active?: boolean
  payload?: Array<{ value?: number; name?: string; color?: string }>
  label?: string
  titulo?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.96))',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 16,
        padding: '12px 14px',
        color: '#f8fafc',
        fontSize: 12,
        fontWeight: 700,
        boxShadow: '0 20px 40px rgba(0,0,0,0.45), 0 0 24px rgba(14,165,233,0.15)',
        minWidth: 140,
      }}
    >
      {titulo ? (
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#94a3b8',
            marginBottom: 6,
          }}
        >
          {titulo}
        </div>
      ) : null}
      <div style={{ marginBottom: 8, color: '#e2e8f0', fontWeight: 900 }}>{label}</div>
      {payload.map((item) => (
        <div
          key={String(item.name)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 6,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: item.color || '#22c55e',
              boxShadow: `0 0 10px ${item.color || '#22c55e'}`,
            }}
          />
          <span style={{ color: '#cbd5e1' }}>
            {formatarLabel(item.name)}: {formatarMoeda(Number(item.value) || 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

function formatarLabel(name?: string) {
  const mapa: Record<string, string> = {
    previsto: 'Previsto',
    recebido: 'Recebido',
    receita: 'Receita',
    clientes: 'Clientes',
    mrr: 'MRR',
  }
  return mapa[String(name || '')] || String(name || 'Valor')
}
