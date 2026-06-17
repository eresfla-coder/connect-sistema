'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, comTimeout } from '@/lib/abrirExterno'
import { montarUrlPublicaDocumento, timestampVersaoPublica } from '@/lib/empresaPublica'
import { gerarFinanceiroDeOrdemServico, lerTitulosFinanceiros, removerFinanceiroDoDocumento } from '@/lib/financeiro'
import {
  baseUrlDocumentoPublico,
  configEmpresaFromLocalStorage,
  normalizarLogoEmpresaPublica,
  type ConfigEmpresaPublica,
} from '@/lib/documentosPublicos'
import { supabase } from '@/lib/supabase'
import { registrarLogSistema } from '@/lib/logs-sistema'
import { exportarOsExcel } from '@/lib/export-modulos'
import { lerLocalStorageUsuario, salvarLocalStorageUsuario } from '@/lib/connect-user-storage'
import { carregarClientesPainelDetalhado } from '@/lib/clientes-painel'

type Cliente = {
  id?: string | number
  codigo?: string
  nome?: string
  telefone?: string
  whatsapp?: string
  email?: string
  endereco?: string
  documento?: string
  cpf?: string
  cnpj?: string
  cpfCnpj?: string
  cep?: string
  ativo?: boolean
}

type OrcamentoSalvo = {
  id: number
  numero: string
  titulo: string
  cliente?: {
    nome?: string
    telefone?: string
    email?: string
    endereco?: string
  } | null
  total: number
  observacao?: string
  status?: string
  data?: string
}

type OrdemServico = {
  id: number
  numero: string
  cliente: string
  clienteId?: string | number
  telefone: string
  whatsapp?: string
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
  link: string
  orcamentoId?: number
}

const STORAGE_KEY = 'connect_ordens_servico_salvas'
const OS_SYNC_PENDING_KEY = 'connect_os_sync_pendentes'
const OS_DELETED_PREFIX = 'connect_os_deleted_'
const CLIENTES_KEY = 'connect_clientes'
const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const PUBLIC_OS_PREFIX = 'connect_public_os_'

function hashNumeroDeterministico(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function idDeterministicoOs(seed: string) {
  return 1100000000 + (hashNumeroDeterministico(seed) % 700000000)
}

function textoDedupe(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function assinaturaOs(item: OrdemServico) {
  const numero = textoDedupe(item.numero || '')
  const cliente = textoDedupe(item.cliente || '')
  const equipamento = textoDedupe(item.equipamento || '')
  const valor = Number(item.valor || 0).toFixed(2)
  const data = textoDedupe(item.data || '')
  return `${numero}|${cliente}|${equipamento}|${valor}|${data}`
}

function baseUrlAtual() {
  if (typeof window !== 'undefined') return window.location.origin
  return SITE_URL || 'https://appconnectpro.com.br'
}

const STATUS_OPTIONS = [
  'Aberta',
  'Aguardando aprovação',
  'Aprovada',
  'Em andamento',
  'Aguardando peça',
  'Finalizada',
  'Entregue',
  'Cancelada',
]

const PRIORIDADE_OPTIONS = ['Baixa', 'Média', 'Alta', 'Urgente']

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function hojeBR() {
  return new Date().toLocaleDateString('pt-BR')
}

function hojeInput() {
  return new Date().toISOString().slice(0, 10)
}

function gerarNumeroExistente(lista: OrdemServico[]) {
  const numeros = lista.map((item) => Number(item.numero)).filter((n) => !Number.isNaN(n))
  const maior = numeros.length ? Math.max(...numeros) : 0
  return String(maior + 1).padStart(4, '0')
}

function corStatus(status: string) {
  switch (status) {
    case 'Aberta':
      return { bg: '#dbeafe', color: '#1d4ed8' }
    case 'Aguardando aprovação':
      return { bg: '#fef3c7', color: '#b45309' }
    case 'Aprovada':
      return { bg: '#dcfce7', color: '#166534' }
    case 'Em andamento':
      return { bg: '#ede9fe', color: '#6d28d9' }
    case 'Aguardando peça':
      return { bg: '#ffe4e6', color: '#be123c' }
    case 'Finalizada':
      return { bg: '#dcfce7', color: '#15803d' }
    case 'Entregue':
      return { bg: '#cffafe', color: '#0f766e' }
    case 'Cancelada':
      return { bg: '#e5e7eb', color: '#374151' }
    default:
      return { bg: '#e5e7eb', color: '#111827' }
  }
}

function corPrioridade(prioridade: string) {
  switch (prioridade) {
    case 'Baixa':
      return { bg: '#ecfeff', color: '#0f766e' }
    case 'Média':
      return { bg: '#fef3c7', color: '#b45309' }
    case 'Alta':
      return { bg: '#fee2e2', color: '#b91c1c' }
    case 'Urgente':
      return { bg: '#fde2ff', color: '#9d174d' }
    default:
      return { bg: '#e5e7eb', color: '#111827' }
  }
}

function ordemVazia(lista: OrdemServico[]): OrdemServico {
  const novoNumero = gerarNumeroExistente(lista)
  const hoje = hojeBR()

  return {
    id: Date.now(),
    numero: novoNumero,
    cliente: '',
    clienteId: undefined,
    telefone: '',
    whatsapp: '',
    email: '',
    endereco: '',
    equipamento: '',
    marca: '',
    modelo: '',
    serial: '',
    defeito: '',
    checklist: '',
    observacao: 'Equipamento recebido para análise/manutenção.',
    valor: 0,
    entrada: 0,
    saldo: 0,
    status: 'Aberta',
    prioridade: 'Média',
    tecnico: '',
    previsao: '',
    data: hoje,
    ultimaAtualizacao: hoje,
    link: '',
  }
}

function normalizarCliente(item: any, index: number): Cliente {
  const telefone = String(item?.telefone || item?.whatsapp || '')

  return {
    id: item?.id ?? Date.now() + index,
    codigo: item?.codigo,
    nome: String(item?.nome || ''),
    telefone,
    whatsapp: String(item?.whatsapp || telefone || ''),
    email: String(item?.email || ''),
    endereco: String(item?.endereco || ''),
    documento: String(item?.documento || item?.cpfCnpj || item?.cpf || item?.cnpj || ''),
    cpf: String(item?.cpf || ''),
    cnpj: String(item?.cnpj || ''),
    cpfCnpj: String(item?.cpfCnpj || ''),
    cep: String(item?.cep || ''),
    ativo: item?.ativo !== false,
  }
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

function telefoneClienteOS(item: any, clientesLista: Cliente[] = []) {
  const direto = normalizarTelefoneWhatsapp(
    item?.telefone ||
      item?.whatsapp ||
      item?.cliente_telefone ||
      item?.cliente?.telefone ||
      item?.cliente?.whatsapp ||
      item?.contato?.telefone ||
      item?.contato?.whatsapp ||
      '',
  )
  if (direto) return direto

  const nome = String(item?.cliente || '').trim().toLowerCase()
  if (!nome || !clientesLista.length) return ''

  const encontrado = clientesLista.find((c) => String(c?.nome || '').trim().toLowerCase() === nome)
  if (!encontrado) return ''

  return normalizarTelefoneWhatsapp(encontrado.whatsapp || encontrado.telefone || '')
}

function linkFallbackOS(item: OrdemServico) {
  return `${baseUrlAtual()}/impressao-ordem-servico/${Number(item.id)}?preview=1`
}

function linkFallbackOrcamento(orcamentoId: number) {
  return `${baseUrlDocumentoPublico()}/impressao-orcamento/${orcamentoId}?preview=1`
}

function montarWhatsappOS(item: OrdemServico) {
  const telefone = telefoneClienteOS(item)
  const link = `${baseUrlAtual()}/impressao-ordem-servico/${Number(item.id)}?preview=1`

  let mensagem = `Olá ${item.cliente || 'cliente'}!\n\n`
  mensagem += `Segue sua ordem de serviço *${item.numero}*.\n`

  if (item.equipamento) {
    mensagem += `Equipamento: ${item.equipamento}\n`
  }

  if (item.status) {
    mensagem += `Status: ${item.status}\n`
  }

  mensagem += `Valor: ${moeda(item.valor)}\n`
  mensagem += `Saldo: ${moeda(item.saldo)}\n\n`
  mensagem += `Acesse aqui:\n${link}`

  const texto = encodeURIComponent(mensagem)

  return telefone ? `https://wa.me/${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`
}

type OsRow = {
  user_id?: string
  local_id?: string
  numero?: string
  cliente?: string
  telefone?: string
  cliente_nome?: string
  cliente_telefone?: string
  equipamento?: string
  status?: string
  prioridade?: string
  valor?: number
  entrada?: number
  saldo?: number
  aprovado?: boolean
  payload?: Partial<OrdemServico> | Record<string, unknown>
}

/** Apenas colunas existentes em public.ordens_servico (upsert não pode incluir extras → PGRST204). */
type OsSupabaseUpsert = {
  user_id: string
  local_id: string
  numero: string
  cliente: string
  telefone: string
  equipamento: string
  status: string
  prioridade: string
  valor: number
  entrada: number
  saldo: number
  aprovado: boolean
  payload: Record<string, unknown>
}

function osAprovadoPorStatus(status?: string) {
  const valor = String(status || '').toLowerCase()
  return valor.includes('aprov') || valor === 'finalizada' || valor === 'entregue'
}

function serializarPayloadOs(os: OrdemServico): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(os)) as Record<string, unknown>
  } catch {
    return { ...os } as unknown as Record<string, unknown>
  }
}

function osParaUpsertSupabase(os: OrdemServico, userId: string): OsSupabaseUpsert {
  const clienteNome = String(os.cliente || '').trim()
  const telefone = String(os.telefone || os.whatsapp || '').trim()
  const status = String(os.status || 'Aberta')

  return {
    user_id: userId,
    local_id: String(os.id),
    numero: String(os.numero || ''),
    cliente: clienteNome,
    telefone,
    equipamento: String(os.equipamento || ''),
    status,
    prioridade: String(os.prioridade || 'Média'),
    valor: Number(os.valor || 0),
    entrada: Number(os.entrada || 0),
    saldo: Number(os.saldo || 0),
    aprovado: osAprovadoPorStatus(status),
    payload: serializarPayloadOs(os),
  }
}

function osDeRowSupabase(row: OsRow): OrdemServico {
  const payload = row.payload && typeof row.payload === 'object' ? (row.payload as Partial<OrdemServico>) : null
  const fallbackSeed = JSON.stringify({
    numero: row.numero || payload?.numero || '',
    cliente: row.cliente || row.cliente_nome || payload?.cliente || '',
    equipamento: row.equipamento || payload?.equipamento || '',
    valor: row.valor || payload?.valor || 0,
    data: payload?.data || '',
  })
  const localId = Number(row.local_id || payload?.id || 0) || idDeterministicoOs(fallbackSeed)

  if (payload && (payload.numero || payload.cliente)) {
    return {
      ...(payload as OrdemServico),
      id: localId,
      numero: String(payload.numero || row.numero || ''),
      cliente: String(payload.cliente || row.cliente || row.cliente_nome || ''),
      telefone: String(payload.telefone || payload.whatsapp || row.telefone || row.cliente_telefone || ''),
      whatsapp: String(payload.whatsapp || payload.telefone || row.telefone || row.cliente_telefone || ''),
      equipamento: String(payload.equipamento || row.equipamento || ''),
      valor: Number(payload.valor ?? row.valor ?? 0),
      entrada: Number(payload.entrada ?? row.entrada ?? 0),
      saldo: Number(payload.saldo ?? row.saldo ?? 0),
      status: String(payload.status || row.status || 'Aberta'),
      prioridade: String(payload.prioridade || row.prioridade || 'Média'),
    }
  }

  const clienteNome = String(row.cliente || row.cliente_nome || '').trim()
  const telefone = String(row.telefone || row.cliente_telefone || '').trim()

  return {
    id: localId,
    numero: String(row.numero || ''),
    cliente: clienteNome,
    telefone,
    whatsapp: telefone,
    email: '',
    endereco: '',
    equipamento: String(row.equipamento || ''),
    marca: '',
    modelo: '',
    serial: '',
    defeito: '',
    checklist: '',
    observacao: '',
    valor: Number(row.valor || 0),
    entrada: Number(row.entrada || 0),
    saldo: Number(row.saldo || 0),
    status: String(row.status || 'Aberta'),
    prioridade: String(row.prioridade || 'Média'),
    tecnico: '',
    previsao: '',
    data: hojeBR(),
    ultimaAtualizacao: hojeBR(),
    link: '',
  }
}

function chaveOsDeleted(userId?: string | null) {
  return `${OS_DELETED_PREFIX}${userId || 'anon'}`
}

function lerDeletedOs(userId?: string | null) {
  try {
    const raw = localStorage.getItem(chaveOsDeleted(userId))
    const lista = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(lista.map((item) => String(item)))
  } catch {
    return new Set<string>()
  }
}

function salvarDeletedOs(ids: Set<string>, userId?: string | null) {
  try {
    localStorage.setItem(chaveOsDeleted(userId), JSON.stringify(Array.from(ids)))
  } catch {}
}

export default function OrdemServicoPage() {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [lista, setLista] = useState<OrdemServico[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [orcamentos, setOrcamentos] = useState<OrcamentoSalvo[]>([])
  const [buscaCliente, setBuscaCliente] = useState('')
  const [mostrarBuscaCliente, setMostrarBuscaCliente] = useState(false)
  const [mostrarImportarOrcamento, setMostrarImportarOrcamento] = useState(false)
  const [buscaOrcamento, setBuscaOrcamento] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [filtroPrioridade, setFiltroPrioridade] = useState('Todas')
  const [ordem, setOrdem] = useState<'recentes' | 'antigas' | 'cliente'>('recentes')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [form, setForm] = useState<OrdemServico>(ordemVazia([]))
  const [darkMode, setDarkMode] = useState(false)
  const osTableRef = useRef<HTMLDivElement | null>(null)
  const syncOsPublicaRodandoRef = useRef(false)
  const osLoadSeqRef = useRef(0)
  const osSyncRodandoRef = useRef(false)
  const userIdOsRef = useRef<string | null>(null)
  const ultimaSyncOsPublicaRef = useRef(0)
  const [osScrollLeft, setOsScrollLeft] = useState(0)
  const [osScrollMax, setOsScrollMax] = useState(1)
  const [zapOsCarregando, setZapOsCarregando] = useState<string | number | null>(null)

  const [config, setConfig] = useState({
    nomeEmpresa: 'CONNECT SISTEMA',
    logoUrl: '/logo-connect.png',
  })
  const [configEmpresa, setConfigEmpresa] = useState<ConfigEmpresaPublica | null>(null)

  function atualizarBarraOs() {
    const el = osTableRef.current
    if (!el) return
    setOsScrollLeft(el.scrollLeft)
    setOsScrollMax(Math.max(1, el.scrollWidth - el.clientWidth))
  }

  function moverBarraOs(valor: number) {
    const el = osTableRef.current
    if (!el) return
    el.scrollLeft = valor
    setOsScrollLeft(valor)
  }

  useEffect(() => {
    const t = window.setTimeout(atualizarBarraOs, 120)
    window.addEventListener('resize', atualizarBarraOs)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', atualizarBarraOs)
    }
  }, [isMobile, lista.length])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const atualizar = () => {
      try {
        const salvo = localStorage.getItem('connect_theme')
        if (salvo === 'light') {
          setDarkMode(false)
          return
        }
        if (salvo === 'dark') {
          setDarkMode(true)
          return
        }
      } catch {}
      setDarkMode(false)
    }

    atualizar()
    media.addEventListener?.('change', atualizar)
    window.addEventListener('connect-theme-change', atualizar as EventListener)

    return () => {
      media.removeEventListener?.('change', atualizar)
      window.removeEventListener('connect-theme-change', atualizar as EventListener)
    }
  }, [])

  function configPublicaOS(): ConfigEmpresaPublica {
    if (configEmpresa) return configEmpresa
    const cfg = configEmpresaFromLocalStorage()
    return {
      ...cfg,
      nomeEmpresa: cfg.nomeEmpresa || config.nomeEmpresa || 'LOJA CONNECT',
      logoUrl: cfg.logoUrl || normalizarLogoEmpresaPublica(config.logoUrl) || '/logo-connect.png',
    }
  }

  async function headersPublicacaoDocs() {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const { data } = await supabase.auth.getSession()
      if (data?.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`
      }
    } catch {}
    return headers
  }

  function codificarPayloadOS(item: OrdemServico) {
    try {
      const json = JSON.stringify({
        i: item.id,
        n: item.numero,
        c: item.cliente,
        t: item.telefone,
        w: item.whatsapp || item.telefone || '',
        e: item.email,
        en: item.endereco,
        eq: item.equipamento,
        ma: item.marca,
        mo: item.modelo,
        se: item.serial,
        df: item.defeito,
        ch: item.checklist,
        ob: item.observacao,
        v: item.valor,
        et: item.entrada,
        sd: item.saldo,
        st: item.status,
        pr: item.prioridade,
        te: item.tecnico,
        pv: item.previsao,
        d: item.data,
        ua: item.ultimaAtualizacao,
        cfg: configPublicaOS(),
      })

      const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )

      return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    } catch {
      return ''
    }
  }

  function montarLinkOS(item: OrdemServico) {
    const id = Number(item.id)
    return `${baseUrlAtual()}/impressao-ordem-servico/${id}?preview=1`
  }

  function normalizarItem(item: any): OrdemServico {
    const telefone = String(item?.telefone || item?.whatsapp || item?.cliente_telefone || '')

    const normalizado: OrdemServico = {
      ...item,
      id: Number(item.id),
      clienteId: item?.clienteId,
      cliente: String(item?.cliente || item?.cliente?.nome || ''),
      telefone,
      whatsapp: String(item?.whatsapp || telefone || ''),
      email: String(item?.email || ''),
      endereco: String(item?.endereco || ''),
      saldo: Math.max(Number(item.valor || 0) - Number(item.entrada || 0), 0),
      link: '',
    }

    return {
      ...normalizado,
      link: montarLinkOS(normalizado),
    }
  }

  function lerOsLocalStorage() {
    try {
      const listaSalva = lerLocalStorageUsuario<OrdemServico[]>(STORAGE_KEY, userIdOsRef.current, [])
      if (!Array.isArray(listaSalva)) return [] as OrdemServico[]
      const deletedIds = lerDeletedOs(userIdOsRef.current)
      return listaSalva
        .map((item) => normalizarItem(item))
        .filter((item) => !deletedIds.has(String(item?.id || '')))
    } catch (e) {
      console.error('[ordens_servico] erro ao ler localStorage:', e)
      return [] as OrdemServico[]
    }
  }

  function scoreOs(item: OrdemServico) {
    let score = Number(item.id || 0)
    if (item.numero) score += 10
    if (item.cliente) score += 10
    if (item.equipamento) score += 8
    if (item.status && item.status !== 'Aberta') score += 4
    if (item.orcamentoId) score += 5
    return score
  }

  function deduplicarOsForte(lista: OrdemServico[]) {
    const porId = new Map<string, OrdemServico>()
    for (const item of lista) {
      if (!item?.id) continue
      const chave = String(item.id)
      const existente = porId.get(chave)
      if (!existente || scoreOs(item) >= scoreOs(existente)) {
        porId.set(chave, item)
      }
    }

    const porAssinatura = new Map<string, OrdemServico>()
    for (const item of porId.values()) {
      const assinatura = assinaturaOs(item)
      const existente = porAssinatura.get(assinatura)
      if (!existente || scoreOs(item) >= scoreOs(existente)) {
        porAssinatura.set(assinatura, item)
      }
    }

    return Array.from(porAssinatura.values()).sort((a, b) => Number(b.id) - Number(a.id))
  }

  function mesclarListasOs(cloud: OrdemServico[], local: OrdemServico[], userId?: string | null) {
    const deletedIds = lerDeletedOs(userId)
    const mapa = new Map<string, OrdemServico>()
    for (const item of cloud) {
      if (!item?.id) continue
      const id = String(item.id)
      if (deletedIds.has(id)) continue
      mapa.set(id, item)
    }
    for (const item of local) {
      if (!item?.id) continue
      const id = String(item.id)
      if (deletedIds.has(id)) continue
      if (!mapa.has(id)) mapa.set(id, item)
    }
    return deduplicarOsForte(Array.from(mapa.values()))
  }

  /** Nunca apaga localStorage quando a nuvem veio vazia mas o aparelho ainda tem OS salvas. */
  function aplicarListaOs(lista: OrdemServico[], contexto: string, permitirSubstituirPorVazio = false) {
    const deletedIds = lerDeletedOs(userIdOsRef.current)
    const listaFiltrada = deduplicarOsForte(
      lista.filter((item) => !deletedIds.has(String(item?.id || '')))
    )
    const localAtual = lerOsLocalStorage()
    if (listaFiltrada.length === 0 && localAtual.length > 0 && !permitirSubstituirPorVazio) {
      console.warn(
        '[ordens_servico] Supabase retornou lista vazia — localStorage NÃO foi apagado.',
        { contexto, mantidas: localAtual.length, idsLocais: localAtual.map((o) => o.id).slice(0, 8) }
      )
      setLista(localAtual)
      setForm(ordemVazia(localAtual))
      return false
    }
    setLista(listaFiltrada)
    setForm(ordemVazia(listaFiltrada))
    try {
      salvarLocalStorageUsuario(STORAGE_KEY, userIdOsRef.current, listaFiltrada)
    } catch (e) {
      console.error('[ordens_servico] erro ao gravar localStorage:', contexto, e)
    }
    return true
  }

  function salvarLista(novaLista: OrdemServico[], origem = 'salvarLista') {
    const deletedIds = lerDeletedOs(userIdOsRef.current)
    const normalizada = deduplicarOsForte(
      novaLista.filter((item) => !deletedIds.has(String(item?.id || '')))
    )
    if (normalizada.length === 0 && origem !== 'excluir') {
      const localAtual = lerOsLocalStorage()
      if (localAtual.length > 0) {
        console.warn('[ordens_servico] salvarLista([]) bloqueado — havia', localAtual.length, 'OS no localStorage. origem:', origem)
        setLista(localAtual)
        return
      }
    }
    setLista(normalizada)
    salvarLocalStorageUsuario(STORAGE_KEY, userIdOsRef.current, normalizada)
    window.dispatchEvent(new Event('connect-local-saved'))
  }

  async function obterUserIdSupabase() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionData?.session?.user?.id) {
      userIdOsRef.current = sessionData.session.user.id
      return sessionData.session.user.id
    }
    if (sessionError) {
      console.error('[ordens_servico] getSession falhou:', sessionError.message)
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userData?.user?.id) {
      userIdOsRef.current = userData.user.id
      return userData.user.id
    }
    if (userError) {
      console.error('[ordens_servico] getUser falhou:', userError.message)
    }

    console.error('[ordens_servico] usuário anônimo / sem sessão — persistência na nuvem indisponível (comum no PWA antes do token restaurar).')
    return null
  }

  function marcarOsComoDeletada(id: number | string, userId?: string | null) {
    const deletedIds = lerDeletedOs(userId)
    deletedIds.add(String(id))
    salvarDeletedOs(deletedIds, userId)
  }

  function removerOsDeDeleted(id: number | string, userId?: string | null) {
    const deletedIds = lerDeletedOs(userId)
    if (deletedIds.delete(String(id))) {
      salvarDeletedOs(deletedIds, userId)
    }
  }

  function carregarOsLocalFallback() {
    const listaCorrigida = lerOsLocalStorage()
    if (!listaCorrigida.length) {
      return
    }
    setLista(listaCorrigida)
    setForm(ordemVazia(listaCorrigida))
  }

  function origemDispositivoOS() {
    if (typeof window === 'undefined') return 'desconhecido'
    return window.innerWidth <= 900 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'mobile' : 'PC'
  }

  async function obterAuthOS(maxTentativas = 8) {
    for (let attempt = 0; attempt < maxTentativas; attempt += 1) {
      const { data: sessionWrap, error: sessionError } = await supabase.auth.getSession()
      if (sessionWrap?.session?.user?.id) {
        userIdOsRef.current = String(sessionWrap.session.user.id)
        return {
          userId: String(sessionWrap.session.user.id),
          email: sessionWrap.session.user.email || '',
          metodo: 'getSession',
          tentativa: attempt + 1,
        }
      }
      if (sessionError) console.error('[ordens_servico] getSession falhou:', sessionError.message)

      const { data: userWrap, error: userError } = await supabase.auth.getUser()
      if (userWrap?.user?.id) {
        userIdOsRef.current = String(userWrap.user.id)
        return {
          userId: String(userWrap.user.id),
          email: userWrap.user.email || '',
          metodo: 'getUser',
          tentativa: attempt + 1,
        }
      }
      if (userError) console.error('[ordens_servico] getUser falhou:', userError.message)

      await new Promise((r) => setTimeout(r, 220 + attempt * 120))
    }

    return null
  }

  function marcarOsPendenteSync(localId: number | string) {
    try {
      const raw = localStorage.getItem(OS_SYNC_PENDING_KEY)
      const lista = raw ? (JSON.parse(raw) as string[]) : []
      const id = String(localId)
      if (!lista.includes(id)) lista.push(id)
      localStorage.setItem(OS_SYNC_PENDING_KEY, JSON.stringify(lista))
    } catch {}
  }

  function removerOsPendenteSync(localId: number | string) {
    try {
      const raw = localStorage.getItem(OS_SYNC_PENDING_KEY)
      const lista = raw ? (JSON.parse(raw) as string[]) : []
      const id = String(localId)
      const filtrada = lista.filter((item) => item !== id)
      localStorage.setItem(OS_SYNC_PENDING_KEY, JSON.stringify(filtrada))
    } catch {}
  }

  async function obterTokenSessaoOS(maxTentativas = 10) {
    for (let attempt = 0; attempt < maxTentativas; attempt++) {
      try {
        const { data: sessao } = await supabase.auth.getSession()
        const token = sessao?.session?.access_token || ''
        if (token) return token
      } catch {}
      await new Promise((r) => setTimeout(r, 280 + attempt * 160))
    }
    return ''
  }

  async function persistirOsSupabase(os: OrdemServico, _userId?: string | null) {
    try {
      const userIdAtual = _userId || userIdOsRef.current || (await obterUserIdSupabase())
      removerOsDeDeleted(os.id, userIdAtual)
      const token = await obterTokenSessaoOS(10)
      if (!token) {
        console.warn('[ordens_servico] sync API: sem token de sessão (aguardando login no aparelho).', {
          local_id: String(os.id),
          origem: origemDispositivoOS(),
        })
        return false
      }

      const resp = await fetch('/api/ordens-servico/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ os }),
      })

      if (!resp.ok) {
        const erro = await resp.json().catch(() => null)
        console.error('[ordens_servico] sync API falhou:', erro?.error || resp.status, {
          local_id: String(os.id),
        })
        return false
      }

      removerOsPendenteSync(os.id)
      return true
    } catch (e) {
      console.error('[ordens_servico] exceção sync API:', e)
      return false
    }
  }

  async function persistirOsComRetry(os: OrdemServico, origem: string, maxTentativas = 4) {
    for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
      const ok = await persistirOsSupabase(os)
      if (ok) return true
      await new Promise((resolve) => setTimeout(resolve, 700 + tentativa * 900))
    }

    marcarOsPendenteSync(os.id)
    console.warn('[ordens_servico] OS ficou pendente de sync na nuvem.', {
      origem,
      dispositivo: origemDispositivoOS(),
      local_id: String(os.id),
    })
    return false
  }

  async function reenviarOsPendentesNuvem() {
    try {
      const raw = localStorage.getItem(OS_SYNC_PENDING_KEY)
      const ids = raw ? (JSON.parse(raw) as string[]) : []
      if (!ids.length) return

      const localList = lerOsLocalStorage()
      for (const id of ids) {
        const os = localList.find((item) => String(item.id) === String(id))
        if (!os) {
          removerOsPendenteSync(id)
          continue
        }
        await persistirOsComRetry(os, 'fila-pendente', 2)
      }
    } catch {}
  }

  async function excluirOsSupabase(os: OrdemServico) {
    try {
      const userId = await obterUserIdSupabase()
      if (!userId) {
        console.error('[ordens_servico] não foi possível excluir: usuário não autenticado.')
        return
      }
      marcarOsComoDeletada(os.id, userId)

      const { error } = await supabase
        .from('ordens_servico')
        .delete()
        .eq('user_id', userId)
        .eq('local_id', String(os.id))

      if (error) console.error('[ordens_servico] erro ao excluir:', error.message)
    } catch (e) {
      console.error('[ordens_servico] erro ao excluir:', e)
    }
  }

  async function sincronizarOsLocaisAntigos(cloudList?: OrdemServico[]) {
    if (osSyncRodandoRef.current) {
      return
    }
    osSyncRodandoRef.current = true

    try {
      const userId = await obterUserIdSupabase()
      if (!userId) return

      const localList = lerOsLocalStorage()
      const cloudIds = new Set((cloudList || []).map((item) => String(item.id)))
      const pendentes = localList.filter((item) => item?.id && !cloudIds.has(String(item.id)))

      if (!pendentes.length) return

      let enviados = 0
      for (const os of pendentes) {
        const ok = await persistirOsSupabase(os, userId)
        if (ok) enviados += 1
      }

      const { data: rows, error } = await supabase
        .from('ordens_servico')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[ordens_servico] erro ao recarregar após sync:', error.message)
        return
      }

      const normalizados = ((rows || []) as OsRow[]).map((row) => normalizarItem(osDeRowSupabase(row)))

      const mesclada = mesclarListasOs(normalizados, localList, userId)
      aplicarListaOs(mesclada, 'sincronizarOsLocaisAntigos')
    } finally {
      osSyncRodandoRef.current = false
    }
  }

  async function carregarOsSupabase() {
    const loadId = ++osLoadSeqRef.current

    try {
      const userId = await obterUserIdSupabase()
      if (!userId) {
        console.error('[ordens_servico] carregarOsSupabase: sem user_id — mantendo localStorage.')
        carregarOsLocalFallback()
        return
      }
      userIdOsRef.current = userId

      const localList = lerOsLocalStorage()
      const deletedIds = lerDeletedOs(userId)

      const { data, error, count } = await supabase
        .from('ordens_servico')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (loadId !== osLoadSeqRef.current) {
        return
      }

      if (error) {
        console.error('[ordens_servico] SELECT erro:', {
          message: error.message,
          code: (error as { code?: string }).code,
          user_id: userId,
        })
        throw error
      }

      const normalizados = ((data || []) as OsRow[])
        .map((row) => normalizarItem(osDeRowSupabase(row)))
        .filter((item) => !deletedIds.has(String(item?.id || '')))

      if (normalizados.length === 0) {
        console.warn('[ordens_servico] Supabase retornou lista vazia', {
          user_id: userId,
          tinhaLocal: localList.length,
        })
      }

      if (normalizados.length === 0 && localList.length > 0) {
        await sincronizarOsLocaisAntigos([])
        if (loadId !== osLoadSeqRef.current) return
        const aposSync = lerOsLocalStorage()
        aplicarListaOs(aposSync, 'carregarOsSupabase-pós-sync-vazio')
        return
      }

      const listaFinal = mesclarListasOs(normalizados, localList, userId)
      aplicarListaOs(listaFinal, 'carregarOsSupabase')

      if (localList.length > normalizados.length) {
        await sincronizarOsLocaisAntigos(normalizados)
      }
    } catch (e) {
      if (loadId !== osLoadSeqRef.current) return
      console.error('[ordens_servico] carregarOsSupabase falhou — fallback localStorage:', e)
      carregarOsLocalFallback()
    }
  }

  async function sincronizarAprovacoesOSPublicas(forcar = false) {
    if (syncOsPublicaRodandoRef.current) return

    const agora = Date.now()
    if (!forcar && agora - ultimaSyncOsPublicaRef.current < 10000) return
    if (!lista.length) return

    syncOsPublicaRodandoRef.current = true
    ultimaSyncOsPublicaRef.current = agora

    try {
      const base = [...lista]
      let alterou = false

      const consulta = base
        .filter((item) => {
          const status = String(item?.status || '').toLowerCase()
          return !status.includes('aprov') && !status.includes('cancel') && !status.includes('recus')
        })
        .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
        .slice(0, 18)

      const atualizados = await Promise.all(
        consulta.map(async (item) => {
          try {
            const resp = await fetch(
              `/api/public-docs?document_type=ordem_servico&document_id=${encodeURIComponent(String(item.id))}&t=${Date.now()}`,
              { cache: 'no-store' }
            )

            if (!resp.ok) return item

            const json = await resp.json().catch(() => null)
            const publico = json?.payload
            const aprovacao = publico?.aprovacaoDigital
            const statusPublico = String(publico?.status || '')
            const aprovado = statusPublico === 'Aprovada' || aprovacao?.status === 'aprovado'
            const recusado = statusPublico === 'Cancelada' || aprovacao?.status === 'recusado'

            if (!aprovado && !recusado) return item

            const statusFinal = recusado ? 'Cancelada' : 'Aprovada'

            if (
              String(item.status) === statusFinal &&
              JSON.stringify((item as any).aprovacaoDigital || {}) === JSON.stringify(aprovacao || {})
            ) {
              return item
            }

            alterou = true

            return {
              ...publico,
              id: item.id,
              status: statusFinal,
              aprovacaoDigital: aprovacao || publico?.aprovacaoDigital,
              ultimaAtualizacao: publico?.ultimaAtualizacao || hojeBR(),
            } as OrdemServico
          } catch {
            return item
          }
        })
      )

      if (alterou) {
        const mapa = new Map(atualizados.map((item) => [String(item.id), item]))
        const listaFinal = base.map((item) => mapa.get(String(item.id)) || item)
        salvarLista(listaFinal)
        for (const item of listaFinal) {
          if (mapa.has(String(item.id))) void persistirOsSupabase(item)
        }
      }
    } finally {
      syncOsPublicaRodandoRef.current = false
    }
  }

  async function publicarOS(item: OrdemServico) {
    const id = Number(item.id)
    const base = baseUrlAtual()
    const cfg = configPublicaOS()
    const payload = { ...item, cfg, config: cfg }
    const tokenLocal = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')

    try {
      const resp = await fetch('/api/public-docs', {
        method: 'POST',
        headers: await headersPublicacaoDocs(),
        body: JSON.stringify({
          document_type: 'ordem_servico',
          document_id: String(id),
          token: tokenLocal,
          payload,
        }),
      })

      if (!resp.ok) {
        const erro = await resp.json().catch(() => null)
        throw new Error(erro?.error || 'Falha ao publicar OS.')
      }

      const json = await resp.json().catch(() => null)
      const token = String(json?.token || tokenLocal).trim()

      if (!token) {
        throw new Error('Token da OS não retornado pela API.')
      }

      const v = timestampVersaoPublica(json?.updated_at || Date.now())
      return montarUrlPublicaDocumento('/view/os', String(id), { token, v })
    } catch (error) {
      console.error('[PUBLICAR_OS]', error)
      throw error
    }
  }

  async function linkPublicoOS(item: OrdemServico): Promise<string> {
    try {
      return await comTimeout(publicarOS(item), 14000)
    } catch {
      return linkFallbackOS(item)
    }
  }

  function linkValido(item: OrdemServico) {
    return montarLinkOS(item)
  }

  async function gerarLinkOrcamentoPublico(orcamentoId: number) {
    const orc = orcamentos.find((o) => Number(o.id) === Number(orcamentoId))
    if (!orc) throw new Error('Orçamento vinculado não encontrado.')

    const cfg = configPublicaOS()
    const base = baseUrlDocumentoPublico()
    const tokenLocal = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')

    const resp = await fetch('/api/public-docs', {
      method: 'POST',
      headers: await headersPublicacaoDocs(),
      body: JSON.stringify({
        tipo: 'orcamento',
        documentoId: String(orcamentoId),
        document_type: 'orcamento',
        document_id: String(orcamentoId),
        token: tokenLocal,
        payload: { ...orc, config: cfg, cfg },
      }),
    })

    if (!resp.ok) {
      const erro = await resp.json().catch(() => null)
      throw new Error(erro?.error || 'Falha ao publicar orçamento.')
    }

    const json = await resp.json().catch(() => null)
    const token = String(json?.token || tokenLocal).trim()
    const v = timestampVersaoPublica(json?.updated_at || Date.now())
    return montarUrlPublicaDocumento('/impressao-orcamento', String(orcamentoId), { token, preview: true, v })
  }

  async function linkPublicoOrcamento(orcamentoId: number): Promise<string> {
    try {
      return await comTimeout(gerarLinkOrcamentoPublico(orcamentoId), 14000)
    } catch {
      return linkFallbackOrcamento(orcamentoId)
    }
  }

  async function copiarTexto(link: string, mensagemOk: string) {
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(link)
        alert(mensagemOk)
        return
      } catch {}
    }
    window.prompt('Copie o link:', link)
  }

  async function copiarLinkOrcamento(item: OrdemServico) {
    const orcId = Number(item.orcamentoId || 0)
    if (!orcId) {
      alert('Esta OS não está vinculada a um orçamento.')
      return
    }
    try {
      const link = await linkPublicoOrcamento(orcId)
      await copiarTexto(link, 'Link do orçamento copiado (com sua logo).')
    } catch (error) {
      const fallback = linkFallbackOrcamento(orcId)
      await copiarTexto(fallback, 'Link alternativo copiado. Se não abrir com logo, tente de novo com internet.')
    }
  }

  function abrirRecebimentoOS(item: OrdemServico) {
    gerarFinanceiroDeOrdemServico(item)
    const titulos = lerTitulosFinanceiros()
    const temTitulo = titulos.some(
      (t) => String(t.origem || '') === 'ordem_servico' && String(t.origem_id || '') === String(item.id),
    )
    if (!temTitulo) {
      alert('Não há saldo em aberto para cobrar nesta OS.')
      return
    }
    router.push(`/financeiro?busca=${encodeURIComponent(String(item.numero || item.id))}`)
  }

  function emitirReciboOS(item: OrdemServico) {
    const cfg = configPublicaOS()
    const valor = Number(item.saldo ?? Math.max(Number(item.valor || 0) - Number(item.entrada || 0), 0))
    const prefill = {
      nomeCliente: item.cliente || '',
      clienteTelefone: item.telefone || item.whatsapp || '',
      referente: `OS #${item.numero}`,
      valorNumero: String(valor > 0 ? valor : item.valor || 0),
      dataRecibo: new Date().toISOString().slice(0, 10),
      formaPagamento: 'Pix',
      observacao: item.observacao || 'Pagamento referente à ordem de serviço.',
      config: {
        nomeEmpresa: cfg.nomeEmpresa,
        cidadeUf: cfg.cidadeUf,
        telefone: cfg.telefone || cfg.whatsapp,
        responsavel: cfg.responsavel || '',
        corPrimaria: '#16a34a',
        corSecundaria: '#f0fdf4',
        logoUrl: cfg.logoUrl,
        endereco: cfg.endereco,
      },
    }
    try {
      sessionStorage.setItem('connect_recibo_prefill', JSON.stringify(prefill))
    } catch {}
    router.push('/recibo-avulso')
  }

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    function aplicarConfigLocal() {
      const cfg = configEmpresaFromLocalStorage()
      setConfigEmpresa(cfg)
      setConfig({
        nomeEmpresa: cfg.nomeEmpresa || 'CONNECT SISTEMA',
        logoUrl: cfg.logoUrl || '/logo-connect.png',
      })
    }

    aplicarConfigLocal()

    async function carregarConfigNuvem() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData?.session?.user?.id
        if (!userId) return

        const { data } = await supabase
          .from('configuracoes_empresa')
          .select('nome_empresa,logo_url,whatsapp_empresa,telefone,endereco,email,responsavel')
          .eq('user_id', userId)
          .maybeSingle()

        if (!data) return

        const local = configEmpresaFromLocalStorage()
        const logoUrl = normalizarLogoEmpresaPublica(data.logo_url) || local.logoUrl
        const merged: ConfigEmpresaPublica = {
          ...local,
          nomeEmpresa: String(data.nome_empresa || local.nomeEmpresa),
          logoUrl: logoUrl || '/logo-connect.png',
          whatsapp: String(data.whatsapp_empresa || local.whatsapp),
          telefone: String(data.telefone || data.whatsapp_empresa || local.telefone),
          telefoneEmpresa: String(data.telefone || local.telefoneEmpresa),
          celularEmpresa: String(data.whatsapp_empresa || local.celularEmpresa),
          email: String(data.email || local.email),
          endereco: String(data.endereco || local.endereco),
          responsavel: String(data.responsavel || local.responsavel || ''),
        }

        setConfigEmpresa(merged)
        setConfig({ nomeEmpresa: merged.nomeEmpresa, logoUrl: merged.logoUrl })

        try {
          localStorage.setItem(
            'connect_configuracoes',
            JSON.stringify({
              ...JSON.parse(localStorage.getItem('connect_configuracoes') || '{}'),
              nomeEmpresa: merged.nomeEmpresa,
              logoUrl: merged.logoUrl,
              whatsappEmpresa: merged.whatsapp,
              telefone: merged.telefone,
              endereco: merged.endereco,
              email: merged.email,
            }),
          )
        } catch {}
      } catch (error) {
        console.error('[OS_CONFIG_EMPRESA]', error)
      }
    }

    void carregarConfigNuvem()
  }, [])

  useEffect(() => {
    carregarOsLocalFallback()
    void carregarOsSupabase()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session?.user &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')
      ) {
        void carregarOsSupabase()
        void carregarClientesPainelDetalhado('ordens-servico').then(({ clientes: lista }) => {
          setClientes(lista.map((item, index) => normalizarCliente(item, index)))
        })
      }
    })

    void carregarClientesPainelDetalhado('ordens-servico').then(({ clientes: lista }) => {
      setClientes(lista.map((item, index) => normalizarCliente(item, index)))
    })

    const orcSalvos = localStorage.getItem(ORCAMENTOS_KEY)
    if (orcSalvos) {
      try {
        const listaOrc = JSON.parse(orcSalvos)
        if (Array.isArray(listaOrc)) setOrcamentos(listaOrc)
      } catch {
        setOrcamentos([])
      }
    }

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    function carregarDadosLocaisV78() {
      carregarOsLocalFallback()
      void carregarOsSupabase()

      void carregarClientesPainelDetalhado('ordens-servico').then(({ clientes: lista }) => {
        setClientes(lista.map((item, index) => normalizarCliente(item, index)))
      })

      try {
        const orcSalvos = localStorage.getItem(ORCAMENTOS_KEY)
        if (orcSalvos) {
          const listaOrc = JSON.parse(orcSalvos)
          if (Array.isArray(listaOrc)) setOrcamentos(listaOrc)
        }
      } catch {}
    }

    window.addEventListener('connect-cloud-hydrated', carregarDadosLocaisV78)
    return () => window.removeEventListener('connect-cloud-hydrated', carregarDadosLocaisV78)
  }, [])

  useEffect(() => {
    if (!lista.length) return
    const timer = window.setTimeout(() => sincronizarAprovacoesOSPublicas(true), 1400)
    return () => window.clearTimeout(timer)
  }, [lista.length])

  useEffect(() => {
    if (!lista.length) return

    const rodarSync = () => sincronizarAprovacoesOSPublicas(true)
    const aoVoltarParaAba = () => {
      if (document.visibilityState === 'visible') rodarSync()
    }

    window.addEventListener('focus', rodarSync)
    document.addEventListener('visibilitychange', aoVoltarParaAba)

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      sincronizarAprovacoesOSPublicas(false)
    }, 60000)

    return () => {
      window.removeEventListener('focus', rodarSync)
      document.removeEventListener('visibilitychange', aoVoltarParaAba)
      window.clearInterval(interval)
    }
  }, [lista])

  useEffect(() => {
    void reenviarOsPendentesNuvem()
    const timer = window.setInterval(() => void reenviarOsPendentesNuvem(), 60000)
    const aoVisivel = () => {
      if (document.visibilityState === 'visible') void reenviarOsPendentesNuvem()
    }
    document.addEventListener('visibilitychange', aoVisivel)
    window.addEventListener('focus', () => void reenviarOsPendentesNuvem())
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVisivel)
    }
  }, [])

  useEffect(() => {
    setForm((anterior) => ({
      ...anterior,
      saldo: Math.max(Number(anterior.valor || 0) - Number(anterior.entrada || 0), 0),
    }))
  }, [form.valor, form.entrada])

  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase()
    const base = clientes.filter((item) => item.ativo !== false)

    if (!termo) return base.slice(0, 8)

    return base
      .filter((item) =>
        [
          item.nome,
          item.telefone,
          item.whatsapp,
          item.email,
          item.documento,
          item.cpf,
          item.cnpj,
          item.cpfCnpj,
          item.cep,
        ]
          .filter(Boolean)
          .some((valor) => String(valor).toLowerCase().includes(termo))
      )
      .slice(0, 8)
  }, [buscaCliente, clientes])

  const orcamentosDisponiveis = useMemo(() => {
    const convertidosIds = new Set(
      lista.filter((item) => Number(item.orcamentoId || 0) > 0).map((item) => Number(item.orcamentoId))
    )

    const base = orcamentos.filter((item) => !convertidosIds.has(Number(item.id)))
    const termo = buscaOrcamento.trim().toLowerCase()

    if (!termo) return base.slice(0, 10)

    return base
      .filter((item) => `${item.numero} ${item.cliente?.nome || ''} ${item.status || ''}`.toLowerCase().includes(termo))
      .slice(0, 10)
  }, [orcamentos, lista, buscaOrcamento])

  const listaFiltrada = useMemo(() => {
    let atual = [...lista]
    const termo = busca.trim().toLowerCase()

    if (termo) {
      atual = atual.filter((item) =>
        [
          item.numero,
          item.cliente,
          item.telefone,
          item.whatsapp,
          item.equipamento,
          item.marca,
          item.modelo,
          item.serial,
          item.status,
          item.prioridade,
          item.tecnico,
        ]
          .filter(Boolean)
          .some((valor) => String(valor).toLowerCase().includes(termo))
      )
    }

    if (filtroStatus !== 'Todos') atual = atual.filter((item) => item.status === filtroStatus)
    if (filtroPrioridade !== 'Todas') atual = atual.filter((item) => item.prioridade === filtroPrioridade)

    if (ordem === 'recentes') atual.sort((a, b) => b.id - a.id)
    else if (ordem === 'antigas') atual.sort((a, b) => a.id - b.id)
    else atual.sort((a, b) => String(a.cliente).localeCompare(String(b.cliente)))

    return atual
  }, [lista, busca, filtroStatus, filtroPrioridade, ordem])

  const resumo = useMemo(() => {
    const abertas = lista.filter((item) => item.status === 'Aberta').length
    const andamento = lista.filter((item) => item.status === 'Em andamento').length
    const finalizadas = lista.filter((item) => item.status === 'Finalizada').length

    const totalAberto = lista
      .filter((item) => item.status !== 'Entregue' && item.status !== 'Cancelada')
      .reduce((acc, item) => acc + Number(item.saldo || 0), 0)

    return { abertas, andamento, finalizadas, totalAberto }
  }, [lista])

  function atualizar<K extends keyof OrdemServico>(campo: K, valor: OrdemServico[K]) {
    setForm((anterior) => ({ ...anterior, [campo]: valor }))
  }

  function selecionarCliente(item: Cliente) {
    const telefoneCliente = item.telefone || item.whatsapp || ''

    setForm((anterior) => ({
      ...anterior,
      clienteId: item.id,
      cliente: item.nome || '',
      telefone: telefoneCliente,
      whatsapp: item.whatsapp || telefoneCliente,
      email: item.email || '',
      endereco: item.endereco || '',
    }))

    setBuscaCliente(item.nome || '')
    setMostrarBuscaCliente(false)
  }

  function importarOrcamento(orc: OrcamentoSalvo) {
    const existe = lista.find((item) => Number(item.orcamentoId || 0) === Number(orc.id))

    if (existe) {
      alert('Esse orçamento já foi importado para uma OS.')
      return
    }

    const novoId = Date.now()
    const telefoneCliente = orc.cliente?.telefone || ''

    const nova: OrdemServico = normalizarItem({
      id: novoId,
      numero: gerarNumeroExistente(lista),
      cliente: orc.cliente?.nome || '',
      telefone: telefoneCliente,
      whatsapp: telefoneCliente,
      email: orc.cliente?.email || '',
      endereco: orc.cliente?.endereco || '',
      equipamento: 'Orçamento importado',
      marca: '',
      modelo: '',
      serial: '',
      defeito: orc.observacao || '',
      checklist: '',
      observacao: orc.observacao || '',
      valor: Number(orc.total || 0),
      entrada: 0,
      saldo: Number(orc.total || 0),
      status: 'Aberta',
      prioridade: 'Média',
      tecnico: '',
      previsao: '',
      data: hojeBR(),
      ultimaAtualizacao: hojeBR(),
      link: '',
      orcamentoId: Number(orc.id),
    })

    const novaLista = [nova, ...lista]
    salvarLista(novaLista, 'importar-orcamento')
    void persistirOsSupabase(nova)
    gerarFinanceiroDeOrdemServico(nova)

    const orcAtualizados = orcamentos.map((item) => (item.id === orc.id ? { ...item, status: 'Convertido' } : item))

    setOrcamentos(orcAtualizados)
    localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(orcAtualizados))

    alert('Orçamento importado para OS com sucesso.')
    setMostrarImportarOrcamento(false)
    setBuscaOrcamento('')
  }

  function limpar() {
    setEditandoId(null)
    setBuscaCliente('')
    setMostrarBuscaCliente(false)
    setMostrarImportarOrcamento(false)
    setBuscaOrcamento('')
    setForm(ordemVazia(lista))
    setFormAberto(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar() {
    if (!form.cliente.trim()) {
      alert('Preencha o cliente.')
      return
    }

    if (!form.telefone?.trim() && !form.whatsapp?.trim()) {
      alert('Cliente sem telefone/WhatsApp. Selecione o cliente cadastrado ou preencha o telefone antes de salvar a OS.')
      return
    }

    if (!form.equipamento.trim()) {
      alert('Preencha o equipamento.')
      return
    }

    if (editandoId !== null) {
      const atualizada: OrdemServico = normalizarItem({
        ...form,
        telefone: form.telefone || form.whatsapp || '',
        whatsapp: form.whatsapp || form.telefone || '',
        id: editandoId,
        ultimaAtualizacao: hojeBR(),
      })

      const novaLista = lista.map((item) => (item.id === editandoId ? atualizada : item))
      salvarLista(novaLista, 'editar')
      gerarFinanceiroDeOrdemServico(atualizada)
      const okNuvem = await persistirOsComRetry(atualizada, 'editar')
      if (okNuvem) {
        alert('OS atualizada com sucesso.')
        void publicarOS(atualizada).catch(() => {})
      } else {
        alert('Alterações salvas neste aparelho. A sincronização com a nuvem continuará automaticamente.')
      }
      const { data: { session: sessOsEdit } } = await supabase.auth.getSession()
      void registrarLogSistema(sessOsEdit?.access_token || '', 'editou_os', {
        modulo: 'ordens_servico',
        referencia_id: String(editandoId),
      })
      limpar()
      return
    }

    const novoId = Date.now()

    const nova: OrdemServico = normalizarItem({
      ...form,
      telefone: form.telefone || form.whatsapp || '',
      whatsapp: form.whatsapp || form.telefone || '',
      id: novoId,
      numero: gerarNumeroExistente(lista),
      data: hojeBR(),
      ultimaAtualizacao: hojeBR(),
    })

    const novaLista = [nova, ...lista]
    salvarLista(novaLista, 'criar')
    gerarFinanceiroDeOrdemServico(nova)
    const okNuvem = await persistirOsComRetry(nova, 'criar')
    if (okNuvem) {
      alert('OS salva com sucesso.')
      void publicarOS(nova).catch(() => {})
    } else {
      alert('OS salva neste aparelho. A sincronização com a nuvem continuará em instantes.')
    }
    const { data: { session: sessOsNovo } } = await supabase.auth.getSession()
    void registrarLogSistema(sessOsNovo?.access_token || '', 'criou_os', {
      modulo: 'ordens_servico',
      referencia_id: String(novoId),
    })
    limpar()
  }

  function editar(item: OrdemServico) {
    const itemCorrigido = normalizarItem(item)
    setEditandoId(itemCorrigido.id)
    setBuscaCliente(itemCorrigido.cliente || '')
    setForm({ ...itemCorrigido })
    setFormAberto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluir(id: number) {
    if (!confirm('Deseja excluir esta OS?')) return

    const userId = userIdOsRef.current || (await obterUserIdSupabase())
    marcarOsComoDeletada(id, userId)
    const atual = lista.find((item) => item.id === id)
    const novaLista = lista.filter((item) => item.id !== id)

    salvarLista(novaLista, 'excluir')
    if (atual) void excluirOsSupabase(atual)
    removerFinanceiroDoDocumento('ordem_servico', id)

    if (atual?.orcamentoId) {
      const orcAtualizados = orcamentos.map((item) =>
        item.id === atual.orcamentoId ? { ...item, status: 'Pendente' } : item
      )

      setOrcamentos(orcAtualizados)
      localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(orcAtualizados))
    }

    const { data: { session: sessOsDel } } = await supabase.auth.getSession()
    void registrarLogSistema(sessOsDel?.access_token || '', 'excluiu_os', {
      modulo: 'ordens_servico',
      referencia_id: String(id),
    })

    if (editandoId === id) limpar()
  }

  function duplicar(item: OrdemServico) {
    const novoId = Date.now()

    const copia: OrdemServico = normalizarItem({
      ...item,
      id: novoId,
      numero: gerarNumeroExistente(lista),
      data: hojeBR(),
      ultimaAtualizacao: hojeBR(),
      status: 'Aberta',
      orcamentoId: undefined,
    })

    const novaLista = [copia, ...lista]
    salvarLista(novaLista, 'duplicar')
    void persistirOsSupabase(copia)
    alert('OS duplicada com sucesso.')
  }

  async function abrir(item: OrdemServico) {
    const link = await linkPublicoOS(item)
    abrirNovaAbaOuMesma(link)
  }

  async function copiarLink(item: OrdemServico) {
    const link = await linkPublicoOS(item)

    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard
        .writeText(link)
        .then(() => {
          alert('Link copiado com sucesso.')
        })
        .catch(() => {
          window.prompt('Copie o link:', link)
        })
      return
    }

    try {
      const textarea = document.createElement('textarea')
      textarea.value = link
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      alert('Link copiado com sucesso.')
    } catch {
      window.prompt('Copie o link:', link)
    }
  }

  async function abrirLinkPublico(item: OrdemServico) {
    abrirNovaAbaOuMesma(await linkPublicoOS(item))
  }

  async function enviarWhatsAppOS(item: OrdemServico) {
    if (zapOsCarregando != null) return

    const telefone = telefoneClienteOS(item, clientes)

    if (!telefone) {
      alert('Preencha o telefone/WhatsApp na OS ou cadastre o cliente com telefone.')
      return
    }

    setZapOsCarregando(item.id)
    try {
      await abrirWhatsappAposPrepararLink({
        telefone,
        linkRapido: linkFallbackOS(item),
        prepararLinkCompleto: () => linkPublicoOS(item),
        montarMensagem: (link) => {
          let mensagem = `Olá ${item.cliente || 'cliente'}!\n\n`
          mensagem += `Segue sua ordem de serviço *${item.numero}*.\n`
          if (item.equipamento) mensagem += `Equipamento: ${item.equipamento}\n`
          if (item.status) mensagem += `Status: ${item.status}\n`
          mensagem += `Valor: ${moeda(item.valor)}\n`
          mensagem += `Saldo: ${moeda(item.saldo)}\n\n`
          mensagem += `Acesse aqui:\n${link}`
          return mensagem
        },
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível abrir o WhatsApp. Tente novamente.'
      alert(msg)
    } finally {
      window.setTimeout(() => setZapOsCarregando(null), 800)
    }
  }

  const colors = darkMode
    ? {
        bg: '#111827',
        shell: 'linear-gradient(180deg,#172033,#1c2638)',
        card: '#182235',
        cardSoft: '#1f2b40',
        text: '#f8fafc',
        muted: '#a8b7cf',
        border: 'rgba(148,163,184,0.22)',
        inputBg: '#0f172a',
        inputBorder: 'rgba(148,163,184,0.22)',
      }
    : {
        bg: '#ffffff',
        shell: '#ffffff',
        card: '#ffffff',
        cardSoft: '#f8fafc',
        text: '#0f172a',
        muted: '#64748b',
        border: 'rgba(148,163,184,0.22)',
        inputBg: '#ffffff',
        inputBorder: '#dbe3f0',
      }

  const pageStyle: React.CSSProperties = {
    maxWidth: isMobile ? '100%' : 1360,
    margin: '0 auto',
    padding: isMobile ? 10 : 24,
    color: colors.text,
    overflowX: 'hidden',
    width: '100%',
    boxSizing: 'border-box',
  }

  const titleTopStyle: React.CSSProperties = {
    color: colors.muted,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  }

  const shellStyle: React.CSSProperties = {
    background: colors.card,
    borderRadius: isMobile ? 16 : 24,
    padding: isMobile ? 12 : 16,
    boxShadow: darkMode ? '0 18px 48px rgba(2,6,23,0.45)' : '0 14px 34px rgba(15,23,42,0.06)',
    border: `1px solid ${colors.border}`,
    transition: 'background .22s ease, border-color .22s ease, box-shadow .22s ease',
  }

  const cardStyle: React.CSSProperties = {
    background: colors.card,
    borderRadius: isMobile ? 12 : 18,
    padding: isMobile ? 10 : 14,
    boxShadow: darkMode ? '0 10px 26px rgba(0,0,0,0.16)' : '0 10px 26px rgba(15,23,42,0.045)',
    border: `1px solid ${colors.border}`,
    transition: 'background .22s ease, border-color .22s ease, box-shadow .22s ease',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 800,
    color: colors.muted,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    color: colors.text,
    padding: '10px 12px',
    boxSizing: 'border-box',
    outline: 'none',
    fontSize: 13,
  }

  const smoothTransition =
    'transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease, opacity .18s ease'

  const premiumGhostButton: React.CSSProperties = {
    minHeight: 40,
    borderRadius: 14,
    border: `1px solid ${colors.border}`,
    background: colors.cardSoft,
    color: colors.text,
    fontWeight: 900,
    fontSize: 12,
    cursor: 'pointer',
    padding: '0 15px',
    boxShadow: darkMode ? '0 8px 18px rgba(0,0,0,.16)' : '0 8px 18px rgba(15,23,42,.05)',
    transition: smoothTransition,
  }

  const premiumBlueButton: React.CSSProperties = {
    minHeight: isMobile ? 46 : 52,
    minWidth: isMobile ? 150 : 190,
    borderRadius: 18,
    border: '1px solid rgba(59,130,246,.55)',
    background: 'linear-gradient(135deg,#0f3bff 0%, #001b6b 100%)',
    color: '#fff',
    fontWeight: 950,
    fontSize: isMobile ? 13 : 15,
    cursor: 'pointer',
    boxShadow: '0 0 28px rgba(37,99,235,.30), inset 0 1px 0 rgba(255,255,255,.14)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: '0 20px',
    textDecoration: 'none',
    transition: smoothTransition,
    willChange: 'transform',
  }

  const premiumGreenButton: React.CSSProperties = {
    minHeight: isMobile ? 46 : 52,
    minWidth: isMobile ? 150 : 190,
    borderRadius: 18,
    border: '1px solid rgba(34,197,94,.50)',
    background: 'linear-gradient(135deg,#16a34a 0%, #065f46 100%)',
    color: '#fff',
    fontWeight: 950,
    fontSize: isMobile ? 13 : 15,
    cursor: 'pointer',
    boxShadow: '0 0 28px rgba(34,197,94,.30), inset 0 1px 0 rgba(255,255,255,.14)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: '0 20px',
    textDecoration: 'none',
    transition: smoothTransition,
    willChange: 'transform',
  }

  return (
    <div
      className="connect-os-mobile-page"
      style={{
        minHeight: '100vh',
        width: '100%',
        maxWidth: '100%',
        background: colors.bg,
        paddingBottom: 20,
        transition: 'background .22s ease, color .22s ease',
        overflowX: 'hidden',
      }}
    >
      <div style={pageStyle}>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          style={{
            height: 38,
            padding: '0 14px',
            marginBottom: 12,
            borderRadius: 999,
            border: `1px solid ${colors.inputBorder}`,
            background: colors.card,
            color: colors.text,
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: darkMode ? '0 10px 24px rgba(2,6,23,.24)' : '0 10px 24px rgba(15,23,42,.08)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          ← Voltar
        </button>

        <div style={titleTopStyle}>Painel técnico premium</div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: isMobile ? 28 : 34,
                lineHeight: 1,
                fontWeight: 900,
                color: colors.text,
              }}
            >
              Ordem de Serviço
            </h1>

            <div style={{ marginTop: 8, color: colors.muted, fontWeight: 700 }}>
              Módulo técnico blindado no mesmo padrão premium do sistema
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: isMobile ? 'stretch' : 'flex-end',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            <button
              type="button"
              onClick={() => exportarOsExcel(lista as unknown as Record<string, unknown>[])}
              style={{
                height: 44,
                borderRadius: 14,
                border: `1px solid ${colors.inputBorder}`,
                background: colors.card,
                color: colors.text,
                fontWeight: 900,
                padding: '0 14px',
                cursor: 'pointer',
              }}
            >
              Exportar Excel
            </button>
            <button
              onClick={() => {
                setEditandoId(null)
                setBuscaCliente('')
                setMostrarImportarOrcamento(false)
                setForm(ordemVazia(lista))
                setFormAberto(true)
              }}
              style={premiumBlueButton}
            >
              ✚ Nova OS
            </button>

            <button onClick={() => router.push('/recibo-avulso')} style={premiumGreenButton}>
              🧾 Recibo avulso
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <ResumoCard titulo="OS abertas" valor={String(resumo.abertas)} darkMode={darkMode} />
          <ResumoCard titulo="Em andamento" valor={String(resumo.andamento)} darkMode={darkMode} />
          <ResumoCard titulo="Finalizadas" valor={String(resumo.finalizadas)} darkMode={darkMode} />
          <ResumoCard titulo="Saldo em aberto" valor={moeda(resumo.totalAberto)} darkMode={darkMode} />
        </div>

        <div style={shellStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
            {formAberto && (
              <div
                onClick={() => setFormAberto(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(15,23,42,0.42)',
                  zIndex: 900,
                  backdropFilter: 'blur(3px)',
                  transition: 'opacity .18s ease',
                }}
              />
            )}

            <div
              style={
                formAberto
                  ? {
                      ...cardStyle,
                      position: 'fixed',
                      right: isMobile ? 10 : 24,
                      top: isMobile ? 'max(14px, calc(env(safe-area-inset-top) + 14px))' : 24,
                      bottom: isMobile ? 'max(14px, env(safe-area-inset-bottom))' : 24,
                      width: isMobile
                        ? 'calc(100vw - 20px - env(safe-area-inset-left) - env(safe-area-inset-right))'
                        : 720,
                      maxWidth: 'calc(100vw - 32px)',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 30px 80px rgba(15,23,42,0.30)',
                      transition: smoothTransition,
                      willChange: 'transform',
                    }
                  : { display: 'none' }
              }
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: colors.text, lineHeight: 1 }}>
                    {editandoId ? 'Editar OS' : 'Nova OS'}
                  </div>

                  <div style={{ color: colors.muted, marginTop: 6 }}>
                    Cadastro completo com cliente, status, prioridade e controle financeiro.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => setFormAberto(false)} style={premiumGhostButton}>
                    Fechar
                  </button>

                  <button
                    onClick={() => setMostrarImportarOrcamento((v) => !v)}
                    style={{
                      ...premiumGreenButton,
                      minHeight: 40,
                      minWidth: 170,
                      borderRadius: 14,
                      fontSize: 12,
                      padding: '0 15px',
                    }}
                  >
                    Importar orçamento
                  </button>

                  <div
                    style={{
                      background: darkMode ? '#0f172a' : '#e2e8f0',
                      color: darkMode ? '#fff' : '#0f172a',
                      borderRadius: 999,
                      padding: '10px 16px',
                      fontWeight: 900,
                    }}
                  >
                    Nº {form.numero}
                  </div>
                </div>
              </div>

              {mostrarImportarOrcamento && (
                <div style={{ marginBottom: 14, position: 'relative' }}>
                  <label style={labelStyle}>📄 Importar orçamento salvo</label>

                  <input
                    style={inputStyle}
                    placeholder="Buscar por número, cliente ou status..."
                    value={buscaOrcamento}
                    onChange={(e) => setBuscaOrcamento(e.target.value)}
                  />

                  <div
                    style={{
                      marginTop: 10,
                      background: colors.card,
                      border: `1px solid ${colors.inputBorder}`,
                      borderRadius: 12,
                      boxShadow: '0 12px 24px rgba(0,0,0,0.10)',
                      zIndex: 50,
                      maxHeight: 240,
                      overflowY: 'auto',
                    }}
                  >
                    {orcamentosDisponiveis.length === 0 ? (
                      <div style={{ padding: '12px 14px', color: '#64748b' }}>
                        Nenhum orçamento disponível para importar.
                      </div>
                    ) : (
                      orcamentosDisponiveis.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => importarOrcamento(item)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            border: 'none',
                            background: '#08111f',
                            color: '#f8fafc',
                            cursor: 'pointer',
                            padding: '12px 14px',
                            borderBottom: `1px solid ${colors.inputBorder}`,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 900,
                              color: '#f8fafc',
                              fontSize: 14,
                              textTransform: 'uppercase',
                            }}
                          >
                            {item.numero} • {item.cliente?.nome || 'Sem cliente'}
                          </div>

                          <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, fontWeight: 700 }}>
                            {item.status || 'Pendente'} • {moeda(item.total)}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14, position: 'relative' }}>
                <label style={labelStyle}>🔎 Puxar cliente cadastrado</label>

                <input
                  style={inputStyle}
                  placeholder="Digite nome, telefone, CPF/CNPJ..."
                  value={buscaCliente}
                  onChange={(e) => {
                    setBuscaCliente(e.target.value)
                    setMostrarBuscaCliente(true)
                  }}
                  onFocus={() => setMostrarBuscaCliente(true)}
                />

                {mostrarBuscaCliente && clientesFiltrados.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 74,
                      left: 0,
                      right: 0,
                      background: colors.card,
                      border: `1px solid ${colors.inputBorder}`,
                      borderRadius: 12,
                      boxShadow: '0 12px 24px rgba(0,0,0,0.10)',
                      zIndex: 50,
                      maxHeight: 220,
                      overflowY: 'auto',
                    }}
                  >
                    {clientesFiltrados.map((item, index) => (
                      <button
                        key={`${item.id ?? item.codigo ?? item.nome ?? index}`}
                        type="button"
                        onClick={() => selecionarCliente(item)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: '#08111f',
                          cursor: 'pointer',
                          padding: '12px 14px',
                          borderBottom: `1px solid ${colors.inputBorder}`,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 900,
                            color: '#f8fafc',
                            fontSize: 14,
                            textTransform: 'uppercase',
                          }}
                        >
                          {item.nome || 'Sem nome'}
                        </div>

                        <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, fontWeight: 700 }}>
                          {[item.telefone || item.whatsapp, item.email].filter(Boolean).join(' • ')}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <Campo label="👤 Cliente" value={form.cliente} onChange={(v) => atualizar('cliente', v)} inputStyle={inputStyle} />
                <Campo label="📞 Telefone" value={form.telefone} onChange={(v) => atualizar('telefone', v)} inputStyle={inputStyle} />
                <Campo label="✉️ E-mail" value={form.email} onChange={(v) => atualizar('email', v)} inputStyle={inputStyle} />
                <Campo label="📍 Endereço" value={form.endereco} onChange={(v) => atualizar('endereco', v)} inputStyle={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 12 }}>
                <Campo label="🖨️ Equipamento" value={form.equipamento} onChange={(v) => atualizar('equipamento', v)} inputStyle={inputStyle} />
                <Campo label="🔐 Serial / IMEI" value={form.serial} onChange={(v) => atualizar('serial', v)} inputStyle={inputStyle} />
                <Campo label="🏷️ Marca" value={form.marca} onChange={(v) => atualizar('marca', v)} inputStyle={inputStyle} />
                <Campo label="🔧 Modelo" value={form.modelo} onChange={(v) => atualizar('modelo', v)} inputStyle={inputStyle} />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr',
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <SelectCampo label="🛠️ Status" value={form.status} onChange={(v) => atualizar('status', v)} options={STATUS_OPTIONS} inputStyle={inputStyle} />
                <SelectCampo label="🚨 Prioridade" value={form.prioridade} onChange={(v) => atualizar('prioridade', v)} options={PRIORIDADE_OPTIONS} inputStyle={inputStyle} />
                <Campo label="👨‍🔧 Técnico" value={form.tecnico} onChange={(v) => atualizar('tecnico', v)} inputStyle={inputStyle} />
                <Campo label="📅 Previsão" type="date" value={form.previsao || hojeInput()} onChange={(v) => atualizar('previsao', v)} inputStyle={inputStyle} />
              </div>

              <div style={{ marginTop: 12 }}>
                <TextAreaCampo label="⚠️ Defeito informado" value={form.defeito} onChange={(v) => atualizar('defeito', v)} inputStyle={inputStyle} />
              </div>

              <div style={{ marginTop: 12 }}>
                <TextAreaCampo label="📦 Checklist / acessórios" value={form.checklist} onChange={(v) => atualizar('checklist', v)} inputStyle={inputStyle} />
              </div>

              <div style={{ marginTop: 12 }}>
                <TextAreaCampo label="📝 Observação" value={form.observacao} onChange={(v) => atualizar('observacao', v)} inputStyle={inputStyle} />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <Campo
                  label="💰 Valor do serviço"
                  type="number"
                  value={String(form.valor || 0)}
                  onChange={(v) => atualizar('valor', Number(v || 0))}
                  inputStyle={inputStyle}
                />

                <Campo
                  label="💵 Entrada"
                  type="number"
                  value={String(form.entrada || 0)}
                  onChange={(v) => atualizar('entrada', Number(v || 0))}
                  inputStyle={inputStyle}
                />

                <div>
                  <label style={labelStyle}>📌 Saldo</label>
                  <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', fontWeight: 800 }}>{moeda(form.saldo)}</div>
                </div>
              </div>

              <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button onClick={limpar} style={{ ...premiumGhostButton, minWidth: 110 }}>
                  Limpar
                </button>

                <button
                  onClick={salvar}
                  style={{ ...premiumBlueButton, minHeight: 42, minWidth: 150, borderRadius: 14, fontSize: 13 }}
                >
                  {editandoId ? 'Atualizar OS' : 'Salvar OS'}
                </button>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 24, fontWeight: 900, color: colors.text, lineHeight: 1 }}>Gestão de OS</div>

              <div style={{ color: colors.muted, marginTop: 6, marginBottom: 14 }}>
                Pesquisa rápida, filtros por status, prioridade e lista completa.
              </div>

              <input
                style={{ ...inputStyle, marginBottom: 12 }}
                placeholder="Buscar por número, cliente, equipamento, serial..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <SelectCampo label="Filtro status" value={filtroStatus} onChange={setFiltroStatus} options={['Todos', ...STATUS_OPTIONS]} inputStyle={inputStyle} />

                <SelectCampo
                  label="Filtro prioridade"
                  value={filtroPrioridade}
                  onChange={setFiltroPrioridade}
                  options={['Todas', ...PRIORIDADE_OPTIONS]}
                  inputStyle={inputStyle}
                />

                <SelectCampo
                  label="Ordenação"
                  value={ordem}
                  onChange={(v) => setOrdem(v as 'recentes' | 'antigas' | 'cliente')}
                  options={['recentes', 'antigas', 'cliente']}
                  inputStyle={inputStyle}
                />
              </div>

              <div
                style={{
                  background: colors.inputBg,
                  border: `1px solid ${colors.inputBorder}`,
                  borderRadius: 999,
                  padding: '8px 14px',
                  fontWeight: 800,
                  color: colors.text,
                  display: 'inline-block',
                  marginBottom: 12,
                }}
              >
                {listaFiltrada.length} registro(s)
              </div>

              {isMobile ? (
                <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: '100%' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: colors.muted, margin: '0 0 2px 2px' }}>
                    Lista ajustada para celular: status, valor e ações aparecem no cartão.
                  </div>

                  {listaFiltrada.length === 0 ? (
                    <div
                      style={{
                        border: `1px solid ${colors.inputBorder}`,
                        background: colors.card,
                        borderRadius: 18,
                        padding: 16,
                        color: colors.muted,
                        fontWeight: 800,
                      }}
                    >
                      Nenhuma ordem de serviço encontrada.
                    </div>
                  ) : (
                    listaFiltrada.map((item) => {
                      const itemCorrigido = normalizarItem(item)
                      const statusCor = corStatus(itemCorrigido.status)
                      const prioridadeCor = corPrioridade(itemCorrigido.prioridade)

                      return (
                        <div
                          key={itemCorrigido.id}
                          style={{
                            border: `1px solid ${colors.inputBorder}`,
                            background: colors.card,
                            borderRadius: 20,
                            padding: 14,
                            boxShadow: darkMode ? '0 14px 35px rgba(0,0,0,.28)' : '0 14px 35px rgba(15,23,42,.08)',
                            width: '100%',
                            maxWidth: '100%',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: colors.muted,
                                  fontWeight: 950,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.5,
                                }}
                              >
                                OS #{itemCorrigido.numero}
                              </div>

                              <div
                                style={{
                                  fontSize: 18,
                                  color: colors.text,
                                  fontWeight: 950,
                                  lineHeight: 1.1,
                                  marginTop: 4,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {itemCorrigido.cliente || '-'}
                              </div>

                              <div style={{ fontSize: 12, color: colors.muted, fontWeight: 800, marginTop: 4, overflowWrap: 'anywhere' }}>
                                {[itemCorrigido.equipamento, itemCorrigido.marca, itemCorrigido.modelo].filter(Boolean).join(' • ') || '-'}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 11, color: colors.muted, fontWeight: 900 }}>Valor</div>
                              <div style={{ fontSize: 16, color: '#16a34a', fontWeight: 950 }}>{moeda(itemCorrigido.valor)}</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                            <span style={{ background: statusCor.bg, color: statusCor.color, borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 950 }}>
                              {itemCorrigido.status}
                            </span>

                            <span
                              style={{
                                background: prioridadeCor.bg,
                                color: prioridadeCor.color,
                                borderRadius: 999,
                                padding: '6px 10px',
                                fontSize: 11,
                                fontWeight: 950,
                              }}
                            >
                              {itemCorrigido.prioridade}
                            </span>

                            <span
                              style={{
                                background: colors.cardSoft,
                                color: colors.muted,
                                border: `1px solid ${colors.inputBorder}`,
                                borderRadius: 999,
                                padding: '6px 10px',
                                fontSize: 11,
                                fontWeight: 900,
                              }}
                            >
                              {itemCorrigido.data || '-'}
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
                            <button type="button" className="connect-os-action-btn" title="Visualizar" onClick={() => void abrir(itemCorrigido)} style={mobileActionButton(colors, 'blue')}>
                              👁 Ver
                            </button>
                            <button
                              type="button"
                              className={`connect-os-action-btn connect-zap-btn${zapOsCarregando === itemCorrigido.id ? ' connect-zap-btn--loading' : ''}`}
                              title="WhatsApp"
                              disabled={zapOsCarregando === itemCorrigido.id}
                              onClick={() => void enviarWhatsAppOS(itemCorrigido)}
                              style={mobileActionButton(colors, 'green')}
                            >
                              {zapOsCarregando === itemCorrigido.id ? '⏳ Abrindo…' : '📲 Zap'}
                            </button>
                            <button type="button" className="connect-os-action-btn" title="Link OS" onClick={() => void copiarLink(itemCorrigido)} style={mobileActionButton(colors, 'green')}>
                              🔗 OS
                            </button>
                            {Number(itemCorrigido.orcamentoId || 0) > 0 ? (
                              <button type="button" className="connect-os-action-btn" title="Link orçamento" onClick={() => void copiarLinkOrcamento(itemCorrigido)} style={mobileActionButton(colors, 'blue')}>
                                📄 Orç.
                              </button>
                            ) : null}
                            <button type="button" className="connect-os-action-btn" title="Receber pagamento" onClick={() => abrirRecebimentoOS(itemCorrigido)} style={mobileActionButton(colors, 'green')}>
                              💰 Receber
                            </button>
                            <button type="button" className="connect-os-action-btn" title="Emitir recibo" onClick={() => emitirReciboOS(itemCorrigido)} style={mobileActionButton(colors, 'dark')}>
                              🧾 Recibo
                            </button>
                            <button type="button" className="connect-os-action-btn" title="Editar" onClick={() => editar(itemCorrigido)} style={mobileActionButton(colors, 'blue')}>
                              ✎ Editar
                            </button>
                            <button type="button" className="connect-os-action-btn" title="Duplicar" onClick={() => duplicar(itemCorrigido)} style={mobileActionButton(colors, 'dark')}>
                              ⧉ Duplicar
                            </button>
                            <button type="button" className="connect-os-action-btn" title="Excluir" onClick={() => excluir(itemCorrigido.id)} style={mobileActionButton(colors, 'red')}>
                              🗑 Excluir
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              ) : (
                <div className="connect-os-lista-limite" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
                  <div
                    ref={osTableRef}
                    onScroll={atualizarBarraOs}
                    className="connect-mobile-scroll connect-os-table-scroll"
                    data-scroll-hint="false"
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      minWidth: 0,
                      overflowX: 'auto',
                      overflowY: 'hidden',
                      WebkitOverflowScrolling: 'touch',
                      touchAction: 'pan-x pan-y',
                      overscrollBehaviorX: 'contain',
                      border: `1px solid ${colors.inputBorder}`,
                      borderRadius: 14,
                      background: colors.card,
                      paddingBottom: 0,
                    }}
                  >
                    <table style={{ width: 'max-content', minWidth: 920, borderCollapse: 'collapse', userSelect: 'none' }}>
                      <thead>
                        <tr style={{ background: darkMode ? '#111827' : '#f8fafc', color: colors.muted, textAlign: 'left' }}>
                          <th style={thStyle}>Nº OS</th>
                          <th style={thStyle}>Cliente / Equipamento</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Prioridade</th>
                          <th style={thStyle}>Abertura</th>
                          <th style={thStyle}>Valor</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>

                      <tbody>
                        {listaFiltrada.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: 18, color: colors.muted }}>
                              Nenhuma ordem de serviço encontrada.
                            </td>
                          </tr>
                        ) : (
                          listaFiltrada.map((item) => {
                            const itemCorrigido = normalizarItem(item)
                            const statusCor = corStatus(itemCorrigido.status)
                            const prioridadeCor = corPrioridade(itemCorrigido.prioridade)

                            return (
                              <tr
                                key={itemCorrigido.id}
                                style={{ borderTop: `1px solid ${colors.inputBorder}`, transition: 'background .16s ease, transform .16s ease' }}
                              >
                                <td style={tdStyle}>
                                  <strong>#{itemCorrigido.numero}</strong>
                                </td>

                                <td style={tdStyle}>
                                  <div style={{ fontWeight: 900, color: colors.text, lineHeight: 1.2 }}>{itemCorrigido.cliente || '-'}</div>
                                  <div style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                                    {[itemCorrigido.equipamento, itemCorrigido.marca, itemCorrigido.modelo].filter(Boolean).join(' • ') || '-'}
                                  </div>
                                </td>

                                <td style={tdStyle}>
                                  <span
                                    style={{
                                      background: statusCor.bg,
                                      color: statusCor.color,
                                      borderRadius: 999,
                                      padding: '4px 8px',
                                      fontSize: 10,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {itemCorrigido.status}
                                  </span>
                                </td>

                                <td style={tdStyle}>
                                  <span
                                    style={{
                                      background: prioridadeCor.bg,
                                      color: prioridadeCor.color,
                                      borderRadius: 999,
                                      padding: '4px 8px',
                                      fontSize: 10,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {itemCorrigido.prioridade}
                                  </span>
                                </td>

                                <td style={tdStyle}>{itemCorrigido.data || '-'}</td>

                                <td style={tdStyle}>
                                  <strong>{moeda(itemCorrigido.valor)}</strong>
                                </td>

                                <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <button title="Visualizar" type="button" onClick={() => void abrir(itemCorrigido)} style={iconButton(colors, 'blue')}>
                                    👁
                                  </button>
                                  <button title="Link OS" type="button" onClick={() => void copiarLink(itemCorrigido)} style={iconButton(colors, 'green')}>
                                    🔗
                                  </button>
                                  {Number(itemCorrigido.orcamentoId || 0) > 0 ? (
                                    <button title="Link orçamento (sua logo)" type="button" onClick={() => void copiarLinkOrcamento(itemCorrigido)} style={iconButton(colors, 'blue')}>
                                      📄
                                    </button>
                                  ) : null}
                                  <button title="Receber pagamento" onClick={() => abrirRecebimentoOS(itemCorrigido)} style={iconButton(colors, 'green')}>
                                    💰
                                  </button>
                                  <button title="Emitir recibo" onClick={() => emitirReciboOS(itemCorrigido)} style={iconButton(colors, 'dark')}>
                                    🧾
                                  </button>
                                  <button
                                    title="WhatsApp"
                                    type="button"
                                    className={`connect-os-action-btn connect-zap-btn${zapOsCarregando === itemCorrigido.id ? ' connect-zap-btn--loading' : ''}`}
                                    disabled={zapOsCarregando === itemCorrigido.id}
                                    onClick={() => void enviarWhatsAppOS(itemCorrigido)}
                                    style={iconButton(colors, 'green')}
                                  >
                                    {zapOsCarregando === itemCorrigido.id ? '⏳' : '📲'}
                                  </button>
                                  <button title="Editar" onClick={() => editar(itemCorrigido)} style={iconButton(colors, 'blue')}>
                                    ✎
                                  </button>
                                  <button title="Duplicar" onClick={() => duplicar(itemCorrigido)} style={iconButton(colors, 'dark')}>
                                    ⧉
                                  </button>
                                  <button title="Excluir" onClick={() => excluir(itemCorrigido.id)} style={iconButton(colors, 'red')}>
                                    🗑
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

const tdStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 11,
  verticalAlign: 'middle',
}

function mobileActionButton(
  colors: { text: string; cardSoft: string; border: string },
  tone: 'blue' | 'green' | 'red' | 'dark' = 'dark'
): React.CSSProperties {
  return {
    ...iconButton(colors, tone),
    width: '100%',
    height: 40,
    borderRadius: 14,
    marginLeft: 0,
    fontSize: 11,
    fontWeight: 950,
    padding: '0 8px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  }
}

function iconButton(
  colors: { text: string; cardSoft: string; border: string },
  tone: 'blue' | 'green' | 'red' | 'dark' = 'dark'
): React.CSSProperties {
  const map = {
    blue: {
      bg: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
      border: 'rgba(96,165,250,.50)',
      color: '#fff',
      shadow: '0 8px 16px rgba(37,99,235,.22)',
    },
    green: {
      bg: 'linear-gradient(135deg,#16a34a,#065f46)',
      border: 'rgba(34,197,94,.45)',
      color: '#fff',
      shadow: '0 8px 16px rgba(34,197,94,.20)',
    },
    red: {
      bg: 'linear-gradient(135deg,#ef4444,#991b1b)',
      border: 'rgba(248,113,113,.45)',
      color: '#fff',
      shadow: '0 8px 16px rgba(239,68,68,.18)',
    },
    dark: {
      bg: colors.cardSoft,
      border: colors.border,
      color: colors.text,
      shadow: '0 8px 16px rgba(15,23,42,.08)',
    },
  }[tone]

  return {
    width: 28,
    height: 28,
    marginLeft: 4,
    borderRadius: 10,
    border: `1px solid ${map.border}`,
    background: map.bg,
    color: map.color,
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 10,
    verticalAlign: 'middle',
    boxShadow: map.shadow,
    transition: 'transform .16s ease, box-shadow .16s ease, opacity .16s ease',
    willChange: 'transform',
  }
}

function ResumoCard({ titulo, valor, darkMode }: { titulo: string; valor: string; darkMode?: boolean }) {
  const isMoney = titulo.toLowerCase().includes('saldo')

  return (
    <div
      style={{
        background: darkMode
          ? 'linear-gradient(135deg, rgba(15,23,42,.96), rgba(30,41,59,.92))'
          : 'linear-gradient(135deg,#ffffff,#f8fbff)',
        borderRadius: 18,
        padding: 16,
        border: isMoney ? '1px solid rgba(34,197,94,.30)' : '1px solid rgba(37,99,235,0.18)',
        boxShadow: isMoney
          ? '0 14px 30px rgba(34,197,94,.12)'
          : darkMode
            ? '0 12px 28px rgba(0,0,0,0.18)'
            : '0 12px 28px rgba(15,23,42,0.06)',
        transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          color: darkMode ? '#94a3b8' : '#64748b',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {titulo}
      </div>

      <div style={{ fontSize: 24, fontWeight: 950, color: isMoney ? '#16a34a' : darkMode ? '#f8fafc' : '#0f172a', lineHeight: 1 }}>
        {valor}
      </div>
    </div>
  )
}

function Campo({
  label,
  value,
  onChange,
  inputStyle,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputStyle: React.CSSProperties
  type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800, color: '#64748b' }}>
        {label}
      </label>

      <input type={type} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function SelectCampo({
  label,
  value,
  onChange,
  options,
  inputStyle,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  inputStyle: React.CSSProperties
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800, color: '#64748b' }}>
        {label}
      </label>

      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
    </div>
  )
}

function TextAreaCampo({
  label,
  value,
  onChange,
  inputStyle,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputStyle: React.CSSProperties
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800, color: '#64748b' }}>
        {label}
      </label>

      <textarea
        style={{
          ...inputStyle,
          minHeight: 82,
          resize: 'vertical',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
