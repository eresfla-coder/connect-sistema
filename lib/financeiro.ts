import { mensagemCobranca } from '@/lib/whatsappMensagens'

export type FinanceiroStatus = 'pendente' | 'pago' | 'atrasado' | 'parcial' | 'hoje' | 'a_vencer'

export type FinanceiroOrigem = 'manual' | 'orcamento' | 'ordem_servico' | 'recibo'

export type FinanceiroTitulo = {
  id: string
  cliente_id?: string | number | null
  cliente_nome?: string | null
  cliente_telefone?: string | null
  descricao?: string | null
  valor?: number | null
  valor_pago?: number | null
  valor_recebido?: number | null
  data_vencimento?: string | null
  data_pagamento?: string | null
  origem?: FinanceiroOrigem | string | null
  origem_id?: string | number | null
  numero_documento?: string | null
  parcela?: number | null
  parcelas?: number | null
  forma_pagamento?: string | null
  observacao?: string | null
  status?: FinanceiroStatus | null
  created_at?: string | null
  updated_at?: string | null
}

export type FinanceiroPagamento = {
  id: string
  financeiro_id?: string | null
  titulo_id?: string | null
  valor?: number | null
  forma_pagamento?: string | null
  observacao?: string | null
  data_pagamento?: string | null
  created_at?: string | null
}

export type ClienteFinanceiro = {
  id: string
  nome: string
  telefone?: string | null
  email?: string | null
}

export type FinanceiroWhatsappCharge = Partial<FinanceiroTitulo> & {
  cliente?: string | null
  valorAberto?: number | null
  vencimento?: string | null
}

export type ParcelamentoInput = {
  total: number
  formaPagamento?: string
  cliente?: {
    id?: string | number
    nome?: string
    telefone?: string
  } | null
  origem?: FinanceiroOrigem | string
  origemId?: string | number
  numeroDocumento?: string
  descricao?: string
  observacao?: string
  dataBase?: Date | string
  dias?: number[]
}

export const FINANCEIRO_STORAGE_KEY = 'connect_financeiro_titulos'
export const FINANCEIRO_PAGAMENTOS_KEY = 'connect_financeiro_pagamentos'

export function money(valor?: number | null) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function parseCurrencyInput(value?: string | number | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const texto = String(value || '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')

  const numero = Number(texto || 0)
  return Number.isFinite(numero) ? numero : 0
}

export function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export function dataISO(data?: Date | string | null) {
  if (!data) return hojeISO()

  if (typeof data === 'string') {
    const limpa = data.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(limpa)) return limpa
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpa)) {
      const [dia, mes, ano] = limpa.split('/')
      return `${ano}-${mes}-${dia}`
    }
  }

  const d = data instanceof Date ? data : new Date(String(data))
  if (Number.isNaN(d.getTime())) return hojeISO()
  return d.toISOString().slice(0, 10)
}

export function formatDateBR(data?: string | null) {
  if (!data) return '-'
  const limpa = String(data).slice(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpa)) return limpa

  if (/^\d{4}-\d{2}-\d{2}$/.test(limpa)) {
    const [ano, mes, dia] = limpa.split('-')
    return `${dia}/${mes}/${ano}`
  }

  try {
    const d = new Date(`${limpa}T00:00:00`)
    if (Number.isNaN(d.getTime())) return String(data)
    return d.toLocaleDateString('pt-BR')
  } catch {
    return String(data)
  }
}

export function addDays(base: Date | string | undefined, dias: number) {
  const iso = dataISO(base)
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + Number(dias || 0))
  return d.toISOString().slice(0, 10)
}

export function extrairDiasParcelamento(texto?: string | null) {
  const bruto = String(texto || '')
  const dias = bruto.match(/\d+/g)?.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0) || []

  if (dias.length) return dias

  const lower = bruto.toLowerCase()
  const matchParcelas = lower.match(/(\d+)\s*x/)
  if (matchParcelas) {
    const qtd = Number(matchParcelas[1])
    if (qtd > 1) return Array.from({ length: qtd }, (_, i) => (i + 1) * 30)
  }

  return [0]
}

export function dividirValor(total: number, parcelas: number) {
  const qtd = Math.max(1, Number(parcelas || 1))
  const centavos = Math.round(Number(total || 0) * 100)
  const base = Math.floor(centavos / qtd)
  const resto = centavos - base * qtd

  return Array.from({ length: qtd }, (_, index) => {
    const valor = base + (index < resto ? 1 : 0)
    return valor / 100
  })
}

function valorPago(item: Partial<FinanceiroTitulo> | null | undefined) {
  return Number(item?.valor_pago ?? item?.valor_recebido ?? 0)
}

export function valorAberto(item: Partial<FinanceiroTitulo> | null | undefined) {
  return Math.max(Number(item?.valor || 0) - valorPago(item), 0)
}

export function normalizeStatus(item: Partial<FinanceiroTitulo> | null | undefined): FinanceiroStatus {
  const valor = Number(item?.valor || 0)
  const recebido = valorPago(item)

  if (recebido >= valor && valor > 0) return 'pago'
  if (recebido > 0 && recebido < valor) return 'parcial'

  const bruto = String(item?.status || '').toLowerCase()
  if (bruto === 'pago') return 'pago'

  if (item?.data_vencimento) {
    const dias = diasAteVencimento(item.data_vencimento)
    if (dias < 0) return 'atrasado'
    if (dias === 0) return 'hoje'
    return 'a_vencer'
  }

  return 'pendente'
}

export function statusLabel(status: FinanceiroStatus) {
  switch (status) {
    case 'pago':
      return 'Pago'
    case 'atrasado':
      return 'Atrasado'
    case 'parcial':
      return 'Parcial'
    case 'hoje':
      return 'Hoje'
    case 'a_vencer':
      return 'A vencer'
    default:
      return 'Pendente'
  }
}

export function buildWhatsappChargeMessage(titulo: FinanceiroWhatsappCharge) {
  const nome = titulo.cliente || titulo.cliente_nome || 'cliente'
  const descricao = titulo.descricao || 'título em aberto'
  const valor = money(titulo.valorAberto ?? valorAberto(titulo) ?? titulo.valor ?? 0)
  const venc = formatDateBR(titulo.vencimento || titulo.data_vencimento)

  return `Olá ${nome}! Passando para lembrar do pagamento referente a ${descricao}. Valor em aberto: ${valor}. Vencimento: ${venc}.`
}

export function makeWhatsappUrl(phone?: string | null, message?: string) {
  let numero = String(phone || '').replace(/\D/g, '')

  if (numero.startsWith('55')) numero = numero.slice(2)
  numero = numero.replace(/^0+/, '')

  const numeroFinal = numero ? `55${numero}` : ''
  const texto = encodeURIComponent(message || '')

  return numeroFinal
    ? `https://api.whatsapp.com/send/?phone=${numeroFinal}&text=${texto}&type=phone_number&app_absent=0`
    : `https://api.whatsapp.com/send/?text=${texto}&app_absent=0`
}

export function lerTitulosFinanceiros(): FinanceiroTitulo[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(FINANCEIRO_STORAGE_KEY)
    const lista = raw ? JSON.parse(raw) : []
    if (!Array.isArray(lista)) return []
    return lista.map((item) => ({
      ...item,
      valor: Number(item.valor || 0),
      valor_pago: Number(item.valor_pago ?? item.valor_recebido ?? 0),
      status: normalizeStatus(item),
    }))
  } catch {
    return []
  }
}

export function salvarTitulosFinanceiros(lista: FinanceiroTitulo[]) {
  if (typeof window === 'undefined') return

  const normalizados = lista
    .map((item) => ({
      ...item,
      valor: Number(item.valor || 0),
      valor_pago: Number(item.valor_pago ?? item.valor_recebido ?? 0),
      status: normalizeStatus(item),
      updated_at: new Date().toISOString(),
    }))
    .sort((a, b) => String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || '')))

  localStorage.setItem(FINANCEIRO_STORAGE_KEY, JSON.stringify(normalizados))
  window.dispatchEvent(new Event('storage'))
  window.dispatchEvent(new CustomEvent('connect-financeiro-change', { detail: normalizados }))
}

export function gerarParcelasFinanceiras(input: ParcelamentoInput): FinanceiroTitulo[] {
  const total = Number(input.total || 0)
  if (total <= 0) return []

  const dias = input.dias?.length ? input.dias : extrairDiasParcelamento(input.formaPagamento)
  const valores = dividirValor(total, dias.length)
  const origemId = input.origemId ?? Date.now()
  const agora = new Date().toISOString()

  return dias.map((dia, index) => {
    const parcela = index + 1
    const parcelas = dias.length
    const vencimento = addDays(input.dataBase, dia)

    return {
      id: `${input.origem || 'manual'}-${origemId}-${parcela}`,
      cliente_id: input.cliente?.id ?? null,
      cliente_nome: input.cliente?.nome || 'Cliente não informado',
      cliente_telefone: input.cliente?.telefone || null,
      descricao: input.descricao || `${input.numeroDocumento ? `Doc. ${input.numeroDocumento} ` : ''}${parcelas > 1 ? `Parcela ${parcela}/${parcelas}` : 'Pagamento'}`,
      valor: valores[index],
      valor_pago: 0,
      data_vencimento: vencimento,
      data_pagamento: null,
      origem: input.origem || 'manual',
      origem_id: origemId,
      numero_documento: input.numeroDocumento || null,
      parcela,
      parcelas,
      forma_pagamento: input.formaPagamento || 'A combinar',
      observacao: input.observacao || null,
      status: 'pendente',
      created_at: agora,
      updated_at: agora,
    }
  })
}

export function salvarParcelasDoDocumento(parcelas: FinanceiroTitulo[], origem: string, origemId: string | number) {
  if (typeof window === 'undefined') return []

  const atuais = lerTitulosFinanceiros()
  const filtrados = atuais.filter((item) => !(String(item.origem || '') === String(origem) && String(item.origem_id || '') === String(origemId)))

  const final = [...filtrados, ...parcelas]
  salvarTitulosFinanceiros(final)

  return final
}

export function gerarFinanceiroDeOrcamento(orcamento: {
  id: number | string
  numero?: string
  cliente?: { id?: string | number; nome?: string; telefone?: string } | null
  total?: number
  formaPagamento?: string
  observacao?: string
  data?: string
}) {
  const parcelas = gerarParcelasFinanceiras({
    total: Number(orcamento.total || 0),
    formaPagamento: orcamento.formaPagamento || 'A combinar',
    cliente: orcamento.cliente || null,
    origem: 'orcamento',
    origemId: orcamento.id,
    numeroDocumento: orcamento.numero || String(orcamento.id || ''),
    descricao: `Orçamento ${orcamento.numero || orcamento.id}`,
    observacao: orcamento.observacao || '',
    dataBase: new Date(),
  })

  return salvarParcelasDoDocumento(parcelas, 'orcamento', orcamento.id)
}

export function diasAteVencimento(data?: string | null) {
  if (!data) return 9999
  const hoje = new Date()
  const venc = new Date(`${String(data).slice(0, 10)}T00:00:00`)
  hoje.setHours(0, 0, 0, 0)
  if (Number.isNaN(venc.getTime())) return 9999
  return Math.ceil((venc.getTime() - hoje.getTime()) / 86400000)
}

export function nivelCobranca(item: Partial<FinanceiroTitulo> | null | undefined) {
  const status = normalizeStatus(item)
  const aberto = valorAberto(item)
  const dias = diasAteVencimento(item?.data_vencimento)

  if (status === 'pago' || aberto <= 0) {
    return { nivel: 'pago', titulo: 'Pago', descricao: 'Cobrança quitada', prioridade: 0 }
  }

  if (dias < 0) {
    return {
      nivel: 'atrasado',
      titulo: 'Atrasado',
      descricao: `Venceu há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`,
      prioridade: 4,
    }
  }

  if (dias === 0) return { nivel: 'hoje', titulo: 'Vence hoje', descricao: 'Enviar lembrete hoje', prioridade: 3 }
  if (dias <= 3) return { nivel: 'proximo', titulo: 'Próximo', descricao: `Vence em ${dias} dia${dias === 1 ? '' : 's'}`, prioridade: 2 }
  if (dias <= 7) return { nivel: 'acompanhar', titulo: 'Acompanhar', descricao: `Vence em ${dias} dias`, prioridade: 1 }

  return { nivel: 'ok', titulo: 'Em dia', descricao: `Vence em ${dias} dias`, prioridade: 0 }
}

export function buildWhatsappChargeMessageV2(
  titulo: FinanceiroWhatsappCharge,
  opts?: { nomeEmpresa?: string },
) {
  const nivel = nivelCobranca(titulo)
  const valor = money(titulo.valorAberto ?? valorAberto(titulo) ?? titulo.valor ?? 0)
  const venc = formatDateBR(titulo.vencimento || titulo.data_vencimento)

  return mensagemCobranca({
    nomeEmpresa: opts?.nomeEmpresa,
    nomeCliente: titulo.cliente || titulo.cliente_nome,
    descricao: titulo.descricao || 'pagamento em aberto',
    valorFormatado: valor,
    vencimentoFormatado: venc,
    atrasado: nivel.nivel === 'atrasado',
    venceHoje: nivel.nivel === 'hoje',
  })
}

export function gerarFinanceiroDeOrdemServico(os: {
  id: number | string
  numero?: string
  cliente?: string
  telefone?: string
  valor?: number
  entrada?: number
  saldo?: number
  equipamento?: string
  observacao?: string
  previsao?: string
  data?: string
}) {
  const saldo = Number(os.saldo ?? Math.max(Number(os.valor || 0) - Number(os.entrada || 0), 0))
  if (saldo <= 0) return lerTitulosFinanceiros()

  const parcelas = gerarParcelasFinanceiras({
    total: saldo,
    formaPagamento: 'A combinar',
    cliente: {
      nome: os.cliente || 'Cliente não informado',
      telefone: os.telefone || '',
    },
    origem: 'ordem_servico',
    origemId: os.id,
    numeroDocumento: os.numero || String(os.id || ''),
    descricao: `OS ${os.numero || os.id}${os.equipamento ? ` - ${os.equipamento}` : ''}`,
    observacao: os.observacao || '',
    dataBase: os.previsao || new Date(),
    dias: [30],
  })

  return salvarParcelasDoDocumento(parcelas, 'ordem_servico', os.id)
}

export function removerFinanceiroDoDocumento(origem: string, origemId: string | number) {
  if (typeof window === 'undefined') return []
  const atuais = lerTitulosFinanceiros()
  const filtrados = atuais.filter((item) => !(String(item.origem || '') === String(origem) && String(item.origem_id || '') === String(origemId)))
  salvarTitulosFinanceiros(filtrados)
  return filtrados
}

export function sincronizarFinanceiroLocalCompleto(params: {
  orcamentos?: any[]
  ordensServico?: any[]
}) {
  if (typeof window === 'undefined') return []

  let atuais = lerTitulosFinanceiros()

  for (const orc of params.orcamentos || []) {
    if (!orc?.id || Number(orc?.total || 0) <= 0) continue
    const jaExiste = atuais.some((item) => String(item.origem) === 'orcamento' && String(item.origem_id) === String(orc.id))
    if (!jaExiste) {
      atuais = gerarFinanceiroDeOrcamento(orc)
    }
  }

  for (const os of params.ordensServico || []) {
    if (!os?.id) continue
    const status = String(os.status || '').toLowerCase()
    if (status.includes('cancel')) continue
    const saldo = Number(os.saldo ?? Math.max(Number(os.valor || 0) - Number(os.entrada || 0), 0))
    if (saldo <= 0) continue
    const jaExiste = atuais.some((item) => String(item.origem) === 'ordem_servico' && String(item.origem_id) === String(os.id))
    if (!jaExiste) {
      atuais = gerarFinanceiroDeOrdemServico(os)
    }
  }

  return lerTitulosFinanceiros()
}
