'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const STORAGE_KEY = 'connect_orcamentos_salvos'
const CONFIG_KEY = 'connect_configuracoes'

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function escapeHtml(valor: string) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export default function ImpressaoOrcamentoPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id || '')

  const [orcamento, setOrcamento] = useState<any>(null)
  const [config, setConfig] = useState<any>({
    nomeEmpresa: 'LOJA CONNECT',
    telefone: '84992181399',
    email: 'lojaconnect@hotmail.com',
    endereco: 'GILBERTO ROBERTO GOMES,243',
    cidadeUf: 'PARNAMIRIM-RN',
    responsavel: 'ERES FAUSTINO',
    tituloPdf: 'Orçamento Comercial',
    rodapePdf: 'Obrigado pela preferência.',
    validadePadrao: '7 dias',
    prazoEntregaPadrao: '3 dias',
    formaPagamentoPadrao: 'PIX',
    corPrimaria: '#16a34a',
    corSecundaria: '#e5e7eb',
    corTabela: '#f6b561',
    mostrarQuantidade: true,
    logoUrl: '/logo-connect.png',
  })

  useEffect(() => {
    const lista = localStorage.getItem(STORAGE_KEY)
    if (lista) {
      try {
        const dados = JSON.parse(lista)
        const encontrado = Array.isArray(dados)
          ? dados.find((o: any) => String(o.id) === id)
          : null
        setOrcamento(encontrado || null)
      } catch {
        setOrcamento(null)
      }
    } else {
      setOrcamento(null)
    }

    const cfg = localStorage.getItem(CONFIG_KEY)
    if (cfg) {
      try {
        setConfig((anterior: any) => ({ ...anterior, ...JSON.parse(cfg) }))
      } catch {}
    }
  }, [id])

  function abrirVisualizacaoPDF() {
    if (!orcamento) return

    const logoUrl = config.logoUrl || '/logo-connect.png'
    const logoAbsoluta = String(logoUrl).startsWith('data:')
      ? String(logoUrl)
      : `${window.location.origin}${String(logoUrl).startsWith('/') ? String(logoUrl) : `/${String(logoUrl)}`}`

    const itens = Array.isArray(orcamento.itens) ? orcamento.itens : []

    const linhas = itens
      .map((item: any) => {
        const quantidade = Number(item.quantidade ?? item.qtd ?? 0)
        const valor = Number(item.valor ?? 0)
        const subtotal = Number(item.total ?? quantidade * valor)
        return `
          <tr>
            <td style="padding:10px 12px;border-top:1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')};font-size:14px;">${escapeHtml(item.nome || '-')}</td>
            ${(config.mostrarQuantidade ?? true) ? `<td style="padding:10px 12px;border-top:1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')};font-size:14px;text-align:center;">${escapeHtml(String(quantidade))}</td>` : ''}
            <td style="padding:10px 12px;border-top:1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')};font-size:14px;text-align:right;">${escapeHtml(moeda(valor))}</td>
            <td style="padding:10px 12px;border-top:1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')};font-size:14px;text-align:right;font-weight:800;">${escapeHtml(moeda(subtotal))}</td>
          </tr>
        `
      })
      .join('')

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Orçamento</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #0b2d63; font-family: Arial, sans-serif; color: #111827; }
          .topbar { max-width: 980px; margin: 18px auto 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 0 12px; }
          .btn { border: none; border-radius: 12px; padding: 11px 18px; font-weight: 800; cursor: pointer; }
          .btn-sec { background: #e5e7eb; color: #111827; }
          .btn-pri { background: #2563eb; color: #fff; }
          .page-wrap { max-width: 980px; margin: 0 auto 20px; padding: 0 12px 20px; }
          .page { background: #f7f3ea; border-radius: 24px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')}; }
          .inner { background: #fff; border-radius: 22px; padding: 20px; border: 1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')}; }
          .header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 3px solid ${escapeHtml(config.corPrimaria || '#16a34a')}; padding-bottom: 14px; margin-bottom: 20px; }
          .brand { display: flex; gap: 12px; align-items: center; }
          .brand img { width: 84px; height: 84px; object-fit: contain; border-radius: 12px; }
          .company-name { font-weight: 900; font-size: 30px; line-height: 1.05; color: #111827; }
          .muted { color: #4b5563; margin-top: 2px; }
          .head-right { text-align: right; }
          .head-right .titulo { font-weight: 900; font-size: 22px; color: #111827; }
          .head-right .numero { margin-top: 10px; font-weight: 700; }
          .box { border: 1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')}; border-radius: 14px; padding: 14px; margin-bottom: 14px; }
          .box-titulo { font-weight: 900; margin-bottom: 8px; }
          .tabela-wrap { border: 1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')}; border-radius: 14px; overflow: hidden; margin-bottom: 18px; }
          table { width: 100%; border-collapse: collapse; }
          thead tr { background: ${escapeHtml(config.corTabela || '#f6b561')}; }
          th { padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 900; }
          td { padding: 10px 12px; border-top: 1px solid #e5e7eb; font-size: 14px; }
          .cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 18px; }
          .card { border: 1px solid ${escapeHtml(config.corSecundaria || '#e5e7eb')}; border-radius: 12px; padding: 14px; min-height: 110px; text-align: center; }
          .icone { font-size: 22px; margin-bottom: 6px; }
          .label { font-weight: 800; font-size: 13px; margin-bottom: 4px; }
          @page { size: A4 portrait; margin: 7mm; }
          @media print {
            html, body { background: white !important; }
            .topbar { display: none !important; }
            .page-wrap { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
            .page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; border: none !important; }
            .inner { border: none !important; }
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
                  <img src="${escapeHtml(logoAbsoluta)}" alt="Logo" />
                  <div>
                    <div class="company-name">${escapeHtml(config.nomeEmpresa || 'LOJA CONNECT')}</div>
                    <div class="muted">${escapeHtml(config.endereco || '')}</div>
                    <div class="muted">${escapeHtml(config.cidadeUf || '')}</div>
                    <div class="muted">${escapeHtml(config.telefone || '')}</div>
                  </div>
                </div>
                <div class="head-right">
                  <div class="titulo">${escapeHtml(orcamento.titulo || config.tituloPdf || 'Orçamento')}</div>
                  <div class="numero">Nº ${escapeHtml(orcamento.numero || '0001')}</div>
                  <div class="muted">${escapeHtml(orcamento.data || '')}</div>
                </div>
              </div>

              <div class="box">
                <div class="box-titulo">👤 Cliente</div>
                <div>${escapeHtml(orcamento.cliente?.nome || '-')}</div>
                <div>${escapeHtml(orcamento.cliente?.telefone || '-')}</div>
                ${orcamento.cliente?.email ? `<div>${escapeHtml(orcamento.cliente.email)}</div>` : ''}
                ${orcamento.cliente?.endereco ? `<div>${escapeHtml(orcamento.cliente.endereco)}</div>` : ''}
              </div>

              <div class="tabela-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      ${(config.mostrarQuantidade ?? true) ? '<th style="text-align:center;">Qtidade</th>' : ''}
                      <th style="text-align:right;">Valor Unitário</th>
                      <th style="text-align:right;">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>${linhas}</tbody>
                </table>
              </div>

              <div class="cards">
                <div class="card"><div class="icone">💰</div><div class="label">Subtotal</div><div>${escapeHtml(moeda(orcamento.subtotal || 0))}</div></div>
                <div class="card"><div class="icone">🚚</div><div class="label">Entrega</div><div>${escapeHtml(moeda(orcamento.entrega || 0))}</div></div>
                <div class="card"><div class="icone">🏷️</div><div class="label">Desconto</div><div>${escapeHtml(moeda(orcamento.desconto || 0))}</div></div>
                <div class="card"><div class="icone">💳</div><div class="label">Pagamento</div><div>${escapeHtml(orcamento.formaPagamento || '-')}</div></div>
              </div>

              <div class="box">
                <div class="box-titulo">📝 Observações</div>
                <div>${escapeHtml(orcamento.observacao || config.rodapePdf || '-')}</div>
              </div>

              <div class="cards">
                <div class="card"><div class="icone">📅</div><div class="label">Validade</div><div>${escapeHtml(orcamento.validade || '-')}</div></div>
                <div class="card"><div class="icone">🚛</div><div class="label">Prazo de entrega</div><div>${escapeHtml(orcamento.prazoEntrega || '-')}</div></div>
                <div class="card"><div class="icone">👤</div><div class="label">Responsável</div><div>${escapeHtml(config.responsavel || '-')}</div></div>
                <div class="card"><div class="icone">✅</div><div class="label">Total</div><div>${escapeHtml(moeda(orcamento.total || 0))}</div></div>
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

  if (!orcamento) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b2d63', zIndex: 9999, overflow: 'auto', padding: 20 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', borderRadius: 18, padding: 20, border: '1px solid #e5e7eb' }}>
          <h1 style={{ marginTop: 0 }}>Orçamento não encontrado</h1>
          <button
            onClick={() => router.push('/orcamentos')}
            style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}
          >
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const itens = Array.isArray(orcamento.itens) ? orcamento.itens : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b2d63', zIndex: 9999, overflow: 'auto', padding: 20 }}>
      <div style={{ maxWidth: 980, margin: '0 auto 14px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/orcamentos')}
          style={{ background: '#e5e7eb', color: '#111827', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.12)' }}
        >
          Fechar
        </button>

        <button
          onClick={abrirVisualizacaoPDF}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.12)' }}
        >
          Visualizar / Baixar PDF
        </button>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', background: '#f7f3ea', borderRadius: 24, padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.08)', border: `1px solid ${config.corSecundaria || '#e5e7eb'}` }}>
        <div style={{ background: '#fff', borderRadius: 22, padding: 20, border: `1px solid ${config.corSecundaria || '#e5e7eb'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: `3px solid ${config.corPrimaria || '#16a34a'}`, paddingBottom: 14, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img
                src={config.logoUrl || '/logo-connect.png'}
                alt="Logo"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  if (!img.src.endsWith('/logo-connect.jpeg')) img.src = '/logo-connect.jpeg'
                }}
                style={{ width: 84, height: 84, objectFit: 'contain', borderRadius: 12 }}
              />
              <div>
                <div style={{ fontWeight: 900, fontSize: 30, lineHeight: 1.05, color: '#111827' }}>{config.nomeEmpresa || 'LOJA CONNECT'}</div>
                <div style={{ color: '#4b5563', marginTop: 6 }}>{config.endereco || ''}</div>
                <div style={{ color: '#4b5563' }}>{config.cidadeUf || ''}</div>
                <div style={{ color: '#4b5563' }}>{config.telefone || ''}</div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 900, fontSize: 22, color: '#111827' }}>{orcamento.titulo || config.tituloPdf || 'Orçamento'}</div>
              <div style={{ marginTop: 10, fontWeight: 700 }}>Nº {orcamento.numero || '0001'}</div>
              <div style={{ color: '#4b5563' }}>{orcamento.data || ''}</div>
            </div>
          </div>

          <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>👤 Cliente</div>
            <div>{orcamento.cliente?.nome || '-'}</div>
            <div>{orcamento.cliente?.telefone || '-'}</div>
            {orcamento.cliente?.email ? <div>{orcamento.cliente.email}</div> : null}
            {orcamento.cliente?.endereco ? <div>{orcamento.cliente.endereco}</div> : null}
          </div>

          <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: config.corTabela || '#f6b561' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 900 }}>Descrição</th>
                  {(config.mostrarQuantidade ?? true) ? <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 900 }}>Qtidade</th> : null}
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 900 }}>Valor Unitário</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 900 }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item: any, index: number) => {
                  const quantidade = Number(item.quantidade ?? item.qtd ?? 0)
                  const valor = Number(item.valor ?? 0)
                  const subtotal = Number(item.total ?? quantidade * valor)
                  return (
                    <tr key={item.id ?? index}>
                      <td style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb' }}>{item.nome || '-'}</td>
                      {(config.mostrarQuantidade ?? true) ? <td style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>{quantidade}</td> : null}
                      <td style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}>{moeda(valor)}</td>
                      <td style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 800 }}>{moeda(subtotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>💰</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Subtotal</div>
              <div>{moeda(orcamento.subtotal || 0)}</div>
            </div>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🚚</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Entrega</div>
              <div>{moeda(orcamento.entrega || 0)}</div>
            </div>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🏷️</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Desconto</div>
              <div>{moeda(orcamento.desconto || 0)}</div>
            </div>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>💳</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Pagamento</div>
              <div>{orcamento.formaPagamento || '-'}</div>
            </div>
          </div>

          <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 14, padding: 14, marginBottom: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>📝 Observações</div>
            <div>{orcamento.observacao || config.rodapePdf || '-'}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>📅</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Validade</div>
              <div>{orcamento.validade || '-'}</div>
            </div>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🚛</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Prazo Entrega</div>
              <div>{orcamento.prazoEntrega || '-'}</div>
            </div>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>👤</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Responsável</div>
              <div>{config.responsavel || '-'}</div>
            </div>
            <div style={{ border: `1px solid ${config.corSecundaria || '#e5e7eb'}`, borderRadius: 12, padding: 14, minHeight: 110, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Total</div>
              <div>{moeda(orcamento.total || 0)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
