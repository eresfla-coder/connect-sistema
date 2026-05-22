'use client'

import { formatarMoeda } from '@/lib/assinatura-cobranca'
import type { RankingCliente } from '@/lib/financeiro-admin'
import { painelGlass } from './theme'

type Props = {
  ranking: RankingCliente[]
  selecionadoId?: string
  onVer: (id: string) => void
  isMobile: boolean
}

const CORES_TOP = ['#fbbf24', '#cbd5e1', '#d97706', '#94a3b8']

export default function RankingTopClientesPremium({
  ranking,
  selecionadoId,
  onVer,
  isMobile,
}: Props) {
  const maxValor = Math.max(1, ...ranking.map((r) => Math.max(r.valor, r.totalPago)))

  return (
    <section style={painelGlass({ padding: isMobile ? 16 : 22, animation: 'fpFadeUp .55s ease .12s forwards' })}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.3, color: '#94a3b8' }}>
          TOP CLIENTES
        </div>
        <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: '#f8fafc' }}>
          Ranking visual premium
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {ranking.map((item, index) => {
          const score = Math.max(item.valor, item.totalPago)
          const largura = `${Math.max(8, (score / maxValor) * 100)}%`
          const corBarra =
            index < 3
              ? `linear-gradient(90deg, ${CORES_TOP[index]}aa, ${CORES_TOP[index]}33)`
              : 'linear-gradient(90deg, rgba(249,115,22,0.55), rgba(249,115,22,0.12))'
          const ativo = selecionadoId === item.resumo.perfil.id

          return (
            <div
              key={item.resumo.perfil.id}
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: ativo
                  ? 'rgba(249,115,22,0.12)'
                  : 'rgba(15,23,42,0.45)',
                border: ativo
                  ? '1px solid rgba(249,115,22,0.4)'
                  : '1px solid rgba(255,255,255,0.08)',
                animation: `fpFadeUp .4s ease ${index * 50}ms forwards`,
                transition: 'transform .2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateX(4px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateX(0)'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 900,
                    fontSize: 16,
                    background:
                      index === 0
                        ? 'linear-gradient(135deg,#fbbf24,#f59e0b)'
                        : 'rgba(255,255,255,0.08)',
                    color: index === 0 ? '#422006' : '#fdba74',
                    boxShadow: index === 0 ? '0 0 20px rgba(251,191,36,0.4)' : 'none',
                  }}
                >
                  {item.posicao}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 15,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.resumo.nomeCliente}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>
                    {formatarMoeda(item.valor)}
                    {item.totalPago > 0 ? ` · ${formatarMoeda(item.totalPago)} pago` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onVer(item.resumo.perfil.id)}
                  style={{
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 14px',
                    background: 'linear-gradient(135deg,#f97316,#ea580c)',
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: 12,
                    cursor: 'pointer',
                    boxShadow: '0 8px 20px rgba(249,115,22,0.35)',
                  }}
                >
                  Ver
                </button>
              </div>
              <div
                style={{
                  marginTop: 12,
                  height: 10,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: largura,
                    height: '100%',
                    borderRadius: 999,
                    background: corBarra,
                    boxShadow: '0 0 16px rgba(249,115,22,0.25)',
                    transformOrigin: 'left center',
                    animation: 'fpBarGrow .7s ease forwards',
                  }}
                />
              </div>
            </div>
          )
        })}
        {ranking.length === 0 ? (
          <div style={{ color: '#94a3b8', fontWeight: 600 }}>Sem clientes para ranquear.</div>
        ) : null}
      </div>
    </section>
  )
}
