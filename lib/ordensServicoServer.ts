/** Mapeamento OS para Supabase — somente server/API. */

export type OsPayloadCliente = {
  id?: number
  numero?: string
  cliente?: string
  telefone?: string
  whatsapp?: string
  equipamento?: string
  status?: string
  prioridade?: string
  valor?: number
  entrada?: number
  saldo?: number
  [key: string]: unknown
}

function osAprovadoPorStatus(status?: string) {
  const valor = String(status || '').toLowerCase()
  return valor.includes('aprov') || valor === 'finalizada' || valor === 'entregue'
}

function serializarPayloadOs(os: OsPayloadCliente): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(os)) as Record<string, unknown>
  } catch {
    return { ...os }
  }
}

export function osParaUpsertSupabaseRow(os: OsPayloadCliente, userId: string) {
  const status = String(os.status || 'Aberta')
  const telefone = String(os.telefone || os.whatsapp || '').trim()

  return {
    user_id: userId,
    local_id: String(os.id),
    numero: String(os.numero || ''),
    cliente: String(os.cliente || '').trim(),
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
