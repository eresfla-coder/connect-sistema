'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import extenso from 'extenso'
import {
  DEFAULT_LOGO_PATH,
  RECIBO_DOCUMENT_TYPE,
  DadosReciboPublico,
  decodeReciboFallback,
  prepararSnapshotRecibo,
} from '@/lib/recibo-publico'

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatarDataBR(data?: string) {
  if (!data) return new Date().toLocaleDateString('pt-BR')
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(data))) return String(data)

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
    const [ano, mes, dia] = String(data).split('-')
    return `${dia}/${mes}/${ano}`
  }

  const d = new Date(`${data}T00:00:00`)
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('pt-BR')
  return d.toLocaleDateString('pt-BR')
}

function formatarDataHoraBR(data?: string) {
  const d = data ? new Date(data) : new Date()
  if (Number.isNaN(d.getTime())) return new Date().toLocaleString('pt-BR')
  return d.toLocaleString('pt-BR')
}

function emojiPagamento(forma?: string) {
  const valor = String(forma || '').toLowerCase()
  if (valor.includes('pix')) return '📲'
  if (valor.includes('crédito') || valor.includes('credito')) return '💳'
  if (valor.includes('débito') || valor.includes('debito')) return '💳'
  if (valor.includes('boleto')) return '🧾'
  if (valor.includes('transfer')) return '🏦'
  return '💵'
}

function ReciboPublicoConteudo() {
  const params = useParams()
  const searchParams = useSearchParams()
  const idParam = String(params?.id || '')
  const token = searchParams.get('token') || ''
  const fallbackBase64 = searchParams.get('d') || ''

  const [dados, setDados] = useState<DadosReciboPublico | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagemFechar, setMensagemFechar] = useState('')

  useEffect(() => {
    let cancelado = false

    async function carregarRecibo() {
      setCarregado(false)
      setErro('')

      if (fallbackBase64) {
        const fallback = decodeReciboFallback(fallbackBase64)

        if (!cancelado) {
          if (fallback) {
            setDados(fallback)
          } else {
            setErro('Recibo público inválido.')
          }
          setCarregado(true)
        }

        return
      }

      if (!idParam || !token) {
        if (!cancelado) {
          setErro('Recibo público não encontrado.')
          setCarregado(true)
        }
        return
      }

      try {
        const resposta = await fetch(
          `/api/public-docs?id=${encodeURIComponent(idParam)}&token=${encodeURIComponent(token)}&document_type=${RECIBO_DOCUMENT_TYPE}`
        )

        if (!resposta.ok) {
          throw new Error('Documento público não encontrado.')
        }

        const documento = await resposta.json()
        const snapshot = documento?.snapshot

        if (!snapshot || typeof snapshot !== 'object') {
          throw new Error('Snapshot inválido.')
        }

        if (!cancelado) {
          setDados(prepararSnapshotRecibo(snapshot))
          setCarregado(true)
        }
      } catch {
        if (!cancelado) {
          setErro('Recibo público não encontrado.')
          setCarregado(true)
        }
      }
    }

    carregarRecibo()

    return () => {
      cancelado = true
    }
  }, [fallbackBase64, idParam, token])

  function fecharReciboPublico() {
    setMensagemFechar('')

    try {
      window.close()
    } catch {
      setMensagemFechar('Você já pode fechar esta aba.')
      return
    }

    window.setTimeout(() => {
      if (!window.closed) {
        setMensagemFechar('Você já pode fechar esta aba.')
      }
    }, 200)
  }

  const valorNumerico = useMemo(() => {
    const valor = parseFloat(String(dados?.valorNumero || 0).replace(',', '.'))
    return Number.isNaN(valor) ? 0 : valor
  }, [dados])

  const valorExtenso = useMemo(() => {
    if (valorNumerico <= 0) return 'ZERO REAIS'
    return extenso(valorNumerico.toFixed(2).replace('.', ','), { mode: 'currency' }).toUpperCase()
  }, [valorNumerico])

  if (!carregado) {
    return (
      <div style={{ background: '#0b2d63', minHeight: '100vh', padding: 20, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Carregando recibo...
      </div>
    )
  }

  if (erro || !dados) {
    return (
      <div style={{ background: '#0b2d63', minHeight: '100vh', padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 520, background: '#ffffff', borderRadius: 18, padding: 20, textAlign: 'center' }}>
          <h1 style={{ marginTop: 0, color: '#111827' }}>{erro || 'Recibo público não encontrado.'}</h1>
          <button
            onClick={fecharReciboPublico}
            style={{ background: '#e5e7eb', color: '#111827', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer' }}
          >
            Fechar
          </button>
          {mensagemFechar ? (
            <div style={{ marginTop: 12, color: '#475569', fontWeight: 700 }}>{mensagemFechar}</div>
          ) : null}
        </div>
      </div>
    )
  }

  const cfg = dados.config || {}
  const corPrimaria = cfg.corPrimaria || '#22c55e'
  const corSecundaria = cfg.corSecundaria || '#f5f1e8'
  const logoUrl = cfg.logoUrl || DEFAULT_LOGO_PATH
  const formaPagamento = dados.formaPagamento || 'Dinheiro'
  const numeroRecibo = String(dados.numeroRecibo || dados.numero || dados.id || idParam || '').slice(-8)
  const emitidoEm = formatarDataHoraBR(dados.emitidoDigitalmenteEm)

  return (
    <div style={{ background: '#0b2d63', minHeight: '100vh', padding: '10px 10px 18px' }}>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          html, body {
            background: #ffffff !important;
            overflow: hidden !important;
          }

          nav, aside, header, footer,
          .no-print, button,
          [class*="sidebar"], [class*="topbar"] {
            display: none !important;
          }

          .print-root,
          .print-wrap,
          .print-page,
          .print-card {
            background: #ffffff !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            height: auto !important;
            border-radius: 0 !important;
            border: none !important;
          }

          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .fit-one-page {
            transform: scale(0.94);
            transform-origin: top center;
            width: 106.5%;
          }
        }
      `}</style>

      <div className="print-root">
        <div
          className="no-print"
          style={{
            maxWidth: 920,
            margin: '0 auto 10px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <button
              onClick={fecharReciboPublico}
              style={{
                background: '#ffffff',
                color: '#111827',
                border: 'none',
                padding: '10px 16px',
                borderRadius: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
            {mensagemFechar ? (
              <div style={{ marginTop: 8, color: '#ffffff', fontWeight: 800 }}>{mensagemFechar}</div>
            ) : null}
          </div>

          <button
            onClick={() => window.print()}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Visualizar / Baixar PDF
          </button>
        </div>

        <div className="print-wrap fit-one-page" style={{ maxWidth: 920, margin: '0 auto' }}>
          <div
            className="print-page"
            style={{
              background: '#0b2d63',
              borderRadius: 20,
              padding: 14,
              boxShadow: '0 16px 36px rgba(0,0,0,0.22)',
            }}
          >
            <div
              className="print-card"
              style={{
                background: corSecundaria,
                borderRadius: 22,
                padding: 16,
              }}
            >
              <div className="avoid-break" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 14,
                      overflow: 'hidden',
                      background: '#ffffff',
                    }}
                  >
                    <img
                      src={logoUrl}
                      alt="Logo"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement
                        if (!img.src.endsWith(DEFAULT_LOGO_PATH)) img.src = DEFAULT_LOGO_PATH
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, color: '#0f172a', textTransform: 'uppercase' }}>
                      {cfg.nomeEmpresa || 'LOJA CONNECT'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                      {cfg.endereco || 'Documento gerado automaticamente'}
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 6, lineHeight: 1.3 }}>
                      {cfg.cidadeUf || 'PARNAMIRIM-RN'}<br />
                      {cfg.telefone || '84992818399'}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>Recibo Comercial</div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 900, color: '#111827' }}>Nº {numeroRecibo || '-'}</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: '#64748b' }}>{formatarDataBR(dados.dataRecibo)}</div>
                </div>
              </div>

              <div style={{ height: 3, background: corPrimaria, borderRadius: 999, marginTop: 14, marginBottom: 12 }} />

              <div
                className="avoid-break"
                style={{
                  background: '#ffffff',
                  border: '1px solid #dbe2ea',
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 16,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 17, color: '#111827', lineHeight: 1.45 }}>
                      Recebi de <strong>{dados.nomeCliente || 'Cliente não informado'}</strong>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 14, color: '#374151' }}>
                      Referente a <strong>{dados.referente || 'pagamento'}</strong>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: '#374151' }}>
                      {valorExtenso}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'inline-block',
                        background: corPrimaria,
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        marginBottom: 10,
                      }}
                    >
                      Recibo
                    </div>
                    <br />
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>
                      Valor recebido
                    </div>
                    <div
                      style={{
                        display: 'inline-block',
                        background: '#fff59d',
                        padding: '10px 16px',
                        borderRadius: 14,
                        fontSize: 30,
                        fontWeight: 900,
                        color: '#111827',
                        boxShadow: 'inset 0 -12px 0 rgba(255,235,59,0.45)',
                      }}
                    >
                      {moeda(valorNumerico)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="avoid-break" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                <MiniCard titulo="Cliente" valor={dados.nomeCliente || 'Cliente não informado'} emoji="👤" />
                <MiniCard titulo="Pagamento" valor={formaPagamento} emoji={emojiPagamento(formaPagamento)} />
                <MiniCard titulo="Data" valor={formatarDataBR(dados.dataRecibo)} emoji="📅" />
              </div>

              <div
                className="avoid-break"
                style={{
                  background: '#ffffff',
                  border: '1px solid #dbe2ea',
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: '#6b7280', marginBottom: 7 }}>📝 Observações</div>
                <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.35 }}>
                  {dados.observacao || 'Obrigado pela preferência.'}
                </div>
              </div>

              <div className="avoid-break" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
                <MiniCard titulo="Responsável" valor={cfg.responsavel || 'ERES FAUSTINO'} emoji="👤" />
                <MiniCard titulo="Recebido em" valor={formaPagamento} emoji={emojiPagamento(formaPagamento)} />
              </div>

              <div className="avoid-break" style={{ marginTop: 6, textAlign: 'center' }}>
                <div style={{ width: 260, maxWidth: '100%', margin: '0 auto', borderTop: '2px solid #111827', paddingTop: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>
                    {cfg.responsavel || 'ERES FAUSTINO'}
                  </div>
                  <div style={{ marginTop: 1, fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.3px' }}>
                    EMITENTE / ASSINATURA
                  </div>
                </div>
              </div>

              <div className="avoid-break" style={{ marginTop: 10, textAlign: 'center' }}>
                <div style={{ display: 'inline-block', background: '#ffffff', border: '1px solid #dbe2ea', borderRadius: 999, padding: '7px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Receita emitida digitalmente
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10, color: '#64748b', fontWeight: 700 }}>
                    {emitidoEm}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniCard({
  titulo,
  valor,
  emoji,
}: {
  titulo: string
  valor: string
  emoji: string
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #dbe2ea',
        borderRadius: 14,
        padding: 10,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 16, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#3f3f46', marginBottom: 5 }}>{titulo}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: '#111827',
          lineHeight: 1.25,
        }}
      >
        {valor}
      </div>
    </div>
  )
}

export default function ReciboPublicoPage() {
  return (
    <Suspense fallback={<div style={{ background: '#0b2d63', minHeight: '100vh' }} />}>
      <ReciboPublicoConteudo />
    </Suspense>
  )
}
