'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import extenso from 'extenso'

type DadosRecibo = {
  nomeCliente?: string
  clienteTelefone?: string
  referente?: string
  valorNumero?: string | number
  dataRecibo?: string
  formaPagamento?: string
  observacao?: string
  config?: {
    nomeEmpresa?: string
    cidadeUf?: string
    telefone?: string
    responsavel?: string
    corPrimaria?: string
    corSecundaria?: string
    logoUrl?: string
    endereco?: string
  }
}

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function somenteDigitos(valor?: string) {
  return String(valor || '').replace(/\D/g, '')
}

function formatarDataBR(data?: string) {
  if (!data) return new Date().toLocaleDateString('pt-BR')
  const d = new Date(`${data}T00:00:00`)
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('pt-BR')
  return d.toLocaleDateString('pt-BR')
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

export default function RecibosPage() {
  const router = useRouter()
  const [dados, setDados] = useState<DadosRecibo | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('connect_recibo_visualizacao')
    if (!raw) return
    try {
      setDados(JSON.parse(raw))
    } catch {
      setDados(null)
    }
  }, [])

  const valorNumerico = useMemo(() => {
    const valor = parseFloat(String(dados?.valorNumero || 0).replace(',', '.'))
    return Number.isNaN(valor) ? 0 : valor
  }, [dados])

  const valorExtenso = useMemo(() => {
    if (valorNumerico <= 0) return 'ZERO REAIS'
    return extenso(valorNumerico.toFixed(2).replace('.', ','), { mode: 'currency' }).toUpperCase()
  }, [valorNumerico])

  if (!dados) return null

  const cfg = dados.config || {}
  const corPrimaria = cfg.corPrimaria || '#22c55e'
  const corSecundaria = cfg.corSecundaria || '#f5f1e8'
  const logoUrl = cfg.logoUrl || ''
  const formaPagamento = dados?.formaPagamento || 'Dinheiro'

  function enviarWhatsApp() {
    const telefone = somenteDigitos(dados?.clienteTelefone)
    const mensagem = `Olá ${dados?.nomeCliente || ''}!\n\nSegue seu recibo:\nValor: ${moeda(valorNumerico)}\nReferente: ${dados?.referente || 'pagamento'}\n\nUse o botão "Visualizar / Baixar PDF".`
    const url = telefone
      ? `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank')
  }

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
          <button
            onClick={() => router.push('/ordens-servico')}
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={enviarWhatsApp}
              style={{
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Enviar WhatsApp
            </button>

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
                  {logoUrl ? (
                    <div
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: 14,
                        overflow: 'hidden',
                        background: '#ffffff',
                      }}
                    >
                      <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : null}

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
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 900, color: '#111827' }}>Nº {Date.now().toString().slice(-4)}</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: '#64748b' }}>{formatarDataBR(dados?.dataRecibo)}</div>
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
                      Recebi de <strong>{dados?.nomeCliente || 'Cliente não informado'}</strong>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 14, color: '#374151' }}>
                      Referente a <strong>{dados?.referente || 'pagamento'}</strong>
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
                <MiniCard titulo="Cliente" valor={dados?.nomeCliente || 'Cliente não informado'} emoji="👤" />
                <MiniCard titulo="Pagamento" valor={formaPagamento} emoji={emojiPagamento(formaPagamento)} />
                <MiniCard titulo="Data" valor={formatarDataBR(dados?.dataRecibo)} emoji="📅" />
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
                  {dados?.observacao || 'Obrigado pela preferência.'}
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