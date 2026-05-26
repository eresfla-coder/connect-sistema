import extenso from 'extenso'
import type { DadosReciboEmitido } from '@/components/recibos/ReciboEmitidoView'
import { abrirNovaAbaOuMesma } from '@/lib/abrirExterno'

function escapeHtml(valor: string) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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

export function abrirReciboPdfEmNovaJanela(dados: DadosReciboEmitido): boolean {
  const valorNumerico = (() => {
    const valor = parseFloat(String(dados?.valorNumero || 0).replace(',', '.'))
    return Number.isNaN(valor) ? 0 : valor
  })()

  const valorExtenso =
    valorNumerico <= 0
      ? 'ZERO REAIS'
      : extenso(valorNumerico.toFixed(2).replace('.', ','), { mode: 'currency' }).toUpperCase()

  const cfg = (dados?.config || {}) as NonNullable<DadosReciboEmitido['config']>
  const corPrimaria = cfg.corPrimaria || '#16a34a'
  const corSecundaria = cfg.corSecundaria || '#f5f1e8'
  const logoUrl = cfg.logoUrl || ''
  const formaPagamento = dados?.formaPagamento || 'Pix'

  const logoAbsoluta = String(logoUrl).startsWith('data:')
    ? String(logoUrl)
    : logoUrl
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}${String(logoUrl).startsWith('/') ? String(logoUrl) : `/${String(logoUrl)}`}`
      : ''

  const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Recibo</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #eef4ff; font-family: Arial, sans-serif; color: #111827; }
          .topbar { max-width: 980px; margin: 18px auto 12px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; padding: 0 12px; }
          .btn { border: none; border-radius: 12px; padding: 11px 18px; font-weight: 800; cursor: pointer; }
          .btn-sec { background: #e5e7eb; color: #111827; }
          .btn-pri { background: #2563eb; color: #fff; }

          .page-wrap { max-width: 980px; margin: 0 auto 20px; padding: 0 12px 20px; }
          .page { background: ${escapeHtml(corSecundaria)}; border-radius: 24px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #94a3b8; }
          .inner { background: #fff; border-radius: 22px; padding: 18px; border: 1px solid #cbd5e1; }

          .header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 3px solid ${escapeHtml(corPrimaria)}; padding-bottom: 12px; margin-bottom: 12px; }
          .brand { display: flex; gap: 12px; align-items: center; }
          .brand img { width: 82px; height: 82px; object-fit: contain; border-radius: 12px; }
          .company-name { font-weight: 900; font-size: 30px; line-height: 1.05; color: #111827; }
          .muted { color: #4b5563; margin-top: 2px; }
          .head-right { text-align: right; }
          .head-right .titulo { font-weight: 900; font-size: 22px; color: #111827; }
          .head-right .numero { margin-top: 10px; font-weight: 700; }

          .hero { border: 1px solid #94a3b8; border-radius: 14px; padding: 12px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }
          .hero-badge { display: inline-block; background: ${escapeHtml(corPrimaria)}; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px; }
          .hero-box { display: inline-block; background: #fff59d; padding: 9px 15px; border-radius: 14px; font-size: 28px; font-weight: 900; color: #111827; box-shadow: inset 0 -12px 0 rgba(255,235,59,0.45); }

          .cards3, .cards2 { display: grid; gap: 8px; margin-bottom: 8px; }
          .cards3 { grid-template-columns: repeat(3,1fr); }
          .cards2 { grid-template-columns: repeat(2,1fr); }

          .card { border: 1px solid #94a3b8; border-radius: 12px; padding: 10px; min-height: 86px; text-align: center; background: #fff; }
          .icone { font-size: 16px; margin-bottom: 4px; }
          .label { font-weight: 800; font-size: 12px; margin-bottom: 4px; color: #3f3f46; }
          .value { font-size: 14px; font-weight: 700; line-height: 1.2; word-break: break-word; }

          .box { border: 1px solid #94a3b8; border-radius: 14px; padding: 10px; margin-bottom: 8px; }
          .box-titulo { font-weight: 900; margin-bottom: 5px; color: #6b7280; }

          .assinatura { margin-top: 34px; text-align: center; }
          .assinatura .linha { width: 230px; max-width: 100%; margin: 0 auto; border-top: 2px solid #111827; padding-top: 8px; }
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
                  <div class="sub">EMITENTE / ASSINATURA AUTOMÁTICA</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)

  const abriu = abrirNovaAbaOuMesma(blobUrl)
  if (abriu) {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    return true
  }

  const janela = window.open('', '_blank', 'noopener,noreferrer')
  if (!janela) {
    URL.revokeObjectURL(blobUrl)
    return false
  }

  try {
    janela.document.open()
    janela.document.write(html)
    janela.document.close()
    URL.revokeObjectURL(blobUrl)
    return true
  } catch {
    URL.revokeObjectURL(blobUrl)
    return false
  }
}
