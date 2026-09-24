/**
 * ADMIN.4.3.7 / 4.3.7a — normalização pura de rows de restore/import de orçamentos.
 *
 * Formato de backup ≠ OrcamentoSalvo do painel; NÃO reutiliza
 * orcamentoParaUpsertSupabase (evita cast artificial).
 *
 * - Tenant (user_id) SEMPRE vem do parâmetro autorizado — nunca do arquivo.
 * - Payload permanece íntegro (sem reestruturar/recalcular/reescrever status).
 * - Resumo top-level: NÃO inventa informação ausente.
 *
 * Políticas 4.3.7a:
 * - status ausente/desconhecido → null (coluna nullable; "gerado" etc. ficam só no payload)
 * - total ausente → null; total explícito 0 preservado
 * - cliente ausente/inválido → null
 * - aprovado: boolean explícito → senão derivado de status canônico Aprovado/Convertido
 *   → senão false (schema NOT NULL DEFAULT false; restore pré-4.3.7 omitia a coluna)
 */

export type StatusOrcamentoBackup = 'Pendente' | 'Aprovado' | 'Convertido' | 'Cancelado'

export type OrcamentoBackupRestoreRow = {
  user_id: string
  local_id: string
  /** null = ausente ou não-canônico no backup (não inventar Pendente) */
  status: StatusOrcamentoBackup | null
  /** null = ausente; 0 = zero explícito */
  total: number | null
  cliente: string | null
  /** NOT NULL no schema — sempre boolean */
  aprovado: boolean
  payload: unknown
  updated_at: string
}

const STATUS_CANONICOS = new Set<string>(['Pendente', 'Aprovado', 'Convertido', 'Cancelado'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/** Rejeita undefined / "undefined" / "null" / string vazia como dado operacional. */
export function textoOperacionalOuNull(v: unknown): string | null {
  if (v == null) return null
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).trim()
  if (!s || s === 'undefined' || s === 'null') return null
  return s
}

/** Número finito (inclui 0). Ausente/inválido → null (não confundir 0 com ausência). */
export function numeroOperacionalOuNull(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t || t === 'undefined' || t === 'null') return null
  }
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Status canônico do enum do painel.
 * Desconhecido (ex.: "gerado") → null — NÃO converter para Pendente no resumo.
 */
export function statusOrcamentoBackup(raw: unknown): StatusOrcamentoBackup | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s || s === 'undefined' || s === 'null') return null
  if (STATUS_CANONICOS.has(s)) return s as StatusOrcamentoBackup
  return null
}

/**
 * Payload do item de backup:
 * - row DB: item.payload
 * - cloud/legado: o próprio item é o documento
 * Nunca muta a referência de entrada.
 */
export function extrairPayloadBackup(item: Record<string, unknown>): unknown {
  if ('payload' in item && item.payload !== undefined) {
    return item.payload
  }
  return item
}

function payloadComoObjeto(payload: unknown): Record<string, unknown> | null {
  return isPlainObject(payload) ? payload : null
}

/** Cliente top-level (string) ou payload.cliente (.nome | string). */
export function clienteOrcamentoBackup(
  topLevel: unknown,
  payload: unknown,
): string | null {
  const top = textoOperacionalOuNull(topLevel)
  if (top) return top

  const p = payloadComoObjeto(payload)
  if (!p) return null
  const c = p.cliente
  if (typeof c === 'string') return textoOperacionalOuNull(c)
  if (isPlainObject(c)) return textoOperacionalOuNull(c.nome)
  return null
}

/**
 * Total final persistido — sem recalcular.
 * Ausência → null (não inventar 0 financeiro).
 */
export function totalOrcamentoBackup(topLevel: unknown, payload: unknown): number | null {
  const top = numeroOperacionalOuNull(topLevel)
  if (top != null) return top
  const p = payloadComoObjeto(payload)
  if (!p) return null
  return numeroOperacionalOuNull(p.total)
}

/**
 * Status do resumo: só valores canônicos.
 * Ausente ou desconhecido → null (payload permanece intacto com o valor original).
 */
export function statusOrcamentoBackupResolvido(
  topLevel: unknown,
  payload: unknown,
): StatusOrcamentoBackup | null {
  const topCanon = statusOrcamentoBackup(topLevel)
  if (topCanon) return topCanon

  const p = payloadComoObjeto(payload)
  if (p && 'status' in p) {
    return statusOrcamentoBackup(p.status)
  }

  return null
}

/**
 * Aprovado — coluna NOT NULL DEFAULT false.
 *
 * 1. top-level boolean explícito
 * 2. payload.aprovado boolean explícito
 * 3. status canônico Aprovado/Convertido → true
 * 4. caso contrário → false
 *
 * Justificativa do false quando informação ausente:
 * - schema exige boolean (DEFAULT false);
 * - restore pré-4.3.7 omitia a coluna → Postgres aplicava DEFAULT false;
 * - não há evidência para marcar true sem aprovado explícito ou status canônico aprovado.
 */
export function aprovadoOrcamentoBackup(
  topLevel: unknown,
  payload: unknown,
  statusResolvido: StatusOrcamentoBackup | null,
): boolean {
  if (typeof topLevel === 'boolean') return topLevel
  const p = payloadComoObjeto(payload)
  if (p && typeof p.aprovado === 'boolean') return p.aprovado
  return statusResolvido === 'Aprovado' || statusResolvido === 'Convertido'
}

export function localIdOrcamentoBackup(item: Record<string, unknown>): string {
  const fromLocal = textoOperacionalOuNull(item.local_id)
  if (fromLocal) return fromLocal
  const fromId = textoOperacionalOuNull(item.id)
  return fromId || ''
}

/**
 * Monta row de upsert para public.orcamentos a partir de item de backup.
 * `authorizedUserId` é a ÚNICA fonte de tenant — item.user_id é ignorado.
 */
export function orcamentoBackupParaRestoreRow(
  item: Record<string, unknown>,
  authorizedUserId: string,
  updatedAt = new Date().toISOString(),
): OrcamentoBackupRestoreRow | null {
  const local_id = localIdOrcamentoBackup(item)
  if (!local_id) return null

  const payload = extrairPayloadBackup(item)
  const status = statusOrcamentoBackupResolvido(item.status, payload)
  const total = totalOrcamentoBackup(item.total, payload)
  const cliente = clienteOrcamentoBackup(item.cliente, payload)
  const aprovado = aprovadoOrcamentoBackup(item.aprovado, payload, status)

  return {
    user_id: authorizedUserId,
    local_id,
    status,
    total,
    cliente,
    aprovado,
    payload,
    updated_at: updatedAt,
  }
}
