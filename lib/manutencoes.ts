export type PeriodicidadeTipo = 'sem_recorrencia' | 'dias' | 'meses' | 'anos' | 'manual'

export type StatusManutencao = 'em_dia' | 'proxima' | 'vencendo' | 'vencida' | 'realizada' | 'cancelada'

/** IDs de cliente no projeto são bigint; UI/forms usam string. */
export type ClienteId = string | number

/** Converte cliente_id (string|number) para bigint numérico seguro. */
export function normalizarClienteId(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor > 0 && Number.isSafeInteger(valor) ? valor : null
  }
  const texto = String(valor ?? '').trim()
  if (!/^\d+$/.test(texto)) return null
  const numero = Number(texto)
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null
}

export function clienteIdComoTexto(valor: unknown): string {
  const id = normalizarClienteId(valor)
  return id == null ? '' : String(id)
}

export function mesmoClienteId(a: unknown, b: unknown): boolean {
  const esquerda = normalizarClienteId(a)
  const direita = normalizarClienteId(b)
  return esquerda != null && direita != null && esquerda === direita
}

export type Manutencao = {
  id: string
  user_id: string
  cliente_id: ClienteId
  equipamento_id?: string | null
  manutencao_origem_id?: string | null
  titulo: string
  tipo_servico?: string | null
  descricao_servico?: string | null
  data_realizacao: string
  periodicidade_tipo: PeriodicidadeTipo
  periodicidade_valor?: number | null
  proxima_manutencao?: string | null
  dias_antecedencia_aviso: number
  data_inicio_aviso?: string | null
  responsavel?: string | null
  valor_servico?: number | null
  observacoes?: string | null
  recorrencia_ativa: boolean
  cancelada_em?: string | null
  created_at?: string
  updated_at?: string
  cliente?: {
    id: ClienteId
    nome: string
    telefone?: string | null
    endereco?: string | null
  } | null
  equipamento?: EquipamentoCliente | null
}

export type EquipamentoCliente = {
  id: string
  user_id: string
  cliente_id: ClienteId
  nome: string
  categoria?: string | null
  marca?: string | null
  modelo?: string | null
  numero_serie?: string | null
  capacidade?: string | null
  patrimonio?: string | null
  local_instalacao?: string | null
  descricao?: string | null
  observacoes?: string | null
  ativo: boolean
  created_at?: string
  updated_at?: string
}

function dataUtc(data: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''))
  if (!match) throw new Error('Data inválida.')
  const ano = Number(match[1])
  const mes = Number(match[2])
  const dia = Number(match[3])
  const value = new Date(Date.UTC(ano, mes - 1, dia))
  if (
    value.getUTCFullYear() !== ano ||
    value.getUTCMonth() !== mes - 1 ||
    value.getUTCDate() !== dia
  ) {
    throw new Error('Data inválida.')
  }
  return value
}

function dataIso(data: Date) {
  return data.toISOString().slice(0, 10)
}

export function adicionarDias(data: string, dias: number) {
  const value = dataUtc(data)
  value.setUTCDate(value.getUTCDate() + dias)
  return dataIso(value)
}

export function adicionarMesesComLimite(data: string, meses: number) {
  const origem = dataUtc(data)
  const diaOriginal = origem.getUTCDate()
  const primeiroDestino = new Date(Date.UTC(origem.getUTCFullYear(), origem.getUTCMonth() + meses, 1))
  const ultimoDiaDestino = new Date(
    Date.UTC(primeiroDestino.getUTCFullYear(), primeiroDestino.getUTCMonth() + 1, 0),
  ).getUTCDate()
  primeiroDestino.setUTCDate(Math.min(diaOriginal, ultimoDiaDestino))
  return dataIso(primeiroDestino)
}

export function calcularProximaManutencao(params: {
  dataRealizacao: string
  periodicidadeTipo: PeriodicidadeTipo
  periodicidadeValor?: number | null
  proximaDataManual?: string | null
}) {
  const valor = Math.max(0, Number(params.periodicidadeValor || 0))
  if (params.periodicidadeTipo === 'sem_recorrencia') return null
  if (params.periodicidadeTipo === 'manual') {
    return params.proximaDataManual ? dataIso(dataUtc(params.proximaDataManual)) : null
  }
  if (!Number.isInteger(valor) || valor <= 0) throw new Error('Informe uma periodicidade válida.')
  if (params.periodicidadeTipo === 'dias') return adicionarDias(params.dataRealizacao, valor)
  if (params.periodicidadeTipo === 'meses') return adicionarMesesComLimite(params.dataRealizacao, valor)
  if (params.periodicidadeTipo === 'anos') return adicionarMesesComLimite(params.dataRealizacao, valor * 12)
  return null
}

export function calcularInicioAviso(proximaManutencao: string | null, diasAntecedencia = 30) {
  if (!proximaManutencao) return null
  return adicionarDias(proximaManutencao, -Math.max(0, Number(diasAntecedencia || 0)))
}

export function diferencaDias(data: string, hoje = dataIso(new Date())) {
  return Math.ceil((dataUtc(data).getTime() - dataUtc(hoje).getTime()) / 86400000)
}

export function calcularStatusManutencao(
  manutencao: Pick<
    Manutencao,
    'proxima_manutencao' | 'dias_antecedencia_aviso' | 'recorrencia_ativa' | 'cancelada_em'
  >,
  hoje?: string,
): { status: StatusManutencao; diasRestantes: number | null } {
  if (manutencao.cancelada_em || !manutencao.recorrencia_ativa) {
    return { status: manutencao.cancelada_em ? 'cancelada' : 'realizada', diasRestantes: null }
  }
  if (!manutencao.proxima_manutencao) return { status: 'realizada', diasRestantes: null }

  const diasRestantes = diferencaDias(manutencao.proxima_manutencao, hoje)
  if (diasRestantes < 0) return { status: 'vencida', diasRestantes }
  if (diasRestantes <= 7) return { status: 'vencendo', diasRestantes }
  if (diasRestantes <= Number(manutencao.dias_antecedencia_aviso || 30)) {
    return { status: 'proxima', diasRestantes }
  }
  return { status: 'em_dia', diasRestantes }
}

export function formatarDataBr(data?: string | null) {
  if (!data) return '—'
  try {
    return dataUtc(data.slice(0, 10)).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  } catch {
    return '—'
  }
}

export function normalizarTelefoneWhatsapp(telefone?: string | null) {
  const digitos = String(telefone || '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.startsWith('55')) return digitos
  return digitos.length >= 10 ? `55${digitos}` : ''
}

export function mensagemLembreteManutencao(manutencao: Manutencao) {
  const cliente = manutencao.cliente?.nome || 'cliente'
  const equipamento = manutencao.equipamento?.nome || manutencao.titulo || 'serviço'
  return [
    `Olá, ${cliente}! Tudo bem?`,
    '',
    `Estamos entrando em contato para lembrar que a manutenção preventiva do seu ${equipamento} está prevista para ${formatarDataBr(manutencao.proxima_manutencao)}.`,
    `A última manutenção foi realizada em ${formatarDataBr(manutencao.data_realizacao)}.`,
    '',
    'Se desejar, podemos agendar sua próxima revisão.',
  ].join('\n')
}

/** Planeja um novo ciclo sem alterar o registro histórico anterior. */
export function planejarNovoCiclo(manutencaoOrigemId: string) {
  if (!manutencaoOrigemId) throw new Error('Manutenção anterior inválida.')
  return {
    novoRegistro: { manutencao_origem_id: manutencaoOrigemId },
    atualizacaoAnterior: { recorrencia_ativa: false },
  } as const
}
