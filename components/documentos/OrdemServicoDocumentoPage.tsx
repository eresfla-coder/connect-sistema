'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

type OrdemServico = {
  id: number
  numero: string
  cliente: string
  telefone: string
  email: string
  endereco: string
  equipamento: string
  marca: string
  modelo: string
  serial: string
  defeito: string
  checklist: string
  observacao: string
  valor: number
  entrada: number
  saldo: number
  status: string
  prioridade: string
  tecnico: string
  previsao: string
  data: string
  ultimaAtualizacao: string
  link?: string
  orcamentoId?: number
}

const STORAGE_KEY = 'connect_ordens_servico_salvas'
const PUBLIC_OS_PREFIX = 'connect_public_os_'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numero(valor: any) { return Number(valor || 0) }

function parseDataBR(data?: string) {
  if (!data) return '-'
  const iso = String(data).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [ano, mes, dia] = iso.split('-')
    return `${dia}/${mes}/${ano}`
  }
  return iso || '-'
}

function limparPartesRepetidas(valor?: string) {
  const texto = String(valor || '').replace(/\s+/g, ' ').trim()
  if (!texto) return ''
  const partes = texto
    .split(/\s*[•|;,-]\s*/g)
    .map((parte) => parte.trim())
    .filter(Boolean)

  const vistos = new Set<string>()
  const limpas: string[] = []

  for (const parte of partes) {
    const chave = parte
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
    limpas.push(parte)
  }

  return limpas.length ? limpas.slice(0, 6).join(' • ') : texto
}

function textoPdf(valor?: string) {
  return limparPartesRepetidas(valor) || '-'
}

function siteBase() {
  if (typeof window !== 'undefined') return window.location.origin
  return SITE_URL || 'https://appconnectpro.com.br'
}

function normalizarLogoUrl(valor: string) {
  if (!valor) return ''
  if (valor.startsWith('http://') || valor.startsWith('https://') || valor.startsWith('data:')) return valor
  if (valor.startsWith('/')) return `${siteBase()}${valor}`
  return valor
}

function getConfig() {
  const fallback = {
    nome: 'LOJA CONNECT',
    logo: '/logo-connect.png',
    telefone: '',
    email: 'lojaconnect@hotmail.com',
    endereco: 'GILBERTO ROBERTO GOMES,243',
    cidadeUf: 'PARNAMIRIM-RN',
  }
  if (typeof window === 'undefined') return fallback
  try {
    const salvo = localStorage.getItem('connect_configuracoes')
    if (!salvo) return fallback
    const config = JSON.parse(salvo)
    return {
      nome: String(config?.nomeEmpresa || fallback.nome),
      logo: normalizarLogoUrl(String(config?.logoUrl || fallback.logo)),
      telefone: String(config?.telefone || ''),
      email: String(config?.email || fallback.email),
      endereco: String(config?.endereco || fallback.endereco),
      cidadeUf: String(config?.cidadeUf || fallback.cidadeUf),
    }
  } catch { return fallback }
}

function telefoneClienteOSPublica(item: any) {
  let telefone = String(item?.telefone || item?.cliente_telefone || item?.whatsapp || item?.cliente?.telefone || item?.cliente?.whatsapp || '').replace(/\D/g, '')
  while (telefone.startsWith('00')) telefone = telefone.slice(2)
  if (telefone.startsWith('55')) telefone = telefone.slice(2)
  telefone = telefone.replace(/^0+/, '')
  if (telefone.length > 11) telefone = telefone.slice(-11)
  if (telefone.length < 10) return ''
  return `55${telefone}`
}

function fromBase64Url(value: string) {

  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4)
  const binary = atob(padded)
  const percentEncoded = Array.from(binary).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
  return decodeURIComponent(percentEncoded)
}

function normalizar(item: any): OrdemServico {
  return {
    id: numero(item?.id ?? item?.i),
    numero: String(item?.numero ?? item?.n ?? ''),
    cliente: String(item?.cliente ?? item?.c ?? ''),
    telefone: String(item?.telefone ?? item?.t ?? ''),
    email: String(item?.email ?? item?.e ?? ''),
    endereco: String(item?.endereco ?? item?.en ?? ''),
    equipamento: String(item?.equipamento ?? item?.eq ?? ''),
    marca: String(item?.marca ?? item?.ma ?? ''),
    modelo: String(item?.modelo ?? item?.mo ?? ''),
    serial: String(item?.serial ?? item?.se ?? ''),
    defeito: String(item?.defeito ?? item?.df ?? ''),
    checklist: String(item?.checklist ?? item?.ch ?? ''),
    observacao: String(item?.observacao ?? item?.ob ?? ''),
    valor: numero(item?.valor ?? item?.v),
    entrada: numero(item?.entrada ?? item?.et),
    saldo: numero(item?.saldo ?? item?.sd ?? (numero(item?.valor ?? item?.v) - numero(item?.entrada ?? item?.et))),
    status: String(item?.status ?? item?.st ?? ''),
    prioridade: String(item?.prioridade ?? item?.pr ?? ''),
    tecnico: String(item?.tecnico ?? item?.te ?? ''),
    previsao: String(item?.previsao ?? item?.pv ?? ''),
    data: String(item?.data ?? item?.d ?? ''),
    ultimaAtualizacao: String(item?.ultimaAtualizacao ?? item?.ua ?? ''),
    link: String(item?.link || ''),
    orcamentoId: item?.orcamentoId ? Number(item.orcamentoId) : undefined,
  }
}

function lerOSDoLink(searchValue: string | null): OrdemServico | null {
  const valorHash = typeof window !== 'undefined' && window.location.hash.startsWith('#d=') ? window.location.hash.slice(3) : null
  const fonte = searchValue || valorHash
  if (!fonte) return null
  try {
    const bruto = JSON.parse(fromBase64Url(fonte))
    return { ...normalizar(bruto), cfg: bruto?.cfg } as any
  } catch { return null }
}

function lerFallbackLocal(id: string): OrdemServico | null {
  if (typeof window === 'undefined') return null
  try {
    const salvo = localStorage.getItem(`${PUBLIC_OS_PREFIX}${id}`)
    return salvo ? normalizar(JSON.parse(salvo)) : null
  } catch { return null }
}

function getOrdens(): OrdemServico[] {
  if (typeof window === 'undefined') return []
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    return Array.isArray(lista) ? lista.map(normalizar) : []
  } catch { return [] }
}


function toBase64Url(json: string) {
  const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)))
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function serializarOSPublica(os: OrdemServico, empresa: ReturnType<typeof getConfig>) {
  const payload = {
    i: os.id,
    n: os.numero,
    c: os.cliente,
    t: os.telefone,
    e: os.email,
    en: os.endereco,
    eq: os.equipamento,
    ma: os.marca,
    mo: os.modelo,
    se: os.serial,
    df: os.defeito,
    ch: os.checklist,
    ob: os.observacao,
    v: os.valor,
    et: os.entrada,
    sd: os.saldo,
    st: os.status,
    pr: os.prioridade,
    te: os.tecnico,
    pv: os.previsao,
    d: os.data,
    ua: os.ultimaAtualizacao,
    cfg: {
      nomeEmpresa: empresa.nome,
      telefone: empresa.telefone,
      email: empresa.email,
      endereco: empresa.endereco,
      cidadeUf: empresa.cidadeUf,
      logoUrl: empresa.logo,
    },
  }
  return toBase64Url(JSON.stringify(payload))
}

function InfoCell({ titulo, valor }: { titulo: string; valor?: string }) {
  return (
    <div className="info-cell">
      <div className="label">{titulo}</div>
      <div className="value">{valor || '-'}</div>
    </div>
  )
}

export function OrdemServicoDocumentoPage({ forcePreview = false }: { forcePreview?: boolean } = {}) {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = String(params?.id ?? '')
  const [os, setOs] = useState<OrdemServico | null>(null)
  const [empresa, setEmpresa] = useState(getConfig())
  const [carregado, setCarregado] = useState(false)
  const [isPreview, setIsPreview] = useState(true)
  const [mensagemAprovacao, setMensagemAprovacao] = useState('')
  const [processandoAprovacao, setProcessandoAprovacao] = useState(false)

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      const lista = getOrdens()
      const osPayload = lerOSDoLink(searchParams.get('d')) as any
      const tokenPublico = searchParams.get('p') || searchParams.get('token')
      let osPublica: any = null

      if (!osPayload && tokenPublico) {
        try {
          const resp = await fetch(`/api/public-docs/${encodeURIComponent(tokenPublico)}`, { cache: 'no-store' })
          if (resp.ok) {
            const dados = await resp.json()
            osPublica = dados?.payload ? normalizar(dados.payload) : null
            if (osPublica && typeof window !== 'undefined') {
              try { localStorage.setItem(`${PUBLIC_OS_PREFIX}${osPublica.id}`, JSON.stringify(osPublica)) } catch {}
            }
          }
        } catch {}
      }

      // Release v43: fallback público por ID para links curtos enviados no WhatsApp/domínio novo.
      if (!osPayload && !osPublica && id) {
        try {
          const resp = await fetch(`/api/public-docs?tipo=os&documentoId=${encodeURIComponent(id)}`, { cache: 'no-store' })
          if (resp.ok) {
            const dados = await resp.json()
            osPublica = dados?.payload ? normalizar(dados.payload) : null
            if (osPublica && typeof window !== 'undefined') {
              try { localStorage.setItem(`${PUBLIC_OS_PREFIX}${osPublica.id}`, JSON.stringify(osPublica)) } catch {}
            }
          }
        } catch {}
      }

      if (cancelado) return

      const osLocal = lista.find((item) => String(item.id) === id || String(item.numero) === id) || null
      const osFinal = osPayload || osPublica || osLocal || lerFallbackLocal(id)
      setOs(osFinal)
      const cfgLocal = getConfig()
      const cfgPayload = osPayload?.cfg || (osPublica as any)?.cfg || null
      setEmpresa(cfgPayload ? {
        ...cfgLocal,
        nome: String(cfgPayload.nomeEmpresa || cfgPayload.nome || cfgLocal.nome),
        telefone: String(cfgPayload.telefone || cfgLocal.telefone),
        email: String(cfgPayload.email || cfgLocal.email),
        endereco: String(cfgPayload.endereco || cfgLocal.endereco),
        cidadeUf: String(cfgPayload.cidadeUf || cfgLocal.cidadeUf),
        logo: normalizarLogoUrl(String(cfgPayload.logoUrl || cfgPayload.logo || cfgLocal.logo)),
      } : cfgLocal)
      setIsPreview(forcePreview || searchParams.get('print') !== '1')
      setCarregado(true)
    }

    carregar()
    return () => { cancelado = true }
  }, [forcePreview, id, searchParams])

  useEffect(() => {
    if (!carregado || !os || isPreview) return
    const timer = window.setTimeout(() => window.print(), 450)
    return () => window.clearTimeout(timer)
  }, [carregado, isPreview, os])

  const contatoEmpresa = useMemo(() => limparPartesRepetidas([empresa.telefone, empresa.email, empresa.endereco, empresa.cidadeUf].filter(Boolean).join(' • ')), [empresa])
  const linkCompartilhamento = useMemo(() => {
    if (!os || typeof window === 'undefined') return ''

    const base = siteBase()
    const params = new URLSearchParams(window.location.search)
    const tokenAtual = params.get('p') || params.get('token')
    const linkBase = `${base}/impressao-ordem-servico/${os.id}?preview=1`

    // V44: mantém link curto e estável. Se veio com token público, preserva o token;
    // se veio por fallback de ID, mantém URL limpa e a página busca no Supabase pelo ID.
    try {
      localStorage.setItem(`${PUBLIC_OS_PREFIX}${os.id}`, JSON.stringify(os))
    } catch {}

    return tokenAtual ? `${linkBase}&p=${encodeURIComponent(tokenAtual)}` : linkBase
  }, [os])

  function copiarLinkAtual() {
    if (!linkCompartilhamento) return
    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(linkCompartilhamento).then(() => alert('Link copiado.')).catch(() => window.prompt('Copie o link:', linkCompartilhamento))
    else window.prompt('Copie o link:', linkCompartilhamento)
  }

  async function salvarStatusPublicoOS(status: 'Aprovada' | 'Cancelada') {
    if (!os || typeof window === 'undefined' || processandoAprovacao) return
    setProcessandoAprovacao(true)
    const atualizado: any = {
      ...os,
      status,
      ultimaAtualizacao: new Date().toLocaleDateString('pt-BR'),
      aprovadoEm: status === 'Aprovada' ? new Date().toLocaleString('pt-BR') : undefined,
      aprovacaoDigital: {
        status: status === 'Aprovada' ? 'aprovado' : 'recusado',
        data: new Date().toLocaleString('pt-BR'),
        origem: 'link-publico-os',
      },
    } as any

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const lista = raw ? JSON.parse(raw) : []
      const baseLista = Array.isArray(lista) ? lista : []
      const existe = baseLista.some((item: any) => String(item?.id) === String(os.id) || String(item?.numero) === String(os.numero))
      const novaLista = existe
        ? baseLista.map((item: any) => (String(item?.id) === String(os.id) || String(item?.numero) === String(os.numero)) ? { ...item, ...atualizado } : item)
        : [atualizado, ...baseLista]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novaLista))
      localStorage.setItem(`${PUBLIC_OS_PREFIX}${atualizado.id}`, JSON.stringify(atualizado))
      window.dispatchEvent(new Event('connect-local-saved'))
    } catch {}

    try {
      const tokenAtual = new URLSearchParams(window.location.search).get('p') || new URLSearchParams(window.location.search).get('token')
      await fetch('/api/public-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'os',
          documentoId: String(atualizado.id),
          token: tokenAtual || undefined,
          payload: { ...atualizado, cfg: empresa },
        }),
      })
    } catch {}

    setOs(atualizado)
    setMensagemAprovacao(status === 'Aprovada' ? 'OS aprovada com sucesso.' : 'OS recusada/cancelada pelo cliente.')

    const telefoneCliente = telefoneClienteOSPublica(atualizado)
    if (telefoneCliente) {
      const msg = status === 'Aprovada'
        ? `✅ Olá ${atualizado.cliente || 'cliente'}!

Sua ordem de serviço *${atualizado.numero || atualizado.id}* foi aprovada com sucesso.
Valor: ${moeda(atualizado.valor)}

A equipe dará continuidade ao atendimento.`
        : `⚠️ Olá ${atualizado.cliente || 'cliente'}!

Sua ordem de serviço *${atualizado.numero || atualizado.id}* foi marcada como recusada/cancelada.`
      window.open(`https://api.whatsapp.com/send/?phone=${telefoneCliente}&text=${encodeURIComponent(msg)}&type=phone_number&app_absent=0`, '_blank', 'noopener,noreferrer')
    }
    setProcessandoAprovacao(false)
  }


  if (!carregado) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', color: '#334155' }}>Carregando OS...</div>
  if (!os) return <div style={{ padding: 24, color: '#334155' }}>OS não encontrada.</div>

  return (
    <div className="os-doc-page">
      <style>{`
        @page { size: A4 portrait; margin: 3mm; }
        * { box-sizing: border-box; }
        .os-doc-page {min-height: 100vh; min-height: 100dvh; background: #eef3f8; padding: calc(env(safe-area-inset-top, 0px) + 74px) max(12px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); overflow-x: hidden; -webkit-overflow-scrolling: touch; color: #0f172a; font-family: Dubai, Arial, sans-serif; }
        .toolbar { display: flex; gap: 10px; justify-content: center; align-items: center; margin: 0 auto 12px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 10px); z-index: 20; padding: 8px; border-radius: 16px; background: rgba(238,243,248,.96); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .toolbar button { min-width: 116px; height: 34px; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; color: #0f172a; font-size: 13px; font-weight: 900; cursor: pointer; }
        .toolbar .primary { background: #2563eb; border-color: #2563eb; color: white; }
        .toolbar .danger { background: #dc2626; border-color: #dc2626; color: white; }
        .toolbar .approve { background: #16a34a; border-color: #16a34a; color: white; }
        .approval-msg { width: 190mm; max-width: 100%; margin: -4px auto 10px; padding: 10px 12px; border-radius: 14px; background: #ecfdf5; border: 1px solid #86efac; color: #166534; font-weight: 900; text-align: center; }
        .approval-badge { display:inline-flex; align-items:center; justify-content:center; padding: 2px 8px; border-radius:999px; background:#dcfce7; color:#166534; font-weight:950; font-size:8px; margin-left:6px; }
        .sheet { width: 190mm; min-height: auto; margin: 0 auto; background: white; border: 1px solid #cbd5e1; border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px rgba(15,23,42,.10); }
        .header { display: grid; grid-template-columns: 1fr auto; gap: 7px; align-items: center; padding: 2.4mm 5.5mm 1.4mm; background: linear-gradient(135deg,#f8fbff,#eef4fb); border-bottom: 1.5px solid #2563eb; }
        .brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .brand img { width: 7.5mm; height: 7.5mm; object-fit: contain; border-radius: 7px; background: transparent; border: 0; padding: 0; }
        .brand h1 { margin: 0; font-size: 13px; line-height: .95; letter-spacing: .02em; font-family: Dubai, Arial, sans-serif; font-weight: 900; }
        .brand p { margin: 1px 0 0; font-size: 6.9px; color: #334155; line-height: 1.18; max-width: 128mm; }
        .doc-number { text-align: right; text-transform: uppercase; letter-spacing: .08em; color: #334155; font-size: 7.8px; font-weight: 900; }
        .doc-number strong { display: block; color: #0f172a; font-size: 14px; letter-spacing: .02em; margin-top: 1px; font-family: Dubai, Arial, sans-serif; font-weight: 950; }
        .title { padding: 1.2mm 5.5mm 1mm; text-align: center; }
        .title small { display: block; color: #64748b; font-size: 6.4px; font-weight: 900; letter-spacing: .22em; text-transform: uppercase; margin-bottom: 1px; }
        .title h2 { margin: 0; font-size: 15px; line-height: .95; letter-spacing: .02em; font-family: Dubai, Arial, sans-serif; font-weight: 950; }
        .content { padding: 0 5.5mm 2mm; }
        .client-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid #dbe4ef; border-radius: 8px; background: #f8fbff; padding: 2px 5px; font-size: 8px; margin-bottom: 3px; }
        .client-line b { font-size: 10.4px; }
        .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #dbe4ef; border-radius: 10px; overflow: hidden; margin-bottom: 4px; }
        .grid4 .info-cell { min-height: 6mm; border-right: 1px solid #dbe4ef; border-bottom: 1px solid #dbe4ef; background: #fbfdff; padding: 2.5px 4px; text-align: center; }
        .grid4 .info-cell:nth-child(4n) { border-right: 0; }
        .grid4 .info-cell:nth-last-child(-n+4) { border-bottom: 0; }
        .label { color: #475569; font-size: 6.1px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
        .value { color: #0f172a; font-size: 7.9px; font-weight: 900; margin-top: 1px; word-break: break-word; }
        .main-grid { display: grid; grid-template-columns: 1.12fr .88fr; gap: 4px; align-items: start; }
        .block { border: 1px solid #dbe4ef; border-radius: 8px; background: #fbfdff; padding: 2px 4px; min-height: 5.5mm; margin-bottom: 2px; break-inside: avoid; page-break-inside: avoid; }
        .block .label { margin-bottom: 1px; }
        .block .text { font-size: 7.7px; font-weight: 750; line-height: 1.12; color: #0f172a; white-space: pre-wrap; }
        .finance { border: 1px solid #86efac; border-radius: 12px; overflow: hidden; background: #f8fff9; margin-bottom: 4px; }
        .finance-row { display: flex; justify-content: space-between; gap: 8px; padding: 2.5px 5px; font-size: 8px; font-weight: 850; }
        .finance-total { display: flex; justify-content: space-between; align-items: center; padding: 2.5px 5px; border-top: 1px solid #bbf7d0; background: linear-gradient(90deg,#ecfdf5,#fff8c4); font-size: 9.4px; font-weight: 950; color: #15803d; box-shadow: inset 0 -6px 0 rgba(250,204,21,.28); }
        .finance-total strong { font-size: 10.8px; }
        .dates { border: 1px solid #dbe4ef; border-radius: 8px; padding: 2px 4px; background: #fbfdff; }
        .date-row { display: flex; justify-content: space-between; gap: 8px; font-size: 7.7px; font-weight: 850; padding: 1px 0; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 2mm; font-size: 7.3px; color: #334155; break-inside: avoid; page-break-inside: avoid; }
        .sig-line { border-top: 1px solid #334155; text-align: center; padding-top: 2px; }
        @media print {
          html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 210mm; height: auto; overflow: visible !important; }
          body { margin: 0 !important; }
          .os-doc-page { padding: 0 !important; background: #fff !important; }
          .toolbar { display: none !important; }
          .sheet { width: 100% !important; min-height: auto !important; max-height: 276mm !important; margin: 0 !important; border-radius: 0 !important; border: 0 !important; box-shadow: none !important; page-break-after: avoid; }
          .header { padding: 2mm 4mm 1.2mm !important; }
          .title { padding: 1mm 4mm .8mm !important; }
          .content { padding: 0 4mm 1.5mm !important; }
          .brand img { width: 7mm !important; height: 7mm !important; }
          .brand h1 { font-size: 12px !important; }
          .doc-number strong { font-size: 13px !important; }
          .title h2 { font-size: 14px !important; }
          .grid4 .info-cell { min-height: 5.5mm !important; padding: 1.5px 3px !important; }
          .block { min-height: 5mm !important; padding: 1.5px 3px !important; margin-bottom: 1.5px !important; }
          .signatures { margin-top: 1.6mm !important; }
        }
        @media (max-width: 760px) { .approval-msg { width:auto; margin: 0 8px 10px; } .os-doc-page { padding: calc(env(safe-area-inset-top, 0px) + 74px) 10px calc(env(safe-area-inset-bottom, 0px) + 18px); touch-action: pan-y; } .toolbar { position: fixed; left: 8px; right: 8px; top: calc(env(safe-area-inset-top, 0px) + 8px); margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .toolbar button { width: 100%; min-width: 0; height: 44px; } .sheet { width: 100%; min-height: auto; border-radius: 14px; overflow: visible; } .header, .title, .content { padding-left: 14px; padding-right: 14px; } .header { grid-template-columns: 1fr; } .brand { align-items: flex-start; } .brand h1 { font-size: 24px; } .grid4 { grid-template-columns: repeat(2, 1fr); } .main-grid { grid-template-columns: 1.12fr .88fr; } .client-line { align-items: flex-start; flex-direction: column; } }
      `}</style>

      <div className="toolbar">
        <button
          className="danger"
          onClick={() => {
            if (window.history.length > 1) window.history.back()
            else window.close()
          }}
        >
          ✕ Fechar
        </button>
        <button className="primary" onClick={() => window.print()}>Imprimir / PDF</button>
        <button className="approve" disabled={processandoAprovacao || os.status === 'Aprovada'} onClick={() => salvarStatusPublicoOS('Aprovada')}>{processandoAprovacao ? 'Salvando...' : os.status === 'Aprovada' ? 'Aprovada' : 'Aprovar OS'}</button>
        <button onClick={copiarLinkAtual}>Copiar link</button>
      </div>

      {mensagemAprovacao ? <div className="approval-msg">{mensagemAprovacao}</div> : null}

      <article className="sheet">
        <header className="header">
          <div className="brand">
            {empresa.logo ? <img src={empresa.logo} alt="Logo" /> : null}
            <div>
              <h1>{empresa.nome}</h1>
              <p>{contatoEmpresa}</p>
            </div>
          </div>
          <div className="doc-number">Ordem de Serviço<strong>Nº {os.numero || '0000'}</strong><span>{parseDataBR(os.data)}</span></div>
        </header>

        <section className="title"><small>Documento técnico premium</small><h2>ORDEM DE SERVIÇO</h2></section>

        <main className="content">
          <div className="client-line"><span><span className="label">Cliente</span> <b>{os.cliente || '-'}</b></span><b>{os.telefone || '-'}</b></div>

          <div className="grid4">
            <InfoCell titulo="Equipamento" valor={os.equipamento} />
            <InfoCell titulo="Marca" valor={os.marca} />
            <InfoCell titulo="Modelo" valor={os.modelo} />
            <InfoCell titulo="Serial / IMEI" valor={os.serial} />
            <InfoCell titulo="Status" valor={os.status} />
            <InfoCell titulo="Prioridade" valor={os.prioridade} />
            <InfoCell titulo="Técnico" valor={os.tecnico} />
            <InfoCell titulo="Previsão" valor={parseDataBR(os.previsao)} />
          </div>

          <div className="main-grid">
            <div>
              <div className="block"><div className="label">E-mail</div><div className="text">{textoPdf(os.email)}</div></div>
              <div className="block"><div className="label">Endereço</div><div className="text">{textoPdf(os.endereco)}</div></div>
              <div className="block"><div className="label">Defeito informado</div><div className="text">{textoPdf(os.defeito)}</div></div>
              <div className="block"><div className="label">Checklist / acessórios</div><div className="text">{textoPdf(os.checklist)}</div></div>
              <div className="block"><div className="label">Observação</div><div className="text">{textoPdf(os.observacao)}</div></div>
            </div>
            <div>
              <div className="finance">
                <div className="finance-row"><span>Valor do serviço</span><strong>{moeda(os.valor)}</strong></div>
                <div className="finance-row"><span>Entrada</span><strong>{moeda(os.entrada)}</strong></div>
                <div className="finance-row"><span>Saldo</span><strong>{moeda(os.saldo)}</strong></div>
                <div className="finance-total"><span>Saldo final</span><strong>{moeda(os.saldo)}</strong></div>
              </div>
              <div className="dates">
                <div className="date-row"><span>Abertura</span><strong>{parseDataBR(os.data)}</strong></div>
                <div className="date-row"><span>Atualização</span><strong>{parseDataBR(os.ultimaAtualizacao)}</strong></div>
                <div className="date-row"><span>Cliente</span><strong>{os.cliente || '-'}</strong></div>
                <div className="date-row"><span>Telefone</span><strong>{os.telefone || '-'}</strong></div>
              </div>
            </div>
          </div>

          <div className="signatures"><div className="sig-line">Assinatura do cliente</div><div className="sig-line">Assinatura técnico</div></div>
        </main>
      </article>
    </div>
  )
}
