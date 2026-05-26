import { supabase } from '@/lib/supabase'

export type ContratoCliente = {
  id?: number | string
  nome: string
  telefone?: string
  cpf?: string
  cnpj?: string
  endereco?: string
  bairro?: string
  cidade?: string
  tipoPessoa?: 'PF' | 'PJ'
  email?: string
}

export type ContratoServico = {
  id: string
  numero: string
  data: string
  validade: string
  cliente: ContratoCliente
  descricaoServico: string
  descricaoServicoItens: string[]
  clausulasExtras: string
  valorTotal: number
  parcelas: number
  valorParcela: number
  formaPagamento: string
  prazoExecucao: string
  garantia: string
  cidadeContrato: string
  status: 'Rascunho' | 'Enviado' | 'Assinado' | 'Vencido' | 'Cancelado'
  observacoes?: string
}

export const CONTRATOS_STORAGE_KEY = 'connect_contratos'

const STATUS_RANK: Record<string, number> = {
  Assinado: 4,
  Enviado: 3,
  Rascunho: 2,
  Vencido: 1,
  Cancelado: 0,
}

function parseClienteRow(item: Record<string, unknown>): ContratoCliente {
  let cliente: ContratoCliente = { nome: '' }
  const rawCliente = item.cliente
  if (rawCliente && typeof rawCliente === 'object') {
    const c = rawCliente as Record<string, unknown>
    cliente = {
      id: c.id as string | number | undefined,
      nome: String(c.nome || ''),
      telefone: String(c.telefone || ''),
      cpf: String(c.cpf || ''),
      cnpj: String(c.cnpj || ''),
      endereco: String(c.endereco || ''),
      bairro: String(c.bairro || ''),
      cidade: String(c.cidade || ''),
      tipoPessoa: c.tipoPessoa as 'PF' | 'PJ' | undefined,
      email: String(c.email || ''),
    }
  } else {
    cliente = {
      id: item.cliente_id as string | number | undefined,
      nome: String(item.cliente_nome || ''),
      telefone: String(item.cliente_telefone || ''),
      cpf: String(item.cliente_cpf || ''),
      cnpj: String(item.cliente_cnpj || ''),
      endereco: String(item.cliente_endereco || ''),
    }
  }
  if (!cliente.nome) cliente.nome = String(item.cliente_nome || '')
  return cliente
}

export function contratoFromSupabaseRow(item: Record<string, unknown>): ContratoServico {
  return {
    id: String(item.id ?? ''),
    numero: String(item.numero ?? ''),
    data: String(item.data ?? ''),
    validade: String(item.validade ?? ''),
    cliente: parseClienteRow(item),
    descricaoServico: String(item.descricao_servico ?? item.descricaoServico ?? ''),
    descricaoServicoItens: Array.isArray(item.descricao_servico_itens)
      ? (item.descricao_servico_itens as string[])
      : Array.isArray(item.descricaoServicoItens)
        ? (item.descricaoServicoItens as string[])
        : [],
    clausulasExtras: String(item.clausulas_extras ?? item.clausulasExtras ?? ''),
    valorTotal: Number(item.valor_total ?? item.valorTotal ?? 0),
    parcelas: Number(item.parcelas ?? 1),
    valorParcela: Number(item.valor_parcela ?? item.valorParcela ?? 0),
    formaPagamento: String(item.forma_pagamento ?? item.formaPagamento ?? 'PIX'),
    prazoExecucao: String(item.prazo_execucao ?? item.prazoExecucao ?? ''),
    garantia: String(item.garantia ?? ''),
    cidadeContrato: String(item.cidade_contrato ?? item.cidadeContrato ?? ''),
    status: (String(item.status || 'Rascunho') as ContratoServico['status']) || 'Rascunho',
    observacoes: String(item.observacoes ?? item.observacao ?? ''),
  }
}

export function contratoToSupabasePayload(contrato: ContratoServico, extenso = true) {
  const cli = contrato.cliente || { nome: '' }
  const base: Record<string, unknown> = {
    numero: contrato.numero,
    data: contrato.data,
    validade: contrato.validade,
    cliente_id: cli.id ? String(cli.id) : null,
    cliente_nome: cli.nome || '',
    descricao_servico: contrato.descricaoServico,
    descricao_servico_itens: contrato.descricaoServicoItens,
    clausulas_extras: contrato.clausulasExtras,
    valor_total: contrato.valorTotal,
    parcelas: contrato.parcelas,
    valor_parcela: contrato.valorParcela,
    forma_pagamento: contrato.formaPagamento,
    prazo_execucao: contrato.prazoExecucao,
    garantia: contrato.garantia,
    cidade_contrato: contrato.cidadeContrato,
    status: contrato.status,
  }
  if (!extenso) return base
  return {
    ...base,
    cliente_telefone: cli.telefone || null,
    cliente_cpf: cli.cpf || null,
    cliente_cnpj: cli.cnpj || null,
    cliente_endereco: cli.endereco || null,
    cliente: cli,
    observacoes: contrato.observacoes || null,
  }
}

function lerContratosLocal(): ContratoServico[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CONTRATOS_STORAGE_KEY)
    if (!raw) return []
    const lista = JSON.parse(raw)
    if (!Array.isArray(lista)) return []
    return lista as ContratoServico[]
  } catch {
    return []
  }
}

export function salvarContratosLocal(lista: ContratoServico[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONTRATOS_STORAGE_KEY, JSON.stringify(lista))
  } catch {}
}

function mesclarContrato(a: ContratoServico, b: ContratoServico): ContratoServico {
  const rankA = STATUS_RANK[a.status] ?? 0
  const rankB = STATUS_RANK[b.status] ?? 0
  const base = rankB >= rankA ? { ...a, ...b } : { ...b, ...a }
  return {
    ...base,
    cliente: { ...a.cliente, ...b.cliente, nome: b.cliente?.nome || a.cliente?.nome || '' },
    descricaoServicoItens:
      (b.descricaoServicoItens?.length ? b.descricaoServicoItens : a.descricaoServicoItens) || [],
  }
}

export function mesclarListasContratos(nuvem: ContratoServico[], local: ContratoServico[]): ContratoServico[] {
  const map = new Map<string, ContratoServico>()
  for (const c of local) {
    if (c?.id) map.set(String(c.id), c)
  }
  for (const c of nuvem) {
    const id = String(c.id)
    const existente = map.get(id)
    map.set(id, existente ? mesclarContrato(existente, c) : c)
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = Date.parse(String(a.data || '').split('/').reverse().join('-')) || 0
    const tb = Date.parse(String(b.data || '').split('/').reverse().join('-')) || 0
    return tb - ta
  })
}

export async function buscarContratosPersistidos(): Promise<ContratoServico[]> {
  const local = lerContratosLocal()
  let nuvem: ContratoServico[] = []

  try {
    const { data, error } = await supabase.from('contratos').select('*').order('created_at', { ascending: false })
    if (!error && data?.length) {
      nuvem = data.map((item) => contratoFromSupabaseRow(item as Record<string, unknown>))
    }
  } catch (e) {
    console.warn('[contratos] Erro Supabase:', e)
  }

  const mesclada = mesclarListasContratos(nuvem, local)
  salvarContratosLocal(mesclada)
  return mesclada
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))
}

export async function persistirContrato(contrato: ContratoServico): Promise<ContratoServico> {
  const lista = lerContratosLocal()
  const idx = lista.findIndex((c) => String(c.id) === String(contrato.id))
  if (idx >= 0) lista[idx] = contrato
  else lista.unshift(contrato)
  salvarContratosLocal(lista)

  async function tentarSalvarNuvem(extenso: boolean) {
    const payload = contratoToSupabasePayload(contrato, extenso)
    if (isUuid(contrato.id)) {
      return supabase.from('contratos').update(payload).eq('id', contrato.id).select().single()
    }
    return supabase.from('contratos').insert(payload).select().single()
  }

  try {
    let resp = await tentarSalvarNuvem(true)
    if (resp.error) resp = await tentarSalvarNuvem(false)
    if (!resp.error && resp.data) {
      const salvo = contratoFromSupabaseRow(resp.data as Record<string, unknown>)
      const novaLista = lista.map((c) => (String(c.id) === String(contrato.id) ? salvo : c))
      salvarContratosLocal(novaLista)
      return salvo
    }
  } catch (e) {
    console.warn('[contratos] Erro ao salvar no Supabase:', e)
  }

  return contrato
}

export async function removerContratoPersistido(id: string): Promise<void> {
  const lista = lerContratosLocal().filter((c) => String(c.id) !== String(id))
  salvarContratosLocal(lista)
  try {
    if (isUuid(id)) await supabase.from('contratos').delete().eq('id', id)
  } catch {}
}

export async function atualizarStatusContratoLocal(id: string, status: ContratoServico['status']) {
  const lista = lerContratosLocal()
  const idx = lista.findIndex((c) => String(c.id) === String(id))
  if (idx < 0) return
  lista[idx] = { ...lista[idx], status }
  salvarContratosLocal(lista)
}
