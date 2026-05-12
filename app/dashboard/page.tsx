'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_LOGO_PATH } from '@/lib/connect-public'

export default function DashboardPage() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const cards = [
    { titulo: 'QTDE GERADO', valor: '1', cor: 'linear-gradient(135deg, #ff7a00, #ff5e00)' },
    { titulo: 'VALOR GERADO', valor: 'R$ 100,00', cor: 'linear-gradient(135deg, #6d3df0, #b05cff)' },
    { titulo: 'QTDE APROVADO', valor: '0', cor: 'linear-gradient(135deg, #65d51b, #28c76f)' },
    { titulo: 'VALOR APROVADO', valor: 'R$ 0,00', cor: 'linear-gradient(135deg, #d4a500, #f0c419)' },
  ]

  const meses = [
    { nome: 'Jan', valor: 16 },
    { nome: 'Fev', valor: 16 },
    { nome: 'Mar', valor: 110 },
    { nome: 'Abr', valor: 16 },
    { nome: 'Mai', valor: 16 },
    { nome: 'Jun', valor: 16 },
    { nome: 'Jul', valor: 16 },
    { nome: 'Ago', valor: 16 },
    { nome: 'Set', valor: 16 },
    { nome: 'Out', valor: 16 },
    { nome: 'Nov', valor: 16 },
    { nome: 'Dez', valor: 16 },
  ]

  return (
    <div
      style={{
        color: '#fff',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
          boxSizing: 'border-box',
        }}
      >
        {/* CAPA */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 24,
            padding: isMobile ? '20px 16px' : '28px 24px',
            boxShadow: '0 18px 40px rgba(0,0,0,0.20)',
            display: 'grid',
            gap: 14,
            justifyItems: 'center',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: isMobile ? 110 : 140,
              height: isMobile ? 110 : 140,
              borderRadius: 28,
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 14px 28px rgba(0,0,0,0.20)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <img
              src={DEFAULT_LOGO_PATH}
              alt="Connect Sistema"
              style={{
                width: isMobile ? 80 : 100,
                height: isMobile ? 80 : 100,
                objectFit: 'contain',
              }}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: isMobile ? 24 : 40,
                fontWeight: 900,
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              CONNECT SISTEMA
            </div>

            <div
              style={{
                fontSize: isMobile ? 14 : 16,
                color: '#cbd5e1',
                fontWeight: 600,
              }}
            >
              Painel principal do sistema
            </div>
          </div>
        </div>

        {/* TÍTULO */}
        <div
          style={{
            fontSize: isMobile ? 22 : 32,
            fontWeight: 900,
            lineHeight: 1.1,
          }}
        >
          Dashboard Gerencial
        </div>

        {/* FILTRO */}
        <div
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18,
            padding: 14,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(160px, 1fr))',
            gap: 12,
            alignItems: 'end',
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
            boxSizing: 'border-box',
          }}
        >
          <div>
            <div style={{ fontSize: 13, marginBottom: 8, color: '#d6d6d6', fontWeight: 700 }}>
              Documento
            </div>
            <select
              style={{
                width: '100%',
                height: 44,
                borderRadius: 12,
                border: 'none',
                outline: 'none',
                padding: '0 12px',
                background: '#f3f4f6',
                color: '#111827',
                fontWeight: 700,
                boxSizing: 'border-box',
              }}
              defaultValue="todos"
            >
              <option value="todos">Todos os Documentos</option>
              <option value="orcamentos">Orçamentos</option>
              <option value="os">Ordens de Serviço</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 13, marginBottom: 8, color: '#d6d6d6', fontWeight: 700 }}>
              De
            </div>
            <input
              type="date"
              defaultValue="2026-01-01"
              style={{
                width: '100%',
                height: 44,
                borderRadius: 12,
                border: 'none',
                outline: 'none',
                padding: '0 12px',
                background: '#f97316',
                color: '#fff',
                fontWeight: 800,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 13, marginBottom: 8, color: '#d6d6d6', fontWeight: 700 }}>
              Até
            </div>
            <input
              type="date"
              defaultValue="2026-12-31"
              style={{
                width: '100%',
                height: 44,
                borderRadius: 12,
                border: 'none',
                outline: 'none',
                padding: '0 12px',
                background: '#f97316',
                color: '#fff',
                fontWeight: 800,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            style={{
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(90deg, #16a34a, #22c55e)',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
              padding: '0 18px',
            }}
          >
            IR
          </button>
        </div>

        <div
          style={{
            textAlign: isMobile ? 'left' : 'center',
            fontSize: 13,
            color: '#f2b177',
            fontStyle: 'italic',
            marginTop: -2,
          }}
        >
          As informações abaixo são atualizadas com base no período filtrado acima
        </div>

        {/* CARDS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
            gap: 14,
          }}
        >
          {cards.map((card) => (
            <div
              key={card.titulo}
              style={{
                background: card.cor,
                borderRadius: 20,
                padding: 20,
                minHeight: 112,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 14px 32px rgba(0,0,0,0.18)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 900 }}>
                {card.titulo}
              </div>

              <div style={{ fontSize: isMobile ? 24 : 36, fontWeight: 900, lineHeight: 1 }}>
                {card.valor}
              </div>

              <div
                style={{
                  width: 56,
                  height: 4,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.9)',
                }}
              />
            </div>
          ))}
        </div>

        {/* BOTÕES */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, max-content)',
            gap: 12,
            justifyContent: isMobile ? 'stretch' : 'center',
          }}
        >
          <button
            style={{
              height: 42,
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(90deg, #f97316, #ff7a00)',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
              padding: '0 18px',
            }}
          >
            Quantidade e Valor Gerado
          </button>

          <button
            style={{
              height: 42,
              borderRadius: 999,
              border: '2px solid #f97316',
              background: 'rgba(255,255,255,0.04)',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
              padding: '0 18px',
            }}
          >
            Quantidade e Valor Aprovado
          </button>
        </div>

        {/* GRÁFICO MOBILE SAFE */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '2px solid rgba(255,255,255,0.18)',
            borderRadius: 20,
            padding: isMobile ? 14 : 18,
            boxShadow: '0 14px 32px rgba(0,0,0,0.16)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#ff8b2b', fontWeight: 900, fontSize: 15 }}>
              Quantidade e Valor Gerado
            </div>
            <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 900 }}>
              Evolução mensal
            </div>
          </div>

          <div
            style={{
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.10)',
              padding: '16px 10px 12px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(12, 1fr)',
                gap: 6,
                alignItems: 'end',
                minHeight: 180,
              }}
            >
              {meses.map((item) => (
                <div
                  key={item.nome}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'end',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 24,
                      height: item.valor,
                      borderRadius: 10,
                      background: 'linear-gradient(180deg, #9eff2f, #84cc16)',
                      boxShadow: '0 8px 18px rgba(132,204,22,0.25)',
                    }}
                  />
                  <div
                    style={{
                      fontSize: isMobile ? 10 : 13,
                      fontWeight: 800,
                      color: '#fff',
                    }}
                  >
                    {item.nome}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 16,
                marginTop: 12,
                flexWrap: 'wrap',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <div>🟢 Valores</div>
              <div>🔵 Quantidades</div>
            </div>
          </div>
        </div>

        {/* PARTE DE BAIXO */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(300px, 420px) 1fr',
            gap: 16,
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '2px solid rgba(255,255,255,0.18)',
              borderRadius: 20,
              padding: 18,
              boxShadow: '0 14px 32px rgba(0,0,0,0.16)',
            }}
          >
            <div
              style={{
                height: 42,
                borderRadius: 999,
                background: 'linear-gradient(90deg, #f97316, #ff7a00)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 16,
                marginBottom: 18,
              }}
            >
              Taxa de Aprovação
            </div>

            <div
              style={{
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(0,0,0,0.12)',
                padding: 18,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: '#d1d5db', marginBottom: 14 }}>
                Aproveitamento atual
              </div>

              <div style={{ fontSize: 54, fontWeight: 900, lineHeight: 1, marginBottom: 14 }}>
                100%
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                }}
              >
                {[
                  ['Gerados', '1'],
                  ['Aprovados', '0'],
                  ['Vendidos', '1'],
                ].map(([titulo, valor]) => (
                  <div
                    key={titulo}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: '#cbd5e1',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      {titulo}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{valor}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '2px solid rgba(255,255,255,0.18)',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 14px 32px rgba(0,0,0,0.16)',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(90deg, #f97316, #ff7a00)',
                padding: '14px 18px',
                fontWeight: 900,
                fontSize: 16,
                textTransform: 'uppercase',
              }}
            >
              Últimos documentos gerados
            </div>

            <div style={{ padding: 16 }}>
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 900 }}>Orçamento - ERES FAUSTINO</div>
                <div style={{ color: '#cbd5e1', fontSize: 14 }}>84999930045</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>R$ 100,00</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}