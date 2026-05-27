'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'
import {
  abrirPdfReciboRenovacao,
  montarMensagemWhatsappReciboRenovacao,
  prepararLinkPublicoReciboRenovacao,
  reciboRenovacaoParaEmitido,
} from '@/lib/reciboRenovacaoFlow'
import { normalizarTelefoneWhatsapp } from '@/lib/recibo-publico'
import {
  formatarDataBr,
  formatarMoedaBr,
  type PlanoRenovacaoManual,
  type ReciboRenovacaoManual,
} from '@/lib/renovacaoManual'
import { PLANOS_CATALOGO } from '@/lib/planosSaaS'

type ClienteResumo = {
  id: string
  nome_empresa?: string | null
  email?: string | null
  telefone?: string | null
  vencimento?: string | null
  valor_plano?: number | null
}

type Props = {
  aberto: boolean
  cliente: ClienteResumo | null
  processando: boolean
  onFechar: () => void
  onConfirmar: (form: FormRenovacao) => Promise<void>
  resultado: {
    mensagemWhatsapp: string
    whatsappUrl: string
    recibo: ReciboRenovacaoManual
  } | null
}

export type FormRenovacao = {
  plano_tier: PlanoRenovacaoManual
  valor_pago: string
  forma_pagamento: string
  data_pagamento: string
  proxima_validade: string
  observacao: string
}

function hojeInput() {
  return new Date().toISOString().slice(0, 10)
}

function maisDiasInput(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

const SCOPED_CSS = `
.connect-renovacao-modal-root {
  color: #0f172a !important;
  font-family: Inter, system-ui, sans-serif !important;
}
.connect-renovacao-modal-root .connect-renovacao-modal-panel {
  color: #1e293b !important;
  background: #ffffff !important;
}
.connect-renovacao-modal-root .crm-title {
  color: #0f172a !important;
  font-weight: 900 !important;
}
.connect-renovacao-modal-root .crm-sub {
  color: #475569 !important;
}
.connect-renovacao-modal-root .crm-label {
  color: #334155 !important;
}
.connect-renovacao-modal-root .crm-recibo,
.connect-renovacao-modal-root .crm-recibo td,
.connect-renovacao-modal-root .crm-recibo h1 {
  color: #1e293b !important;
}
.connect-renovacao-modal-root .crm-recibo td.crm-recibo-label {
  color: #475569 !important;
}
.connect-renovacao-modal-root .crm-recibo .crm-muted {
  color: #475569 !important;
}
.connect-renovacao-modal-root .crm-input,
.connect-renovacao-modal-root .crm-input option {
  background: #ffffff !important;
  color: #0f172a !important;
  border-color: #cbd5e1 !important;
}
.connect-renovacao-modal-root .crm-input::placeholder {
  color: #64748b !important;
}
.connect-renovacao-modal-root .crm-btn-cancel,
.connect-renovacao-modal-root .crm-btn-cancel:disabled {
  background: #f1f5f9 !important;
  color: #475569 !important;
  border: 1px solid #cbd5e1 !important;
}
.connect-renovacao-modal-root button.crm-btn-primary:disabled {
  background: #f1f5f9 !important;
  color: #475569 !important;
  border: 1px solid #cbd5e1 !important;
  opacity: 1 !important;
}
.connect-renovacao-modal-root .crm-btn-whatsapp {
  color: #ffffff !important;
}
`

const panel: CSSProperties = {
  background: '#ffffff',
  borderRadius: 20,
  padding: 22,
  maxWidth: 720,
  width: '100%',
  maxHeight: '92vh',
  overflow: 'auto',
  border: '1px solid #dbe3ef',
  boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
  color: '#1e293b',
}

const titleStyle: CSSProperties = {
  margin: '0 0 6px',
  fontSize: 22,
  fontWeight: 900,
  color: '#0f172a',
}

const subStyle: CSSProperties = {
  margin: '0 0 18px',
  color: '#475569',
  fontWeight: 700,
  fontSize: 14,
}

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: '#334155',
  marginBottom: 6,
}

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 42,
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  padding: '0 12px',
  fontWeight: 700,
  color: '#0f172a',
  background: '#ffffff',
}

const btnCancelStyle: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#f1f5f9',
  color: '#475569',
  fontWeight: 800,
  cursor: 'pointer',
}

const btnCancelSmStyle: CSSProperties = {
  padding: '9px 14px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  background: '#f1f5f9',
  color: '#475569',
  fontWeight: 800,
  cursor: 'pointer',
}

export default function ModalRenovacaoManual({ aberto, cliente, processando, onFechar, onConfirmar, resultado }: Props) {
  const reciboRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [linkPublicoRecibo, setLinkPublicoRecibo] = useState('')
  const [preparandoRecibo, setPreparandoRecibo] = useState(false)
  const [erroRecibo, setErroRecibo] = useState('')
  const [pdfBloqueado, setPdfBloqueado] = useState(false)
  const [form, setForm] = useState<FormRenovacao>({
    plano_tier: 'starter',
    valor_pago: '49,90',
    forma_pagamento: 'PIX',
    data_pagamento: hojeInput(),
    proxima_validade: maisDiasInput(30),
    observacao: '',
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!aberto || !cliente) return
    setForm({
      plano_tier: 'starter',
      valor_pago: String(Number(cliente.valor_plano || 49.9).toFixed(2)).replace('.', ','),
      forma_pagamento: 'PIX',
      data_pagamento: hojeInput(),
      proxima_validade: cliente.vencimento && cliente.vencimento > hojeInput() ? cliente.vencimento : maisDiasInput(30),
      observacao: '',
    })
  }, [aberto, cliente?.id])

  useEffect(() => {
    if (!aberto) return
    const tier = form.plano_tier
    const preco = PLANOS_CATALOGO[tier]?.precos.mensal
    if (preco) {
      setForm((f) => ({ ...f, valor_pago: String(preco.toFixed(2)).replace('.', ',') }))
    }
  }, [form.plano_tier, aberto])

  useEffect(() => {
    if (!resultado?.recibo) {
      setLinkPublicoRecibo('')
      setErroRecibo('')
      setPdfBloqueado(false)
      return
    }
    let vivo = true
    setPreparandoRecibo(true)
    setErroRecibo('')
    const dadosEmitidos = reciboRenovacaoParaEmitido(resultado.recibo, {
      telefoneCliente: cliente?.telefone,
    })
    void prepararLinkPublicoReciboRenovacao(dadosEmitidos)
      .then((link) => {
        if (vivo) setLinkPublicoRecibo(link)
      })
      .catch((err) => {
        console.error('[RECIBO_RENOVACAO] falha ao publicar recibo:', err)
        if (vivo) setErroRecibo('Não foi possível salvar o link público. PDF e visualização local ainda funcionam.')
      })
      .finally(() => {
        if (vivo) setPreparandoRecibo(false)
      })
    return () => {
      vivo = false
    }
  }, [resultado?.recibo?.numero, cliente?.id])

  if (!mounted || !aberto || !cliente) return null

  function dadosEmitidosAtual() {
    if (!resultado?.recibo) return null
    return reciboRenovacaoParaEmitido(resultado.recibo, {
      telefoneCliente: cliente?.telefone,
    })
  }

  function abrirPdfRecibo() {
    const dados = dadosEmitidosAtual()
    if (!dados) {
      setErroRecibo('Recibo não encontrado ou dados incompletos.')
      return
    }
    const ok = abrirPdfReciboRenovacao(dados)
    if (!ok) {
      setPdfBloqueado(true)
      setErroRecibo('Pop-up bloqueado. Use "Visualizar recibo" ou libere pop-ups e tente de novo.')
      console.warn('[RECIBO_RENOVACAO] PDF bloqueado pelo navegador')
      return
    }
    setPdfBloqueado(false)
  }

  async function visualizarRecibo() {
    const dados = dadosEmitidosAtual()
    if (!dados) {
      setErroRecibo('Recibo não encontrado ou dados incompletos.')
      return
    }
    setPreparandoRecibo(true)
    setErroRecibo('')
    try {
      const link = linkPublicoRecibo || (await prepararLinkPublicoReciboRenovacao(dados))
      setLinkPublicoRecibo(link)
      const abriu = window.open(link, '_blank', 'noopener,noreferrer')
      if (!abriu) {
        setErroRecibo('Pop-up bloqueado. Copie o link abaixo ou toque em "Abrir recibo".')
      }
    } catch (err) {
      console.error('[RECIBO_RENOVACAO] visualizar:', err)
      setErroRecibo('Não foi possível abrir o recibo. Tente baixar o PDF.')
    } finally {
      setPreparandoRecibo(false)
    }
  }

  function enviarWhatsappRecibo() {
    if (!resultado?.recibo) return
    const msg = montarMensagemWhatsappReciboRenovacao(resultado.recibo, linkPublicoRecibo)
    const tel = normalizarTelefoneWhatsapp(cliente.telefone)
    if (!tel) {
      alert('Cliente sem telefone cadastrado. Copie a mensagem e envie manualmente.')
      return
    }
    const url = montarUrlWhatsapp(tel, msg)
    abrirWhatsappUrl(url)
  }

  const ui = (
    <div
      className="connect-renovacao-modal-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(15,23,42,0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        color: '#0f172a',
      }}
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="crm-renovacao-title"
    >
      <style>{SCOPED_CSS}</style>
      <div className="connect-renovacao-modal-panel" style={panel} onClick={(e) => e.stopPropagation()}>
        <h2 id="crm-renovacao-title" className="crm-title" style={titleStyle}>
          Renovar sistema (manual)
        </h2>
        <p className="crm-sub" style={subStyle}>
          {cliente.nome_empresa || cliente.email} — não altera cobrança automática do Mercado Pago.
        </p>

        {!resultado ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <div>
                <div className="crm-label" style={labelStyle}>
                  Plano renovado
                </div>
                <select
                  className="crm-input"
                  style={inputStyle}
                  value={form.plano_tier}
                  onChange={(e) => setForm((f) => ({ ...f, plano_tier: e.target.value as PlanoRenovacaoManual }))}
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="empresa">Empresa</option>
                </select>
              </div>
              <div>
                <div className="crm-label" style={labelStyle}>
                  Valor pago (R$)
                </div>
                <input
                  className="crm-input"
                  style={inputStyle}
                  value={form.valor_pago}
                  placeholder="0,00"
                  onChange={(e) => setForm((f) => ({ ...f, valor_pago: e.target.value }))}
                />
              </div>
              <div>
                <div className="crm-label" style={labelStyle}>
                  Forma de pagamento
                </div>
                <input
                  className="crm-input"
                  style={inputStyle}
                  value={form.forma_pagamento}
                  placeholder="PIX, cartão, transferência..."
                  onChange={(e) => setForm((f) => ({ ...f, forma_pagamento: e.target.value }))}
                />
              </div>
              <div>
                <div className="crm-label" style={labelStyle}>
                  Data do pagamento
                </div>
                <input
                  type="date"
                  className="crm-input"
                  style={inputStyle}
                  value={form.data_pagamento}
                  onChange={(e) => setForm((f) => ({ ...f, data_pagamento: e.target.value }))}
                />
              </div>
              <div>
                <div className="crm-label" style={labelStyle}>
                  Próxima validade / vencimento
                </div>
                <input
                  type="date"
                  className="crm-input"
                  style={inputStyle}
                  value={form.proxima_validade}
                  onChange={(e) => setForm((f) => ({ ...f, proxima_validade: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="crm-label" style={labelStyle}>
                Observação (opcional)
              </div>
              <textarea
                className="crm-input"
                style={{ ...inputStyle, minHeight: 72, padding: 10, resize: 'vertical' }}
                value={form.observacao}
                placeholder="Anotações internas da renovação..."
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="crm-btn-primary"
                disabled={processando}
                onClick={() => void onConfirmar(form)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 12,
                  border: processando ? '1px solid #cbd5e1' : 'none',
                  background: processando ? '#f1f5f9' : 'linear-gradient(135deg,#16a34a,#15803d)',
                  color: processando ? '#475569' : '#ffffff',
                  fontWeight: 900,
                  cursor: processando ? 'not-allowed' : 'pointer',
                }}
              >
                {processando ? 'Salvando…' : 'Confirmar renovação'}
              </button>
              <button type="button" className="crm-btn-cancel" onClick={onFechar} style={btnCancelStyle}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <div ref={reciboRef} className="crm-recibo">
              <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: '#0f172a' }}>Recibo de renovação</h1>
              <p className="crm-muted" style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                Connect Sistema — emissora
              </p>
              <p style={{ color: '#166534', fontWeight: 900, marginTop: 12 }}>{resultado.recibo.status}</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
                <tbody>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, width: '38%', color: '#475569' }}>
                      Nº recibo
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{resultado.recibo.numero}</td>
                  </tr>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                      Cliente
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{resultado.recibo.clienteNome}</td>
                  </tr>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                      E-mail
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{resultado.recibo.clienteEmail || '—'}</td>
                  </tr>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                      Telefone
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{cliente.telefone || '—'}</td>
                  </tr>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                      Plano
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{resultado.recibo.plano}</td>
                  </tr>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                      Valor
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{formatarMoedaBr(resultado.recibo.valor)}</td>
                  </tr>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                      Pagamento
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>
                      {resultado.recibo.formaPagamento} — {formatarDataBr(resultado.recibo.dataPagamento)}
                    </td>
                  </tr>
                  <tr>
                    <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                      Validade até
                    </td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{formatarDataBr(resultado.recibo.validadeAte)}</td>
                  </tr>
                  {resultado.recibo.observacao ? (
                    <tr>
                      <td className="crm-recibo-label" style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#475569' }}>
                        Obs.
                      </td>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', color: '#1e293b' }}>{resultado.recibo.observacao}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {preparandoRecibo ? (
              <p className="crm-muted" style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
                Preparando recibo e link público…
              </p>
            ) : null}
            {erroRecibo ? (
              <p style={{ marginTop: 12, fontSize: 13, color: '#b45309', fontWeight: 800 }}>{erroRecibo}</p>
            ) : null}
            {linkPublicoRecibo ? (
              <p style={{ marginTop: 10, fontSize: 12, color: '#475569', wordBreak: 'break-all' }}>
                Link:{' '}
                <a href={linkPublicoRecibo} target="_blank" rel="noopener noreferrer">
                  {linkPublicoRecibo}
                </a>
              </p>
            ) : null}
            <textarea
              readOnly
              className="crm-input"
              value={montarMensagemWhatsappReciboRenovacao(resultado.recibo, linkPublicoRecibo) || resultado.mensagemWhatsapp}
              style={{ ...inputStyle, minHeight: 100, marginTop: 14, width: '100%' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="crm-btn-cancel"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(montarMensagemWhatsappReciboRenovacao(resultado.recibo, linkPublicoRecibo) || resultado.mensagemWhatsapp)
                    .then(() => alert('Mensagem copiada.'))
                }
                style={btnCancelSmStyle}
              >
                Copiar mensagem
              </button>
              <button
                type="button"
                className="crm-btn-whatsapp"
                onClick={enviarWhatsappRecibo}
                style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#ffffff', fontWeight: 900, cursor: 'pointer' }}
              >
                Enviar WhatsApp
              </button>
              <button
                type="button"
                className="crm-btn-cancel"
                onClick={() => void visualizarRecibo()}
                disabled={preparandoRecibo}
                style={btnCancelSmStyle}
              >
                Visualizar recibo
              </button>
              <button type="button" className="crm-btn-cancel" onClick={abrirPdfRecibo} style={btnCancelSmStyle}>
                Baixar / Imprimir PDF
              </button>
              {pdfBloqueado && linkPublicoRecibo ? (
                <button
                  type="button"
                  className="crm-btn-cancel"
                  onClick={() => window.open(linkPublicoRecibo, '_blank', 'noopener,noreferrer')}
                  style={btnCancelSmStyle}
                >
                  Abrir recibo (link)
                </button>
              ) : null}
              <button type="button" className="crm-btn-cancel" onClick={onFechar} style={btnCancelSmStyle}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(ui, document.body)
}
