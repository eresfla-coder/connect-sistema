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

const RECIBO_KEY = 'connect_recibo_visualizacao'
const CONFIG_KEY = 'connect_configuracoes'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://painel.appconnectpro.com.br').replace(/\/$/, '')

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function normalizarTelefoneWhatsapp(valor?: string) {
  let telefone = String(valor || '').replace(/\D/g, '')

  if (!telefone) return ''

  while (telefone.startsWith('00')) {
    telefone = telefone.slice(2)
  }

  if (telefone.startsWith('55')) {
    telefone = telefone.slice(2)
  }

  telefone = telefone.replace(/^0+/, '')

  if (telefone.length > 11) {
    telefone = telefone.slice(-11)
  }

  if (telefone.length < 10) return ''

  return `55${telefone}`
}

function gerarToken() {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `${Date.now()}${Math.random().toString(36).slice(2)}`
  }
}

function toBase64Url(value: string) {
  const utf8 = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  )
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function gerarLinkPublicoRecibo(dados: DadosRecibo) {
  const documentId = String(Date.now())
  const token = gerarToken()

  try {
    const response = await fetch('/api/public-docs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_type: 'recibo',
        document_id: documentId,
        token,
        payload: dados,
        snapshot: dados,
      }),
    })

    if (response.ok) {
      return `${SITE_URL}/visualizar/recibo/${documentId}?token=${token}`
    }

    console.error('[RECIBO_PUBLICO] Falha ao salvar documento público:', await response.text())
  } catch (error) {
    console.error('[RECIBO_PUBLICO] Erro ao salvar documento público:', error)
  }

  const payload = toBase64Url(JSON.stringify(dados))
  return `${SITE_URL}/recibo-avulso?preview=1&d=${payload}`
}

function hojeInput() {
  return new Date().toISOString().slice(0, 10)
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

function configPadrao(): DadosRecibo['config'] {
  return {
    nomeEmpresa: 'LOJA CONNECT',
    cidadeUf: '',
    telefone: '',
    responsavel: 'ERES FAUSTINO',
    corPrimaria: '#16a34a',
    corSecundaria: '#f5f1e8',
    logoUrl: '',
    endereco: '',
  }
}

const PALETAS_RECIBO = [
  { nome: 'Verde Connect', primaria: '#16a34a', secundaria: '#f0fdf4' },
  { nome: 'Azul Premium', primaria: '#2563eb', secundaria: '#eff6ff' },
  { nome: 'Grafite', primaria: '#0f172a', secundaria: '#f8fafc' },
  { nome: 'Dourado', primaria: '#d97706', secundaria: '#fffbeb' },
  { nome: 'Roxo', primaria: '#7c3aed', secundaria: '#f5f3ff' },
  { nome: 'Vermelho', primaria: '#dc2626', secundaria: '#fef2f2' },
]

export default function ReciboAvulsoPage() {
  const router = useRouter()
  const [dados, setDados] = useState<DadosRecibo | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [form, setForm] = useState<DadosRecibo>({
    nomeCliente: '',
    clienteTelefone: '',
    referente: '',
    valorNumero: '',
    dataRecibo: hojeInput(),
    formaPagamento: 'Pix',
    observacao: 'Obrigado pela preferência.',
    config: configPadrao(),
  })

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')
      setForm((old) => ({
        ...old,
        config: {
          nomeEmpresa: cfg?.nomeEmpresa || 'LOJA CONNECT',
          cidadeUf: cfg?.cidadeUf || '',
          telefone: cfg?.telefone || '',
          responsavel: cfg?.responsavel || 'ERES FAUSTINO',
          corPrimaria: cfg?.corPrimaria || '#16a34a',
          corSecundaria: cfg?.corSecundaria || '#f5f1e8',
          logoUrl: cfg?.logoUrl || '',
          endereco: cfg?.endereco || '',
        },
      }))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const paramsRecibo = new URLSearchParams(window.location.search)
      const payload = paramsRecibo.get('d')
      if (!payload) return

      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
      const decoded = decodeURIComponent(
        atob(normalized)
          .split('')
          .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
          .join('')
      )
      const recebido = JSON.parse(decoded)
      setDados(recebido)
      setForm((old) => ({ ...old, ...recebido }))
    } catch {}
  }, [])

  const valorNumerico = useMemo(() => {
    const valor = parseFloat(String(dados?.valorNumero || form.valorNumero || 0).replace(',', '.'))
    return Number.isNaN(valor) ? 0 : valor
  }, [dados, form.valorNumero])

  const valorExtenso = useMemo(() => {
    if (valorNumerico <= 0) return 'ZERO REAIS'
    return extenso(valorNumerico.toFixed(2).replace('.', ','), { mode: 'currency' }).toUpperCase()
  }, [valorNumerico])

  function atualizar<K extends keyof DadosRecibo>(campo: K, valor: DadosRecibo[K]) {
    setForm((old) => ({ ...old, [campo]: valor }))
  }

  function selecionarPaleta(primaria: string, secundaria: string) {
    setForm((old) => ({
      ...old,
      config: {
        ...(old.config || configPadrao()),
        corPrimaria: primaria,
        corSecundaria: secundaria,
      },
    }))
  }

  function gerarRecibo() {
    if (!String(form.nomeCliente || '').trim()) {
      alert('Informe o nome do cliente.')
      return
    }

    if (valorNumerico <= 0) {
      alert('Informe o valor do recibo.')
      return
    }

    const novo: DadosRecibo = {
      ...form,
      nomeCliente: String(form.nomeCliente || '').trim(),
      clienteTelefone: String(form.clienteTelefone || '').trim(),
      referente: String(form.referente || 'pagamento').trim(),
      valorNumero: valorNumerico,
      dataRecibo: form.dataRecibo || hojeInput(),
      formaPagamento: form.formaPagamento || 'Pix',
      observacao: form.observacao || 'Obrigado pela preferência.',
    }

    try {
      localStorage.setItem(RECIBO_KEY, JSON.stringify(novo))
    } catch {}

    setDados(novo)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function novoRecibo() {
    setDados(null)
    setForm((old) => ({
      ...old,
      nomeCliente: '',
      clienteTelefone: '',
      referente: '',
      valorNumero: '',
      dataRecibo: hojeInput(),
      formaPagamento: 'Pix',
      observacao: 'Obrigado pela preferência.',
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function visualizarUltimoRecibo() {
    try {
      const raw = localStorage.getItem(RECIBO_KEY)
      if (!raw) {
        alert('Nenhum recibo anterior encontrado.')
        return
      }

      const ultimo = JSON.parse(raw)
      setDados(ultimo)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      alert('Não foi possível abrir o último recibo.')
    }
  }

  const cfg = (dados?.config || form.config || configPadrao()) as NonNullable<DadosRecibo['config']>
  const corPrimaria = cfg.corPrimaria || '#16a34a'
  const corSecundaria = cfg.corSecundaria || '#f5f1e8'
  const logoUrl = cfg.logoUrl || ''
  const formaPagamento = dados?.formaPagamento || form.formaPagamento || 'Pix'

  async function enviarWhatsApp() {
    if (!dados) return

    const telefone = normalizarTelefoneWhatsapp(dados?.clienteTelefone)
    const link = await gerarLinkPublicoRecibo(dados)

    let mensagem = `Olá ${dados?.nomeCliente || 'cliente'}!\n\n`
    mensagem += `Segue seu recibo.\n`
    mensagem += `Referente a: ${dados?.referente || 'pagamento'}.\n`
    mensagem += `\n🔗 Acesse aqui:\n${link}`

    const texto = encodeURIComponent(mensagem)

    const url = isMobile
      ? telefone
        ? `whatsapp://send?phone=${telefone}&text=${texto}`
        : `whatsapp://send?text=${texto}`
      : telefone
        ? `https://wa.me/${telefone}?text=${texto}`
        : `https://wa.me/?text=${texto}`

    if (isMobile) {
      window.location.href = url
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function fecharRecibo() {
    window.close()

    setTimeout(() => {
      document.body.innerHTML = `
        <div style="
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          font-family:Arial, sans-serif;
          background:#f8fafc;
          color:#111827;
          flex-direction:column;
          gap:12px;
          text-align:center;
          padding:24px;
        ">
          <h2 style="margin:0;font-size:28px;">Recibo finalizado</h2>
          <p style="margin:0;color:#475569;font-size:16px;">Você já pode fechar esta aba.</p>
        </div>
      `
    }, 300)
  }

  function abrirVisualizacaoPDF() {
    if (!dados) return

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

    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.open()
    janela.document.write(html)
    janela.document.close()
  }

  if (!dados) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f4f7fb 0%,#eaf1fb 100%)', padding: isMobile ? 12 : 24, color: '#0f172a' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: corPrimaria }}>Recibo avulso • Connect Sistema</div>
              <h1 style={{ margin: '6px 0 0', fontSize: isMobile ? 30 : 42, lineHeight: 1, color: '#0f172a' }}>Criar recibo</h1>
              <p style={{ margin: '8px 0 0', color: '#64748b', fontWeight: 700 }}>Preencha os dados e gere o recibo para visualizar, enviar ou baixar em PDF.</p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
              <button
                onClick={visualizarUltimoRecibo}
                style={{ minHeight: 44, borderRadius: 16, border: '1px solid rgba(37,99,235,.35)', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontWeight: 900, padding: '0 18px', cursor: 'pointer', boxShadow: '0 0 22px rgba(37,99,235,.18)' }}
              >
                👁 Último recibo
              </button>

              <button
                onClick={() => router.push('/ordens-servico')}
                style={{ minHeight: 44, borderRadius: 16, border: '1px solid rgba(148,163,184,.35)', background: '#ffffff', color: '#0f172a', fontWeight: 900, padding: '0 18px', cursor: 'pointer', boxShadow: '0 8px 18px rgba(15,23,42,.06)' }}
              >
                Voltar para OS
              </button>
            </div>
          </div>

          <section style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderTop: `5px solid ${corPrimaria}`, boxShadow: '0 24px 70px rgba(15,23,42,0.10)', borderRadius: 30, padding: isMobile ? 16 : 24 }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#334155', marginBottom: 10 }}>Paleta do recibo</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {PALETAS_RECIBO.map((paleta) => {
                  const ativo = form.config?.corPrimaria === paleta.primaria
                  return (
                    <button
                      key={paleta.nome}
                      onClick={() => selecionarPaleta(paleta.primaria, paleta.secundaria)}
                      style={{
                        minHeight: 38,
                        borderRadius: 14,
                        border: ativo ? `2px solid ${paleta.primaria}` : '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#0f172a',
                        fontWeight: 900,
                        padding: '0 12px',
                        cursor: 'pointer',
                        boxShadow: ativo ? `0 0 18px ${paleta.primaria}40` : '0 6px 14px rgba(15,23,42,.05)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 999, background: paleta.primaria, display: 'inline-block' }} />
                      {paleta.nome}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <Campo label="Cliente" value={form.nomeCliente || ''} onChange={(v) => atualizar('nomeCliente', v)} placeholder="Nome do cliente" />
              <Campo label="Telefone / WhatsApp" value={form.clienteTelefone || ''} onChange={(v) => atualizar('clienteTelefone', v)} placeholder="84999999999" />
              <Campo label="Referente" value={form.referente || ''} onChange={(v) => atualizar('referente', v)} placeholder="Serviço, venda, entrada, parcela..." />
              <Campo label="Valor" value={String(form.valorNumero || '')} onChange={(v) => atualizar('valorNumero', v)} placeholder="150,00" />
              <Campo label="Data" type="date" value={String(form.dataRecibo || hojeInput())} onChange={(v) => atualizar('dataRecibo', v)} />
              <SelectCampo label="Forma de pagamento" value={form.formaPagamento || 'Pix'} onChange={(v) => atualizar('formaPagamento', v)} options={['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto']} />
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', marginBottom: 7, color: '#334155', fontWeight: 900, fontSize: 13 }}>Observação</label>
              <textarea
                value={form.observacao || ''}
                onChange={(e) => atualizar('observacao', e.target.value)}
                style={{ width: '100%', minHeight: 90, borderRadius: 16, border: '1px solid #cbd5e1', background: '#f8fbff', color: '#0f172a', padding: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={novoRecibo}
                style={{ minHeight: 50, borderRadius: 16, border: '1px solid rgba(148,163,184,.35)', background: '#e5e7eb', color: '#0f172a', fontWeight: 900, padding: '0 18px', cursor: 'pointer' }}
              >
                Limpar
              </button>
              <button
                onClick={gerarRecibo}
                style={{ minHeight: 46, minWidth: 190, borderRadius: 16, border: `1px solid ${corPrimaria}`, background: `linear-gradient(135deg,${corPrimaria},#0f172a)`, color: '#fff', fontWeight: 950, padding: '0 20px', cursor: 'pointer', boxShadow: `0 0 28px ${corPrimaria}40` }}
              >
                🧾 Gerar recibo
              </button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f4f7fb 0%,#eaf1fb 100%)', overflowX: 'clip', overflowY: 'auto', padding: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 12px) 10px 96px' : 20, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 980, width: '100%', margin: '0 auto 14px', display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={fecharRecibo}
          title="Fechar recibo"
          style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#ef4444,#991b1b)', color: '#fff', border: '1px solid rgba(239,68,68,.45)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(239,68,68,.22)' }}
        >
          ✕ Fechar
        </button>
        <button
          onClick={() => router.back()}
          style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', border: '1px solid rgba(148,163,184,.40)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(15,23,42,.22)' }}
        >
          ← Voltar
        </button>
        <button
          onClick={novoRecibo}
          style={{ minHeight: 50, minWidth: isMobile ? 120 : 150, background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', border: '1px solid rgba(148,163,184,.40)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 24px rgba(15,23,42,.22)' }}
        >
          Novo recibo
        </button>

        <button
          onClick={enviarWhatsApp}
          style={{ minHeight: 50, minWidth: isMobile ? 150 : 190, background: 'linear-gradient(135deg,#16a34a 0%, #065f46 100%)', color: '#fff', border: '1px solid rgba(34,197,94,.50)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 0 28px rgba(34,197,94,.30), inset 0 1px 0 rgba(255,255,255,.14)' }}
        >
          🟢 Enviar link
        </button>

        <button
          onClick={abrirVisualizacaoPDF}
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

function Campo({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 7, color: '#334155', fontWeight: 900, fontSize: 13 }}>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', minHeight: 50, borderRadius: 16, border: '1px solid #cbd5e1', background: '#f8fbff', color: '#0f172a', padding: '0 14px', outline: 'none', boxSizing: 'border-box', fontSize: 16, lineHeight: '50px', WebkitAppearance: 'none', appearance: 'none' }}
      />
    </div>
  )
}

function SelectCampo({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 7, color: '#334155', fontWeight: 900, fontSize: 13 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', minHeight: 50, borderRadius: 16, border: '1px solid #cbd5e1', background: '#f8fbff', color: '#0f172a', padding: '0 14px', outline: 'none', boxSizing: 'border-box', fontSize: 16, lineHeight: '50px', WebkitAppearance: 'none', appearance: 'none' }}
      >
        {options.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </div>
  )
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