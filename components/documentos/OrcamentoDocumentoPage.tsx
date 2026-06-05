'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { abrirWhatsappUrl, montarUrlWhatsapp, type ResultadoAbrirWhatsapp } from '@/lib/abrirExterno'
import { normalizarTelefoneWhatsapp } from '@/lib/recibo-publico'
import { mensagemOrcamentoAprovadoParaEmpresa } from '@/lib/whatsappMensagens'
import { logoUrlAbsolutaPublica, mergeConfigPublicacao } from '@/lib/documentosPublicos'
import { montarUrlPublicaDocumento, siteUrlPublico } from '@/lib/empresaPublica'
import { urlQrCode } from '@/lib/pdfPremium'
import { iconeFormaPagamento, listaFormasPagamentoOrcamento, textoPagamentoOrcamento } from '@/lib/orcamento-pagamento'
import {
  itemOrcamentoOcultarDetalheClienteM2,
  normalizarTextoObservacao,
  OBSERVACAO_PADRAO_ORCAMENTO,
  orcamentoDeveOcultarM2Cliente,
  validadeOrcamentoAtiva,
} from '@/lib/orcamentoTextos'

type Cliente = {
  nome?: string
  telefone?: string
  email?: string
  endereco?: string
  bairro?: string
  cidade?: string
  tipoPessoa?: 'PF' | 'PJ'
  cpf?: string
  cnpj?: string
  razaoSocial?: string
  nomeFantasia?: string
}

type ItemOrcamento = {
  id?: number | string
  nome?: string
  descricao?: string
  quantidade?: number
  valor?: number
  total?: number
  mostrarCliente?: boolean
  tipoCadastro?: 'produto' | 'servico'
  tipoCalculo?: 'unidade' | 'm2' | 'peso'
  largura?: number
  altura?: number
  metragem?: number
  valorM2?: number
  unidadeLabel?: string
}

type Orcamento = {
  id: number
  numero: string
  titulo?: string
  data?: string
  status?: string
  cliente?: Cliente | string | null
  itens?: ItemOrcamento[]
  subtotal?: number
  entrega?: number
  desconto?: number
  total?: number
  formaPagamento?: string
  validade?: string
  prazoEntrega?: string
  enderecoEntrega?: string
  observacao?: string
  link?: string
  tipoDocumento?: string
  tituloProposta?: string
  descricaoProposta?: string
  condicoesPagamento?: string
  validadeProposta?: string
  observacoesProposta?: string
  formasPagamentoLista?: string[]
  observacaoPagamento?: string
  ocultarValorUnitarioM2?: boolean
  aprovacaoDigital?: {
    status?: 'aprovado' | 'recusado'
    nome?: string
    data?: string
    assinatura?: string
    origem?: string
  }
  config?: Config
}

type Config = {
  nomeEmpresa?: string
  nome?: string
  telefone?: string
  telefoneEmpresa?: string
  celularEmpresa?: string
  celular?: string
  whatsappEmpresa?: string
  whatsapp?: string
  email?: string
  endereco?: string
  cidadeUf?: string
  responsavel?: string
  tituloPdf?: string
  rodapePdf?: string
  logoUrl?: string
  logo?: string
  corPrimaria?: string
  corSecundaria?: string
}

const STORAGE_KEY = 'connect_orcamentos_salvos'
const CONFIG_KEY = 'connect_configuracoes'
const OS_KEY = 'connect_ordens_servico_salvas'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

function texto(valor: any, fallback = ''): string {
  if (valor === null || valor === undefined || valor === '') return fallback
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return String(valor)
  if (typeof valor === 'object') {
    return String(
      valor.nome ||
        valor.nomeCompleto ||
        valor.nomeFantasia ||
        valor.razaoSocial ||
        valor.titulo ||
        valor.descricao ||
        fallback
    )
  }
  return fallback
}

function clienteTelefone(cliente: any, fallback = ''): string {
  if (!cliente) return fallback
  if (typeof cliente === 'object') return texto(cliente.telefone || cliente.whatsapp || cliente.celular, fallback)
  return fallback
}

function clienteEmail(cliente: any, fallback = ''): string {
  if (!cliente || typeof cliente !== 'object') return fallback
  return texto(cliente.email, fallback)
}

function clienteEndereco(cliente: any, fallback = ''): string {
  if (!cliente || typeof cliente !== 'object') return fallback
  const partes = [cliente.endereco, cliente.bairro, cliente.cidade].filter(Boolean)
  return partes.length ? partes.join(' • ') : fallback
}

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function numero(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}

function parseDataBR(valor?: string) {
  if (!valor) return new Date().toLocaleDateString('pt-BR')
  const v = String(valor).trim()
  if (!v) return new Date().toLocaleDateString('pt-BR')
  if (v.includes('/')) return v
  const data = new Date(v)
  if (Number.isNaN(data.getTime())) return v
  return data.toLocaleDateString('pt-BR')
}

function totalItem(item: ItemOrcamento) {
  if (Number(item.total || 0) > 0) return Number(item.total || 0)
  if (item.tipoCalculo === 'm2') return Number(item.metragem || 0) * Number(item.valorM2 ?? item.valor ?? 0)
  return Number(item.quantidade || 0) * Number(item.valor || 0)
}

function valorUnitario(item: ItemOrcamento) {
  if (item.tipoCalculo === 'm2') return Number(item.valorM2 ?? item.valor ?? 0)
  return Number(item.valor || 0)
}

function unidadeItem(item: ItemOrcamento) {
  if (item.unidadeLabel) return item.unidadeLabel
  if (item.tipoCalculo === 'm2') return 'm²'
  if (item.tipoCalculo === 'peso') return 'kg'
  if (item.tipoCadastro === 'servico') return 'serv.'
  return 'un'
}

function quantidadeItem(item: ItemOrcamento) {
  if (itemOrcamentoOcultarDetalheClienteM2(item)) return ''
  if (item.tipoCalculo === 'peso') {
    return Number(item.quantidade || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
      useGrouping: false,
    })
  }
  return numero(Number(item.quantidade || 0))
}

function ocultarDetalhesItemCliente(item: ItemOrcamento) {
  return itemOrcamentoOcultarDetalheClienteM2(item)
}

function findOrcamento(lista: any[], idParam: string) {
  const target = String(idParam || '').trim()
  return (
    lista.find((o: any) => String(o?.id ?? '') === target) ||
    lista.find((o: any) => String(o?.numero ?? '') === target) ||
    lista.find((o: any) => String(o?.link ?? '').includes(`/${target}`)) ||
    null
  )
}

function decodePayload(value: string | null) {
  if (!value) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    )
    const compact = JSON.parse(decoded)
    if (!compact?.i && !compact?.id) return compact
    return {
      id: compact.i || compact.id,
      numero: compact.n || compact.numero,
      titulo: compact.ti || compact.titulo || 'Orçamento Comercial',
      data: compact.d || compact.data,
      cliente: {
        nome: compact.cl?.n || compact.cliente?.nome || '',
        telefone: compact.cl?.t || compact.cliente?.telefone || '',
        email: compact.cl?.e || compact.cliente?.email || '',
        endereco: compact.cl?.en || compact.cliente?.endereco || '',
      },
      itens: Array.isArray(compact.it)
        ? compact.it.map((i: any, idx: number) => ({
            id: idx + 1,
            nome: i.n || i.nome || '',
            quantidade: Number(i.q || i.quantidade || 0),
            valor: Number(i.v || i.valor || 0),
            total: Number(i.t || i.total || 0),
          }))
        : compact.itens || [],
      subtotal: Number(compact.sb || compact.subtotal || 0),
      entrega: Number(compact.en || compact.entrega || 0),
      desconto: Number(compact.ds || compact.desconto || 0),
      total: Number(compact.tt || compact.total || 0),
      formaPagamento: compact.fp || compact.formaPagamento,
      validade: compact.vd || compact.validade,
      prazoEntrega: compact.pe || compact.prazoEntrega,
      enderecoEntrega: compact.eden || compact.enderecoEntrega,
      observacao: compact.ob || compact.observacao,
      tipoDocumento: compact.td || compact.tipoDocumento,
      tituloProposta: compact.tp || compact.tituloProposta,
      descricaoProposta: compact.dp || compact.descricaoProposta,
      condicoesPagamento: compact.cp || compact.condicoesPagamento,
      formasPagamentoLista: compact.fpl || compact.formasPagamentoLista,
      observacaoPagamento: compact.opg || compact.observacaoPagamento,
      ocultarValorUnitarioM2: Boolean(compact.om2 ?? compact.ocultarValorUnitarioM2),
      validadeProposta: compact.vp || compact.validadeProposta,
      observacoesProposta: compact.op || compact.observacoesProposta,
      config: compact.em
        ? {
            nomeEmpresa: compact.em.n || compact.em.nomeEmpresa,
            telefone:
              compact.em.t ||
              compact.em.celularEmpresa ||
              compact.em.celular ||
              compact.em.whatsappEmpresa ||
              compact.em.whatsapp ||
              compact.em.telefoneEmpresa ||
              compact.em.telefone,
            email: compact.em.e || compact.em.email,
            endereco: compact.em.en || compact.em.endereco,
            cidadeUf: compact.em.c || compact.em.cidadeUf,
            logoUrl: compact.em.l || compact.em.logoUrl,
            corPrimaria: compact.em.cp || compact.em.corPrimaria,
            corSecundaria: compact.em.cs || compact.em.corSecundaria,
          }
        : undefined,
      cfg: compact.em
        ? {
            nomeEmpresa: compact.em.n || compact.em.nomeEmpresa,
            telefone:
              compact.em.t ||
              compact.em.celularEmpresa ||
              compact.em.celular ||
              compact.em.whatsappEmpresa ||
              compact.em.whatsapp ||
              compact.em.telefoneEmpresa ||
              compact.em.telefone,
            email: compact.em.e || compact.em.email,
            endereco: compact.em.en || compact.em.endereco,
            cidadeUf: compact.em.c || compact.em.cidadeUf,
            logoUrl: compact.em.l || compact.em.logoUrl,
          }
        : undefined,
    }
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value))
    } catch {
      return null
    }
  }
}

function logoPublicaOrcamento(valor?: string) {
  const logo = String(valor || '').trim()
  if (!logo) return '/logo-connect.png'
  if (logo.startsWith('data:')) return logo
  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo
  if (logo.startsWith('/')) return logo
  return `/${logo}`
}

function toBase64UrlOrcamento(value: string) {
  const utf8 = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  )
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function serializarOrcamentoPublico(dados: Orcamento, config: Config) {
  const itens = Array.isArray(dados?.itens)
    ? dados.itens.filter((item: any) => item?.mostrarCliente !== false).map((item: any) => ({
        n: item?.nome || item?.descricao || '',
        q: Number(item?.quantidade || 0),
        v: Number(item?.valor || 0),
        t: Number(item?.total || (Number(item?.quantidade || 0) * Number(item?.valor || 0))),
      }))
    : []

  const cliente: any = typeof dados?.cliente === 'object' && dados?.cliente ? dados.cliente : {}

  const logo = logoUrlAbsolutaPublica(config?.logoUrl) || logoPublicaOrcamento(config?.logoUrl)

  return toBase64UrlOrcamento(JSON.stringify({
    i: Number(dados?.id || 0),
    n: String(dados?.numero || ''),
    ti: String(dados?.titulo || 'Orçamento Comercial'),
    d: String(dados?.data || ''),
    st: String(dados?.status || 'Pendente'),
    cl: {
      n: String(cliente?.nome || texto(dados?.cliente, '')),
      t: String(cliente?.telefone || ''),
      e: String(cliente?.email || ''),
      en: String(cliente?.endereco || ''),
    },
    it: itens,
    sb: Number(dados?.subtotal || 0),
    en: Number(dados?.entrega || 0),
    ds: Number(dados?.desconto || 0),
    tt: Number(dados?.total || 0),
    fp: String(dados?.formaPagamento || ''),
    vd: String(dados?.validade || ''),
    pe: String(dados?.prazoEntrega || ''),
    eden: String(dados?.enderecoEntrega || ''),
    ob: String(dados?.observacao || ''),
    td: String(dados?.tipoDocumento || ''),
    tp: String(dados?.tituloProposta || ''),
    dp: String(dados?.descricaoProposta || ''),
    cp: String(dados?.condicoesPagamento || ''),
    fpl: Array.isArray(dados?.formasPagamentoLista) ? dados.formasPagamentoLista : undefined,
    opg: String(dados?.observacaoPagamento || ''),
    om2: Boolean(dados?.ocultarValorUnitarioM2),
    vp: String(dados?.validadeProposta || dados?.validade || ''),
    op: String(dados?.observacoesProposta || ''),
    em: {
      n: String(config?.nomeEmpresa || 'LOJA CONNECT'),
      t: String(
        config?.celularEmpresa ||
        config?.celular ||
        config?.whatsappEmpresa ||
        config?.whatsapp ||
        config?.telefoneEmpresa ||
        config?.telefone ||
        ''
      ),
      e: String(config?.email || ''),
      en: String(config?.endereco || ''),
      c: String(config?.cidadeUf || ''),
      l: logo,
      cp: String(config?.corPrimaria || '#068b43'),
      cs: String(config?.corSecundaria || '#dcfce7'),
    },
  }))
}

function getConfig(): Config {
  const fallback: Config = {
    nomeEmpresa: 'LOJA CONNECT',
    telefone: '',
    email: '',
    endereco: '',
    cidadeUf: '',
    rodapePdf: 'Obrigado pela preferência.',
    logoUrl: '/logo-connect.png',
    corPrimaria: '#068b43',
    corSecundaria: '#dcfce7',
  }

  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function copiarTextoSeguro(texto: string) {
  if (!texto || typeof window === 'undefined') return
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(texto).catch(() => {})
    return
  }
  const input = document.createElement('textarea')
  input.value = texto
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
}

export function OrcamentoDocumentoPage({ forcePreview = false }: { forcePreview?: boolean } = {}) {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const [orc, setOrc] = useState<Orcamento | null>(null)
  const [config, setConfig] = useState<Config>(getConfig())
  const [copiado, setCopiado] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isPreview, setIsPreview] = useState(true)
  const [modalAprovacao, setModalAprovacao] = useState(false)
  const [assinaturaNome, setAssinaturaNome] = useState('')
  const [assinaturaDesenhada, setAssinaturaDesenhada] = useState(false)
  const [mensagemAprovacao, setMensagemAprovacao] = useState('')
  const [whatsappRetorno, setWhatsappRetorno] = useState<ResultadoAbrirWhatsapp | null>(null)
  const [linkPublicoQr, setLinkPublicoQr] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const desenhandoRef = useRef(false)

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      try {
        const id = String(params?.id || '')
        const payload = decodePayload(search.get('d'))
        const tokenPublico = search.get('p') || search.get('token')
        let docPublico: any = null
        let documentoIdPublico = id

        let cfgApiPublica: Record<string, unknown> | null = null

        if (!payload && tokenPublico) {
          try {
            const respCfg = await fetch(`/api/public-docs/config?token=${encodeURIComponent(tokenPublico)}`, { cache: 'no-store' })
            if (respCfg.ok) {
              const dadosCfg = await respCfg.json()
              if (dadosCfg?.config) cfgApiPublica = dadosCfg.config
            }
          } catch {}

          try {
            const resp = await fetch(`/api/public-docs/${encodeURIComponent(tokenPublico)}`, { cache: 'no-store' })
            if (resp.ok) {
              const dados = await resp.json()
              docPublico = dados?.payload || null
              documentoIdPublico = String(dados?.documento_id || docPublico?.id || id)
              if (docPublico && typeof window !== 'undefined') {
                try { localStorage.setItem(`${STORAGE_KEY}_public_${docPublico.id || id}`, JSON.stringify(docPublico)) } catch {}
              }
            }
          } catch {}
        }

        // Release v43: fallback público por ID para links curtos enviados via WhatsApp/domínio novo.
        if (!payload && !docPublico && id) {
          try {
            const resp = await fetch(`/api/public-docs?tipo=orcamento&documentoId=${encodeURIComponent(id)}`, { cache: 'no-store' })
            if (resp.ok) {
              const dados = await resp.json()
              docPublico = dados?.payload || null
              if (docPublico && typeof window !== 'undefined') {
                try { localStorage.setItem(`${STORAGE_KEY}_public_${docPublico.id || id}`, JSON.stringify(docPublico)) } catch {}
              }
            }
          } catch {}
        }

        if (!cfgApiPublica && (tokenPublico || docPublico || payload)) {
          try {
            const qsCfg = tokenPublico
              ? `token=${encodeURIComponent(tokenPublico)}`
              : `tipo=orcamento&documentoId=${encodeURIComponent(documentoIdPublico || id)}`
            const respCfg = await fetch(`/api/public-docs/config?${qsCfg}`, { cache: 'no-store' })
            if (respCfg.ok) {
              const dadosCfg = await respCfg.json()
              if (dadosCfg?.config) cfgApiPublica = dadosCfg.config
            }
          } catch {}
        }

        if (cancelado) return

        const saved = localStorage.getItem(STORAGE_KEY)
        const lista = saved ? JSON.parse(saved) : []
        const fallbackPublico = typeof window !== 'undefined' ? localStorage.getItem(`${STORAGE_KEY}_public_${id}`) : null
        const encontrado = payload || docPublico || findOrcamento(Array.isArray(lista) ? lista : [], id) || (fallbackPublico ? JSON.parse(fallbackPublico) : null)
        if (!payload && encontrado && documentoIdPublico) {
          ;(encontrado as any).id = Number(documentoIdPublico) || (encontrado as any).id
        }
        setOrc(encontrado || null)

        const linkPublico = Boolean(tokenPublico || payload)
        const cfgLocal = getConfig()
        const cfgPayload = mergeConfigPublicacao(
          cfgApiPublica,
          (encontrado as any)?.cfg,
          (encontrado as any)?.config
        )
        const resolverTelefone = (cfg: Record<string, unknown>) =>
          String(
            cfg?.celularEmpresa ||
              cfg?.celular ||
              cfg?.whatsappEmpresa ||
              cfg?.whatsapp ||
              cfg?.telefoneEmpresa ||
              cfg?.telefone ||
              ''
          )
        const telefoneResolvido = resolverTelefone(cfgPayload as Record<string, unknown>) || resolverTelefone(cfgLocal as Record<string, unknown>)

        const logoFinal = logoUrlAbsolutaPublica(cfgPayload.logoUrl) || cfgPayload.logoUrl

        if (linkPublico) {
          setConfig({
            ...cfgLocal,
            ...cfgPayload,
            logoUrl: logoFinal || cfgPayload.logoUrl,
            telefone: telefoneResolvido,
            nomeEmpresa: cfgPayload.nomeEmpresa || cfgLocal.nomeEmpresa,
          })
        } else {
          setConfig({ ...cfgLocal, ...cfgPayload, telefone: telefoneResolvido, logoUrl: logoFinal || cfgLocal.logoUrl })
        }

        const temConfigEmpresaSalva = (() => {
          try {
            const raw = localStorage.getItem(CONFIG_KEY)
            if (!raw) return false
            const parsed = JSON.parse(raw)
            return Boolean(parsed?.nomeEmpresa && parsed.nomeEmpresa !== 'LOJA CONNECT')
          } catch {
            return false
          }
        })()

        if (encontrado && telefoneResolvido && typeof window !== 'undefined' && temConfigEmpresaSalva && !linkPublico) {
          const tokenAtual = search.get('p') || search.get('token')
          const cfgAtualizado = mergeConfigPublicacao(cfgLocal, cfgPayload, { telefone: telefoneResolvido })
          try {
            fetch('/api/public-docs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tipo: 'orcamento',
                documentoId: String(documentoIdPublico || encontrado.id || id),
                token: tokenAtual || undefined,
                payload: { ...encontrado, config: cfgAtualizado, cfg: cfgAtualizado },
              }),
            }).catch(() => {})
          } catch {}
        }

        const qs = new URLSearchParams(window.location.search)
        setIsPreview(forcePreview || qs.get('print') !== '1')
      } catch {
        if (!cancelado) setOrc(null)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    carregar()
    return () => { cancelado = true }
  }, [params?.id, search, forcePreview])

  useEffect(() => {
    if (!orc || isPreview) return
    if (!linkPublicoQr) return
    const timer = window.setTimeout(() => window.print(), 600)
    return () => window.clearTimeout(timer)
  }, [orc, isPreview, linkPublicoQr])

  useEffect(() => {
    if (!orc || typeof window === 'undefined') {
      setLinkPublicoQr('')
      return
    }

    let cancelado = false
    const id = String(orc.id || params?.id || '')
    if (!id) return () => { cancelado = true }

    async function resolverLinkQr() {
      const tokenAtual = search.get('p') || search.get('token')
      if (tokenAtual) {
        if (!cancelado) {
          setLinkPublicoQr(
            montarUrlPublicaDocumento('/impressao-orcamento', id, {
              token: tokenAtual,
              preview: true,
            }),
          )
        }
        return
      }

      try {
        const resp = await fetch('/api/public-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'orcamento',
            documentoId: id,
            document_type: 'orcamento',
            document_id: id,
            payload: { ...orc, config, cfg: config },
          }),
        })
        if (resp.ok) {
          const json = await resp.json()
          if (json?.token && !cancelado) {
            setLinkPublicoQr(
              montarUrlPublicaDocumento('/impressao-orcamento', id, {
                token: String(json.token),
                preview: true,
                v: json.updated_at,
              }),
            )
            return
          }
        }
      } catch {}

      try {
        const resp = await fetch(
          `/api/public-docs?tipo=orcamento&documentoId=${encodeURIComponent(id)}`,
          { cache: 'no-store' },
        )
        if (resp.ok) {
          const json = await resp.json()
          if (json?.token && !cancelado) {
            setLinkPublicoQr(
              montarUrlPublicaDocumento('/impressao-orcamento', id, {
                token: String(json.token),
                preview: true,
                v: json.updated_at,
              }),
            )
            return
          }
        }
      } catch {}

      if (!cancelado) {
        setLinkPublicoQr(`${siteUrlPublico()}/impressao-orcamento/${id}?preview=1`)
      }
    }

    void resolverLinkQr()
    return () => {
      cancelado = true
    }
  }, [orc, config, search, params?.id])

  // Itens visíveis no PDF/link do cliente.
  // Itens internos (mostrarCliente === false) continuam existindo no painel,
  // mas não entram na lista nem no total apresentado ao cliente.
  const itens = Array.isArray(orc?.itens)
    ? orc!.itens!.filter((item) => item.mostrarCliente !== false)
    : []

  const subtotalCalculado = useMemo(
    () => itens.reduce((acc, item) => acc + totalItem(item), 0),
    [itens]
  )

  const subtotal = subtotalCalculado
  const frete = Number(orc?.entrega || 0)
  const desconto = Number(orc?.desconto || 0)
  const total = Math.max(subtotal + frete - desconto, 0)

  const linkCompartilhamento = useMemo(() => {
    if (linkPublicoQr) return linkPublicoQr
    if (!orc) return ''
    const id = String(orc.id || '')
    if (!id) return ''
    return `${siteUrlPublico()}/impressao-orcamento/${id}?preview=1`
  }, [linkPublicoQr, orc])

  function handleVoltar() {
    if (window.history.length > 1) window.history.back()
    else window.location.href = '/orcamentos'
  }

  function handleCopiar() {
    copiarTextoSeguro(linkCompartilhamento)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 1600)
  }

  function canvasPoint(event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const touch = 'touches' in event ? event.touches[0] : null
    const clientX = touch ? touch.clientX : (event as React.MouseEvent<HTMLCanvasElement>).clientX
    const clientY = touch ? touch.clientY : (event as React.MouseEvent<HTMLCanvasElement>).clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function iniciarAssinatura(event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { x, y } = canvasPoint(event)
    desenhandoRef.current = true
    ctx.lineWidth = 2.8
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function moverAssinatura(event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!desenhandoRef.current) return
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { x, y } = canvasPoint(event)
    ctx.lineTo(x, y)
    ctx.stroke()
    setAssinaturaDesenhada(true)
  }

  function finalizarAssinatura() { desenhandoRef.current = false }

  function limparAssinatura() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setAssinaturaDesenhada(false)
  }

  async function salvarAprovacaoPublica(dados: Orcamento) {
    try {
      const tokenAtual = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('p') || new URLSearchParams(window.location.search).get('token')
        : ''

      const resp = await fetch('/api/public-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'orcamento',
          document_id: String((dados as any).id),
          tipo: 'orcamento',
          documentoId: String((dados as any).id),
          token: tokenAtual || undefined,
          payload: {
            ...dados,
            config: mergeConfigPublicacao(config),
            cfg: mergeConfigPublicacao(config),
          },
        }),
      })

      if (!resp.ok) {
        const erro = await resp.json().catch(() => null)
        console.error('[ORCAMENTO_PUBLICO] erro ao salvar aprovação:', {
          status: resp.status,
          body: erro,
          documentoId: String((dados as any).id),
        })
        return false
      }

      console.log('[ORCAMENTO_PUBLICO] aprovação persistida em public-docs', {
        documentoId: String((dados as any).id),
        status: (dados as any).status,
        aprovado: (dados as any).aprovado,
      })
      return true
    } catch (error) {
      console.error('[ORCAMENTO_PUBLICO] exceção ao salvar aprovação:', error)
      return false
    }
  }

  async function salvarOrcamentoAprovado(status: 'Aprovado' | 'Cancelado', assinatura?: string) {
    if (!orc || typeof window === 'undefined') return null
    const agora = new Date()
    const dataAprovacao = agora.toLocaleString('pt-BR')
    const atualizado: Orcamento = {
      ...orc,
      status,
      aprovado: status === 'Aprovado',
      aprovadoEm: status === 'Aprovado' ? dataAprovacao : undefined,
      aprovacaoDigital: {
        status: status === 'Aprovado' ? 'aprovado' : 'recusado',
        nome: assinaturaNome.trim() || cliente,
        data: dataAprovacao,
        assinatura: assinatura || '',
        origem: 'link-publico',
      },
      atualizadoEm: agora.getTime(),
    } as Orcamento
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const lista = raw ? JSON.parse(raw) : []
      const baseLista = Array.isArray(lista) ? lista : []
      const existe = baseLista.some((item: any) => String(item?.id) === String(orc.id))
      const novaLista = existe
        ? baseLista.map((item: any) => String(item?.id) === String(orc.id) ? { ...item, ...atualizado } : item)
        : [atualizado, ...baseLista]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novaLista))
      window.dispatchEvent(new Event('connect-data-change'))
    } catch {}
    setOrc(atualizado)
    await salvarAprovacaoPublica(atualizado)
    return atualizado
  }

  function gerarOSDaAprovacao(dados: Orcamento) {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(OS_KEY)
      const ordens = raw ? JSON.parse(raw) : []
      const baseOrdens = Array.isArray(ordens) ? ordens : []
      if (baseOrdens.some((item: any) => String(item?.orcamentoId) === String(dados.id))) return
      const numeros = baseOrdens.map((o: any) => Number(o.numero)).filter((n: number) => !Number.isNaN(n))
      const maior = numeros.length ? Math.max(...numeros) : 0
      const clienteObj: any = typeof dados.cliente === 'object' && dados.cliente ? dados.cliente : {}
      const novoId = Date.now()
      const novaOS = {
        id: novoId,
        numero: String(maior + 1).padStart(4, '0'),
        cliente: clienteObj.nome || texto(dados.cliente, 'Cliente não informado'),
        telefone: clienteObj.telefone || '',
        email: clienteObj.email || '',
        endereco: clienteObj.endereco || '',
        equipamento: 'Orçamento aprovado digitalmente',
        marca: '',
        modelo: '',
        serial: '',
        defeito: dados.observacao || '',
        checklist: '',
        observacao: 'Gerada automaticamente pela aprovação digital do orçamento ' + (dados.numero || dados.id) + '.',
        valor: Number(dados.total || 0),
        entrada: 0,
        saldo: Number(dados.total || 0),
        status: 'Aberta',
        prioridade: 'Média',
        tecnico: '',
        previsao: '',
        data: new Date().toLocaleDateString('pt-BR'),
        ultimaAtualizacao: new Date().toLocaleDateString('pt-BR'),
        link: (SITE_URL || window.location.origin) + '/impressao-ordem-servico/' + novoId,
        orcamentoId: dados.id,
        origem: 'aprovação digital',
      }
      localStorage.setItem(OS_KEY, JSON.stringify([novaOS, ...baseOrdens]))
      window.dispatchEvent(new Event('connect-data-change'))
    } catch {}
  }

  function telefoneEmpresaOrcamento() {
    return normalizarTelefoneWhatsapp(
      String(
        config.celularEmpresa ||
          config.celular ||
          config.whatsappEmpresa ||
          config.whatsapp ||
          config.telefoneEmpresa ||
          config.telefone ||
          '',
      ),
    )
  }

  function urlAvisoEmpresaWhatsapp(
    tipo: 'aprovado' | 'recusado',
    ctx?: { numeroDoc: string; nomeCliente: string; totalFmt: string },
  ) {
    const docProposta = String(orc?.tipoDocumento || '').toLowerCase() === 'proposta_comercial'
    const rotulo = docProposta ? 'Proposta' : 'Orçamento'
    const numeroFinal = telefoneEmpresaOrcamento()
    if (!numeroFinal) {
      console.warn('[ORCAMENTO_APROVACAO] WhatsApp da empresa não encontrado no documento.')
      return ''
    }
    const nDoc = ctx?.numeroDoc || String(orc?.numero || orc?.id || '')
    const nomeCli = ctx?.nomeCliente || texto(orc?.cliente, 'Cliente')
    const totalFmt = ctx?.totalFmt || moeda(Number(orc?.total || 0))
    const textoMensagem =
      tipo === 'aprovado'
        ? `${mensagemOrcamentoAprovadoParaEmpresa({
            numero: nDoc,
            nomeCliente: nomeCli,
            totalFormatado: totalFmt,
          })}${assinaturaNome.trim() ? `\n\nAprovado por: ${assinaturaNome.trim()}` : ''}`
        : `⚠️ ${rotulo} recusado pelo cliente.\n\nCliente: ${nomeCli}\nDocumento: ${nDoc}\nTotal: ${totalFmt}`
    return montarUrlWhatsapp(numeroFinal, textoMensagem)
  }

  function notificarEmpresaWhatsapp(
    tipo: 'aprovado' | 'recusado',
    ctx?: { numeroDoc: string; nomeCliente: string; totalFmt: string },
  ) {
    const url = urlAvisoEmpresaWhatsapp(tipo, ctx)
    if (!url) {
      setWhatsappRetorno({ url: '', abriu: false, mostrarLink: true })
      return { url: '', abriu: false, mostrarLink: true }
    }
    const resultado = abrirWhatsappUrl(url)
    const final = resultado.abriu || resultado.mostrarLink ? resultado : { url, abriu: false, mostrarLink: true }
    setWhatsappRetorno(final)
    return final
  }

  async function confirmarAprovacaoDigital() {
    if (!orc) return
    if (!assinaturaNome.trim() && !assinaturaDesenhada) {
      setMensagemAprovacao('Informe o nome ou assine no quadro para aprovar.')
      return
    }
    const assinatura = assinaturaDesenhada ? canvasRef.current?.toDataURL('image/png') || '' : ''
    const docProposta = String(orc.tipoDocumento || '').toLowerCase() === 'proposta_comercial'
    const ctxWhatsapp = {
      numeroDoc: String(orc.numero || orc.id || ''),
      nomeCliente: texto(orc.cliente, 'Cliente'),
      totalFmt: moeda(Number(orc.total || 0)),
    }
    const atualizado = await salvarOrcamentoAprovado('Aprovado', assinatura)
    if (atualizado) gerarOSDaAprovacao(atualizado)
    const wa = notificarEmpresaWhatsapp('aprovado', ctxWhatsapp)
    setModalAprovacao(false)
    setMensagemAprovacao(
      wa.abriu
        ? `${docProposta ? 'Proposta' : 'Orçamento'} aprovado com sucesso. WhatsApp aberto para avisar a empresa.`
        : wa.url
          ? `${docProposta ? 'Proposta' : 'Orçamento'} aprovado. Toque no botão abaixo para enviar a confirmação pelo WhatsApp.`
          : `${docProposta ? 'Proposta' : 'Orçamento'} aprovado. Cadastre o WhatsApp da empresa nas configurações para receber avisos automáticos.`,
    )
  }

  async function recusarOrcamentoDigital() {
    const docProposta = String(orc?.tipoDocumento || '').toLowerCase() === 'proposta_comercial'
    const ctxWhatsapp = {
      numeroDoc: String(orc?.numero || orc?.id || ''),
      nomeCliente: texto(orc?.cliente, 'Cliente'),
      totalFmt: moeda(Number(orc?.total || 0)),
    }
    await salvarOrcamentoAprovado('Cancelado')
    notificarEmpresaWhatsapp('recusado', ctxWhatsapp)
    setMensagemAprovacao(`${docProposta ? 'Proposta' : 'Orçamento'} marcado como recusado.`)
  }


  if (loading) return <div className="orc-loading">Carregando documento...</div>
  if (!orc) return <div className="orc-loading">Documento não encontrado.</div>

  const isProposta = String(orc.tipoDocumento || '').toLowerCase() === 'proposta_comercial'
  const rotuloDocumento = isProposta ? 'proposta comercial' : 'orçamento'

  const empresa = texto(config.nomeEmpresa, 'LOJA CONNECT')
  const telefone = texto(
    config.celularEmpresa || config.celular || config.whatsappEmpresa || config.whatsapp || config.telefoneEmpresa || config.telefone,
    ''
  )
  const email = texto(config.email, 'lojaconnect@hotmail.com')
  const endereco = texto(config.endereco, 'GILBERTO ROBERTO GOMES, 243')
  const cidade = texto(config.cidadeUf, 'PARNAMIRIM-RN')
  const logo = logoUrlAbsolutaPublica(config.logoUrl) || logoPublicaOrcamento(texto(config.logoUrl, ''))
  const cliente = texto(orc.cliente, 'Cliente não informado')
  const telCliente = clienteTelefone(orc.cliente, '')
  const emailCliente = clienteEmail(orc.cliente, '')
  const enderecoCliente = clienteEndereco(orc.cliente, '')
  const enderecoEntregaDoc = String(orc.enderecoEntrega || '').trim()
  const mostrarEnderecoEntrega =
    Boolean(enderecoEntregaDoc) &&
    enderecoEntregaDoc.toLowerCase() !== enderecoCliente.trim().toLowerCase()
  const data = parseDataBR(orc.data)
  const validadeBruta = texto(orc.validadeProposta || orc.validade, '')
  const validade = validadeOrcamentoAtiva(validadeBruta) ? validadeBruta.trim() : ''
  const entrega = texto(orc.prazoEntrega, '3 dias')
  const pagamento = textoPagamentoOrcamento(orc)
  const pagamentoLista = listaFormasPagamentoOrcamento(orc)
  const ocultarM2 = orcamentoDeveOcultarM2Cliente(itens, Boolean(orc.ocultarValorUnitarioM2))
  const descricaoProposta = texto(orc.descricaoProposta, '')
  const observacao = normalizarTextoObservacao(
    texto(
      orc.observacoesProposta || orc.observacao,
      texto(config.rodapePdf, isProposta ? 'Aguardamos sua aprovação.' : OBSERVACAO_PADRAO_ORCAMENTO),
    ),
  )
  const numeroDoc = texto(orc.numero, String(orc.id || '').slice(-4).padStart(4, '0'))
  const corPrimaria = texto(config.corPrimaria, '#068b43')
  const corSecundaria = texto(config.corSecundaria, '#dcfce7')
  const itensParaMostrar = itens.length ? itens : [{ nome: 'Item não informado', quantidade: 1, valor: 0, total: 0 }]
  const statusAtual = texto(orc.status, 'Pendente')
  const qrUrl = linkCompartilhamento ? urlQrCode(linkCompartilhamento, 120) : ''

  return (
    <main className="orc-page" style={{ '--pdf-primary': corPrimaria, '--pdf-soft': corSecundaria } as React.CSSProperties}>
      <div className="orc-actions no-print">
        <button onClick={handleVoltar}>Fechar</button>
        <button className="primary" onClick={() => window.print()}>Imprimir / PDF</button>
        <button onClick={handleCopiar}>{copiado ? 'Copiado' : 'Copiar link'}</button>
        <button className="approve" onClick={() => setModalAprovacao(true)}>Aprovar</button>
        <button className="danger" onClick={recusarOrcamentoDigital}>Recusar</button>
      </div>

      <section className="orc-sheet">
        <header className="orc-hero">
          <div className="orc-hero-left">
            <img className="orc-hero-logo" src={logo} alt="Logo" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
            <div className="orc-hero-brand">
              <h1>{empresa}</h1>
              {telefone ? <p>{telefone}</p> : null}
              {email ? <p>{email}</p> : null}
              {(endereco || cidade) ? <p>{[endereco, cidade].filter(Boolean).join(' • ')}</p> : null}
            </div>
          </div>
          <div className="orc-hero-right">
            <div className="orc-hero-corner">
              {qrUrl ? (
                <a
                  className="orc-qr-box"
                  href={linkCompartilhamento}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir orçamento digital"
                >
                  <img src={qrUrl} alt="QR Code do documento" width={120} height={120} />
                  <span>Digital / PDF</span>
                </a>
              ) : null}
              <div className="orc-doc-pill">Doc. Nº {numeroDoc}</div>
            </div>
          </div>
        </header>

        <section className="orc-title-band">
          <span className="orc-kicker">{isProposta ? 'PROPOSTA COMERCIAL' : 'ORÇAMENTO COMERCIAL'}</span>
          <h2>{isProposta ? 'PROPOSTA COMERCIAL' : 'ORÇAMENTO COMERCIAL'}</h2>
          {isProposta && texto(orc.tituloProposta || orc.titulo, '') ? (
            <p className="orc-subtitle">{texto(orc.tituloProposta || orc.titulo, '')}</p>
          ) : null}
        </section>

        <section className="orc-approval-status">
          <strong>Status: {statusAtual}</strong>
          {mensagemAprovacao && <span>{mensagemAprovacao}</span>}
        </section>
        {whatsappRetorno?.mostrarLink && whatsappRetorno.url ? (
          <div className="orc-wa-fallback no-print">
            <a
              href={whatsappRetorno.url}
              target="_blank"
              rel="noopener noreferrer"
              className="orc-wa-fallback-btn"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
            >
              Enviar confirmação pelo WhatsApp
            </a>
          </div>
        ) : null}

        <section className="orc-info">
          <article>
            <span>Cliente</span>
            <strong>{cliente}</strong>
            {telCliente && <em>{telCliente}</em>}
          </article>
          <article>
            <span>Data</span>
            <strong>{data}</strong>
          </article>
          <article>
            <span>Documento</span>
            <strong>Nº {numeroDoc}</strong>
          </article>
          {validade ? (
            <article>
              <span>Validade</span>
              <strong>{validade}</strong>
            </article>
          ) : null}
          <article>
            <span>Entrega</span>
            <strong>{entrega}</strong>
          </article>
        </section>

        {(emailCliente || enderecoCliente || mostrarEnderecoEntrega) && (
          <section className="orc-client-extra">
            {emailCliente && <span>E-mail: {emailCliente}</span>}
            {enderecoCliente && <span>Endereço do cliente: {enderecoCliente}</span>}
            {mostrarEnderecoEntrega && <span>Endereço de entrega: {enderecoEntregaDoc}</span>}
          </section>
        )}

        {isProposta && descricaoProposta ? (
          <section className="orc-prose-block">
            <h4>Descrição da proposta</h4>
            <p>{descricaoProposta}</p>
          </section>
        ) : null}

        <section className="orc-table orc-table-screen">
          <div className={`orc-thead ${ocultarM2 ? 'orc-thead-m2-cliente' : ''}`}>
            {!ocultarM2 ? <span>Item</span> : null}
            <span>Descrição</span>
            {!ocultarM2 ? <span>Un.</span> : null}
            {!ocultarM2 ? <span>Qtde</span> : null}
            {!ocultarM2 ? <span>Valor Unit.</span> : null}
            <span className={ocultarM2 ? 'orc-th-valor' : ''}>{ocultarM2 ? 'Total' : 'Subtotal'}</span>
          </div>

          {itensParaMostrar.map((item, index) => {
            return (
              <div
                className={`orc-row ${ocultarM2 ? 'orc-row-m2-cliente' : ''}`}
                key={String(item.id || index)}
              >
                {!ocultarM2 ? (
                  <div className="orc-index">{String(index + 1).padStart(2, '0')}</div>
                ) : null}
                <div className="orc-desc">
                  <strong>{texto(item.nome, 'Item')}</strong>
                  {texto(item.descricao, '') && <small>{texto(item.descricao, '')}</small>}
                </div>
                {!ocultarM2 ? (
                  <>
                    <div className="orc-unit">
                      <span>{unidadeItem(item)}</span>
                    </div>
                    <div className="orc-center">{quantidadeItem(item)}</div>
                    <div className="orc-money">{moeda(valorUnitario(item))}</div>
                  </>
                ) : null}
                <div className="orc-line-total">{moeda(totalItem(item))}</div>
              </div>
            )
          })}
        </section>

        <footer className="orc-footer">
          <article className="orc-notes">
            <h3 className="orc-obs-titulo">
              <span className="orc-obs-label">OBSERVAÇÃO</span>
            </h3>
            <p className="orc-obs-texto">{observacao}</p>
          </article>

          <article className="orc-total-card">
            <div><span>Subtotal</span><strong>{moeda(subtotal)}</strong></div>
            <div><span>Frete</span><strong>{moeda(frete)}</strong></div>
            <div><span>Desconto</span><strong>{moeda(desconto)}</strong></div>
            <div className="orc-grand">
              <span className="orc-grand-label">Valor total</span>
              <strong className="orc-grand-value">{moeda(total)}</strong>
            </div>
          </article>

          <article className="orc-pay">
            <h3>Condições de pagamento</h3>
            <div className="orc-pay-badges">
              {pagamentoLista.formas.map((forma) => (
                <span key={forma} className="orc-pay-badge">{iconeFormaPagamento(forma)} {forma}</span>
              ))}
            </div>
            {pagamentoLista.observacao ? <p className="orc-pay-note">{pagamentoLista.observacao}</p> : null}
            {!pagamentoLista.formas.length ? <strong>{pagamento}</strong> : null}
            {validade ? <em>Validade: {validade}</em> : null}
          </article>
        </footer>

        <div className="orc-signatures">
          <div className="orc-sign-col">
            <span>Assinatura do cliente</span>
            <div className="orc-sign-line" />
          </div>
          <div className="orc-sign-col">
            <span>{empresa}</span>
            <div className="orc-sign-line" />
          </div>
        </div>

        <div className="orc-generated">
          Gerado pelo <strong>Connect Sistema Premium</strong> • {data}
        </div>
      </section>


      {modalAprovacao && (
        <div className="approval-modal no-print" role="dialog" aria-modal="true">
          <div className="approval-card">
            <button className="approval-close" onClick={() => setModalAprovacao(false)}>×</button>
            <p className="approval-kicker">Aprovação digital</p>
            <h2>Aprovar {rotuloDocumento} Nº {numeroDoc}</h2>
            <p className="approval-sub">Confirme o nome e assine no quadro. Ao aprovar, o {rotuloDocumento} fica marcado como aprovado e uma OS é gerada automaticamente no painel quando o documento existir neste navegador.</p>
            <label>Nome do aprovador</label>
            <input value={assinaturaNome} onChange={(e) => setAssinaturaNome(e.target.value)} placeholder="Nome completo" />
            <label>Assinatura digital</label>
            <canvas
              ref={canvasRef}
              width={760}
              height={210}
              onMouseDown={iniciarAssinatura}
              onMouseMove={moverAssinatura}
              onMouseUp={finalizarAssinatura}
              onMouseLeave={finalizarAssinatura}
              onTouchStart={iniciarAssinatura}
              onTouchMove={moverAssinatura}
              onTouchEnd={finalizarAssinatura}
            />
            <div className="approval-row">
              <button onClick={limparAssinatura}>Limpar assinatura</button>
              <p style={{margin:'0 0 10px',fontSize:12,color:'#64748b',fontWeight:800}}>Ao aprovar, sua ordem de serviço será gerada automaticamente.</p>
              <button className="approval-confirm" onClick={confirmarAprovacaoDigital}>
                Aprovar {rotuloDocumento}
              </button>
            </div>
            {mensagemAprovacao && <small>{mensagemAprovacao}</small>}
            {whatsappRetorno?.mostrarLink && whatsappRetorno.url ? (
              <a
                href={whatsappRetorno.url}
                target="_blank"
                rel="noopener noreferrer"
                className="approval-wa-fallback"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
              >
                Enviar confirmação pelo WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      )}


      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #eef2f7; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
        .orc-loading { min-height: 100vh; display: grid; place-items: center; font: 800 18px Arial; color: #334155; background: #eef2f7; }
        .orc-page { min-height: 100vh; min-height: 100dvh; padding: max(18px, calc(env(safe-area-inset-top) + 14px)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left)); background: #eef2f7; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
        .orc-actions { display: flex; justify-content: center; gap: 10px; margin-bottom: 14px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 10px); z-index: 50; padding: 8px; border-radius: 18px; background: rgba(238,242,247,.96); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .orc-actions button { height: 36px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 10px; padding: 0 18px; font-size: 13px; font-weight: 900; cursor: pointer; }
        .orc-actions .primary { background: var(--pdf-primary); border-color: var(--pdf-primary); color: #fff; }
        .orc-actions .approve { background: #16a34a; border-color: #16a34a; color: #fff; }
        .orc-actions .danger { background: #fee2e2; border-color: #fecaca; color: #991b1b; }
        .orc-approval-status { margin: -4px 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border-radius: 14px; background: #f8fafc; border: 1px solid #dbe5ef; color: #334155; }
        .orc-approval-status strong { font-size: 14px; font-weight: 950; }
        .orc-approval-status span { font-size: 13px; font-weight: 800; color: #166534; }
        .orc-wa-fallback { margin: -6px 0 14px; display: flex; justify-content: center; }
        .orc-wa-fallback-btn { height: 42px; padding: 0 20px; border: none; border-radius: 12px; background: #22c55e; color: #fff; font-size: 14px; font-weight: 900; cursor: pointer; box-shadow: 0 8px 24px rgba(34,197,94,.35); }
        .approval-wa-fallback { width: 100%; margin-top: 12px; height: 44px; border: none; border-radius: 12px; background: #22c55e; color: #fff; font-size: 14px; font-weight: 900; cursor: pointer; }
        .approval-modal { position: fixed; inset: 0; z-index: 9999; background: rgba(15,23,42,.62); display: grid; place-items: center; padding: calc(env(safe-area-inset-top, 0px) + 18px) 18px calc(env(safe-area-inset-bottom, 0px) + 18px); }
        .approval-card { width: min(720px, 100%); max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px); overflow: auto; background: #fff; border-radius: 22px; padding: max(22px, calc(env(safe-area-inset-top) + 16px)) 22px 22px; box-shadow: 0 30px 90px rgba(0,0,0,.35); position: relative; }
        .approval-close { position: sticky; float: right; margin-top: 0; right: 14px; top: max(12px, env(safe-area-inset-top)); width: 36px; height: 36px; border-radius: 12px; border: 1px solid #dbe5ef; background: #f8fafc; font-size: 24px; font-weight: 900; cursor: pointer; }
        .approval-kicker { margin: 0 0 6px; text-transform: uppercase; letter-spacing: .18em; color: var(--pdf-primary); font-size: 11px; font-weight: 950; }
        .approval-card h2 { margin: 0 0 8px; font-size: 28px; letter-spacing: -.04em; }
        .approval-sub { margin: 0 0 14px; color: #475569; font-size: 14px; line-height: 1.45; font-weight: 700; }
        .approval-card label { display: block; margin: 12px 0 6px; color: #334155; font-size: 12px; font-weight: 950; text-transform: uppercase; }
        .approval-card input { width: 100%; height: 46px; border-radius: 14px; border: 1px solid #cbd5e1; padding: 0 14px; font-size: 15px; font-weight: 800; outline: none; }
        .approval-card canvas { width: 100%; height: 180px; border: 2px dashed #cbd5e1; border-radius: 16px; background: #f8fafc; touch-action: none; }
        .approval-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
        .approval-row button { height: 42px; border-radius: 13px; border: 1px solid #cbd5e1; background: #fff; padding: 0 15px; font-weight: 950; cursor: pointer; }
        .approval-row .approval-confirm { background: #16a34a; border-color: #16a34a; color: #fff; }
        .approval-card small { display: block; margin-top: 10px; color: #166534; font-weight: 850; }
        .orc-sheet { width: 1120px; max-width: 100%; margin: 0 auto; background: #fff; border: 1px solid #dbe5ef; border-radius: 22px; padding: 20px 22px 18px; box-shadow: 0 28px 80px rgba(15,23,42,.12); }
        .orc-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 18px; padding: 14px 16px; border-radius: 16px; background: linear-gradient(135deg, #f8fafc 0%, var(--pdf-soft) 100%); border: 1px solid #dbe5ef; margin-bottom: 12px; }
        .orc-hero-left { display: flex; gap: 14px; align-items: center; min-width: 0; }
        .orc-hero-logo { width: 92px; height: 92px; object-fit: contain; border-radius: 18px; border: 1px solid #dbe5ef; padding: 8px; background: #fff; flex-shrink: 0; }
        .orc-hero-brand h1 { margin: 0; font-size: 26px; letter-spacing: -.03em; font-weight: 950; color: #0f172a; line-height: 1.05; }
        .orc-hero-brand p { margin: 4px 0 0; font-size: 12.5px; color: #475569; font-weight: 700; line-height: 1.35; }
        .orc-hero-right { justify-self: end; align-self: start; }
        .orc-hero-corner { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .orc-qr-box { display: grid; place-items: center; gap: 4px; padding: 6px; border-radius: 12px; background: #fff; border: 1px solid #dbe5ef; text-decoration: none; color: inherit; }
        .orc-qr-box span { font-size: 9px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
        .orc-doc-pill { padding: 8px 14px; border-radius: 999px; background: var(--pdf-primary); color: #fff; font-size: 12px; font-weight: 950; letter-spacing: .04em; }
        .orc-title-band { text-align: center; padding: 14px 12px 12px; border-bottom: 2px solid var(--pdf-primary); margin-bottom: 10px; }
        .orc-kicker { display: block; font-size: 11px; font-weight: 950; letter-spacing: .28em; color: var(--pdf-primary); margin-bottom: 6px; }
        .orc-title-band h2 { margin: 0; font-size: 34px; line-height: 1; letter-spacing: -.04em; font-weight: 950; color: #0f172a; }
        .orc-subtitle { margin: 8px 0 0; font-size: 14px; font-weight: 800; color: #475569; }
        .orc-prose-block { margin: 8px 0 10px; padding: 12px 14px; border-radius: 14px; border: 1px solid #dbe5ef; background: linear-gradient(180deg,#fff,#f8fafc); }
        .orc-prose-block h4 { margin: 0 0 6px; font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .14em; color: var(--pdf-primary); }
        .orc-prose-block p { margin: 0; font-size: 14px; line-height: 1.45; color: #334155; font-weight: 700; }
        .orc-info { display: grid; grid-template-columns: 1.25fr 1fr 1fr 1fr 1fr; border: 1px solid #dbe5ef; border-radius: 14px; overflow: hidden; }
        .orc-info article { min-height: 76px; padding: 15px 16px; border-right: 1px solid #dbe5ef; }
        .orc-info article:last-child { border-right: 0; }
        .orc-info span { display: block; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 950; margin-bottom: 6px; }
        .orc-info strong { display: inline-block; font-size: 18px; font-weight: 950; color: #0f172a; }
        .orc-info em { display: inline-block; margin-left: 8px; padding: 4px 12px; border-radius: 999px; background: var(--pdf-soft); color: var(--pdf-primary); font-size: 13px; font-style: normal; font-weight: 950; }
        .orc-client-extra { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .orc-client-extra span { border: 1px solid #cbd5e1; border-radius: 14px; padding: 9px 13px; background: #f8fafc; color: #334155; font-size: 14px; font-weight: 850; line-height: 1.22; }
        .orc-table { margin-top: 14px; border: 1px solid #dbe5ef; border-radius: 14px; overflow: hidden; }

        .orc-table-print { display: none; }
        .orc-thead, .orc-row { display: grid; grid-template-columns: 70px 1fr 80px 90px 150px 170px; align-items: center; column-gap: 10px; }
        .orc-thead-m2-cliente, .orc-row-m2-cliente { grid-template-columns: minmax(0, 1fr) 200px; column-gap: 16px; }
        .orc-thead-m2-cliente span:first-child { text-align: left; justify-self: start; }
        .orc-thead-m2-cliente span.orc-th-valor { text-align: right; justify-self: end; width: 100%; }
        .orc-row-m2-cliente .orc-desc { justify-self: stretch; }
        .orc-row-m2-cliente .orc-desc strong { font-size: 17px; }
        .orc-row-m2-cliente .orc-line-total { font-size: 20px; text-align: right; justify-self: end; width: 100%; }
        .orc-pay-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
        .orc-pay-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: var(--pdf-soft); color: var(--pdf-primary); font-size: 13px; font-weight: 900; border: 1px solid rgba(6,139,67,.18); }
        .orc-pay-note { margin: 0 0 8px; color: #475569; font-size: 14px; line-height: 1.4; font-weight: 700; }
        .orc-thead { background: var(--pdf-primary); color: #fff; padding: 12px 16px; text-transform: uppercase; font-size: 13px; font-weight: 950; }
        .orc-row { padding: 12px 16px; border-top: 1px dashed #dbe5ef; }
        .orc-index { width: 34px; height: 34px; border-radius: 12px; background: #f1f5f9; display: grid; place-items: center; color: var(--pdf-primary); font-size: 16px; font-weight: 950; }
        .orc-desc strong { display: block; color: #0f172a; font-size: 16px; font-weight: 950; }
        .orc-desc small { display: block; margin-top: 4px; color: #64748b; font-size: 13px; }
        .orc-unit span { display: inline-flex; border-radius: 999px; padding: 5px 14px; background: var(--pdf-soft); color: var(--pdf-primary); font-size: 13px; font-weight: 950; }
        .orc-center { text-align: center; font-size: 17px; font-weight: 700; color: #334155; }
        .orc-money { text-align: right; color: #334155; font-size: 17px; }
        .orc-line-total { text-align: right; color: var(--pdf-primary); font-size: 22px; font-weight: 950; }
        .orc-footer { display: grid; grid-template-columns: 38% 30% 32%; gap: 12px; margin-top: 12px; align-items: stretch; }
        .orc-notes, .orc-total-card, .orc-pay { border: 1px solid #dbe5ef; border-radius: 14px; padding: 16px; background: #fff; min-width: 0; overflow: hidden; }
        .orc-notes { min-width: 0; }
        .orc-total-card { min-width: 0; }
        .orc-pay { min-width: 0; }
        .orc-notes h3, .orc-pay h3 { margin: 0 0 12px; color: #0f172a; font-size: 16px; font-weight: 950; text-transform: uppercase; }
        .orc-obs-titulo { margin: 0 0 10px; font-size: 16px; font-weight: 950; text-transform: none; letter-spacing: 0; }
        .orc-obs-label { color: #dc2626; font-weight: 950; }
        .orc-obs-texto {
          margin: 0;
          line-height: 1.65;
          color: #1e293b;
          font-size: 14px;
          font-weight: 700;
          font-family: Arial, Helvetica, 'Segoe UI', sans-serif;
          white-space: pre-wrap;
          word-break: normal;
          overflow-wrap: break-word;
          hyphens: manual;
        }
        .orc-hero-brand p { word-break: break-word; overflow-wrap: anywhere; }
        .orc-notes p { margin: 0; line-height: 1.45; color: #475569; font-size: 15px; }
        .orc-total-card div { display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; font-size: 15px; min-width: 0; }
        .orc-total-card div span { white-space: nowrap; flex-shrink: 0; }
        .orc-total-card div strong { font-weight: 950; white-space: nowrap; text-align: right; flex-shrink: 0; margin-left: auto; }
        .orc-total-card strong { font-weight: 950; }
        .orc-grand {
          margin-top: 6px;
          padding: 12px 10px !important;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--pdf-soft), #fffbeb);
          color: #0f172a;
          font-weight: 950;
          border: 2px solid var(--pdf-primary);
          box-shadow: inset 0 -6px 0 rgba(250,204,21,.25);
          display: flex !important;
          flex-wrap: nowrap !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 8px !important;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }
        .orc-grand-label { white-space: nowrap !important; flex: 0 0 auto; font-size: 16px !important; line-height: 1.1; }
        .orc-grand-value { color: var(--pdf-primary); font-size: 18px !important; white-space: nowrap !important; flex: 0 0 auto; margin-left: auto; text-align: right; line-height: 1.1; max-width: 58%; overflow: hidden; text-overflow: ellipsis; }
        .orc-pay strong { display: block; font-size: 16px; color: #0f172a; line-height: 1.35; }
        .orc-pay em { display: block; margin-top: 8px; font-size: 12px; font-style: normal; font-weight: 800; color: var(--pdf-primary); }
        .orc-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; padding-top: 8px; break-inside: avoid; page-break-inside: avoid; }
        .orc-sign-col span { display: block; font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .12em; color: #64748b; margin-bottom: 22px; }
        .orc-sign-line { border-top: 2px solid #0f172a; height: 0; }
        .orc-generated { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 12px; }
        .orc-generated strong { color: var(--pdf-primary); }
        @media (max-width: 760px) {
          .orc-page { padding: calc(env(safe-area-inset-top, 0px) + 74px) 8px calc(env(safe-area-inset-bottom, 0px) + 18px) 8px; touch-action: pan-y; }
          .orc-actions { position: fixed; left: 8px; right: 8px; top: calc(env(safe-area-inset-top, 0px) + 8px); margin: 0; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; z-index: 100; }
          .orc-actions button { width: 100%; padding: 0 10px; min-height: 44px; touch-action: manipulation; }
          .orc-sheet { margin-top: 0; }
          .orc-approval-status { flex-direction: column; align-items: flex-start; }
          .approval-card { padding: calc(env(safe-area-inset-top, 0px) + 18px) 18px 18px; border-radius: 18px; max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px); }
          .approval-card h2 { font-size: 22px; }
          .approval-row { flex-direction: column; }
          .approval-row button { width: 100%; }
          .orc-sheet { padding: 14px; border-radius: 16px; }
          .orc-hero { grid-template-columns: 1fr; }
          .orc-hero-right { justify-self: stretch; }
          .orc-hero-corner { align-items: flex-start; }
          .orc-signatures { grid-template-columns: 1fr; gap: 16px; }
          .orc-info, .orc-footer { grid-template-columns: 1fr; }
          .orc-info article { border-right: 0; border-bottom: 1px solid #dbe5ef; }
          .orc-thead { display: none; }
          .orc-row:not(.orc-row-m2-cliente) { grid-template-columns: 42px 1fr; gap: 8px; }
          .orc-row-m2-cliente { grid-template-columns: 1fr !important; gap: 6px !important; }
          .orc-row:not(.orc-row-m2-cliente) > div:nth-child(n+3) { grid-column: 2; text-align: left; }
          .orc-row-m2-cliente .orc-line-total { text-align: right !important; }
          .orc-line-total { text-align: left; }
          .orc-notes { min-width: 0; }
        }
        @media print {
          body, .orc-page { background: #fff !important; }
          .orc-page { padding: 0 !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 6mm; }

          .orc-sheet {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 10px 12px 8px !important;
            border: 1px solid #dbe5ef !important;
            border-radius: 14px !important;
            box-shadow: none !important;
          }

          .orc-hero { grid-template-columns: minmax(0, 1fr) auto !important; padding: 10px 12px !important; margin-bottom: 8px !important; }
          .orc-hero-logo { width: 64px !important; height: 64px !important; }
          .orc-hero-brand h1 { font-size: 20px !important; }
          .orc-hero-brand p { font-size: 11px !important; margin-top: 2px !important; }
          .orc-qr-box img { width: 72px !important; height: 72px !important; }
          .orc-hero-right { justify-self: end !important; }
          .orc-hero-corner { align-items: flex-end !important; }
          .orc-title-band { text-align: center !important; padding: 8px 8px 6px !important; margin-bottom: 6px !important; }
          .orc-title-band h2 { font-size: 26px !important; }
          .orc-kicker { font-size: 10px !important; margin-bottom: 4px !important; }
          .orc-approval-status { margin-bottom: 6px !important; padding: 6px 10px !important; }

          .orc-info { grid-template-columns: 1.25fr 1fr 1fr 1fr 1fr !important; }
          .orc-info article {
            min-height: 52px !important;
            padding: 8px 10px !important;
            display: block !important;
            border-right: 1px solid #dbe5ef !important;
            border-bottom: none !important;
          }
          .orc-info span { font-size: 10px !important; margin-bottom: 2px !important; }
          .orc-info strong { font-size: 13px !important; }
          .orc-info article:last-child { border-right: 0 !important; }
          .orc-client-extra { margin-top: 6px !important; gap: 6px !important; }
          .orc-client-extra span { font-size: 11px !important; padding: 5px 8px !important; }

          .orc-table-screen { margin-top: 8px !important; }
          .orc-thead { padding: 8px 12px !important; font-size: 11px !important; }
          .orc-row { padding: 8px 12px !important; }

          .orc-footer {
            grid-template-columns: 38% 30% 32% !important;
            gap: 8px !important;
            margin-top: 8px !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .orc-notes, .orc-total-card, .orc-pay { padding: 10px !important; border-radius: 10px !important; }
          .orc-notes { min-width: 0 !important; break-inside: avoid; page-break-inside: avoid; }
          .orc-obs-texto { font-size: 11px !important; line-height: 1.45 !important; }
          .orc-total-card { min-width: 0 !important; break-inside: avoid; page-break-inside: avoid; }
          .orc-total-card div { font-size: 12px !important; padding: 3px 0 !important; }
          .orc-grand { padding: 8px 8px !important; margin-top: 4px !important; }
          .orc-grand-label { font-size: 13px !important; }
          .orc-grand-value { font-size: 15px !important; max-width: 62% !important; }
          .orc-pay { break-inside: avoid; page-break-inside: avoid; }
          .orc-pay h3 { font-size: 12px !important; margin-bottom: 6px !important; }
          .orc-pay-badges { gap: 4px !important; flex-direction: column !important; align-items: stretch !important; }
          .orc-pay-badge { font-size: 10px !important; padding: 4px 8px !important; justify-content: center !important; }

          .orc-thead { display: grid !important; }
          .orc-row { display: grid !important; }
          .orc-thead:not(.orc-thead-m2-cliente) { grid-template-columns: 70px 1fr 80px 90px 150px 170px !important; }
          .orc-row:not(.orc-row-m2-cliente) { grid-template-columns: 70px 1fr 80px 90px 150px 170px !important; }
          .orc-thead-m2-cliente, .orc-row-m2-cliente { grid-template-columns: minmax(0, 1fr) 180px !important; }
          .orc-row > div:nth-child(n+3) { grid-column: auto !important; }
          .orc-line-total { text-align: right !important; font-size: 16px !important; }

          .orc-signatures { grid-template-columns: 1fr 1fr !important; margin-top: 6px !important; gap: 12px !important; }
          .orc-sign-col span { margin-bottom: 14px !important; font-size: 9px !important; }
          .orc-generated { margin-top: 4px !important; padding-top: 4px !important; font-size: 10px !important; }
        }
      `}</style>
    </main>
  )
}
