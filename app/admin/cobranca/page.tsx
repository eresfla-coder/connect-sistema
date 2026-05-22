'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { carregarDadosAdminAssinatura } from '@/lib/admin-dados-assinatura'
import {
  abrirWhatsAppCobranca,
  formatarMoeda,
  NOME_SISTEMA_COBRANCA,
  type GrupoCobranca,
  type ResumoAssinatura,
} from '@/lib/assinatura-cobranca'

type FiltroPainel = GrupoCobranca | 'todos'

export default function AdminCobrancaPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroPainel>('todos')
  const [assinaturas, setAssinaturas] = useState<ResumoAssinatura[]>([])
  const [adminLiberado, setAdminLiberado] = useState(true)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let ativo = true

    async function carregarPainel() {
      setCarregando(true)
      setErro('')

      try {
        const dados = await carregarDadosAdminAssinatura()
        if (!ativo) return

        if (dados.erro) {
          setErro(dados.erro)
          setAssinaturas([])
          return
        }

        setAdminLiberado(dados.souAdmin)
        setAssinaturas(dados.resumos)
      } catch {
        if (!ativo) return
        setErro('Erro inesperado ao montar o painel de cobrança.')
        setAssinaturas([])
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregarPainel()

    return () => {
      ativo = false
    }
  }, [])

  const contadores = useMemo(() => {
    return {
      vencendo_hoje: assinaturas.filter((item) => item.grupo === 'vencendo_hoje').length,
      atrasado: assinaturas.filter((item) => item.grupo === 'atrasado').length,
      ativo: assinaturas.filter((item) => item.grupo === 'ativo').length,
      todos: assinaturas.length,
    }
  }, [assinaturas])

  const listaFiltrada = useMemo(() => {
    if (filtro === 'todos') return assinaturas
    return assinaturas.filter((item) => item.grupo === filtro)
  }, [assinaturas, filtro])

  const valorEmAberto = useMemo(() => {
    return assinaturas
      .filter((item) => item.grupo !== 'ativo')
      .reduce((total, item) => total + item.valorMensalidade, 0)
  }, [assinaturas])

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
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 24,
            padding: isMobile ? '20px 16px' : '26px 24px',
            boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 900, lineHeight: 1.1 }}>
              Cobrança Premium
            </div>
            <Link
              href="/admin/financeiro"
              style={{
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 12,
                background: 'rgba(14,165,233,0.14)',
                border: '1px solid rgba(14,165,233,0.35)',
                color: '#7dd3fc',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              Financeiro →
            </Link>
          </div>
          <div style={{ color: '#cbd5e1', fontWeight: 600, fontSize: isMobile ? 14 : 16 }}>
            Mini painel administrativo — assinaturas {NOME_SISTEMA_COBRANCA}
          </div>
          {!adminLiberado ? (
            <div
              style={{
                marginTop: 4,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.28)',
                color: '#fde68a',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Exibindo apenas sua assinatura. Para ver todos os clientes, marque o perfil como
              admin no Supabase ou configure NEXT_PUBLIC_CONNECT_ADMIN_EMAILS.
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          {(
            [
              ['vencendo_hoje', 'Vencendo hoje', 'linear-gradient(135deg,#f59e0b,#d97706)'],
              ['atrasado', 'Atrasados', 'linear-gradient(135deg,#ef4444,#b91c1c)'],
              ['ativo', 'Ativos', 'linear-gradient(135deg,#22c55e,#15803d)'],
              ['todos', 'Total', 'linear-gradient(135deg,#6366f1,#4338ca)'],
            ] as const
          ).map(([chave, titulo, cor]) => {
            const ativoCard = filtro === chave
            const valor =
              chave === 'todos'
                ? contadores.todos
                : contadores[chave as GrupoCobranca]

            return (
              <button
                key={chave}
                type="button"
                onClick={() => setFiltro(chave)}
                style={{
                  textAlign: 'left',
                  border: ativoCard
                    ? '2px solid rgba(255,255,255,0.45)'
                    : '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 18,
                  padding: 16,
                  background: cor,
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: ativoCard
                    ? '0 16px 34px rgba(0,0,0,0.28)'
                    : '0 10px 24px rgba(0,0,0,0.18)',
                  transform: ativoCard ? 'translateY(-2px)' : 'none',
                  transition: 'transform .15s ease, box-shadow .15s ease, border .15s ease',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.92 }}>{titulo}</div>
                <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 900, lineHeight: 1.1 }}>
                  {valor}
                </div>
              </button>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <div style={{ fontWeight: 800, color: '#e2e8f0' }}>
            Em aberto (hoje + atrasados):{' '}
            <span style={{ color: '#fbbf24' }}>{formatarMoeda(valorEmAberto)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
            WhatsApp abre em nova aba — o sistema continua aberto (PC e PWA).
          </div>
        </div>

        {carregando ? (
          <div
            style={{
              padding: 28,
              textAlign: 'center',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.03)',
              fontWeight: 700,
              color: '#cbd5e1',
            }}
          >
            Carregando assinaturas...
          </div>
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
        ) : listaFiltrada.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              borderRadius: 18,
              border: '1px dashed rgba(255,255,255,0.18)',
              color: '#94a3b8',
              fontWeight: 700,
            }}
          >
            Nenhuma assinatura neste filtro.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 14,
            }}
          >
            {listaFiltrada.map((item) => (
              <article
                key={item.perfil.id}
                style={{
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                  padding: 16,
                  display: 'grid',
                  gap: 12,
                  boxShadow: '0 14px 30px rgba(0,0,0,0.18)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.nomeCliente}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#94a3b8',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.perfil.email || '—'}
                    </div>
                  </div>

                  <span
                    style={{
                      flexShrink: 0,
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 900,
                      background: item.badge.corFundo,
                      color: item.badge.corTexto,
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    {item.badge.label}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 10,
                  }}
                >
                  <InfoMini titulo="Mensalidade" valor={formatarMoeda(item.valorMensalidade)} />
                  <InfoMini titulo="Vencimento" valor={item.vencimentoFormatado} />
                  <InfoMini
                    titulo="Dias em atraso"
                    valor={item.diasAtraso > 0 ? String(item.diasAtraso) : '0'}
                    destaque={item.diasAtraso > 0}
                  />
                  <InfoMini titulo="Status" valor={item.statusTexto} />
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    background: 'rgba(15,23,42,0.55)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 12,
                    color: '#cbd5e1',
                    lineHeight: 1.5,
                    fontWeight: 600,
                  }}
                >
                  {`Olá ${item.nomeCliente}, sua assinatura do ${NOME_SISTEMA_COBRANCA} está ${item.statusMensagem}. Valor: ${
                    item.valorMensalidade > 0
                      ? formatarMoeda(item.valorMensalidade)
                      : 'consulte o suporte'
                  }. Vencimento: ${item.vencimentoFormatado}.`}
                </div>

                <button
                  type="button"
                  onClick={() => abrirWhatsAppCobranca(item)}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    border: 'none',
                    borderRadius: 14,
                    cursor: 'pointer',
                    fontWeight: 900,
                    fontSize: 15,
                    color: '#052e16',
                    background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                    boxShadow: '0 12px 24px rgba(34,197,94,0.28)',
                  }}
                >
                  Cobrar WhatsApp
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoMini({
  titulo,
  valor,
  destaque,
}: {
  titulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: '#94a3b8',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: destaque ? '#fecaca' : '#f8fafc',
          lineHeight: 1.3,
        }}
      >
        {valor}
      </div>
    </div>
  )
}
