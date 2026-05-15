'use client'

import { useMemo } from 'react'
import extenso from 'extenso'

export type DadosReciboEmitido = {
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

function emojiPagamento(forma?: string) {
  const valor = String(forma || '').toLowerCase()
  if (valor.includes('pix')) return '📲'
  if (valor.includes('crédito') || valor.includes('credito')) return '💳'
  if (valor.includes('débito') || valor.includes('debito')) return '💳'
  if (valor.includes('boleto')) return '🧾'
  if (valor.includes('transfer')) return '🏦'
  return '💵'
}

function Card({ emoji, titulo, valor }: { emoji: string; titulo: string; valor: string }) {
  return (
    <div style={{ border: '1px solid #94a3b8', borderRadius: 12, padding: 10, minHeight: 86, textAlign: 'center', background: '#ffffff', color: '#0f172a' }}>
      <div style={{ fontSize: 16, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 4, color: '#1f2937' }}>{titulo}</div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, wordBreak: 'break-word' }}>{valor}</div>
    </div>
  )
}

type Props = {
  dados: DadosReciboEmitido
  isMobile: boolean
  onFechar: () => void
  onVoltar: () => void
  onNovo: () => void
  onEnviarLink: () => void
  onPdf: () => void
  showEnviarLink?: boolean
}

export function ReciboEmitidoView({
  dados,
  isMobile,
  onFechar,
  onVoltar,
  onNovo,
  onEnviarLink,
  onPdf,
  showEnviarLink = true,
}: Props) {
  const valorNumerico = useMemo(() => {
    const valor = parseFloat(String(dados?.valorNumero || 0).replace(',', '.'))
    return Number.isNaN(valor) ? 0 : valor
  }, [dados?.valorNumero])

  const valorExtenso = useMemo(() => {
    if (valorNumerico <= 0) return 'ZERO REAIS'
    return extenso(valorNumerico.toFixed(2).replace('.', ','), { mode: 'currency' }).toUpperCase()
  }, [valorNumerico])

  const cfg = (dados?.config || {}) as NonNullable<DadosReciboEmitido['config']>
  const corPrimaria = cfg.corPrimaria || '#16a34a'
  const corSecundaria = cfg.corSecundaria || '#f5f1e8'
  const logoUrl = cfg.logoUrl || ''
  const formaPagamento = dados?.formaPagamento || 'Pix'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f4f7fb 0%,#eaf1fb 100%)', overflowX: 'clip', overflowY: 'auto', padding: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 12px) 10px 96px' : 20, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 980, width: '100%', margin: '0 auto 14px', display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onFechar}
          title="Fechar recibo"
          style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#ef4444,#991b1b)', color: '#fff', border: '1px solid rgba(239,68,68,.45)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(239,68,68,.22)' }}
        >
          ✕ Fechar
        </button>
        <button
          onClick={onVoltar}
          style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', border: '1px solid rgba(148,163,184,.40)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(15,23,42,.22)' }}
        >
          ← Voltar
        </button>
        <button
          onClick={onNovo}
          style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', border: '1px solid rgba(148,163,184,.40)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(15,23,42,.22)' }}
        >
          Novo recibo
        </button>

        {showEnviarLink ? (
          <button
            onClick={onEnviarLink}
            style={{ minHeight: 50, minWidth: isMobile ? 150 : 190, background: 'linear-gradient(135deg,#16a34a 0%, #065f46 100%)', color: '#fff', border: '1px solid rgba(34,197,94,.50)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 28px rgba(34,197,94,.30), inset 0 1px 0 rgba(255,255,255,.14)' }}
          >
            🟢 Enviar link
          </button>
        ) : null}

        <button
          onClick={onPdf}
          style={{ minHeight: 50, minWidth: isMobile ? 180 : 230, background: 'linear-gradient(135deg,#0f3bff 0%, #001b6b 100%)', color: '#fff', border: '1px solid rgba(59,130,246,.55)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 28px rgba(37,99,235,.30), inset 0 1px 0 rgba(255,255,255,.14)' }}
        >
          📄 Visualizar / Baixar PDF
        </button>
      </div>

      <div style={{ maxWidth: 980, width: '100%', margin: '0 auto', background: corSecundaria, borderRadius: isMobile ? 18 : 24, padding: isMobile ? 10 : 20, boxShadow: '0 18px 40px rgba(15,23,42,0.10)', border: '1px solid #94a3b8' }}>
        <div style={{ background: '#fff', borderRadius: isMobile ? 16 : 22, padding: isMobile ? 12 : 18, border: '1px solid #cbd5e1', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: `3px solid ${corPrimaria}`, paddingBottom: 12, marginBottom: 12, background: 'linear-gradient(135deg,#ffffff 0%,#f8fbff 100%)', borderRadius: 18, padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ width: isMobile ? 64 : 82, height: isMobile ? 64 : 82, objectFit: 'contain', borderRadius: 12, alignSelf: isMobile ? 'flex-start' : 'center' }}
                />
              ) : null}
              <div>
                <div style={{ fontWeight: 900, fontSize: isMobile ? 20 : 30, lineHeight: 1.05, color: '#111827', wordBreak: 'break-word' }}>{cfg.nomeEmpresa || 'LOJA CONNECT'}</div>
                <div style={{ color: '#1f2937', marginTop: 6 }}>{cfg.endereco || ''}</div>
                <div style={{ color: '#1f2937' }}>{cfg.cidadeUf || ''}</div>
                <div style={{ color: '#1f2937' }}>{cfg.telefone || ''}</div>
              </div>
            </div>

            <div style={{ textAlign: isMobile ? 'left' : 'right', width: isMobile ? '100%' : 'auto' }}>
              <div style={{ fontWeight: 900, fontSize: 22, color: '#111827' }}>Recibo Comercial</div>
              <div style={{ marginTop: 10, fontWeight: 700 }}>{formatarDataBR(dados?.dataRecibo)}</div>
            </div>
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: 14, padding: 12, marginBottom: 10, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 14, alignItems: 'center', overflow: 'hidden' }}>
            <div>
              <div style={{ fontSize: 18, color: '#111827', lineHeight: 1.3 }}>Recebi de <strong>{dados?.nomeCliente || ''}</strong></div>
              <div style={{ marginTop: 5, fontSize: 14, color: '#374151' }}>Referente a <strong>{dados?.referente || 'pagamento'}</strong></div>
              <div style={{ marginTop: 7, fontSize: 12, fontWeight: 800, color: '#374151' }}>{valorExtenso}</div>
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'right', width: isMobile ? '100%' : 'auto' }}>
              <div style={{ display: 'inline-block', background: corPrimaria, color: '#fff', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>RECIBO</div>
              <br />
              <div style={{ fontSize: 11, fontWeight: 900, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>Valor recebido</div>
              <div style={{ display: 'inline-block', maxWidth: '100%', background: '#fff59d', padding: isMobile ? '8px 12px' : '9px 15px', borderRadius: 14, fontSize: isMobile ? 22 : 28, fontWeight: 900, color: '#111827', boxShadow: 'inset 0 -12px 0 rgba(255,235,59,0.45)' }}>
                {moeda(valorNumerico)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
            <Card emoji="👤" titulo="Cliente" valor={dados?.nomeCliente || ''} />
            <Card emoji={emojiPagamento(formaPagamento)} titulo="Pagamento" valor={formaPagamento} />
            <Card emoji="📅" titulo="Data" valor={formatarDataBR(dados?.dataRecibo)} />
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: 14, padding: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, marginBottom: 5, color: '#334155' }}>📝 Observações</div>
            <div>{dados?.observacao || 'Obrigado pela preferência.'}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
            <Card emoji="👤" titulo="Responsável" valor={cfg.responsavel || 'ERES FAUSTINO'} />
            <Card emoji={emojiPagamento(formaPagamento)} titulo="Recebido em" valor={formaPagamento} />
          </div>

          <div style={{ marginTop: 46, textAlign: 'center' }}>
            <div style={{ width: 230, maxWidth: '100%', margin: '0 auto', borderTop: '2px solid #111827', paddingTop: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>{cfg.responsavel || 'ERES FAUSTINO'}</div>
              <div style={{ marginTop: 1, fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '.3px' }}>EMITENTE / ASSINATURA AUTOMÁTICA</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
