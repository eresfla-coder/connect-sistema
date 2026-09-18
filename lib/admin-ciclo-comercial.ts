/**
 * ADMIN.3.1 — ciclo comercial da carteira (puro / testável).
 * Independente de Auth, perfis e Mercado Pago.
 */

export type StatusInicialComercial = 'ativo' | 'trial' | 'bloqueado'

export type StatusPagamentoComercial = 'pendente' | 'trial' | 'em_dia' | 'pago' | 'bloqueado'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuidAdmin(valor: unknown): boolean {
  return UUID_RE.test(String(valor || '').trim())
}

/** YYYY-MM-DD a partir de Date local (sem UTC shift). */
export function dataCalendarioLocal(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDataCalendario(iso: string): { y: number; m: number; d: number } | null {
  const s = String(iso || '').trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

export function formatDataCalendario(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function validarDiaVencimento(valor: unknown): number | null {
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  const dia = Math.floor(n)
  if (dia < 1 || dia > 28) return null
  return dia
}

export function validarDiasTrial(valor: unknown): number | null {
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  const dias = Math.floor(n)
  if (dias < 1 || dias > 90) return null
  return dias
}

export function adicionarDiasCalendario(iso: string, dias: number): string {
  const p = parseDataCalendario(iso)
  if (!p) throw new Error('Data inválida')
  const dt = new Date(p.y, p.m - 1, p.d)
  dt.setDate(dt.getDate() + dias)
  return dataCalendarioLocal(dt)
}

/**
 * Primeira data de vencimento para cliente ATIVO com dia_vencimento.
 * - Se o dia ainda não ocorreu neste mês (hoje < dia): dia no mês atual
 * - Se já ocorreu ou é hoje: dia no próximo mês
 */
export function calcularPrimeiroVencimentoAtivo(params: {
  hoje: string
  diaVencimento: number
}): string {
  const dia = validarDiaVencimento(params.diaVencimento)
  if (dia == null) throw new Error('Dia de vencimento inválido (1–28).')
  const hoje = parseDataCalendario(params.hoje)
  if (!hoje) throw new Error('Data de referência inválida.')

  if (hoje.d < dia) {
    return formatDataCalendario(hoje.y, hoje.m, dia)
  }
  let y = hoje.y
  let m = hoje.m + 1
  if (m > 12) {
    m = 1
    y += 1
  }
  return formatDataCalendario(y, m, dia)
}

/**
 * Próximo ciclo mensal a partir da data de vencimento atual (ou de hoje).
 * Sempre avança para o mês seguinte com o dia_vencimento (1–28).
 */
export function calcularProximoVencimentoMensal(params: {
  dataReferencia: string
  diaVencimento: number
}): string {
  const dia = validarDiaVencimento(params.diaVencimento)
  if (dia == null) throw new Error('Dia de vencimento inválido (1–28).')
  const ref = parseDataCalendario(params.dataReferencia)
  if (!ref) throw new Error('Data de referência inválida.')

  let y = ref.y
  let m = ref.m + 1
  if (m > 12) {
    m = 1
    y += 1
  }
  return formatDataCalendario(y, m, dia)
}

export function normalizarStatusInicial(valor: unknown): StatusInicialComercial {
  const v = String(valor || '')
    .trim()
    .toLowerCase()
  if (v === 'ativo') return 'ativo'
  if (v === 'bloqueado') return 'bloqueado'
  if (v === 'trial' || v === 'teste') return 'trial'
  return 'trial'
}

/**
 * Campos comerciais iniciais do vínculo (sem Auth).
 * Ativo: status_pagamento=pendente, ultimo_pagamento=null (não presume pagamento).
 * Trial: não gera receita/MRR.
 * Bloqueado: só no vínculo — não implica admin_clientes.ativo=false (multissistema).
 */
export function camposIniciaisVinculoComercial(params: {
  statusInicial: StatusInicialComercial
  hoje?: string
  diaVencimento?: number | null
  diasTrial?: number | null
  dataVencimentoOverride?: string | null
}): {
  status: StatusInicialComercial
  status_pagamento: StatusPagamentoComercial
  inicio: string
  fim_trial: string | null
  data_vencimento: string | null
  dia_vencimento: number | null
  ultimo_pagamento: null
  /** Sempre true no cadastro: bloqueio é por vínculo. */
  admin_cliente_ativo: true
} {
  const hoje = params.hoje || dataCalendarioLocal()
  const status = params.statusInicial

  if (status === 'trial') {
    const n = validarDiasTrial(params.diasTrial ?? 7) ?? 7
    const fim = params.dataVencimentoOverride
      ? String(params.dataVencimentoOverride).slice(0, 10)
      : adicionarDiasCalendario(hoje, n)
    return {
      status: 'trial',
      status_pagamento: 'trial',
      inicio: hoje,
      fim_trial: fim,
      data_vencimento: fim,
      dia_vencimento: validarDiaVencimento(params.diaVencimento),
      ultimo_pagamento: null,
      admin_cliente_ativo: true,
    }
  }

  if (status === 'bloqueado') {
    const dia = validarDiaVencimento(params.diaVencimento)
    let data: string | null = params.dataVencimentoOverride
      ? String(params.dataVencimentoOverride).slice(0, 10)
      : null
    if (!data && dia != null) {
      data = calcularPrimeiroVencimentoAtivo({ hoje, diaVencimento: dia })
    }
    return {
      status: 'bloqueado',
      status_pagamento: 'bloqueado',
      inicio: hoje,
      fim_trial: null,
      data_vencimento: data,
      dia_vencimento: dia,
      ultimo_pagamento: null,
      admin_cliente_ativo: true,
    }
  }

  // ativo
  const dia = validarDiaVencimento(params.diaVencimento)
  let data: string | null = params.dataVencimentoOverride
    ? String(params.dataVencimentoOverride).slice(0, 10)
    : null
  if (!data) {
    if (dia == null) {
      throw new Error('Informe o dia de vencimento (1–28) para cliente ativo.')
    }
    data = calcularPrimeiroVencimentoAtivo({ hoje, diaVencimento: dia })
  }
  return {
    status: 'ativo',
    status_pagamento: 'pendente',
    inicio: hoje,
    fim_trial: null,
    data_vencimento: data,
    dia_vencimento: dia,
    ultimo_pagamento: null,
    admin_cliente_ativo: true,
  }
}

/** Compara YYYY-MM-DD: -1 se a<b, 0 se iguais, 1 se a>b. */
export function compararDataCalendario(a: string, b: string): number {
  const pa = parseDataCalendario(a)
  const pb = parseDataCalendario(b)
  if (!pa || !pb) throw new Error('Data inválida')
  const sa = formatDataCalendario(pa.y, pa.m, pa.d)
  const sb = formatDataCalendario(pb.y, pb.m, pb.d)
  if (sa < sb) return -1
  if (sa > sb) return 1
  return 0
}

/**
 * Próximo vencimento APÓS marcar pagamento.
 * - se data_vencimento atual > hoje: preservar
 * - se atual <= hoje ou ausente: primeira ocorrência do dia ESTRITAMENTE posterior a hoje
 */
export function calcularProximoVencimentoAposPagamento(params: {
  hoje: string
  dataVencimentoAtual?: string | null
  diaVencimento: number
}): string {
  const dia = validarDiaVencimento(params.diaVencimento)
  if (dia == null) throw new Error('Dia de vencimento inválido (1–28).')
  const hoje = String(params.hoje || '').slice(0, 10)
  if (!parseDataCalendario(hoje)) throw new Error('Data de referência inválida.')

  const atual = params.dataVencimentoAtual
    ? String(params.dataVencimentoAtual).slice(0, 10)
    : null
  if (atual && parseDataCalendario(atual) && compararDataCalendario(atual, hoje) > 0) {
    return atual
  }
  return calcularPrimeiroVencimentoAtivo({ hoje, diaVencimento: dia })
}

/**
 * Renovar: avança só o ciclo. Não grava/apaga pagamento.
 * status_pagamento / ultimo_pagamento NÃO entram no retorno → DB preserva.
 */
export function aplicarRenovacaoComercial(params: {
  dataVencimentoAtual?: string | null
  diaVencimento: number
  hoje?: string
}): {
  data_vencimento: string
  status: 'ativo'
} {
  const hoje = params.hoje || dataCalendarioLocal()
  const ref =
    params.dataVencimentoAtual && parseDataCalendario(params.dataVencimentoAtual)
      ? String(params.dataVencimentoAtual).slice(0, 10)
      : hoje
  return {
    data_vencimento: calcularProximoVencimentoMensal({
      dataReferencia: ref,
      diaVencimento: params.diaVencimento,
    }),
    status: 'ativo',
  }
}

/**
 * Marcar pago: registra pagamento real + próximo vencimento futuro (ou preserva se já futuro).
 */
export function aplicarMarcarPagoComercial(params: {
  dataVencimentoAtual?: string | null
  diaVencimento: number
  hoje?: string
}): {
  data_vencimento: string
  status: 'ativo'
  status_pagamento: 'em_dia'
  ultimo_pagamento: string
} {
  const hoje = params.hoje || dataCalendarioLocal()
  return {
    data_vencimento: calcularProximoVencimentoAposPagamento({
      hoje,
      dataVencimentoAtual: params.dataVencimentoAtual,
      diaVencimento: params.diaVencimento,
    }),
    status: 'ativo',
    status_pagamento: 'em_dia',
    ultimo_pagamento: hoje,
  }
}

export function aplicarBloqueioVinculo(): {
  status: 'bloqueado'
  status_pagamento: 'bloqueado'
} {
  return { status: 'bloqueado', status_pagamento: 'bloqueado' }
}

export function aplicarDesbloqueioVinculo(): {
  status: 'ativo'
  status_pagamento: 'pendente'
} {
  return { status: 'ativo', status_pagamento: 'pendente' }
}

/**
 * Bloquear um vínculo NÃO deve desativar admin_clientes.ativo
 * se o cliente puder ter outros sistemas.
 */
export function deveDesativarAdminClientePorBloqueioVinculo(): false {
  return false
}

export type ItemVinculoMetricas = {
  status?: string | null
  valor?: number | null
  data_vencimento?: string | null
  status_pagamento?: string | null
}

export type MetricasCicloComercial = {
  totalClientes: number
  mrr: number
  recebido: number
  trials: number
  novos: number
  vencidos: number
  vencendo7: number
  bloqueados: number
  /** valor >= 400 e status ativo (regra comercial existente “ANUAL”) */
  anual: number
}

function diasAte(iso?: string | null, hoje?: string): number | null {
  const p = parseDataCalendario(String(iso || ''))
  if (!p) return null
  const h = parseDataCalendario(hoje || dataCalendarioLocal())
  if (!h) return null
  const a = Date.UTC(p.y, p.m - 1, p.d)
  const b = Date.UTC(h.y, h.m - 1, h.d)
  return Math.floor((a - b) / 86400000)
}

/** MRR: somente vínculos status=ativo (trial/bloqueado fora). */
export function vinculoEntraNoMrr(v: ItemVinculoMetricas): boolean {
  return String(v.status || '').toLowerCase() === 'ativo'
}

/** RECEBIDO: só pagamento efetivo em_dia/pago. */
export function vinculoEntraNoRecebido(v: ItemVinculoMetricas): boolean {
  return ['em_dia', 'pago'].includes(String(v.status_pagamento || '').toLowerCase())
}

export function calcularMetricasCicloComercial(params: {
  clientes: Array<{ data_criacao?: string | null; vinculos: ItemVinculoMetricas[] }>
  hoje?: string
}): MetricasCicloComercial {
  const hoje = params.hoje || dataCalendarioLocal()
  const totalClientes = params.clientes.length
  let mrr = 0
  let recebido = 0
  let trials = 0
  let vencidos = 0
  let vencendo7 = 0
  let bloqueados = 0
  let anual = 0

  for (const c of params.clientes) {
    for (const v of c.vinculos || []) {
      const st = String(v.status || '').toLowerCase()
      const valor = Number(v.valor || 0)
      if (st === 'trial' || st === 'teste') trials += 1
      if (st === 'bloqueado') bloqueados += 1
      if (vinculoEntraNoMrr(v)) {
        mrr += valor
        if (valor >= 400) anual += valor
      }
      if (vinculoEntraNoRecebido(v)) recebido += valor
      if (st !== 'bloqueado') {
        const d = diasAte(v.data_vencimento, hoje)
        if (d !== null && d < 0) vencidos += 1
        if (d !== null && d >= 0 && d <= 7) vencendo7 += 1
      }
    }
  }

  const novos = params.clientes.filter((c) => {
    const criado = c.data_criacao ? new Date(c.data_criacao) : null
    return !!criado && !Number.isNaN(criado.getTime()) && Date.now() - criado.getTime() <= 30 * 86400000
  }).length

  return { totalClientes, mrr, recebido, trials, novos, vencidos, vencendo7, bloqueados, anual }
}

export function montarMensagemCobrancaPorOrigem(params: {
  origem: 'connect' | 'terceiro'
  nome: string
  sistema: string
  valor: number
  vencimento?: string | null
  status?: string | null
  siteUrl?: string
}): { mensagem: string; incluiAssinaturaConnect: boolean } {
  const valorFmt = Number(params.valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const venc = params.vencimento
    ? (() => {
        const p = parseDataCalendario(params.vencimento)
        if (!p) return params.vencimento
        return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`
      })()
    : '-'

  if (params.origem === 'terceiro') {
    const mensagem = [
      `Olá, ${params.nome}!`,
      '',
      `Passando para lembrar sobre a mensalidade do ${params.sistema}.`,
      `Valor: ${valorFmt}`,
      `Vencimento: ${venc}`,
      params.status ? `Status: ${params.status}` : '',
      '',
      'Quando puder, me confirma o pagamento por aqui.',
      '',
      '— Connect (carteira comercial)',
    ]
      .filter(Boolean)
      .join('\n')
    return { mensagem, incluiAssinaturaConnect: false }
  }

  const link = `${String(params.siteUrl || '').replace(/\/$/, '')}/assinatura`
  const mensagem = [
    `Olá, ${params.nome}!`,
    '',
    `Passando para lembrar sobre sua mensalidade do ${params.sistema}.`,
    `Valor: ${valorFmt}`,
    `Vencimento: ${venc}`,
    `Status: ${params.status || 'Pendente'}`,
    `Link de pagamento/assinatura: ${link}`,
    '',
    'Para manter o acesso e o suporte em dia, me chama por aqui para regularizar.',
    '',
    '— Connect Sistema',
  ].join('\n')
  return { mensagem, incluiAssinaturaConnect: true }
}

/**
 * Sync opcional de perfis SOMENTE para vínculo Connect com acesso_connect.
 * Nunca criar Auth. Nunca aplicar a terceiro.
 */
export function deveSincronizarPerfilConnect(params: {
  origem: string
  acessoConnect: boolean
  perfilId?: string | null
}): boolean {
  return (
    String(params.origem).toLowerCase() === 'connect' &&
    params.acessoConnect === true &&
    Boolean(params.perfilId)
  )
}

export const CODIGO_CONNECT_SYNC_FAILED = 'ADMIN_CONNECT_SYNC_FAILED'
export const CODIGO_CONNECT_SYNC_INCONSISTENT = 'ADMIN_CONNECT_SYNC_INCONSISTENT'
export const MSG_CONNECT_SYNC_FAILED =
  'Não foi possível sincronizar o acesso Connect. A alteração comercial foi revertida.'
export const MSG_CONNECT_SYNC_INCONSISTENT =
  'Falha ao sincronizar o acesso Connect e ao restaurar o vínculo. Contate o suporte.'

export type SnapshotVinculoComercial = {
  status: string | null
  valor: number | null
  dia_vencimento: number | null
  data_vencimento: string | null
  status_pagamento: string | null
  ultimo_pagamento: string | null
  observacoes: string | null
  fim_trial: string | null
}

/** Snapshot dos campos comerciais alteráveis (compensação por vínculo). */
export function montarSnapshotVinculoComercial(v: {
  status?: string | null
  valor?: number | null
  dia_vencimento?: number | null
  data_vencimento?: string | null
  status_pagamento?: string | null
  ultimo_pagamento?: string | null
  observacoes?: string | null
  fim_trial?: string | null
}): SnapshotVinculoComercial {
  return {
    status: v.status != null ? String(v.status) : null,
    valor: v.valor != null ? Number(v.valor) : null,
    dia_vencimento: v.dia_vencimento != null ? Number(v.dia_vencimento) : null,
    data_vencimento: v.data_vencimento ? String(v.data_vencimento).slice(0, 10) : null,
    status_pagamento: v.status_pagamento != null ? String(v.status_pagamento) : null,
    ultimo_pagamento: v.ultimo_pagamento ? String(v.ultimo_pagamento).slice(0, 10) : null,
    observacoes: v.observacoes != null ? String(v.observacoes) : null,
    fim_trial: v.fim_trial ? String(v.fim_trial).slice(0, 10) : null,
  }
}

/**
 * Decisão pós-sync Connect (testável).
 * Terceiro / sem sync: sucesso sem compensação.
 */
export function decidirResultadoSyncConnect(params: {
  precisaSync: boolean
  syncOk: boolean
  compensacaoOk?: boolean
}):
  | { ok: true; code?: undefined }
  | { ok: false; code: typeof CODIGO_CONNECT_SYNC_FAILED | typeof CODIGO_CONNECT_SYNC_INCONSISTENT; deveCompensar: boolean } {
  if (!params.precisaSync) return { ok: true }
  if (params.syncOk) return { ok: true }
  if (params.compensacaoOk === true) {
    return { ok: false, code: CODIGO_CONNECT_SYNC_FAILED, deveCompensar: true }
  }
  return { ok: false, code: CODIGO_CONNECT_SYNC_INCONSISTENT, deveCompensar: true }
}

export function payloadSyncPerfilConnect(params: {
  status: string
  dataVencimento?: string | null
  statusPagamento?: string | null
  ultimoPagamento?: string | null
  valor?: number | null
}): {
  status: string
  ativo: boolean
  vencimento: string | null
  status_pagamento: string | null
  ultimo_pagamento: string | null
  valor_plano?: number
} {
  const st = String(params.status || '').toLowerCase()
  return {
    status: st === 'bloqueado' ? 'bloqueado' : st === 'trial' ? 'trial' : 'ativo',
    ativo: st !== 'bloqueado',
    vencimento: params.dataVencimento ? String(params.dataVencimento).slice(0, 10) : null,
    status_pagamento: params.statusPagamento ? String(params.statusPagamento) : null,
    ultimo_pagamento: params.ultimoPagamento ? String(params.ultimoPagamento).slice(0, 10) : null,
    ...(params.valor != null ? { valor_plano: Number(params.valor) } : {}),
  }
}
