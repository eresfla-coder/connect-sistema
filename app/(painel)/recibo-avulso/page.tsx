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
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(data))) return String(data)

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
    const [ano, mes, dia] = String(data).split('-')
    return `${dia}/${mes}/${ano}`
  }

  const d = new Date(`${data}T00:00:00`)
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('pt-BR')
  return d.toLocaleDateString('pt-BR')
}

function escapeHtml(valor: string) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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

export default function ReciboAvulsoPage() {
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
  const corPrimaria = cfg.corPrimaria || '#16a34a'
  const corSecundaria = cfg.corSecundaria || '#f5f1e8'
  const logoUrl = cfg.logoUrl || ''
  const formaPagamento = dados?.formaPagamento || 'Pix'

  function enviarWhatsApp() {
    const telefone = somenteDigitos(dados?.clienteTelefone)
    const mensagem = `Olá ${dados?.nomeCliente || ''}!\n\nSegue seu recibo:\nValor: ${moeda(valorNumerico)}\nReferente: ${dados?.referente || 'pagamento'}`
    const url = telefone
      ? `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank')
  }

  function abrirVisualizacaoPDF() {
    const logoAbsoluta = String(logoUrl).startsWith('data:')
      ? String(logoUrl)
      : logoUrl
        ? `${window.location.origin}${String(logoUrl).startsWith('/') ? String(logoUrl) : `/${String(logoUrl)}`}`
        : ''

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Recibo</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #0b2d63; font-family: Arial, sans-serif; color: #111827; }
          .topbar { max-width: 980px; margin: 18px auto 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 0 12px; }
          .btn { border: none; border-radius: 12px; padding: 11px 18px; font-weight: 800; cursor: pointer; }
          .btn-sec { background: #e5e7eb; color: #111827; }
          .btn-pri { background: #2563eb; color: #fff; }

          .page-wrap { max-width: 980px; margin: 0 auto 20px; padding: 0 12px 20px; }
          .page { background: ${escapeHtml(corSecundaria)}; border-radius: 24px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; }
          .inner { background: #fff; border-radius: 22px; padding: 18px; border: 1px solid #e5e7eb; }

          .header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 3px solid ${escapeHtml(corPrimaria)}; padding-bottom: 12px; margin-bottom: 12px; }
          .brand { display: flex; gap: 12px; align-items: center; }
          .brand img { width: 82px; height: 82px; object-fit: contain; border-radius: 12px; }
          .company-name { font-weight: 900; font-size: 30px; line-height: 1.05; color: #111827; }
          .muted { color: #4b5563; margin-top: 2px; }
          .head-right { text-align: right; }
          .head-right .titulo { font-weight: 900; font-size: 22px; color: #111827; }
          .head-right .numero { margin-top: 10px; font-weight: 700; }

          .hero { border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }
          .hero-badge { display: inline-block; background: ${escapeHtml(corPrimaria)}; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px; }
          .hero-box { display: inline-block; background: #fff59d; padding: 9px 15px; border-radius: 14px; font-size: 28px; font-weight: 900; color: #111827; box-shadow: inset 0 -12px 0 rgba(255,235,59,0.45); }

          .cards3, .cards2 { display: grid; gap: 8px; margin-bottom: 8px; }
          .cards3 { grid-template-columns: repeat(3,1fr); }
          .cards2 { grid-template-columns: repeat(2,1fr); }

          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; min-height: 86px; text-align: center; }
          .icone { font-size: 16px; margin-bottom: 4px; }
          .label { font-weight: 800; font-size: 12px; margin-bottom: 4px; color: #3f3f46; }
          .value { font-size: 14px; font-weight: 700; line-height: 1.2; word-break: break-word; }

          .box { border: 1px solid #e5e7eb; border-radius: 14px; padding: 10px; margin-bottom: 8px; }
          .box-titulo { font-weight: 900; margin-bottom: 5px; color: #6b7280; }

          .assinatura { margin-top: 0; text-align: center; }
          .assinatura .linha { width: 230px; max-width: 100%; margin: 0 auto; border-top: 2px solid #111827; padding-top: 3px; }
          .assinatura .nome { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
          .assinatura .sub { margin-top: 1px; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: .3px; }

          @page { size: A4 portrait; margin: 6mm; }
          @media print {
            html, body { background: white !important; }
            .topbar { display: none !important; }
            .page-wrap { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
            .page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; border: none !important; background: #fff !important; }
            .inner { border: none !important; padding: 0 !important; }
            .cards3, .cards2, .hero, .box, .assinatura { break-inside: avoid-page; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="topbar">
          <button class="btn btn-sec" onclick="window.close()">Fechar</button>
          <button class="btn btn-pri" onclick="window.print()">Visualizar / Baixar PDF</button>
        </div>

        <div class="page-wrap">
          <div class="page">
            <div class="inner">
              <div class="header">
                <div class="brand">
                  ${logoAbsoluta ? `<img src="${escapeHtml(logoAbsoluta)}" alt="Logo" />` : ''}
                  <div>
                    <div class="company-name">${escapeHtml(cfg.nomeEmpresa || 'LOJA CONNECT')}</div>
                    <div class="muted">${escapeHtml(cfg.endereco || '')}</div>
                    <div class="muted">${escapeHtml(cfg.cidadeUf || '')}</div>
                    <div class="muted">${escapeHtml(cfg.telefone || '')}</div>
                  </div>
                </div>
                <div class="head-right">
                  <div class="titulo">Recibo Comercial</div>
                  <div class="numero">${escapeHtml(formatarDataBR(dados?.dataRecibo))}</div>
                </div>
              </div>

              <div class="hero">
                <div>
                  <div style="font-size:18px;color:#111827;line-height:1.3">Recebi de <strong>${escapeHtml(dados?.nomeCliente || '')}</strong></div>
                  <div style="margin-top:5px;font-size:14px;color:#374151">Referente a <strong>${escapeHtml(dados?.referente || 'pagamento')}</strong></div>
                  <div style="margin-top:7px;font-size:12px;font-weight:800;color:#374151">${escapeHtml(valorExtenso)}</div>
                </div>
                <div style="text-align:right">
                  <div class="hero-badge">RECIBO</div><br />
                  <div style="font-size:11px;font-weight:900;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Valor recebido</div>
                  <div class="hero-box">${escapeHtml(moeda(valorNumerico))}</div>
                </div>
              </div>

              <div class="cards3">
                <div class="card"><div class="icone">👤</div><div class="label">Cliente</div><div class="value">${escapeHtml(dados?.nomeCliente || '')}</div></div>
                <div class="card"><div class="icone">${escapeHtml(emojiPagamento(formaPagamento))}</div><div class="label">Pagamento</div><div class="value">${escapeHtml(formaPagamento)}</div></div>
                <div class="card"><div class="icone">📅</div><div class="label">Data</div><div class="value">${escapeHtml(formatarDataBR(dados?.dataRecibo))}</div></div>
              </div>

              <div class="box">
                <div class="box-titulo">📝 Observações</div>
                <div>${escapeHtml(dados?.observacao || 'Obrigado pela preferência.')}</div>
              </div>

              <div class="cards2">
                <div class="card"><div class="icone">👤</div><div class="label">Responsável</div><div class="value">${escapeHtml(cfg.responsavel || 'ERES FAUSTINO')}</div></div>
                <div class="card"><div class="icone">${escapeHtml(emojiPagamento(formaPagamento))}</div><div class="label">Recebido em</div><div class="value">${escapeHtml(formaPagamento)}</div></div>
              </div>

              <div class="assinatura">
                <div class="linha">
                  <div class="nome">${escapeHtml(cfg.responsavel || 'ERES FAUSTINO')}</div>
                  <div class="sub">EMITENTE / ASSINATURA</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `

    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.open()
    janela.document.write(html)
    janela.document.close()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b2d63', zIndex: 9999, overflow: 'auto', padding: 20 }}>
      <div style={{ maxWidth: 980, margin: '0 auto 14px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/ordens-servico')}
          style={{ background: '#e5e7eb', color: '#111827', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.12)' }}
        >
          Fechar
        </button>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={enviarWhatsApp}
            style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.12)' }}
          >
            Enviar WhatsApp
          </button>

          <button
            onClick={abrirVisualizacaoPDF}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.12)' }}
          >
            Visualizar / Baixar PDF
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', background: corSecundaria, borderRadius: 24, padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
        <div style={{ background: '#fff', borderRadius: 22, padding: 18, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: `3px solid ${corPrimaria}`, paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ width: 82, height: 82, objectFit: 'contain', borderRadius: 12 }}
                />
              ) : null}
              <div>
                <div style={{ fontWeight: 900, fontSize: 30, lineHeight: 1.05, color: '#111827' }}>{cfg.nomeEmpresa || 'LOJA CONNECT'}</div>
                <div style={{ color: '#4b5563', marginTop: 6 }}>{cfg.endereco || ''}</div>
                <div style={{ color: '#4b5563' }}>{cfg.cidadeUf || ''}</div>
                <div style={{ color: '#4b5563' }}>{cfg.telefone || ''}</div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 900, fontSize: 22, color: '#111827' }}>Recibo Comercial</div>
              <div style={{ marginTop: 10, fontWeight: 700 }}>{formatarDataBR(dados?.dataRecibo)}</div>
            </div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, color: '#111827', lineHeight: 1.3 }}>Recebi de <strong>{dados?.nomeCliente || ''}</strong></div>
              <div style={{ marginTop: 5, fontSize: 14, color: '#374151' }}>Referente a <strong>{dados?.referente || 'pagamento'}</strong></div>
              <div style={{ marginTop: 7, fontSize: 12, fontWeight: 800, color: '#374151' }}>{valorExtenso}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-block', background: corPrimaria, color: '#fff', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>RECIBO</div>
              <br />
              <div style={{ fontSize: 11, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Valor recebido</div>
              <div style={{ display: 'inline-block', background: '#fff59d', padding: '9px 15px', borderRadius: 14, fontSize: 28, fontWeight: 900, color: '#111827', boxShadow: 'inset 0 -12px 0 rgba(255,235,59,0.45)' }}>
                {moeda(valorNumerico)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
            <Card emoji="👤" titulo="Cliente" valor={dados?.nomeCliente || ''} />
            <Card emoji={emojiPagamento(formaPagamento)} titulo="Pagamento" valor={formaPagamento} />
            <Card emoji="📅" titulo="Data" valor={formatarDataBR(dados?.dataRecibo)} />
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, marginBottom: 5, color: '#6b7280' }}>📝 Observações</div>
            <div>{dados?.observacao || 'Obrigado pela preferência.'}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
            <Card emoji="👤" titulo="Responsável" valor={cfg.responsavel || 'ERES FAUSTINO'} />
            <Card emoji={emojiPagamento(formaPagamento)} titulo="Recebido em" valor={formaPagamento} />
          </div>

          <div style={{ marginTop: 0, textAlign: 'center' }}>
            <div style={{ width: 230, maxWidth: '100%', margin: '0 auto', borderTop: '2px solid #111827', paddingTop: 3 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>{cfg.responsavel || 'ERES FAUSTINO'}</div>
              <div style={{ marginTop: 1, fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '.3px' }}>EMITENTE / ASSINATURA</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ emoji, titulo, valor }: { emoji: string; titulo: string; valor: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, minHeight: 86, textAlign: 'center', background: '#fff' }}>
      <div style={{ fontSize: 16, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 4, color: '#3f3f46' }}>{titulo}</div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, wordBreak: 'break-word' }}>{valor}</div>
    </div>
  )
}
