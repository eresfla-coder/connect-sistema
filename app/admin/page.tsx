'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase-browser'
import { isAdminMaster } from '@/lib/access'
import AdminAssinaturasMetricas from '@/components/admin/AdminAssinaturasMetricas'
import ModalRenovacaoManual, { type FormRenovacao } from '@/components/admin/ModalRenovacaoManual'
import { WHATSAPP_FALLBACK_EVENT, abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'
import type { ReciboRenovacaoManual } from '@/lib/renovacaoManual'

type FiltroStatus = 'todos' | 'trial' | 'ativo' | 'bloqueado' | 'vencidos' | 'risco'
type TipoNovoCliente = 'trial' | 'ativo'

type PerfilAdmin = {
  id: string
  email: string | null
  ativo: boolean | null
  vencimento: string | null
  status: string | null
  plano_tier?: string | null
  data_criacao?: string | null
  valor_plano?: number | null
  telefone?: string | null
  nome_empresa?: string | null
  ultimo_pagamento?: string | null
  status_pagamento?: string | null
  sistema_cliente?: string | null
  observacoes?: string | null
}

type SessaoAtiva = {
  user_id?: string | null
  email?: string | null
  device_label?: string | null
  ip_address?: string | null
  last_seen_at?: string | null
  updated_at?: string | null
}

type NovoClienteForm = {
  email: string
  nome_empresa: string
  telefone: string
  valor_plano: string
  tipo: TipoNovoCliente
  sistema_cliente: string
  observacoes: string
  criar_acesso: boolean
}

type EditForm = {
  id: string
  email: string
  nome_empresa: string
  telefone: string
  valor_plano: string
  status: string
  plano_tier: string
  vencimento: string
  sistema_cliente: string
  observacoes: string
}

type UsoSistema = {
  clientes: number
  produtos: number
  orcamentos: number
  ordens: number
  financeiro: number
  crm: number
}

type MetaCliente = {
  sistema_cliente?: string
  observacoes?: string
}

type DesktopActionMenuState = {
  cliente: PerfilAdmin
  anchorRect: {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }
  top: number
  left: number
  placement: 'top' | 'bottom'
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
const LOGIN_URL = `${SITE_URL}/login`
const META_KEY = 'connect_admin_clientes_meta_v2'

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function toMoney(valor?: number | null): string {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseMoney(value: string | number | null | undefined): number {
  const normalized = String(value ?? '0').replace(/\./g, '').replace(',', '.')
  const numero = Number(normalized)
  return Number.isFinite(numero) ? numero : 0
}

function dataMaisDias(dias: number): string {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return data.toISOString().slice(0, 10)
}

function daysUntil(dateText: string | null | undefined): number | null {
  if (!dateText) return null
  const today = new Date()
  const target = new Date(`${dateText}T00:00:00`)
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function isPermanent(profile: PerfilAdmin): boolean {
  return profile.vencimento === '2099-12-31' || Number(profile.valor_plano || 0) === 0
}

function prazoLabel(profile: PerfilAdmin): string {
  if (isPermanent(profile)) return 'Permanente'
  const dias = daysUntil(profile.vencimento)
  if (dias === null) return 'Sem vencimento'
  if (dias < 0) return `Atrasado ${Math.abs(dias)}d`
  if (dias === 0) return 'Vence hoje'
  if (dias === 1) return '1 dia'
  return `${dias} dias`
}

function prazoColor(profile: PerfilAdmin): string {
  if (isPermanent(profile)) return '#22c55e'
  const dias = daysUntil(profile.vencimento)
  if (dias === null) return '#94a3b8'
  if (dias < 0) return '#ef4444'
  if (dias <= 3) return '#fb7185'
  if (dias <= 7) return '#facc15'
  return '#22c55e'
}

function linksWhatsappFallback(url: string) {
  try {
    const parsed = new URL(String(url || '').trim())
    let phone = ''
    let text = ''

    if (parsed.hostname.includes('wa.me')) {
      phone = parsed.pathname.replace(/\//g, '').replace(/\D/g, '')
      text = parsed.searchParams.get('text') || ''
      const textoDecodificado = decodeURIComponent(text.replace(/\+/g, ' '))
      const encoded = encodeURIComponent(textoDecodificado)
      const principal = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`
      const alternativa = phone
        ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
        : `https://api.whatsapp.com/send?text=${encoded}`
      return { principal, alternativa }
    }

    phone = (parsed.searchParams.get('phone') || '').replace(/\D/g, '')
    text = parsed.searchParams.get('text') || ''
    const textoDecodificado = decodeURIComponent(text.replace(/\+/g, ' '))
    const encoded = encodeURIComponent(textoDecodificado)
    const principal = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`
    const alternativa = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`
    return { principal, alternativa }
  } catch {
    return { principal: String(url || ''), alternativa: String(url || '') }
  }
}

function statusColor(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase()
  if (s === 'ativo') return '#22c55e'
  if (s === 'trial' || s === 'teste') return '#facc15'
  if (s === 'bloqueado') return '#ef4444'
  if (s === 'vencido') return '#fb7185'
  return '#94a3b8'
}

function statusTrialAdmin(status?: string | null) {
  const s = String(status || '').toLowerCase()
  return s === 'trial' || s === 'teste'
}

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

function whatsappDestino(value?: string | null) {
  const tel = normalizePhone(value)
  if (!tel) return ''
  if (tel.startsWith('55')) return tel
  return `55${tel}`
}

function readMeta(): Record<string, MetaCliente> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeMeta(meta: Record<string, MetaCliente>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

function planoCliente(cliente: PerfilAdmin) {
  const valor = Number(cliente.valor_plano || 0)
  if (valor <= 0 || isPermanent(cliente)) return { nome: 'Founder', limite: 'Ilimitado', cor: '#22c55e' }
  if (valor >= 400) return { nome: 'Anual', limite: 'Recorrência anual', cor: '#a78bfa' }
  return { nome: 'Mensal', limite: 'Recorrência mensal', cor: '#60a5fa' }
}

function riscoCliente(cliente: PerfilAdmin) {
  const status = String(cliente.status || '').toLowerCase()
  const dias = daysUntil(cliente.vencimento)
  if (status === 'bloqueado' || cliente.ativo === false) return { nivel: 'bloqueado', texto: 'Bloqueado', cor: '#ef4444' }
  if (!isPermanent(cliente) && dias !== null && dias < 0) return { nivel: 'critico', texto: 'Atrasado', cor: '#ef4444' }
  if (!isPermanent(cliente) && dias !== null && dias <= 3) return { nivel: 'atenção', texto: 'Atenção', cor: '#facc15' }
  if (status === 'trial') return { nivel: 'trial', texto: 'Trial', cor: '#38bdf8' }
  return { nivel: 'ok', texto: 'Saudável', cor: '#22c55e' }
}

export default function AdminSaasMasterPage() {
  const router = useRouter()
  const [clientes, setClientes] = useState<PerfilAdmin[]>([])
  const [sessoes, setSessoes] = useState<SessaoAtiva[]>([])
  const [uso, setUso] = useState<UsoSistema>({ clientes: 0, produtos: 0, orcamentos: 0, ordens: 0, financeiro: 0, crm: 0 })
  const [metaLocal, setMetaLocal] = useState<Record<string, MetaCliente>>({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  const [aba, setAba] = useState<'clientes' | 'sessoes' | 'metricas'>('clientes')
  const [desktopActionMenu, setDesktopActionMenu] = useState<DesktopActionMenuState | null>(null)
  const desktopActionMenuRef = useRef<HTMLDivElement | null>(null)
  const [desktopActionMenuAnimIn, setDesktopActionMenuAnimIn] = useState(false)
  const [acaoProcessandoId, setAcaoProcessandoId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingNew, setSavingNew] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteText, setInviteText] = useState('')
  const [invitePhone, setInvitePhone] = useState('')
  const [renovarOpen, setRenovarOpen] = useState(false)
  const [renovarCliente, setRenovarCliente] = useState<PerfilAdmin | null>(null)
  const [renovarProcessando, setRenovarProcessando] = useState(false)
  const [renovarResultado, setRenovarResultado] = useState<{
    mensagemWhatsapp: string
    whatsappUrl: string
    recibo: ReciboRenovacaoManual
  } | null>(null)
  const [isMobileAdmin, setIsMobileAdmin] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [acaoClienteMobile, setAcaoClienteMobile] = useState<PerfilAdmin | null>(null)
  const [whatsFallbackUrl, setWhatsFallbackUrl] = useState('')
  const [novoCliente, setNovoCliente] = useState<NovoClienteForm>({
    email: '',
    nome_empresa: '',
    telefone: '',
    valor_plano: '49,90',
    tipo: 'trial',
    sistema_cliente: 'Connect Sistema',
    observacoes: '',
    criar_acesso: true,
  })

  useEffect(() => {
    setMetaLocal(readMeta())
    void carregarTudo()
  }, [])

  useEffect(() => {
    const aoFallback = (event: Event) => {
      const custom = event as CustomEvent<{ url?: string }>
      const url = String(custom?.detail?.url || '')
      if (url) setWhatsFallbackUrl(url)
    }
    window.addEventListener(WHATSAPP_FALLBACK_EVENT, aoFallback as EventListener)
    return () => window.removeEventListener(WHATSAPP_FALLBACK_EVENT, aoFallback as EventListener)
  }, [])

  useEffect(() => {
    const verificar = () => {
      const mobile = window.innerWidth < 900
      setIsMobileAdmin(mobile)
      if (!mobile) {
        setMobileDrawerOpen(false)
        setAcaoClienteMobile(null)
      }
      if (mobile) setDesktopActionMenu(null)
    }
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    function fecharMenus(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-action-menu]') && !target?.closest('[data-action-popover]')) {
        setDesktopActionMenu(null)
      }
    }
    document.addEventListener('mousedown', fecharMenus)
    return () => document.removeEventListener('mousedown', fecharMenus)
  }, [])

  useEffect(() => {
    if (!desktopActionMenu) {
      setDesktopActionMenuAnimIn(false)
      return
    }
    setDesktopActionMenuAnimIn(false)
    const id = requestAnimationFrame(() => setDesktopActionMenuAnimIn(true))
    return () => cancelAnimationFrame(id)
  }, [desktopActionMenu?.cliente.id])

  useLayoutEffect(() => {
    if (!desktopActionMenu) return
    const menu = desktopActionMenuRef.current
    if (!menu) return

    const viewportPadding = 12
    const gap = 8
    const vw = window.innerWidth
    const vh = window.innerHeight

    const rect = menu.getBoundingClientRect()
    const menuW = rect.width
    const menuH = rect.height

    const anchor = desktopActionMenu.anchorRect
    const preferredLeft = anchor.left + anchor.width / 2 - menuW / 2
    const preferredTopBelow = anchor.bottom + gap
    const preferredTopAbove = anchor.top - gap - menuH

    const spaceBelow = vh - anchor.bottom
    const spaceAbove = anchor.top
    const openUpwards = spaceBelow < menuH + gap && spaceAbove > spaceBelow

    let nextLeft = preferredLeft
    let nextTop = openUpwards ? preferredTopAbove : preferredTopBelow

    nextLeft = Math.max(viewportPadding, Math.min(vw - viewportPadding - menuW, nextLeft))
    nextTop = Math.max(viewportPadding, Math.min(vh - viewportPadding - menuH, nextTop))

    const placement: DesktopActionMenuState['placement'] = openUpwards ? 'top' : 'bottom'
    const changed =
      Math.abs((desktopActionMenu.left ?? 0) - nextLeft) > 0.5 ||
      Math.abs((desktopActionMenu.top ?? 0) - nextTop) > 0.5 ||
      desktopActionMenu.placement !== placement

    if (!changed) return
    setDesktopActionMenu((prev) => (prev ? { ...prev, left: nextLeft, top: nextTop, placement } : prev))
  }, [desktopActionMenu])

  function clienteSistema(cliente: PerfilAdmin) {
    return cliente.sistema_cliente || metaLocal[cliente.id]?.sistema_cliente || 'Connect Sistema'
  }

  function clienteObs(cliente: PerfilAdmin) {
    return cliente.observacoes || metaLocal[cliente.id]?.observacoes || ''
  }

  async function sairPainel() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function safeCount(table: string): Promise<number> {
    try {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
      if (error) return 0
      return count || 0
    } catch {
      return 0
    }
  }

  async function carregarTudo() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const email = (user.email || '').trim().toLowerCase()
    if (!isAdminMaster(email)) {
      router.push('/dashboard')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch('/api/admin/clientes', {
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
    })

    const payload = await response.json()

    if (!response.ok) {
      console.error('ADMIN_PERFIS_ERROR', payload?.error)
      setClientes([])
    } else {
      setClientes((payload?.clientes as PerfilAdmin[]) || [])
    }

    try {
      const { data: sessaoData } = await supabase
        .from('sessoes_ativas')
        .select('user_id,email,device_label,ip_address,last_seen_at,updated_at')
        .order('last_seen_at', { ascending: false })
        .limit(40)
      setSessoes((sessaoData as SessaoAtiva[]) || [])
    } catch {
      setSessoes([])
    }

    const [clientesCount, produtos, orcamentos, ordens, financeiro, crm] = await Promise.all([
      safeCount('clientes'),
      safeCount('produtos'),
      safeCount('orcamentos'),
      safeCount('ordens_servico'),
      safeCount('financeiro'),
      safeCount('crm_interacoes'),
    ])

    setUso({ clientes: clientesCount, produtos, orcamentos, ordens, financeiro, crm })
    setLoading(false)
  }

  async function refreshClientes() {
    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch('/api/admin/clientes', {
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
    })

    const payload = await response.json()

    if (response.ok) {
      setClientes((payload?.clientes as PerfilAdmin[]) || [])
    }
  }

  async function atualizarCliente(id: string, updates: Partial<PerfilAdmin>) {
    try {
      setAcaoProcessandoId(id)

      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.')

      const response = await fetch('/api/admin/clientes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id,
          updates,
          admin_email: session?.user?.email || '',
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.error || 'Não foi possível concluir a ação.')
      }

      await refreshClientes()
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Não foi possível concluir a ação.')
    } finally {
      setAcaoProcessandoId(null)
    }
  }

  async function trial7(id: string) {
    await atualizarCliente(id, {
      status: 'trial',
      ativo: true,
      vencimento: dataMaisDias(7),
      status_pagamento: 'trial',
      ultimo_pagamento: null,
    })
  }

  async function ativar(dias: number, id: string) {
    await atualizarCliente(id, {
      status: 'ativo',
      ativo: true,
      plano_tier: 'starter',
      vencimento: dataMaisDias(dias),
      status_pagamento: 'em_dia',
      ultimo_pagamento: hojeISO(),
    })
  }

  async function marcarComoPago(id: string) {
    await atualizarCliente(id, {
      status: 'ativo',
      ativo: true,
      plano_tier: 'starter',
      vencimento: dataMaisDias(30),
      status_pagamento: 'pago',
      ultimo_pagamento: hojeISO(),
    })
  }

  function abrirRenovacaoManual(cliente: PerfilAdmin) {
    setRenovarCliente(cliente)
    setRenovarResultado(null)
    setRenovarOpen(true)
    setDesktopActionMenu(null)
    setAcaoClienteMobile(null)
  }

  async function confirmarRenovacaoManual(form: FormRenovacao) {
    if (!renovarCliente) return
    try {
      setRenovarProcessando(true)
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.')

      const valor = parseMoney(form.valor_pago)
      const response = await fetch('/api/admin/clientes/renovar-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: renovarCliente.id,
          plano_tier: form.plano_tier,
          valor_pago: valor,
          forma_pagamento: form.forma_pagamento,
          data_pagamento: form.data_pagamento,
          proxima_validade: form.proxima_validade,
          observacao: form.observacao,
          admin_email: session?.user?.email || '',
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível renovar o cliente.')

      setRenovarResultado({
        mensagemWhatsapp: String(payload.mensagemWhatsapp || ''),
        whatsappUrl: String(payload.whatsappUrl || ''),
        recibo: payload.recibo as ReciboRenovacaoManual,
      })
      await refreshClientes()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao renovar.'
      alert(msg)
    } finally {
      setRenovarProcessando(false)
    }
  }

  function fecharRenovacaoManual() {
    setRenovarOpen(false)
    setRenovarCliente(null)
    setRenovarResultado(null)
  }

  async function bloquear(id: string) {
    await atualizarCliente(id, {
      status: 'bloqueado',
      ativo: false,
      status_pagamento: 'bloqueado',
    })
  }

  async function excluirCliente(cliente: PerfilAdmin) {
    const nome = cliente.nome_empresa || cliente.email || 'este cliente'
    const confirmar = confirm(`Excluir definitivamente ${nome}?\n\nEssa ação remove o cliente do painel admin e também tenta remover o acesso de login.`)

    if (!confirmar) return

    try {
      setAcaoProcessandoId(cliente.id)
      setDesktopActionMenu(null)
      setAcaoClienteMobile(null)

      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.')

      const response = await fetch(`/api/admin/clientes?id=${encodeURIComponent(cliente.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.error || 'Não foi possível excluir o cliente.')
      }

      const meta = readMeta()
      delete meta[cliente.id]
      writeMeta(meta)
      setMetaLocal(meta)

      setClientes((lista) => lista.filter((item) => item.id !== cliente.id))
      await refreshClientes()
      alert('Cliente excluído com sucesso.')
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Não foi possível excluir o cliente.')
    } finally {
      setAcaoProcessandoId(null)
    }
  }

  function cobrarWhatsapp(cliente: PerfilAdmin) {
    const nome = cliente.nome_empresa || cliente.email || 'cliente'
    const sistema = clienteSistema(cliente)
    const plano = planoCliente(cliente)
    const risco = riscoCliente(cliente)
    const statusAtual = String(cliente.status || '').toLowerCase()
    const atrasado = risco.nivel === 'critico' || statusAtual === 'bloqueado'
    const linkPagamento = `${SITE_URL}/assinatura`
    const statusTexto = atrasado ? 'Atrasado' : statusAtual === 'ativo' ? 'Ativo' : (cliente.status || 'Pendente')
    const mensagem = [
      `Olá, ${nome}!`,
      '',
      `Passando para lembrar sobre sua mensalidade do ${sistema}.`,
      `Plano: ${plano.nome}`,
      `Valor: ${toMoney(cliente.valor_plano || 0)}`,
      `Vencimento: ${cliente.vencimento || '-'}`,
      `Status: ${statusTexto}`,
      `Link de pagamento/assinatura: ${linkPagamento}`,
      '',
      atrasado
        ? 'Seu acesso pode ser bloqueado por atraso. Me chama aqui para regularizar agora.'
        : 'Para manter o acesso e o suporte em dia, me chama por aqui para regularizar.',
      '',
      '— Connect Sistema',
    ].join('\n')

    const resultado = abrirWhatsappUrl(montarUrlWhatsapp(whatsappDestino(cliente.telefone), mensagem))
    if (resultado.mostrarLink && resultado.url) {
      setWhatsFallbackUrl(resultado.url)
    }
  }

  function mensagemUpgrade(cliente: PerfilAdmin) {
    const nome = cliente.nome_empresa || cliente.email || 'cliente'
    const mensagem = [
      `Olá, ${nome}!`,
      '',
      'Separei uma sugestão para manter seu Connect Sistema ativo.',
      'Hoje trabalhamos com contratação mensal ou anual. O anual é o melhor custo-benefício para manter o sistema liberado o ano inteiro.',
      '',
      'Quer que eu te mostre as opções?',
      '',
      '— Connect Sistema',
    ].join('\n')
    abrirWhatsappUrl(montarUrlWhatsapp(whatsappDestino(cliente.telefone), mensagem))
  }

  function copiarResumoExecutivo() {
    const texto = [
      'Resumo SaaS Connect Sistema',
      `Clientes: ${resumo.total}`,
      `Ativos: ${resumo.ativos}`,
      `Trial: ${resumo.trials}`,
      `Bloqueados: ${resumo.bloqueados}`,
      `Vencidos: ${resumo.vencidos}`,
      `MRR potencial: ${toMoney(resumo.mrr)}`,
      `Recebido mês: ${toMoney(resumo.recebidoMes)}`,
      `Churn risco: ${resumo.risco}`,
    ].join('\n')
    void navigator.clipboard.writeText(texto)
    alert('Resumo copiado.')
  }

  async function resetarSenhaCliente(cliente: PerfilAdmin) {
    if (!cliente.email) {
      alert('Cliente sem e-mail cadastrado.')
      return
    }

    const confirmar = confirm('Gerar uma nova senha provisória para este cliente?\n\nA senha antiga deixará de funcionar.')
    if (!confirmar) return

    const temTelefone = !!normalizePhone(cliente.telefone)
    const abaWhatsApp = temTelefone ? window.open('about:blank', '_blank') : null

    try {
      setAcaoProcessandoId(cliente.id)
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.')

      const response = await fetch('/api/admin/clientes/reset-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: cliente.id,
          email: cliente.email,
          nome_empresa: cliente.nome_empresa || '',
          telefone: cliente.telefone || '',
          sistema_cliente: clienteSistema(cliente),
          admin_email: session?.user?.email || '',
        }),
      })

      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível redefinir a senha.')

      const texto = String(payload?.inviteText || '')
      const senha = String(payload?.temporaryPassword || '')
      const whatsappUrl = String(payload?.whatsappUrl || '')

      if (texto) {
        try { await navigator.clipboard.writeText(texto) } catch {}
      }

      if (whatsappUrl) {
        if (abaWhatsApp) {
          try {
            abaWhatsApp.location.replace(whatsappUrl)
            abaWhatsApp.focus()
          } catch {
            abrirWhatsappUrl(whatsappUrl)
          }
        } else {
          abrirWhatsappUrl(whatsappUrl)
        }
        alert(`Senha provisória gerada com sucesso.\n\nSenha: ${senha}\n\nTexto copiado e WhatsApp aberto.`)
      } else {
        if (abaWhatsApp) abaWhatsApp.close()
        alert(`Senha provisória gerada com sucesso.\n\nSenha: ${senha}\n\nCliente sem telefone válido. Texto copiado.`)
      }
    } catch (error: any) {
      if (abaWhatsApp) abaWhatsApp.close()
      console.error(error)
      alert(error?.message || 'Não foi possível redefinir a senha do cliente.')
    } finally {
      setAcaoProcessandoId(null)
    }
  }

  async function copiarTexto(texto: string, mensagemSucesso: string) {
    try {
      await navigator.clipboard.writeText(texto)
      alert(mensagemSucesso)
    } catch {
      alert('Não consegui copiar automaticamente. Copie manualmente.')
    }
  }

  function abrirEdicao(cliente: PerfilAdmin) {
    setEditForm({
      id: cliente.id,
      email: cliente.email || '',
      nome_empresa: cliente.nome_empresa || '',
      telefone: cliente.telefone || '',
      valor_plano: String(cliente.valor_plano ?? '49.90').replace('.', ','),
      status: cliente.status || 'trial',
      plano_tier: String(cliente.plano_tier || 'starter'),
      vencimento: cliente.vencimento || '',
      sistema_cliente: clienteSistema(cliente),
      observacoes: clienteObs(cliente),
    })
    setEditOpen(true)
  }

  async function salvarEdicao() {
    if (!editForm) return
    if (!editForm.email.trim()) {
      alert('Informe o e-mail do cliente.')
      return
    }

    try {
      setSavingEdit(true)
      const meta = readMeta()
      meta[editForm.id] = {
        sistema_cliente: editForm.sistema_cliente || 'Connect Sistema',
        observacoes: editForm.observacoes || '',
      }
      writeMeta(meta)
      setMetaLocal(meta)

      const statusEdicao = editForm.status
      const planoTier =
        statusEdicao === 'ativo'
          ? (editForm.plano_tier && editForm.plano_tier !== 'trial' ? editForm.plano_tier : 'starter')
          : editForm.plano_tier

      await atualizarCliente(editForm.id, {
        email: editForm.email.trim().toLowerCase(),
        nome_empresa: editForm.nome_empresa.trim() || null,
        telefone: normalizePhone(editForm.telefone) || null,
        valor_plano: parseMoney(editForm.valor_plano),
        status: statusEdicao,
        plano_tier: planoTier,
        ativo: statusEdicao !== 'bloqueado',
        vencimento: editForm.vencimento || null,
        status_pagamento: statusEdicao === 'ativo' ? 'em_dia' : statusEdicao === 'trial' ? 'trial' : undefined,
        ultimo_pagamento: statusEdicao === 'ativo' ? hojeISO() : undefined,
        sistema_cliente: editForm.sistema_cliente || 'Connect Sistema',
        observacoes: editForm.observacoes || null,
      })

      setEditOpen(false)
      setEditForm(null)
      alert('Cliente atualizado com sucesso.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function salvarNovoCliente() {
    if (!novoCliente.email.trim()) {
      alert('Informe o e-mail do cliente.')
      return
    }

    try {
      setSavingNew(true)
      setInviteLink('')
      setInviteText('')
      setInvitePhone(novoCliente.telefone)

      const telefoneDigitado = novoCliente.telefone
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.')

      const response = await fetch('/api/admin/clientes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...novoCliente,
          admin_email: session?.user?.email || '',
        }),
      })

      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível criar o cliente.')

      const id = payload?.cliente?.id
      if (id) {
        const meta = readMeta()
        meta[id] = {
          sistema_cliente: novoCliente.sistema_cliente || 'Connect Sistema',
          observacoes: novoCliente.observacoes || '',
        }
        writeMeta(meta)
        setMetaLocal(meta)
      }

      const linkFinal = String(payload?.accessLink || LOGIN_URL)
      const textoFinal = String(payload?.inviteText || [
        `Olá, ${novoCliente.nome_empresa || novoCliente.email}!`,
        '',
        `Seu acesso ao ${novoCliente.sistema_cliente || 'Connect Sistema'} foi criado com sucesso.`,
        '',
        `Login: ${novoCliente.email.trim().toLowerCase()}`,
        payload?.temporaryPassword ? `Senha provisória: ${payload.temporaryPassword}` : '',
        '',
        `Acesse: ${linkFinal}`,
      ].filter(Boolean).join('\n'))

      setInviteLink(linkFinal)
      setInviteText(textoFinal)
      setInvitePhone(telefoneDigitado)

      try { await navigator.clipboard.writeText(textoFinal) } catch {}

      await carregarTudo()

      setNovoCliente({
        email: '',
        nome_empresa: '',
        telefone: '',
        valor_plano: '49,90',
        tipo: 'trial',
        sistema_cliente: 'Connect Sistema',
        observacoes: '',
        criar_acesso: true,
      })

      setModalOpen(true)

      if (payload?.whatsappUrl) {
        window.open(String(payload.whatsappUrl), '_blank')
      }

      alert('Cliente criado com sucesso. A senha e a mensagem ficaram no cadastro para copiar/enviar.')
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Não foi possível criar o cliente.')
    } finally {
      setSavingNew(false)
    }
  }

  const resumo = useMemo(() => {
    const total = clientes.length
    const ativos = clientes.filter((c) => String(c.status || '').toLowerCase() === 'ativo').length
    const trials = clientes.filter((c) => statusTrialAdmin(c.status)).length
    const bloqueados = clientes.filter((c) => String(c.status || '').toLowerCase() === 'bloqueado' || c.ativo === false).length
    const vencidos = clientes.filter((c) => !isPermanent(c) && (daysUntil(c.vencimento) || 0) < 0).length
    const vencendo7 = clientes.filter((c) => {
      const dias = daysUntil(c.vencimento)
      return !isPermanent(c) && dias !== null && dias >= 0 && dias <= 7
    }).length
    const risco = vencidos + bloqueados + vencendo7
    const mrr = clientes
      .filter((c) => String(c.status || '').toLowerCase() !== 'bloqueado' && c.ativo !== false)
      .reduce((acc, c) => acc + Number(c.valor_plano || 0), 0)
    const faturamentoAnual = clientes
      .filter((c) => String(c.status || '').toLowerCase() !== 'bloqueado' && c.ativo !== false && Number(c.valor_plano || 0) >= 400)
      .reduce((acc, c) => acc + Number(c.valor_plano || 0), 0)
    const recebidoMes = clientes
      .filter((c) => ['em_dia', 'pago'].includes(String(c.status_pagamento || '').toLowerCase()))
      .reduce((acc, c) => acc + Number(c.valor_plano || 0), 0)
    const novos30 = clientes.filter((c) => {
      const criado = c.data_criacao ? new Date(c.data_criacao) : null
      return !!criado && !Number.isNaN(criado.getTime()) && Date.now() - criado.getTime() <= 30 * 86400000
    }).length
    const renovacoesRecentes = clientes
      .filter((c) => !!c.ultimo_pagamento)
      .sort((a, b) => new Date(b.ultimo_pagamento || '').getTime() - new Date(a.ultimo_pagamento || '').getTime())
      .slice(0, 6)
    const arpa = ativos > 0 ? mrr / ativos : 0
    const conversaoTrial = trials + ativos > 0 ? Math.round((ativos / (trials + ativos)) * 100) : 0
    const churnRisco = total > 0 ? Math.round((risco / total) * 100) : 0
    return { total, ativos, trials, bloqueados, vencidos, vencendo7, risco, mrr, faturamentoAnual, recebidoMes, novos30, renovacoesRecentes, arpa, conversaoTrial, churnRisco }
  }, [clientes])

  const sistemasDisponiveis = useMemo(() => {
    const set = new Set<string>()
    clientes.forEach((c) => set.add(clienteSistema(c)))
    return Array.from(set).filter(Boolean).sort()
  }, [clientes, metaLocal])

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      const termo = busca.trim().toLowerCase()
      const hay = [c.email || '', c.nome_empresa || '', c.status || '', c.telefone || '', clienteSistema(c), clienteObs(c)]
        .join(' ')
        .toLowerCase()
      const bateBusca = !termo || hay.includes(termo)
      const status = String(c.status || '').toLowerCase()
      const vencido = !isPermanent(c) && (daysUntil(c.vencimento) || 0) < 0
      const risco = riscoCliente(c).nivel !== 'ok'
      const bateFiltro =
        filtro === 'todos' ||
        (filtro === 'trial' && statusTrialAdmin(c.status)) ||
        (filtro !== 'trial' && status === filtro) ||
        (filtro === 'vencidos' && vencido) ||
        (filtro === 'risco' && risco)
      return bateBusca && bateFiltro
    })
  }, [clientes, busca, filtro, metaLocal])

  const clientesRisco = useMemo(() => {
    return clientes
      .filter((c) => riscoCliente(c).nivel !== 'ok')
      .slice(0, 8)
  }, [clientes])

  const sessoesMap = useMemo(() => {
    const map = new Map<string, SessaoAtiva>()
    sessoes.forEach((s) => {
      if (s.user_id) map.set(s.user_id, s)
      if (s.email) map.set(String(s.email).toLowerCase(), s)
    })
    return map
  }, [sessoes])

  if (loading) {
    return (
      <div style={styles.loaderWrap}>
        <div style={styles.loaderBox}>Carregando painel master SaaS...</div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.page, ...(isMobileAdmin ? styles.pageMobile : {}) }}>
      <div style={{ ...styles.container, ...(isMobileAdmin ? styles.containerMobile : {}) }}>
        <section style={{ ...styles.heroMaster, ...(isMobileAdmin ? styles.heroMasterMobile : {}) }}>
          <div style={styles.heroContent}>
            <div style={styles.kicker}>Painel dono do sistema • SaaS Master</div>
            <h1 style={{ ...styles.title, ...(isMobileAdmin ? styles.titleMobile : {}) }}>Central Admin Connect Sistema</h1>
            <p style={{ ...styles.subtitle, ...(isMobileAdmin ? styles.subtitleMobile : {}) }}>Controle clientes, planos, bloqueios, sessões, trial, cobrança, uso e crescimento do seu SaaS em uma única tela.</p>
            <div style={{ ...styles.heroActions, ...(isMobileAdmin ? styles.heroActionsMobile : {}) }}>
              <button
                style={styles.primaryHeroButton}
                onClick={() => {
                  setInviteLink('')
                  setInviteText('')
                  setInvitePhone('')
                  setNovoCliente({
                    email: '',
                    nome_empresa: '',
                    telefone: '',
                    valor_plano: '49,90',
                    tipo: 'trial',
                    sistema_cliente: 'Connect Sistema',
                    observacoes: '',
                    criar_acesso: true,
                  })
                  setModalOpen(true)
                }}
              >
                + Novo cliente
              </button>
              <button style={styles.clientPanelButton} onClick={() => router.push('/dashboard')}>Painel Cliente</button>
              <button style={styles.secondaryHeroButton} onClick={() => void carregarTudo()}>Atualizar painel</button>
              <button style={styles.secondaryHeroButton} onClick={copiarResumoExecutivo}>Copiar resumo</button>
            </div>
          </div>
          <div style={{ ...styles.heroSide, ...(isMobileAdmin ? styles.heroSideMobile : {}) }}>
            <button style={styles.logoutButton} onClick={() => void sairPainel()}>Sair do painel</button>
            <div style={styles.mrrCard}>
              <span>MRR potencial</span>
              <strong>{toMoney(resumo.mrr)}</strong>
              <small>Receita mensal ativa estimada</small>
            </div>
          </div>
        </section>

        <AdminAssinaturasMetricas />

        <section style={{ ...styles.kpiGrid, ...(isMobileAdmin ? styles.kpiGridMobile : {}) }}>
          <KpiCard titulo="Clientes" valor={String(resumo.total)} detalhe={`${resumo.ativos} ativos`} cor="#60a5fa" icone="👥" />
          <KpiCard titulo="MRR" valor={toMoney(resumo.mrr)} detalhe={`ARPA ${toMoney(resumo.arpa)}`} cor="#22c55e" icone="💰" />
          <KpiCard titulo="Recebido" valor={toMoney(resumo.recebidoMes)} detalhe="pagamentos confirmados" cor="#a78bfa" icone="✅" />
          <KpiCard titulo="Anual" valor={toMoney(resumo.faturamentoAnual)} detalhe="contratos anuais ativos" cor="#f59e0b" icone="🏆" />
          <KpiCard titulo="Trials" valor={String(resumo.trials)} detalhe={`${resumo.conversaoTrial}% conversão base`} cor="#facc15" icone="🧪" />
          <KpiCard titulo="Novos" valor={String(resumo.novos30)} detalhe="clientes em 30 dias" cor="#38bdf8" icone="📈" />
        </section>

        {isMobileAdmin ? (
          <button type="button" style={styles.mobileMenuButton} onClick={() => setMobileDrawerOpen((open) => !open)}>
            {mobileDrawerOpen ? '✕ Fechar radar e ações' : '☰ Abrir radar e ações'}
          </button>
        ) : null}

        {isMobileAdmin && mobileDrawerOpen ? (
          <div style={styles.drawerBackdrop} onClick={() => setMobileDrawerOpen(false)} />
        ) : null}

        {!isMobileAdmin || mobileDrawerOpen ? (
          <section style={{
            ...styles.commandCenter,
            ...(isMobileAdmin ? styles.commandCenterMobile : {}),
            ...(isMobileAdmin ? styles.commandCenterDrawer : {}),
          }}>
            <div style={styles.centerLeft}>
              <div style={styles.centerTitle}>Radar SaaS</div>
              <div style={{ ...styles.radarGrid, ...(isMobileAdmin ? styles.radarGridMobile : {}) }}>
              <RadarItem label="Vencidos" value={String(resumo.vencidos)} color="#ef4444" />
              <RadarItem label="Vencendo 7 dias" value={String(resumo.vencendo7)} color="#facc15" />
              <RadarItem label="Bloqueados" value={String(resumo.bloqueados)} color="#fb7185" />
              <RadarItem label="Uso total" value={String(uso.orcamentos + uso.ordens + uso.financeiro)} color="#60a5fa" />
            </div>
          </div>
          <div style={styles.centerRight}>
            <div style={styles.centerTitle}>Ações inteligentes</div>
            <div style={{ ...styles.quickActions, ...(isMobileAdmin ? styles.quickActionsMobile : {}) }}>
              <button style={styles.quickButton} onClick={() => { setFiltro('risco'); if (isMobileAdmin) setMobileDrawerOpen(false) }}>Ver clientes em risco</button>
              <button style={styles.quickButton} onClick={() => { setFiltro('trial'); if (isMobileAdmin) setMobileDrawerOpen(false) }}>Ver trials</button>
              <button style={styles.quickButton} onClick={() => { setFiltro('vencidos'); if (isMobileAdmin) setMobileDrawerOpen(false) }}>Cobrança vencidos</button>
              <button style={styles.quickButton} onClick={() => { setAba('metricas'); if (isMobileAdmin) setMobileDrawerOpen(false) }}>Uso do sistema</button>
            </div>
          </div>
        </section>
        ) : null}

        <section style={{ ...styles.tabs, ...(isMobileAdmin ? styles.tabsMobile : {}) }}>
          <button style={{ ...(aba === 'clientes' ? styles.tabActive : styles.tab), ...(isMobileAdmin ? styles.tabMobile : {}) }} onClick={() => setAba('clientes')}>Clientes e planos</button>
          <button style={{ ...(aba === 'sessoes' ? styles.tabActive : styles.tab), ...(isMobileAdmin ? styles.tabMobile : {}) }} onClick={() => setAba('sessoes')}>Sessões ativas</button>
          <button style={{ ...(aba === 'metricas' ? styles.tabActive : styles.tab), ...(isMobileAdmin ? styles.tabMobile : {}) }} onClick={() => setAba('metricas')}>Uso e crescimento</button>
        </section>

        {aba === 'clientes' && (
          <section style={{ ...styles.panel, ...(isMobileAdmin ? styles.panelMobile : {}) }}>
            <div style={{ ...styles.panelTop, ...(isMobileAdmin ? styles.panelTopMobile : {}) }}>
              <div>
                <h2 style={{ ...styles.panelTitle, ...(isMobileAdmin ? styles.panelTitleMobile : {}) }}>Clientes, planos e cobrança</h2>
                <p style={styles.panelSub}>Gerencie assinatura, status, limite, acesso, senha provisória e cobrança WhatsApp.</p>
              </div>
              <div style={{ ...styles.toolbar, ...(isMobileAdmin ? styles.toolbarMobile : {}) }}>
                <input style={{ ...styles.search, ...(isMobileAdmin ? styles.searchMobile : {}) }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, sistema, e-mail ou telefone" />
                <select style={{ ...styles.select, ...(isMobileAdmin ? styles.selectMobile : {}) }} value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroStatus)}>
                  <option style={styles.selectOption} value="todos">Todos</option>
                  <option style={styles.selectOption} value="risco">Risco</option>
                  <option style={styles.selectOption} value="trial">Trial</option>
                  <option style={styles.selectOption} value="ativo">Ativo</option>
                  <option style={styles.selectOption} value="bloqueado">Bloqueado</option>
                  <option style={styles.selectOption} value="vencidos">Vencidos</option>
                </select>
              </div>
            </div>

            {sistemasDisponiveis.length > 0 ? (
              <div style={styles.systemPills}>
                {sistemasDisponiveis.slice(0, 10).map((sistema) => (
                  <button key={sistema} style={styles.systemPill} onClick={() => setBusca(sistema)}>{sistema}</button>
                ))}
              </div>
            ) : null}

            {clientesRisco.length > 0 ? (
              <div style={styles.riskBox}>
                <div style={styles.riskTitle}>Prioridade de hoje</div>
                <div style={styles.riskList}>
                  {clientesRisco.map((cliente) => (
                    <button key={cliente.id} style={styles.riskItem} onClick={() => cobrarWhatsapp(cliente)}>
                      <span>{cliente.nome_empresa || cliente.email || 'Cliente'}</span>
                      <small style={{ color: riscoCliente(cliente).cor }}>{riscoCliente(cliente).texto} • {prazoLabel(cliente)}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ ...styles.clientList, ...(isMobileAdmin ? styles.clientListMobile : {}) }}>
              {clientesFiltrados.map((cliente) => {
                const plan = planoCliente(cliente)
                const risk = riscoCliente(cliente)
                const sessao = sessoesMap.get(cliente.id) || sessoesMap.get(String(cliente.email || '').toLowerCase())

                return (
                  <div key={cliente.id} style={{ ...styles.clientRow, ...(isMobileAdmin ? styles.clientRowMobile : {}) }}>
                    <div style={{ ...styles.clientIdentity, ...(isMobileAdmin ? styles.clientIdentityMobile : {}) }}>
                      <div style={{ ...styles.clientName, ...(isMobileAdmin ? styles.clientNameMobile : {}) }}>{cliente.nome_empresa || 'Cliente sem nome'}</div>
                      <div style={{ ...styles.clientLine, ...(isMobileAdmin ? styles.clientLineMobile : {}) }}>{cliente.email || '-'} {cliente.telefone ? `• ${cliente.telefone}` : ''}</div>
                      <div style={styles.systemLine}>{clienteSistema(cliente)}</div>
                    </div>

                    <Badge label={cliente.status || '-'} color={statusColor(cliente.status)} />
                    <Info label="Plano" value={plan.nome} color={plan.cor} />
                    <Info label="Limite" value={plan.limite} color="#dbeafe" />
                    <Info label="Vencimento" value={cliente.vencimento || '-'} color={prazoColor(cliente)} />
                    <Info label="Mensalidade" value={toMoney(cliente.valor_plano || 0)} color="#ffffff" />
                    <Info label="Sessão" value={sessao ? 'Online' : 'Sem registro'} color={sessao ? '#22c55e' : '#94a3b8'} />
                    <Badge label={risk.texto} color={risk.cor} />

                    <div style={{ ...styles.rowActions, ...(isMobileAdmin ? styles.rowActionsMobile : {}) }}>
                      <button style={styles.primarySmall} onClick={() => cobrarWhatsapp(cliente)}>Cobrar</button>
                      {isMobileAdmin ? (
                        <button
                          style={styles.actionSummary}
                          onClick={(e) => {
                            e.stopPropagation()
                            setAcaoClienteMobile(cliente)
                          }}
                        >
                          Ações
                        </button>
                      ) : (
                        <div style={styles.menuWrap} data-action-menu>
                          <button
                            style={styles.actionSummary}
                            onClick={(e) => {
                              e.stopPropagation()
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                              setDesktopActionMenu((atual) =>
                                atual?.cliente.id === cliente.id
                                  ? null
                                  : {
                                      cliente,
                                      anchorRect: {
                                        top: rect.top,
                                        left: rect.left,
                                        right: rect.right,
                                        bottom: rect.bottom,
                                        width: rect.width,
                                        height: rect.height,
                                      },
                                      top: rect.bottom + 8,
                                      left: rect.left + rect.width / 2 - 245 / 2,
                                      placement: 'bottom',
                                    }
                              )
                            }}
                          >
                            Ações
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {clientesFiltrados.length === 0 && <div style={styles.empty}>Nenhum cliente encontrado com esse filtro.</div>}
            </div>
          </section>
        )}

        {aba === 'sessoes' && (
          <section style={{ ...styles.panel, ...(isMobileAdmin ? styles.panelMobile : {}) }}>
            <div style={styles.panelTop}>
              <div>
                <h2 style={styles.panelTitle}>Sessões ativas e proteção anti-compartilhamento</h2>
                <p style={styles.panelSub}>Acompanhe dispositivos conectados. A estrutura já está preparada para 1 usuário por conta e limites por plano.</p>
              </div>
              <button style={styles.secondaryHeroButton} onClick={() => void carregarTudo()}>Atualizar sessões</button>
            </div>
            <div style={styles.sessionGrid}>
              {sessoes.length > 0 ? sessoes.map((sessao, index) => (
                <div style={styles.sessionCard} key={`${sessao.user_id || sessao.email}-${index}`}>
                  <div style={styles.sessionTop}>
                    <strong>{sessao.email || 'Sessão sem e-mail'}</strong>
                    <span>Protegido</span>
                  </div>
                  <p>{sessao.device_label || 'Dispositivo'}</p>
                  <small>IP: {sessao.ip_address || '-'}</small>
                  <small>Último acesso: {sessao.last_seen_at ? new Date(sessao.last_seen_at).toLocaleString('pt-BR') : '-'}</small>
                </div>
              )) : <div style={styles.empty}>Nenhuma sessão ativa registrada ainda. Execute o SQL do controle de sessão e faça login com um usuário comum.</div>}
            </div>
          </section>
        )}

        {aba === 'metricas' && (
          <section style={{ ...styles.panel, ...(isMobileAdmin ? styles.panelMobile : {}) }}>
            <div style={styles.panelTop}>
              <div>
                <h2 style={styles.panelTitle}>Uso do sistema e crescimento</h2>
                <p style={styles.panelSub}>Leitura rápida do volume operacional dos clientes dentro do Connect.</p>
              </div>
            </div>
            <div style={styles.usageGrid}>
              <UsageCard label="Clientes cadastrados" value={uso.clientes} icon="👥" />
              <UsageCard label="Produtos/serviços" value={uso.produtos} icon="📦" />
              <UsageCard label="Orçamentos" value={uso.orcamentos} icon="💰" />
              <UsageCard label="Ordens de serviço" value={uso.ordens} icon="🛠️" />
              <UsageCard label="Financeiro" value={uso.financeiro} icon="📊" />
              <UsageCard label="CRM/interações" value={uso.crm} icon="🤖" />
            </div>
            <div style={styles.paymentsPanel}>
              <div>
                <h3 style={styles.paymentsTitle}>Últimos pagamentos e renovações</h3>
                <p style={styles.panelSub}>Baseado nos clientes liberados pelo painel master e pelo webhook Mercado Pago.</p>
              </div>
              <div style={styles.paymentsList}>
                {resumo.renovacoesRecentes.length > 0 ? resumo.renovacoesRecentes.map((cliente) => (
                  <div key={cliente.id} style={styles.paymentRow}>
                    <div>
                      <strong>{cliente.nome_empresa || cliente.email || 'Cliente'}</strong>
                      <span>{cliente.ultimo_pagamento ? new Date(cliente.ultimo_pagamento).toLocaleDateString('pt-BR') : '-'}</span>
                    </div>
                    <b>{toMoney(cliente.valor_plano || 0)}</b>
                  </div>
                )) : (
                  <div style={styles.emptyPayments}>Nenhum pagamento confirmado ainda.</div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {desktopActionMenu && typeof document !== 'undefined'
        ? createPortal(
            <div style={styles.desktopActionBackdrop} onClick={() => setDesktopActionMenu(null)}>
              <div
                ref={desktopActionMenuRef}
                style={{
                  ...styles.actionMenuPortal,
                  top: desktopActionMenu.top,
                  left: desktopActionMenu.left,
                  transformOrigin: desktopActionMenu.placement === 'top' ? 'bottom center' : 'top center',
                  opacity: desktopActionMenuAnimIn ? 1 : 0,
                  transform: desktopActionMenuAnimIn ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.985)',
                }}
                data-action-popover
                onClick={(event) => event.stopPropagation()}
              >
                <div style={styles.menuHeader}>
                  <span>Ações rápidas</span>
                  <button style={styles.menuClose} onClick={() => setDesktopActionMenu(null)}>×</button>
                </div>
                <button style={styles.menuItem} onClick={() => { setDesktopActionMenu(null); abrirEdicao(desktopActionMenu.cliente) }}>Editar cliente</button>
                <button style={styles.menuItem} disabled={acaoProcessandoId === desktopActionMenu.cliente.id} onClick={() => { setDesktopActionMenu(null); void resetarSenhaCliente(desktopActionMenu.cliente) }}>Resetar senha / WhatsApp</button>
                <button style={styles.menuItem} disabled={acaoProcessandoId === desktopActionMenu.cliente.id} onClick={() => { setDesktopActionMenu(null); trial7(desktopActionMenu.cliente.id) }}>Trial 7 dias</button>
                <button style={styles.menuItem} disabled={acaoProcessandoId === desktopActionMenu.cliente.id || isPermanent(desktopActionMenu.cliente)} onClick={() => { setDesktopActionMenu(null); void marcarComoPago(desktopActionMenu.cliente.id) }}>Marcar ativo / pago</button>
                <button style={styles.menuItem} disabled={acaoProcessandoId === desktopActionMenu.cliente.id || isPermanent(desktopActionMenu.cliente)} onClick={() => { setDesktopActionMenu(null); ativar(30, desktopActionMenu.cliente.id) }}>Ativar +30 dias</button>
                <button style={styles.menuItem} disabled={acaoProcessandoId === desktopActionMenu.cliente.id || isPermanent(desktopActionMenu.cliente)} onClick={() => { setDesktopActionMenu(null); ativar(60, desktopActionMenu.cliente.id) }}>Ativar +60 dias</button>
                <button style={styles.menuItem} disabled={acaoProcessandoId === desktopActionMenu.cliente.id || isPermanent(desktopActionMenu.cliente)} onClick={() => { setDesktopActionMenu(null); ativar(365, desktopActionMenu.cliente.id) }}>Renovar anual</button>
                <button style={styles.menuItem} disabled={acaoProcessandoId === desktopActionMenu.cliente.id || isPermanent(desktopActionMenu.cliente)} onClick={() => { setDesktopActionMenu(null); abrirRenovacaoManual(desktopActionMenu.cliente) }}>Renovar sistema / Marcar pago</button>
                <button style={styles.menuItem} onClick={() => { setDesktopActionMenu(null); mensagemUpgrade(desktopActionMenu.cliente) }}>Oferta upgrade</button>
                <button style={styles.menuDanger} disabled={acaoProcessandoId === desktopActionMenu.cliente.id || isPermanent(desktopActionMenu.cliente)} onClick={() => { if (confirm('Bloquear este cliente?')) { setDesktopActionMenu(null); void bloquear(desktopActionMenu.cliente.id) } }}>Bloquear</button>
                <button style={styles.menuDelete} disabled={acaoProcessandoId === desktopActionMenu.cliente.id} onClick={() => { setDesktopActionMenu(null); void excluirCliente(desktopActionMenu.cliente) }}>Excluir cliente</button>
              </div>
            </div>,
            document.body
          )
        : null}

      {isMobileAdmin && acaoClienteMobile ? (
        <div style={styles.mobileActionOverlay} onClick={() => setAcaoClienteMobile(null)}>
          <div style={styles.mobileActionSheet} onClick={(event) => event.stopPropagation()}>
            <div style={styles.mobileActionSheetHeader}>
              <div>
                <div style={styles.mobileActionTitle}>Ações do cliente</div>
                <div style={styles.mobileActionSub}>
                  {acaoClienteMobile.nome_empresa || acaoClienteMobile.email || 'Cliente'}
                </div>
              </div>
              <button style={styles.mobileActionClose} onClick={() => setAcaoClienteMobile(null)}>✕</button>
            </div>

            <div style={styles.mobileActionScroll}>
              <div style={styles.mobileActionGroup}>
                <div style={styles.mobileActionGroupTitle}>Ações principais</div>
                <button style={styles.mobileActionBtn} onClick={() => { setAcaoClienteMobile(null); abrirEdicao(acaoClienteMobile) }}>Editar cliente</button>
                <button style={styles.mobileActionBtn} onClick={() => { setAcaoClienteMobile(null); cobrarWhatsapp(acaoClienteMobile) }}>Cobrar WhatsApp</button>
                <button style={styles.mobileActionBtn} disabled={isPermanent(acaoClienteMobile)} onClick={() => { setAcaoClienteMobile(null); abrirRenovacaoManual(acaoClienteMobile) }}>Renovar sistema / Marcar pago</button>
                <button style={styles.mobileActionBtn} disabled={isPermanent(acaoClienteMobile)} onClick={() => { setAcaoClienteMobile(null); void marcarComoPago(acaoClienteMobile.id) }}>Marcar ativo / pago</button>
              </div>

              <div style={styles.mobileActionGroup}>
                <div style={styles.mobileActionGroupTitle}>Acesso</div>
                <button style={styles.mobileActionBtn} disabled={acaoProcessandoId === acaoClienteMobile.id} onClick={() => { setAcaoClienteMobile(null); void resetarSenhaCliente(acaoClienteMobile) }}>Resetar senha / WhatsApp</button>
                <button style={styles.mobileActionBtn} onClick={() => { setAcaoClienteMobile(null); trial7(acaoClienteMobile.id) }}>Trial 7 dias</button>
                <button style={styles.mobileActionBtn} disabled={isPermanent(acaoClienteMobile)} onClick={() => { setAcaoClienteMobile(null); ativar(30, acaoClienteMobile.id) }}>Ativar +30 dias</button>
                <button style={styles.mobileActionBtn} disabled={isPermanent(acaoClienteMobile)} onClick={() => { setAcaoClienteMobile(null); ativar(60, acaoClienteMobile.id) }}>Ativar +60 dias</button>
                <button style={styles.mobileActionBtn} disabled={isPermanent(acaoClienteMobile)} onClick={() => { setAcaoClienteMobile(null); ativar(365, acaoClienteMobile.id) }}>Renovar anual</button>
              </div>

              <div style={styles.mobileActionGroup}>
                <div style={styles.mobileActionGroupTitle}>Comercial</div>
                <button style={styles.mobileActionBtn} onClick={() => { setAcaoClienteMobile(null); mensagemUpgrade(acaoClienteMobile) }}>Oferta upgrade</button>
              </div>

              <div style={styles.mobileActionDangerWrap}>
                <button
                  style={styles.mobileActionDanger}
                  disabled={isPermanent(acaoClienteMobile)}
                  onClick={() => {
                    if (confirm('Bloquear este cliente?')) {
                      setAcaoClienteMobile(null)
                      void bloquear(acaoClienteMobile.id)
                    }
                  }}
                >
                  Bloquear
                </button>
                <button style={styles.mobileActionDelete} onClick={() => { setAcaoClienteMobile(null); void excluirCliente(acaoClienteMobile) }}>
                  Excluir cliente
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {whatsFallbackUrl ? (
        <div style={styles.whatsFallbackBar}>
          <span>Não foi possível abrir automaticamente.</span>
          <a style={styles.whatsFallbackButton} href={linksWhatsappFallback(whatsFallbackUrl).principal} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
          <a style={styles.whatsFallbackAltButton} href={linksWhatsappFallback(whatsFallbackUrl).alternativa} target="_blank" rel="noopener noreferrer">Abrir alternativa</a>
          <button style={styles.whatsFallbackClose} onClick={() => setWhatsFallbackUrl('')}>✕</button>
        </div>
      ) : null}

      {modalOpen && (
        <Modal maxWidth={820} onClose={() => { setModalOpen(false); setInviteLink(''); setInviteText(''); setInvitePhone('') }}>
          <div style={styles.modalTitle}>Novo cliente SaaS</div>
          <div style={styles.modalSub}>Cadastre um cliente do Connect Sistema ou de outro sistema para controlar assinatura, WhatsApp e cobrança.</div>

          <div style={styles.formGrid}>
            <Input label="E-mail do cliente" value={novoCliente.email} onChange={(v) => setNovoCliente((prev) => ({ ...prev, email: v }))} placeholder="cliente@email.com" />
            <Input label="Nome da empresa" value={novoCliente.nome_empresa} onChange={(v) => setNovoCliente((prev) => ({ ...prev, nome_empresa: v }))} placeholder="Nome da empresa" />
            <Input label="Telefone / WhatsApp" value={novoCliente.telefone} onChange={(v) => setNovoCliente((prev) => ({ ...prev, telefone: v }))} placeholder="84999999999" />
            <Input label="Sistema contratado" value={novoCliente.sistema_cliente} onChange={(v) => setNovoCliente((prev) => ({ ...prev, sistema_cliente: v }))} placeholder="Connect Sistema, Agenda, Loja..." />
            <Input label="Valor mensal" value={novoCliente.valor_plano} onChange={(v) => setNovoCliente((prev) => ({ ...prev, valor_plano: v }))} placeholder="49,90" />
            <div>
              <div style={styles.inputLabel}>Tipo inicial</div>
              <select style={{ ...styles.input, width: '100%' }} value={novoCliente.tipo} onChange={(e) => setNovoCliente((prev) => ({ ...prev, tipo: e.target.value as TipoNovoCliente }))}>
                <option style={styles.selectOption} value="trial">Trial 7 dias</option>
                <option style={styles.selectOption} value="ativo">Ativo 30 dias</option>
              </select>
            </div>
          </div>

          <label style={styles.checkboxRow}>
            <input type="checkbox" checked={novoCliente.criar_acesso} onChange={(e) => setNovoCliente((prev) => ({ ...prev, criar_acesso: e.target.checked }))} />
            <span><b>Criar acesso no Connect Sistema</b><small>Desmarque para cadastrar cliente de outro sistema somente para cobrança e controle financeiro.</small></span>
          </label>

          <div style={{ marginTop: 14 }}>
            <div style={styles.inputLabel}>Observações internas</div>
            <textarea style={styles.textareaInput} value={novoCliente.observacoes} onChange={(e) => setNovoCliente((prev) => ({ ...prev, observacoes: e.target.value }))} placeholder="Ex.: cliente veio do sistema de agenda; valor combinado; suporte incluso..." />
          </div>

          {inviteLink ? (
            <div style={styles.inviteBox}>
              <div style={styles.inviteTitle}>Link de login do cliente</div>
              <textarea readOnly value={inviteLink || LOGIN_URL} style={styles.inviteTextarea} />
              <div style={styles.inviteButtons}><button style={styles.copyButton} onClick={() => void copiarTexto(inviteLink, 'Link copiado com sucesso.')}>Copiar link</button></div>
            </div>
          ) : null}

          {inviteText ? (
            <div style={styles.inviteBox}>
              <div style={styles.inviteTitle}>Texto pronto para WhatsApp</div>
              <textarea readOnly value={inviteText} style={{ ...styles.inviteTextarea, minHeight: 140 }} />
              <div style={styles.inviteButtons}>
                <button style={styles.whatsButton} onClick={() => void copiarTexto(inviteText, 'Texto copiado com sucesso.')}>Copiar texto</button>
                <button style={styles.copyButton} onClick={() => abrirWhatsappUrl(montarUrlWhatsapp(whatsappDestino(invitePhone || novoCliente.telefone), inviteText))}>Enviar WhatsApp</button>
              </div>
            </div>
          ) : null}

          <div style={styles.modalActions}>
            <button style={styles.cancelButton} onClick={() => { setModalOpen(false); setInviteLink(''); setInviteText(''); setInvitePhone('') }} disabled={savingNew}>Fechar</button>
            <button style={styles.saveButton} onClick={() => void salvarNovoCliente()} disabled={savingNew}>{savingNew ? 'Salvando...' : 'Salvar cliente'}</button>
          </div>
        </Modal>
      )}

      {editOpen && editForm && (
        <Modal maxWidth={760} onClose={() => { setEditOpen(false); setEditForm(null) }}>
          <div style={styles.modalTitle}>Editar cliente</div>
          <div style={styles.modalSub}>Altere dados comerciais, valor mensal, sistema contratado, status e vencimento.</div>

          <div style={styles.formGrid}>
            <Input label="E-mail" value={editForm.email} onChange={(v) => setEditForm((prev) => prev ? ({ ...prev, email: v }) : prev)} placeholder="cliente@email.com" />
            <Input label="Nome / empresa" value={editForm.nome_empresa} onChange={(v) => setEditForm((prev) => prev ? ({ ...prev, nome_empresa: v }) : prev)} placeholder="Nome da empresa" />
            <Input label="Telefone / WhatsApp" value={editForm.telefone} onChange={(v) => setEditForm((prev) => prev ? ({ ...prev, telefone: v }) : prev)} placeholder="84999999999" />
            <Input label="Sistema contratado" value={editForm.sistema_cliente} onChange={(v) => setEditForm((prev) => prev ? ({ ...prev, sistema_cliente: v }) : prev)} placeholder="Connect Sistema" />
            <Input label="Valor mensal" value={editForm.valor_plano} onChange={(v) => setEditForm((prev) => prev ? ({ ...prev, valor_plano: v }) : prev)} placeholder="49,90" />
            <Input label="Vencimento" value={editForm.vencimento} onChange={(v) => setEditForm((prev) => prev ? ({ ...prev, vencimento: v }) : prev)} placeholder="2026-05-30" />
            <div>
              <div style={styles.inputLabel}>Status</div>
              <select style={{ ...styles.input, width: '100%' }} value={editForm.status} onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, status: e.target.value }) : prev)}>
                <option style={styles.selectOption} value="trial">Trial</option>
                <option style={styles.selectOption} value="ativo">Ativo / Pago</option>
                <option style={styles.selectOption} value="bloqueado">Bloqueado</option>
              </select>
            </div>
            <div>
              <div style={styles.inputLabel}>Plano</div>
              <select style={{ ...styles.input, width: '100%' }} value={editForm.plano_tier} onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, plano_tier: e.target.value }) : prev)}>
                <option style={styles.selectOption} value="trial">Trial</option>
                <option style={styles.selectOption} value="starter">Starter</option>
                <option style={styles.selectOption} value="pro">Pro</option>
                <option style={styles.selectOption} value="empresa">Empresa</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={styles.inputLabel}>Observações internas</div>
            <textarea style={styles.textareaInput} value={editForm.observacoes} onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, observacoes: e.target.value }) : prev)} />
          </div>

          <div style={styles.modalActions}>
            <button style={styles.cancelButton} onClick={() => { setEditOpen(false); setEditForm(null) }} disabled={savingEdit}>Cancelar</button>
            <button style={styles.saveButton} onClick={() => void salvarEdicao()} disabled={savingEdit}>{savingEdit ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </Modal>
      )}

      <ModalRenovacaoManual
        aberto={renovarOpen}
        cliente={renovarCliente}
        processando={renovarProcessando}
        onFechar={fecharRenovacaoManual}
        onConfirmar={confirmarRenovacaoManual}
        resultado={renovarResultado}
      />
    </div>
  )
}

function KpiCard({ titulo, valor, detalhe, cor, icone }: { titulo: string; valor: string; detalhe: string; cor: string; icone: string }) {
  return (
    <div style={{ ...styles.kpiCard, borderColor: `${cor}55` }}>
      <div style={styles.kpiIcon}>{icone}</div>
      <div style={styles.kpiTitle}>{titulo}</div>
      <div style={{ ...styles.kpiValue, color: cor }}>{valor}</div>
      <div style={styles.kpiDetail}>{detalhe}</div>
    </div>
  )
}

function RadarItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={styles.radarItem}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}

function UsageCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={styles.usageCard}>
      <div style={styles.usageIcon}>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ ...styles.badge, color }}>
      <span style={{ ...styles.dot, background: color }} />
      {label}
    </div>
  )
}

function Info({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={styles.infoCell}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={{ ...styles.infoValue, color }}>{value}</div>
    </div>
  )
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={styles.inputLabel}>{label}</div>
      <input style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function Modal({ children, maxWidth, onClose }: { children: React.ReactNode; maxWidth: number; onClose?: () => void }) {
  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={{ ...styles.modal, maxWidth, position: 'relative' }} onMouseDown={(event) => event.stopPropagation()}>
        {onClose ? (
          <button type="button" style={styles.modalCloseButton} onClick={onClose} aria-label="Fechar cadastro">
            ✕
          </button>
        ) : null}
        {children}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: 'max(18px, env(safe-area-inset-top)) 18px 28px',
    background: 'radial-gradient(circle at top left, rgba(59,130,246,0.30), transparent 34%), linear-gradient(135deg,#08111f,#152238 45%,#101827)',
    color: '#f8fafc',
    fontFamily: 'Inter, Arial, sans-serif',
  },
  container: { width: 'min(1420px,100%)', margin: '0 auto', display: 'grid', gap: 18 },
  loaderWrap: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: '#fff' },
  loaderBox: { padding: 22, borderRadius: 22, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', fontWeight: 900 },
  heroMaster: { borderRadius: 32, padding: 28, display: 'flex', justifyContent: 'space-between', gap: 22, alignItems: 'stretch', background: 'linear-gradient(135deg, rgba(15,23,42,0.86), rgba(30,64,175,0.38), rgba(8,145,178,0.22))', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 26px 80px rgba(2,6,23,0.38)' },
  heroContent: { maxWidth: 760 },
  kicker: { color: '#67e8f9', textTransform: 'uppercase', letterSpacing: 2.8, fontWeight: 950, fontSize: 12 },
  title: { margin: '9px 0 0', fontSize: 'clamp(34px, 5vw, 62px)', lineHeight: 0.95, fontWeight: 950, color: '#fff', letterSpacing: -1.8 },
  subtitle: { margin: '16px 0 0', color: '#dbeafe', fontSize: 16, lineHeight: 1.55, fontWeight: 750 },
  heroActions: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 },
  primaryHeroButton: { height: 46, borderRadius: 999, border: 'none', padding: '0 18px', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 950, cursor: 'pointer', boxShadow: '0 16px 34px rgba(34,197,94,0.26)' },
  clientPanelButton: { height: 46, borderRadius: 999, border: '1px solid rgba(147,197,253,0.42)', padding: '0 18px', background: 'linear-gradient(135deg,#2563eb,#0f172a)', color: '#fff', fontWeight: 950, cursor: 'pointer', boxShadow: '0 16px 34px rgba(37,99,235,0.24)' },
  secondaryHeroButton: { height: 46, borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)', padding: '0 18px', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  heroSide: { minWidth: 290, display: 'grid', gap: 12, alignContent: 'space-between' },
  logoutButton: { justifySelf: 'end', height: 40, borderRadius: 999, border: '1px solid rgba(248,113,113,0.35)', background: 'linear-gradient(135deg,rgba(127,29,29,0.62),rgba(185,28,28,0.22))', color: '#fee2e2', padding: '0 16px', fontWeight: 900, cursor: 'pointer' },
  mrrCard: { padding: 20, borderRadius: 24, background: 'rgba(2,6,23,0.34)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(6,minmax(150px,1fr))', gap: 12 },
  kpiCard: { borderRadius: 24, padding: 17, minHeight: 150, background: 'linear-gradient(135deg, rgba(51,65,85,0.72), rgba(15,23,42,0.80))', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 18px 44px rgba(2,6,23,0.28)' },
  kpiIcon: { width: 42, height: 42, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.09)', marginBottom: 10 },
  kpiTitle: { color: '#bfdbfe', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 950, fontSize: 11 },
  kpiValue: { marginTop: 8, fontSize: 29, fontWeight: 950, lineHeight: 1 },
  kpiDetail: { marginTop: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 750 },
  commandCenter: { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 },
  centerLeft: { borderRadius: 26, padding: 20, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)' },
  centerRight: { borderRadius: 26, padding: 20, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)' },
  centerTitle: { fontSize: 20, fontWeight: 950, marginBottom: 13 },
  radarGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 },
  radarItem: { padding: 14, borderRadius: 18, background: 'rgba(15,23,42,0.42)', border: '1px solid rgba(255,255,255,0.12)', display: 'grid', gap: 6 },
  quickActions: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 },
  quickButton: { minHeight: 46, borderRadius: 16, border: '1px solid rgba(147,197,253,0.20)', background: 'rgba(59,130,246,0.14)', color: '#dbeafe', fontWeight: 900, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  tab: { height: 43, borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', padding: '0 16px', fontWeight: 900, cursor: 'pointer' },
  tabActive: { height: 43, borderRadius: 999, border: '1px solid rgba(34,197,94,0.50)', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', padding: '0 16px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 14px 30px rgba(34,197,94,0.22)' },
  panel: { borderRadius: 28, padding: 22, background: 'linear-gradient(135deg, rgba(51,65,85,0.88), rgba(30,41,59,0.86))', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 22px 60px rgba(15,23,42,0.24)' },
  panelTop: { display: 'flex', gap: 18, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
  panelTitle: { margin: 0, fontSize: 27, fontWeight: 950, color: '#ffffff' },
  panelSub: { margin: '7px 0 0', color: '#cbd5e1', fontSize: 13 },
  toolbar: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  search: { height: 44, minWidth: 330, borderRadius: 15, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(248,250,252,0.08)', color: '#f8fafc', padding: '0 14px', outline: 'none', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' },
  select: { height: 44, borderRadius: 15, border: '1px solid rgba(255,255,255,0.16)', backgroundColor: '#263244', color: '#f8fafc', padding: '0 14px', outline: 'none', colorScheme: 'dark' },
  selectOption: { backgroundColor: '#263244', color: '#f8fafc' },
  systemPills: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  systemPill: { border: '1px solid rgba(103,232,249,0.28)', borderRadius: 999, background: 'rgba(103,232,249,0.12)', color: '#a5f3fc', height: 31, padding: '0 12px', fontWeight: 900, cursor: 'pointer' },
  riskBox: { marginBottom: 14, padding: 14, borderRadius: 20, background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.22)' },
  riskTitle: { fontWeight: 950, marginBottom: 10, color: '#fef3c7' },
  riskList: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 },
  riskItem: { minHeight: 54, borderRadius: 15, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15,23,42,0.36)', color: '#fff', display: 'grid', textAlign: 'left', padding: '8px 10px', cursor: 'pointer' },
  clientList: { display: 'grid', gap: 11, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' },
  clientRow: { minWidth: 1250, display: 'grid', gridTemplateColumns: 'minmax(240px,1.4fr) 105px 105px 105px 120px 130px 105px 110px 195px', gap: 9, alignItems: 'center', borderRadius: 20, padding: 13, background: 'linear-gradient(135deg, rgba(248,250,252,0.075), rgba(15,23,42,0.42))', border: '1px solid rgba(255,255,255,0.13)', boxShadow: '0 12px 28px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.04)' },
  clientIdentity: { minWidth: 0 },
  clientName: { fontSize: 18, fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#ffffff' },
  clientLine: { marginTop: 5, color: '#cbd5e1', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  systemLine: { display: 'inline-block', marginTop: 7, borderRadius: 999, padding: '4px 9px', color: '#a5f3fc', background: 'rgba(103,232,249,0.12)', border: '1px solid rgba(103,232,249,0.22)', fontSize: 11, fontWeight: 900 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 999, padding: '0 10px', background: 'rgba(15,23,42,0.30)', border: '1px solid rgba(255,255,255,0.13)', fontSize: 12, fontWeight: 950, textTransform: 'capitalize' },
  dot: { width: 8, height: 8, borderRadius: 999, boxShadow: '0 0 0 3px rgba(255,255,255,0.06)' },
  infoCell: { minHeight: 44, borderRadius: 15, padding: '8px 9px', background: 'rgba(15,23,42,0.30)', border: '1px solid rgba(255,255,255,0.12)' },
  infoLabel: { color: '#bfdbfe', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 950 },
  infoValue: { marginTop: 4, fontSize: 12, fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowActions: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  primarySmall: { height: 38, borderRadius: 999, border: 'none', padding: '0 14px', color: '#fff', background: 'linear-gradient(135deg,#25d366,#16a34a)', fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 22px rgba(34,197,94,0.22)' },
  menuWrap: { position: 'relative' },
  actionSummary: { height: 38, borderRadius: 999, padding: '0 15px', background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(147,197,253,0.28)', color: '#dbeafe', fontWeight: 950, cursor: 'pointer' },
  actionMenu: { position: 'absolute', right: 0, top: 44, zIndex: 9999, width: 245, borderRadius: 18, padding: 9, background: 'linear-gradient(135deg, rgba(38,50,68,0.98), rgba(30,41,59,0.98))', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 22px 58px rgba(15,23,42,0.52)', display: 'grid', gap: 6 },
  desktopActionBackdrop: { position: 'fixed', inset: 0, zIndex: 1650, background: 'transparent' },
  actionMenuPortal: { position: 'fixed', zIndex: 1660, width: 245, borderRadius: 18, padding: 9, paddingBottom: 12, maxHeight: '80vh', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(148,163,184,0.55) rgba(15,23,42,0.65)', background: 'linear-gradient(135deg, rgba(38,50,68,0.98), rgba(30,41,59,0.98))', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 28px 76px rgba(2,6,23,0.62)', display: 'grid', gap: 6, transition: 'opacity 140ms ease, transform 140ms ease', willChange: 'transform, opacity' },
  menuHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 4px 6px 8px', color: '#bfdbfe', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1 },
  menuClose: { width: 27, height: 27, borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.09)', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  menuItem: { minHeight: 37, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 850, textAlign: 'left', padding: '0 11px', cursor: 'pointer' },
  menuDanger: { minHeight: 37, borderRadius: 12, border: '1px solid rgba(248,113,113,0.16)', background: 'rgba(239,68,68,0.20)', color: '#fecaca', fontWeight: 900, textAlign: 'left', padding: '0 11px', cursor: 'pointer' },
  menuDelete: { minHeight: 37, borderRadius: 12, border: '1px solid rgba(248,113,113,0.34)', background: 'linear-gradient(135deg,rgba(127,29,29,0.78),rgba(239,68,68,0.28))', color: '#fff', fontWeight: 950, textAlign: 'left', padding: '0 11px', cursor: 'pointer' },
  empty: { padding: 24, borderRadius: 20, textAlign: 'center', color: '#cbd5e1', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)' },
  sessionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 },
  sessionCard: { display: 'grid', gap: 7, borderRadius: 20, padding: 16, background: 'rgba(15,23,42,0.36)', border: '1px solid rgba(255,255,255,0.13)' },
  sessionTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  usageGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 },
  usageCard: { minHeight: 150, borderRadius: 24, padding: 20, display: 'grid', alignContent: 'center', gap: 8, background: 'linear-gradient(135deg,rgba(59,130,246,0.16),rgba(15,23,42,0.44))', border: '1px solid rgba(147,197,253,0.18)' },
  usageIcon: { fontSize: 28 },
  paymentsPanel: { marginTop: 16, borderRadius: 24, padding: 18, background: 'rgba(15,23,42,0.30)', border: '1px solid rgba(255,255,255,0.12)', display: 'grid', gap: 12 },
  paymentsTitle: { margin: 0, color: '#ffffff', fontSize: 20, fontWeight: 950 },
  paymentsList: { display: 'grid', gap: 9 },
  paymentRow: { minHeight: 54, borderRadius: 16, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' },
  emptyPayments: { borderRadius: 16, padding: 14, color: '#cbd5e1', background: 'rgba(255,255,255,0.06)', fontWeight: 850 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.68)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom))', zIndex: 999 },
  modal: { width: '100%', borderRadius: 26, padding: 24, background: 'linear-gradient(135deg, rgba(51,65,85,0.98), rgba(30,41,59,0.98))', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 26px 80px rgba(15,23,42,0.48)', maxHeight: '90vh', overflow: 'auto' },
  modalCloseButton: { position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(15,23,42,0.72)', color: '#fff', fontSize: 18, fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 24px rgba(2,6,23,0.28)' },
  modalTitle: { fontSize: 30, fontWeight: 950, marginBottom: 8, color: '#fff', paddingRight: 48 },
  modalSub: { color: '#dbeafe', fontSize: 14, marginBottom: 18 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 },
  inputLabel: { fontSize: 12, color: '#dbeafe', fontWeight: 950, marginBottom: 8 },
  input: { height: 48, width: '100%', borderRadius: 15, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(15,23,42,0.28)', color: '#fff', padding: '0 14px', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' },
  textareaInput: { width: '100%', minHeight: 90, resize: 'vertical', borderRadius: 15, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(15,23,42,0.28)', color: '#fff', padding: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, Arial, sans-serif' },
  checkboxRow: { marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 16, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(147,197,253,0.24)', color: '#dbeafe', cursor: 'pointer' },
  inviteBox: { marginTop: 16, padding: 16, borderRadius: 20, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)' },
  inviteTitle: { fontSize: 15, fontWeight: 950, marginBottom: 10, color: '#fff' },
  inviteTextarea: { width: '100%', minHeight: 92, resize: 'vertical', borderRadius: 15, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(15,23,42,0.46)', color: '#fff', padding: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, Arial, sans-serif', fontSize: 13 },
  inviteButtons: { display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  copyButton: { height: 42, borderRadius: 999, border: 'none', padding: '0 17px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 22px rgba(59,130,246,0.22)' },
  whatsButton: { height: 42, borderRadius: 999, border: 'none', padding: '0 17px', background: 'linear-gradient(135deg,#25d366,#16a34a)', color: '#fff', fontWeight: 950, cursor: 'pointer', boxShadow: '0 10px 22px rgba(34,197,94,0.22)' },
  modalActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' },
  cancelButton: { height: 46, borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)', padding: '0 18px', background: 'rgba(255,255,255,0.07)', color: '#fff', fontWeight: 850, cursor: 'pointer' },
  saveButton: { height: 46, borderRadius: 999, border: 'none', padding: '0 19px', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 950, cursor: 'pointer', boxShadow: '0 14px 30px rgba(34,197,94,0.26)' },

  pageMobile: { padding: 'max(12px, env(safe-area-inset-top)) 10px 18px' },  mobileMenuButton: { width: '100%', minHeight: 46, borderRadius: 16, border: '1px solid rgba(147,197,253,0.28)', background: 'rgba(59,130,246,0.18)', color: '#dbeafe', fontWeight: 900, cursor: 'pointer' },
  drawerBackdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.62)', backdropFilter: 'blur(4px)', zIndex: 1190 },
  commandCenterDrawer: { position: 'fixed', top: 0, left: 0, bottom: 0, width: 'min(88vw, 360px)', zIndex: 1200, margin: 0, borderRadius: '0 24px 24px 0', overflowY: 'auto', boxShadow: '18px 0 48px rgba(2,6,23,0.45)', alignContent: 'start' },
  titleMobile: { fontSize: 'clamp(28px, 8vw, 40px)', letterSpacing: -1.1 },
  subtitleMobile: { fontSize: 14, lineHeight: 1.5 },
  heroActionsMobile: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 16 },
  tabsMobile: { overflowX: 'auto', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', gap: 8, paddingBottom: 4 },
  tabMobile: { flexShrink: 0, fontSize: 13, height: 40, padding: '0 14px' },
  radarGridMobile: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 },
  quickActionsMobile: { gridTemplateColumns: '1fr', gap: 8 },
  panelTopMobile: { flexDirection: 'column', alignItems: 'stretch' },
  panelTitleMobile: { fontSize: 22, lineHeight: 1.2 },
  selectMobile: { width: '100%' },
  clientIdentityMobile: { gridColumn: '1 / -1' },
  clientNameMobile: { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', wordBreak: 'break-word', fontSize: 17 },
  clientLineMobile: { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', wordBreak: 'break-word' },

  containerMobile: { gap: 12 },
  heroMasterMobile: { borderRadius: 22, padding: 16, display: 'grid', gap: 14 },
  heroSideMobile: { minWidth: 0, width: '100%' },
  kpiGridMobile: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 },
  commandCenterMobile: { gridTemplateColumns: '1fr', gap: 10 },
  panelMobile: { borderRadius: 20, padding: 12 },
  toolbarMobile: { display: 'grid', gridTemplateColumns: '1fr', width: '100%' },
  searchMobile: { minWidth: 0, width: '100%' },
  clientListMobile: { overflowX: 'visible', gap: 10 },
  clientRowMobile: { minWidth: 0, gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, padding: 12, borderRadius: 18 },
  rowActionsMobile: { gridColumn: '1 / -1', justifyContent: 'stretch', display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' },
  mobileActionOverlay: { position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.66)', backdropFilter: 'blur(4px)', zIndex: 1600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 10px max(10px, env(safe-area-inset-bottom))' },
  mobileActionSheet: { width: '100%', maxWidth: 560, maxHeight: '85dvh', borderRadius: '22px 22px 16px 16px', background: 'linear-gradient(180deg,rgba(30,41,59,0.98),rgba(15,23,42,0.98))', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 -12px 40px rgba(2,6,23,0.55)', overflow: 'hidden' },
  mobileActionSheetHeader: { position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 14px 10px', background: 'rgba(15,23,42,0.9)', borderBottom: '1px solid rgba(255,255,255,0.10)' },
  mobileActionTitle: { color: '#fff', fontWeight: 950, fontSize: 17 },
  mobileActionSub: { color: '#cbd5e1', fontSize: 12, marginTop: 2, maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  mobileActionClose: { width: 34, height: 34, borderRadius: 999, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  mobileActionScroll: { overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 12, display: 'grid', gap: 10 },
  mobileActionGroup: { display: 'grid', gap: 8, padding: 10, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)' },
  mobileActionGroupTitle: { color: '#93c5fd', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 },
  mobileActionBtn: { minHeight: 38, borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15,23,42,0.58)', color: '#fff', fontSize: 13, fontWeight: 850, textAlign: 'left', padding: '0 12px', cursor: 'pointer' },
  mobileActionDangerWrap: { display: 'grid', gap: 8, padding: 10, borderRadius: 14, border: '1px solid rgba(248,113,113,0.22)', background: 'rgba(127,29,29,0.14)' },
  mobileActionDanger: { minHeight: 40, borderRadius: 11, border: '1px solid rgba(248,113,113,0.26)', background: 'rgba(239,68,68,0.24)', color: '#fecaca', fontWeight: 900, textAlign: 'left', padding: '0 12px', cursor: 'pointer' },
  mobileActionDelete: { minHeight: 40, borderRadius: 11, border: '1px solid rgba(248,113,113,0.45)', background: 'linear-gradient(135deg,rgba(127,29,29,0.92),rgba(239,68,68,0.34))', color: '#fff', fontWeight: 950, textAlign: 'left', padding: '0 12px', cursor: 'pointer' },
  whatsFallbackBar: { position: 'fixed', left: 12, right: 12, bottom: 'max(10px, env(safe-area-inset-bottom))', zIndex: 1700, minHeight: 52, borderRadius: 14, border: '1px solid rgba(147,197,253,0.3)', background: 'rgba(15,23,42,0.95)', color: '#dbeafe', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 12px 30px rgba(2,6,23,0.45)' },
  whatsFallbackButton: { height: 34, borderRadius: 999, border: 'none', padding: '0 12px', background: 'linear-gradient(135deg,#25d366,#16a34a)', color: '#fff', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
  whatsFallbackAltButton: { height: 34, borderRadius: 999, border: '1px solid rgba(147,197,253,0.4)', padding: '0 12px', background: 'rgba(30,64,175,0.35)', color: '#dbeafe', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
  whatsFallbackClose: { width: 30, height: 30, borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 900, cursor: 'pointer', marginLeft: 'auto' },
}

