'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import extenso from 'extenso'

import { ReciboEmitidoView, type DadosReciboEmitido } from '@/components/recibos/ReciboEmitidoView'
import { abrirReciboPdfEmNovaJanela } from '@/lib/recibo-print-html'
import { supabase } from '@/lib/supabase-browser'

type DadosRecibo = DadosReciboEmitido

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

function prepararPayloadReciboPublico(dados: DadosRecibo) {
  try {
    const payload = JSON.parse(JSON.stringify(dados)) as DadosRecibo
    const logoUrl = payload.config?.logoUrl
    if (typeof logoUrl === 'string' && logoUrl.startsWith('data:') && logoUrl.length > 120_000) {
      payload.config = { ...payload.config, logoUrl: '' }
    }
    return payload
  } catch (error) {
    console.error('[RECIBO_PUBLICO] Payload inválido para serialização:', error)
    return dados
  }
}

async function gerarLinkPublicoRecibo(dados: DadosRecibo): Promise<string> {
  const documentId = String(Date.now())
  const token = gerarToken()
  const payload = prepararPayloadReciboPublico(dados)

  let accessToken = ''
  let userId = ''
  try {
    const { data: { session } } = await supabase.auth.getSession()
    accessToken = session?.access_token || ''
    userId = session?.user?.id || ''
  } catch (error) {
    console.warn('[RECIBO_PUBLICO] Sessão não disponível para publicar link:', error)
  }

  const body = {
    document_type: 'recibo',
    document_id: documentId,
    token,
    payload,
    ...(userId ? { user_id: userId } : {}),
  }

  try {
    const response = await fetch('/api/public-docs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    })

    const raw = await response.text()
    let json: { success?: boolean; error?: string; token?: string; document_id?: string } | null = null
    try {
      json = raw ? JSON.parse(raw) : null
    } catch {
      json = null
    }

    if (response.ok && json?.success !== false) {
      const tokenSalvo = String(json?.token || token).trim()
      const idSalvo = String(json?.document_id || documentId).trim()
      return `${SITE_URL}/visualizar/recibo/${encodeURIComponent(idSalvo)}?token=${encodeURIComponent(tokenSalvo)}`
    }

    console.error('[RECIBO_PUBLICO] Falha POST /api/public-docs', {
      status: response.status,
      statusText: response.statusText,
      body: json ?? raw,
      request: { document_type: 'recibo', document_id: documentId, token },
    })

    const msgApi = String(json?.error || '').trim()
    alert(
      msgApi
        ? `Não foi possível gerar o link público do recibo.\n\n${msgApi}`
        : 'Não foi possível gerar o link público do recibo. Verifique sua conexão e tente novamente.',
    )
  } catch (error) {
    console.error('[RECIBO_PUBLICO] Erro de rede ao salvar documento público:', error)
    alert('Não foi possível gerar o link público do recibo. Verifique sua conexão e tente novamente.')
  }

  return ''
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
      if (paramsRecibo.get('preview') !== '1') return
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
    if (!link) return

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
    abrirReciboPdfEmNovaJanela(dados)
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
    <ReciboEmitidoView
      dados={dados}
      isMobile={isMobile}
      onFechar={fecharRecibo}
      onVoltar={() => router.back()}
      onNovo={novoRecibo}
      onEnviarLink={enviarWhatsApp}
      onPdf={abrirVisualizacaoPDF}
    />
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
