'use client'

import { useMemo, useState } from 'react'
import extenso from 'extenso'

const reciboPrintCss = `
@media print {
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .recibo-toolbar { display: none !important; }
  .recibo-outer { padding: 0 !important; background: #fff !important; min-height: auto !important; }
  .recibo-frame { box-shadow: none !important; border: 0 !important; padding: 0 !important; background: #fff !important; }
  .recibo-sheet { border-radius: 0 !important; border: 0 !important; box-shadow: none !important; page-break-inside: avoid; }
  @page { size: A4 portrait; margin: 10mm; }
}
`

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
  /** Oculta “Novo recibo” (ex.: link público). Padrão: true. */
  showNovoRecibo?: boolean
  /** Oculta “Voltar” (ex.: link público). Padrão: true. */
  showVoltar?: boolean
  /** Toolbar mínima + fechar com window.close e fallback de mensagem. */
  modoPublico?: boolean
  loadingWhatsapp?: boolean
  loadingPdf?: boolean
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
  showNovoRecibo = true,
  showVoltar = true,
  modoPublico = false,
  loadingWhatsapp = false,
  loadingPdf = false,
}: Props) {
  const [avisoFecharPublico, setAvisoFecharPublico] = useState(false)

  const barraPublicaMinima = showEnviarLink === false
  const showVoltarUi = barraPublicaMinima ? false : showVoltar
  const showNovoUi = barraPublicaMinima ? false : showNovoRecibo
  const modoPublicoUi = barraPublicaMinima ? true : modoPublico

  function fecharModoPublico() {
    setAvisoFecharPublico(false)
    try {
      window.close()
    } catch {
      setAvisoFecharPublico(true)
      return
    }
    window.setTimeout(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setAvisoFecharPublico(true)
      }
    }, 450)
  }
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
    <div className="recibo-outer" style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f4f7fb 0%,#eaf1fb 100%)', overflowX: 'clip', overflowY: 'auto', padding: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 12px) 10px 96px' : 20, boxSizing: 'border-box' }}>
      <style>{reciboPrintCss}</style>
      <div className="recibo-toolbar" style={{ maxWidth: 980, width: '100%', margin: '0 auto 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={modoPublicoUi ? fecharModoPublico : onFechar}
            title="Fechar recibo"
            style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#ef4444,#991b1b)', color: '#fff', border: '1px solid rgba(239,68,68,.45)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(239,68,68,.22)' }}
          >
            ✕ Fechar
          </button>
          {showVoltarUi ? (
            <button
              onClick={onVoltar}
              style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', border: '1px solid rgba(148,163,184,.40)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(15,23,42,.22)' }}
            >
              ← Voltar
            </button>
          ) : null}
          {showNovoUi ? (
            <button
              onClick={onNovo}
              style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', border: '1px solid rgba(148,163,184,.40)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(15,23,42,.22)' }}
            >
              Novo recibo
            </button>
          ) : null}

          {showEnviarLink ? (
            <button
              onClick={onEnviarLink}
              disabled={loadingWhatsapp}
              style={{ minHeight: 50, minWidth: isMobile ? 150 : 190, background: loadingWhatsapp ? '#94a3b8' : 'linear-gradient(135deg,#16a34a 0%, #065f46 100%)', color: '#fff', border: '1px solid rgba(34,197,94,.50)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: loadingWhatsapp ? 'wait' : 'pointer', boxShadow: '0 0 28px rgba(34,197,94,.30), inset 0 1px 0 rgba(255,255,255,.14)', opacity: loadingWhatsapp ? 0.85 : 1 }}
            >
              {loadingWhatsapp ? '⏳ Preparando link…' : '🟢 Enviar link'}
            </button>
          ) : null}

          <button
            onClick={onPdf}
            disabled={loadingPdf}
            style={{ minHeight: 50, minWidth: isMobile ? 180 : 230, background: loadingPdf ? '#64748b' : 'linear-gradient(135deg,#0f3bff 0%, #001b6b 100%)', color: '#fff', border: '1px solid rgba(59,130,246,.55)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: loadingPdf ? 'wait' : 'pointer', boxShadow: '0 0 28px rgba(37,99,235,.30), inset 0 1px 0 rgba(255,255,255,.14)', opacity: loadingPdf ? 0.85 : 1 }}
          >
            {loadingPdf ? '⏳ Abrindo PDF…' : '📄 Visualizar / Baixar PDF'}
          </button>
        </div>
        {modoPublicoUi && avisoFecharPublico ? (
          <p
            style={{
              textAlign: 'center',
              color: '#475569',
              fontWeight: 700,
              fontSize: 15,
              margin: '14px 12px 0',
              lineHeight: 1.45,
            }}
          >
            Você já pode fechar esta aba.
          </p>
        ) : null}
      </div>

      <div className="recibo-frame" style={{ maxWidth: 980, width: '100%', margin: '0 auto', background: corSecundaria, borderRadius: isMobile ? 18 : 24, padding: isMobile ? 10 : 20, boxShadow: '0 18px 40px rgba(15,23,42,0.10)', border: '1px solid #94a3b8' }}>
        <div className="recibo-sheet" style={{ background: '#fff', borderRadius: isMobile ? 16 : 22, padding: isMobile ? 12 : 18, border: '1px solid #cbd5e1', overflow: 'hidden' }}>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ display: 'inline-block', padding: '6px 20px', borderRadius: 999, background: corPrimaria, color: '#fff', fontSize: isMobile ? 22 : 28, fontWeight: 950, letterSpacing: '.22em' }}>RECIBO</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: `3px solid ${corPrimaria}`, paddingBottom: 12, marginBottom: 12, background: 'linear-gradient(135deg,#ffffff 0%,#f8fbff 100%)', borderRadius: 18, padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ width: isMobile ? 72 : 96, height: isMobile ? 72 : 96, objectFit: 'contain', borderRadius: 14, border: '1px solid #e2e8f0', padding: 6, background: '#fff', alignSelf: isMobile ? 'flex-start' : 'center' }}
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
              <div style={{ fontWeight: 800, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.14em' }}>Comprovante oficial</div>
              <div style={{ marginTop: 6, fontWeight: 900, fontSize: 18, color: '#111827' }}>{formatarDataBR(dados?.dataRecibo)}</div>
            </div>
          </div>

          <div style={{ border: `2px solid ${corPrimaria}`, borderRadius: 16, padding: isMobile ? 14 : 18, marginBottom: 10, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 14, alignItems: 'center', overflow: 'hidden', background: 'linear-gradient(180deg,#fff,#f0fdf4)' }}>
            <div>
              <div style={{ fontSize: 18, color: '#111827', lineHeight: 1.3 }}>Recebi de <strong>{dados?.nomeCliente || ''}</strong></div>
              <div style={{ marginTop: 5, fontSize: 14, color: '#374151' }}>Referente a <strong>{dados?.referente || 'pagamento'}</strong></div>
              <div style={{ marginTop: 7, fontSize: 12, fontWeight: 800, color: '#374151' }}>{valorExtenso}</div>
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'right', width: isMobile ? '100%' : 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 6 }}>Valor recebido</div>
              <div style={{ display: 'inline-block', maxWidth: '100%', background: 'linear-gradient(135deg,#fef9c3,#fff59d)', padding: isMobile ? '10px 16px' : '12px 20px', borderRadius: 16, fontSize: isMobile ? 28 : 36, fontWeight: 950, color: '#0f172a', boxShadow: 'inset 0 -14px 0 rgba(250,204,21,.4), 0 8px 24px rgba(15,23,42,.08)', border: '2px solid #eab308' }}>
                {moeda(valorNumerico)}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: corPrimaria }}>{emojiPagamento(formaPagamento)} {formaPagamento}</div>
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

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginTop: 36, paddingTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 32 }}>Assinatura do cliente</div>
              <div style={{ borderTop: '2px solid #0f172a', maxWidth: 260, margin: '0 auto' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 32 }}>Emitente</div>
              <div style={{ borderTop: '2px solid #0f172a', maxWidth: 260, margin: '0 auto', paddingTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>{cfg.responsavel || cfg.nomeEmpresa || 'Responsável'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
