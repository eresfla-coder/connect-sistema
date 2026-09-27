/**
 * Lógica pura do backfill das colunas resumo de public.orcamentos.
 *
 * Sem Supabase client, sem service_role, sem escrita. Tudo aqui é cálculo em
 * memória ou leitura HTTP GET com fetch injetado.
 *
 * Regras (top-level existente é autoridade; payload nunca é alterado):
 * - status: só preenche coluna null com payload.status canônico exato.
 *   "gerado"/desconhecido/ausente → NO-OP (nunca vira Pendente).
 * - total: só preenche coluna null com payload.total number finito (0 válido).
 *   String numérica, objeto, null, ausente → NO-OP. Nunca recalcula.
 * - cliente: só preenche coluna null com payload.cliente.nome ou payload.cliente
 *   string válida (trim, != "undefined"/"null" case-insensitive).
 * - aprovado, payload, user_id, local_id, created_at: nunca entram no patch.
 */
import { createHash } from 'node:crypto'

export const CANONICAL_STATUSES = Object.freeze(['Pendente', 'Aprovado', 'Convertido', 'Cancelado'])
export const PATCHABLE_FIELDS = Object.freeze(['status', 'total', 'cliente'])
/** Marcador sintético da linha de teste do smoke ADMIN.4.3.6b — nunca é candidata a write. */
export const PROTECTED_TEST_CLIENT = 'TESTE NORMALIZACAO 436B'

export const CATEGORY = Object.freeze({
  ALREADY_NORMALIZED: 'ALREADY_NORMALIZED',
  SAFE_FULL: 'SAFE_FULL',
  SAFE_PARTIAL: 'SAFE_PARTIAL',
  NO_SAFE_DATA: 'NO_SAFE_DATA',
  ANOMALY: 'ANOMALY',
})

export const SELECT_COLUMNS = 'id,user_id,local_id,status,total,cliente,aprovado,created_at,updated_at,payload'

const CANONICAL_SET = new Set(CANONICAL_STATUSES)
const PATCHABLE_SET = new Set(PATCHABLE_FIELDS)

export function isNullish(v) {
  return v === null || v === undefined
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** String de cliente confiável ou null. */
export function validClientName(v) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === 'undefined' || lower === 'null') return null
  return s
}

/** Status canônico exato ou null. */
export function canonicalStatus(v) {
  return typeof v === 'string' && CANONICAL_SET.has(v) ? v : null
}

export function validTotal(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Nome do cliente no payload: 1) payload.cliente.nome  2) payload.cliente string. */
export function payloadClientName(payload) {
  if (!isPlainObject(payload)) return null
  const c = payload.cliente
  if (isPlainObject(c)) return validClientName(c.nome)
  if (typeof c === 'string') return validClientName(c)
  return null
}

export function maskId(v, head = 8) {
  const s = String(v ?? '')
  if (!s) return '(vazio)'
  return s.length <= head ? `${s}…` : `${s.slice(0, head)}…`
}

export function maskLocalId(v) {
  const s = String(v ?? '')
  if (!s) return '(vazio)'
  if (s.length <= 8) return `${s.slice(0, 2)}…`
  return `${s.slice(0, 6)}…${s.slice(-2)}`
}

export function rowKey(row) {
  return `${String(row.user_id ?? '')}|${String(row.local_id ?? '')}`
}

export function isProtectedTestRow(row) {
  const target = PROTECTED_TEST_CLIENT.toLowerCase()
  const col = typeof row.cliente === 'string' ? row.cliente.trim().toLowerCase() : ''
  const pay = (payloadClientName(row.payload) || '').toLowerCase()
  return col === target || pay === target
}

/** Coluna top-level preenchida mas com formato inválido (não é null e não é valor válido). */
function topLevelFormatAnomalies(row) {
  const out = []
  if (!isNullish(row.status) && (typeof row.status !== 'string' || !row.status.trim())) {
    out.push('status_top_level_invalid_format')
  }
  if (!isNullish(row.total) && !validTotal(row.total)) {
    out.push('total_top_level_invalid_format')
  }
  if (!isNullish(row.cliente) && validClientName(row.cliente) === null) {
    out.push('cliente_top_level_invalid_format')
  }
  return out
}

function payloadUserIdMismatch(row) {
  const p = row.payload
  if (!isPlainObject(p)) return false
  for (const k of ['user_id', 'userId']) {
    if (!isNullish(p[k]) && String(p[k]) !== String(row.user_id)) return true
  }
  return false
}

function detectConflicts(row) {
  const p = isPlainObject(row.payload) ? row.payload : {}
  const out = []
  if (typeof row.status === 'string' && typeof p.status === 'string' && row.status !== p.status) {
    out.push('status')
  }
  if (validTotal(row.total) && validTotal(p.total) && row.total !== p.total) {
    out.push('total')
  }
  const colCli = validClientName(row.cliente)
  const payCli = payloadClientName(p)
  if (colCli && payCli && colCli !== payCli) out.push('cliente')
  return out
}

function detectApprovedInconsistencies(row) {
  const p = isPlainObject(row.payload) ? row.payload : {}
  const out = []
  if (typeof row.aprovado === 'boolean' && typeof p.aprovado === 'boolean' && row.aprovado !== p.aprovado) {
    out.push('aprovado_coluna_vs_payload')
  }
  const st = canonicalStatus(p.status)
  if ((st === 'Aprovado' || st === 'Convertido') && row.aprovado !== true) {
    out.push('payload_status_aprovado_coluna_false')
  }
  if (row.aprovado === true && (st === 'Pendente' || st === 'Cancelado')) {
    out.push('coluna_true_payload_status_nao_aprovado')
  }
  return out
}

/**
 * Planeja uma row. `ctx.duplicateKeys` = Set de chaves user_id|local_id duplicadas.
 * Retorna patch mínimo (somente campos null com candidato seguro).
 */
export function planRow(row, ctx = {}) {
  const duplicateKeys = ctx.duplicateKeys || new Set()
  const missing = PATCHABLE_FIELDS.filter((f) => isNullish(row[f]))
  const payload = row.payload
  const flags = {
    legacyGeradoTopLevel: row.status === 'gerado',
    legacyGeradoPayloadNullColumn: false,
    unknownPayloadStatus: false,
    invalidTotalPayload: false,
    missingTotalPayload: false,
    missingClientPayload: false,
    protectedTestRow: isProtectedTestRow(row),
    tenantInconsistency: false,
    duplicateKey: false,
  }
  const anomalies = []

  if (isNullish(row.user_id) || String(row.user_id).trim() === '') anomalies.push('user_id_ausente')
  if (isNullish(row.local_id) || String(row.local_id).trim() === '') anomalies.push('local_id_ausente')
  if (duplicateKeys.has(rowKey(row))) {
    flags.duplicateKey = true
    anomalies.push('chave_user_id_local_id_duplicada')
  }
  if (payloadUserIdMismatch(row)) {
    flags.tenantInconsistency = true
    anomalies.push('payload_user_id_diverge_da_coluna')
  }
  anomalies.push(...topLevelFormatAnomalies(row))
  if (missing.length && !isPlainObject(payload)) anomalies.push('payload_nao_objeto')

  const conflicts = detectConflicts(row)
  const approvedInconsistencies = detectApprovedInconsistencies(row)

  const patch = {}
  if (isPlainObject(payload)) {
    if (missing.includes('status')) {
      const st = canonicalStatus(payload.status)
      if (st) patch.status = st
      else if (!isNullish(payload.status)) {
        flags.unknownPayloadStatus = true
        if (payload.status === 'gerado') flags.legacyGeradoPayloadNullColumn = true
      }
    }
    if (missing.includes('total')) {
      if (validTotal(payload.total)) patch.total = payload.total
      else if (isNullish(payload.total)) flags.missingTotalPayload = true
      else flags.invalidTotalPayload = true
    }
    if (missing.includes('cliente')) {
      const nome = payloadClientName(payload)
      if (nome) patch.cliente = nome
      else flags.missingClientPayload = true
    }
  }

  let category
  if (!missing.length) {
    category = anomalies.length ? CATEGORY.ANOMALY : CATEGORY.ALREADY_NORMALIZED
  } else if (anomalies.length) {
    category = CATEGORY.ANOMALY
  } else if (flags.protectedTestRow) {
    anomalies.push('linha_teste_protegida_com_campo_ausente')
    category = CATEGORY.ANOMALY
  } else {
    const found = Object.keys(patch).length
    category = found === 0 ? CATEGORY.NO_SAFE_DATA : found === missing.length ? CATEGORY.SAFE_FULL : CATEGORY.SAFE_PARTIAL
  }

  const finalPatch = category === CATEGORY.SAFE_FULL || category === CATEGORY.SAFE_PARTIAL ? sanitizePatch(patch) : {}

  return {
    id: row.id ?? null,
    user_id: row.user_id,
    local_id: row.local_id,
    category,
    missing,
    patch: finalPatch,
    flags,
    anomalies,
    conflicts,
    approvedInconsistencies,
  }
}

/** Garante que somente status/total/cliente não-nulos entrem no patch. */
export function sanitizePatch(patch) {
  const out = {}
  for (const [k, v] of Object.entries(patch || {})) {
    if (!PATCHABLE_SET.has(k)) continue
    if (isNullish(v)) continue
    out[k] = v
  }
  return out
}

export function findDuplicateKeys(rows) {
  const count = new Map()
  for (const r of rows) {
    const k = rowKey(r)
    count.set(k, (count.get(k) || 0) + 1)
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k))
}

export function computeStats(rows) {
  let fully = 0
  let statusNull = 0
  let totalNull = 0
  let clientNull = 0
  let allThreeNull = 0
  let partial = 0
  for (const r of rows) {
    const sN = isNullish(r.status)
    const tN = isNullish(r.total)
    const cN = isNullish(r.cliente)
    if (sN) statusNull++
    if (tN) totalNull++
    if (cN) clientNull++
    const nulls = Number(sN) + Number(tN) + Number(cN)
    if (nulls === 0) fully++
    else if (nulls === 3) allThreeNull++
    else partial++
  }
  return {
    total_rows: rows.length,
    fully_normalized: fully,
    status_null: statusNull,
    total_null: totalNull,
    client_null: clientNull,
    all_three_null: allThreeNull,
    partially_normalized: partial,
  }
}

/** Aplica patch em memória somente sobre campos ainda null (mesma semântica do apply condicional). */
export function applyPatchInMemory(row, patch) {
  const next = { ...row }
  for (const [k, v] of Object.entries(sanitizePatch(patch))) {
    if (isNullish(next[k])) next[k] = v
  }
  return next
}

export function payloadBytes(payload) {
  if (isNullish(payload)) return 0
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8')
  } catch {
    return 0
  }
}

export function buildPlan(rows) {
  const duplicateKeys = findDuplicateKeys(rows)
  const plans = rows.map((r) => planRow(r, { duplicateKeys }))
  const byCategory = Object.fromEntries(Object.values(CATEGORY).map((c) => [c, 0]))
  for (const p of plans) byCategory[p.category]++

  const after = rows.map((r, i) => applyPatchInMemory(r, plans[i].patch))
  return { plans, byCategory, duplicateKeys, statsBefore: computeStats(rows), statsAfter: computeStats(after) }
}

/**
 * Apply: um UPDATE por campo, condicionado a:
 *   id + user_id + local_id (identidade/tenant) E campo AINDA null.
 * Se a aplicação preencher o campo entre o SELECT e o write, o UPDATE afeta 0 rows.
 */
export function buildConditionalUpdates(plans) {
  const out = []
  for (const p of plans) {
    for (const [field, value] of Object.entries(sanitizePatch(p.patch))) {
      out.push({
        match: { id: p.id, user_id: p.user_id, local_id: p.local_id },
        requireNull: field,
        set: { [field]: value },
      })
    }
  }
  return out
}

/** Filtro PostgREST equivalente (string de query) para um update condicional. */
export function conditionalUpdateQuery(update) {
  const q = new URLSearchParams()
  if (!isNullish(update.match.id)) q.set('id', `eq.${update.match.id}`)
  q.set('user_id', `eq.${update.match.user_id}`)
  q.set('local_id', `eq.${update.match.local_id}`)
  q.set(update.requireNull, 'is.null')
  return q.toString()
}

/** Colunas devolvidas pelo PATCH (return=representation) — nunca payload. */
export function applyReturnSelect(update) {
  return `id,updated_at,${update.requireNull}`
}

/** Query completa do PATCH: filtros condicionais + representação mínima. */
export function applyUpdateQuery(update) {
  const q = new URLSearchParams(conditionalUpdateQuery(update))
  q.set('select', applyReturnSelect(update))
  return q.toString()
}

/** Confere se a row devolvida pelo PATCH é a esperada e recebeu exatamente o valor planejado. */
export function verifyAppliedRow(update, returned) {
  if (!isPlainObject(returned)) return 'representacao_invalida'
  if (!isNullish(update.match.id) && returned.id !== update.match.id) return 'id_divergente'
  const field = update.requireNull
  const expected = update.set[field]
  const got = returned[field]
  if (field === 'total' ? Number(got) !== expected : got !== expected) return 'valor_divergente'
  return null
}

/** Simulador em memória da semântica do update condicional (usado nos testes). */
export function simulateConditionalApply(stateRows, updates) {
  const rows = stateRows.map((r) => ({ ...r }))
  let applied = 0
  let skipped = 0
  for (const u of updates) {
    const targets = rows.filter(
      (r) =>
        (isNullish(u.match.id) || r.id === u.match.id) &&
        r.user_id === u.match.user_id &&
        r.local_id === u.match.local_id &&
        isNullish(r[u.requireNull]),
    )
    if (!targets.length) {
      skipped++
      continue
    }
    for (const t of targets) Object.assign(t, u.set)
    applied += targets.length
  }
  return { rows, applied, skipped }
}

/**
 * Rollback (manual, nunca automático): reverte o campo para null SOMENTE se ele ainda contém o valor
 * escrito pelo backfill (não desfaz escrita posterior da aplicação).
 */
export function buildRollbackUpdates(snapshotRows) {
  const out = []
  for (const s of snapshotRows) {
    for (const f of PATCHABLE_FIELDS) {
      const planned = s[`planned_${f}`]
      if (isNullish(planned)) continue
      out.push({
        match: { id: s.id ?? null, user_id: s.user_id, local_id: s.local_id },
        requireEquals: { [f]: planned },
        set: { [f]: null },
      })
    }
  }
  return out
}

export function buildSnapshotRows(rows, plans) {
  const out = []
  rows.forEach((r, i) => {
    const p = plans[i]
    if (!p.missing.length || p.category === CATEGORY.ANOMALY) return
    out.push({
      id: r.id ?? null,
      user_id: r.user_id,
      local_id: r.local_id,
      category: p.category,
      will_write: Object.keys(p.patch).length > 0,
      old_status: r.status ?? null,
      old_total: r.total ?? null,
      old_cliente: r.cliente ?? null,
      old_aprovado: r.aprovado ?? null,
      old_updated_at: r.updated_at ?? null,
      planned_status: p.patch.status ?? null,
      planned_total: p.patch.total ?? null,
      planned_cliente: p.patch.cliente ?? null,
      ...payloadFingerprint(r.payload),
    })
  })
  return out
}

/** Impressão digital do payload (sem conteúdo): sha256 da serialização JSONB devolvida + atualizadoEm. */
export function payloadFingerprint(payload) {
  if (isNullish(payload)) return { payload_sha256: null, payload_atualizado_em: null }
  const atu = isPlainObject(payload) ? payload.atualizadoEm : undefined
  return {
    payload_sha256: createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex'),
    payload_atualizado_em: isNullish(atu) ? null : atu,
  }
}

/** Estado pré-apply de TODAS as rows (sem payload) para auditoria pós-apply. */
export function buildRowFingerprints(rows) {
  return rows.map((r) => ({
    id: r.id ?? null,
    user_id: r.user_id,
    local_id: r.local_id,
    status: r.status ?? null,
    total: r.total ?? null,
    cliente: r.cliente ?? null,
    aprovado: r.aprovado ?? null,
    updated_at: r.updated_at ?? null,
    ...payloadFingerprint(r.payload),
  }))
}

/**
 * PLAN_ID: sha256 do estado observado de TODAS as rows (fingerprints) + updates
 * planejados. Qualquer mudança no banco (valor, updated_at, payload, row nova ou
 * removida) ou na regra de planejamento gera outro PLAN_ID.
 */
export function computePlanId({ fingerprints, updates }) {
  const key = (x) => `${x.user_id}|${x.local_id}|${x.id}`
  const state = [...fingerprints].sort((a, b) => key(a).localeCompare(key(b)))
  const ups = updates
    .map((u) => ({ ...u.match, field: u.requireNull, value: u.set[u.requireNull] }))
    .sort((a, b) => `${key(a)}|${a.field}`.localeCompare(`${key(b)}|${b.field}`))
  const digest = createHash('sha256').update(JSON.stringify({ v: 1, state, updates: ups }), 'utf8').digest('hex')
  return `bf1-${digest.slice(0, 32)}`
}

/** Lê --plan-id=<id> dos argumentos (null se ausente). */
export function parsePlanIdArg(argv) {
  const arg = (argv || []).find((a) => a.startsWith('--plan-id='))
  const v = arg ? arg.slice('--plan-id='.length).trim() : ''
  return v || null
}

/**
 * Portão do apply (fail-closed). Exige: modo APPLY, plano do dry-run informado em
 * --plan-id E repetido em BACKFILL_ORCAMENTOS_CONFIRM, igual ao PLAN_ID recalculado
 * agora contra o banco, plano seguro (ready) e ao menos um update.
 */
export function evaluateApplyGate({ writesEnabled, providedPlanId, confirm, currentPlanId, ready, updatesCount }) {
  if (!writesEnabled) return { ok: false, reason: 'DRY_RUN' }
  if (!providedPlanId) return { ok: false, reason: 'APPLY_REFUSED: --plan-id=<PLAN_ID do dry-run> ausente' }
  if (confirm !== providedPlanId) return { ok: false, reason: 'APPLY_NOT_CONFIRMED: BACKFILL_ORCAMENTOS_CONFIRM deve repetir o PLAN_ID' }
  if (!currentPlanId || providedPlanId !== currentPlanId) {
    return { ok: false, reason: 'APPLY_REFUSED: PLAN_ID divergente — estado do banco ou plano mudou; rode novo dry-run' }
  }
  if (!ready) return { ok: false, reason: 'APPLY_REFUSED: plano não seguro (anomalia, duplicata, tenant, 436B ou snapshot)' }
  if (!updatesCount) return { ok: false, reason: 'APPLY_REFUSED: nada a aplicar' }
  return { ok: true, reason: null }
}

function sameValue(a, b) {
  if (isNullish(a) || isNullish(b)) return isNullish(a) && isNullish(b)
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return a === b
}

/**
 * Auditoria pós-apply (read-only): compara rows atuais com as impressões digitais
 * pré-apply e com o plano do snapshot.
 */
export function buildPostApplyAudit({ fingerprints, snapshotRows, rowsNow }) {
  const nowById = new Map(rowsNow.map((r) => [String(r.id), r]))
  const beforeIds = new Set(fingerprints.map((f) => String(f.id)))
  const planById = new Map(snapshotRows.map((s) => [String(s.id), s]))
  const written = { status: 0, total: 0, cliente: 0 }
  const plannedNotWritten = { status: 0, total: 0, cliente: 0 }
  const unexpectedFieldChanges = []
  const out = {
    rows_missing: 0,
    rows_new: rowsNow.filter((r) => !beforeIds.has(String(r.id))).length,
    user_id_changed: 0,
    local_id_changed: 0,
    payload_changed: 0,
    payload_atualizado_em_changed: 0,
    approved_changed: 0,
    updated_at_changed: 0,
    updated_at_changed_outside_plan: 0,
  }
  for (const f of fingerprints) {
    const id = String(f.id)
    const r = nowById.get(id)
    if (!r) {
      out.rows_missing++
      continue
    }
    const plan = planById.get(id)
    if (r.user_id !== f.user_id) out.user_id_changed++
    if (String(r.local_id) !== String(f.local_id)) out.local_id_changed++
    const fp = payloadFingerprint(r.payload)
    if (fp.payload_sha256 !== f.payload_sha256) out.payload_changed++
    if (!sameValue(fp.payload_atualizado_em, f.payload_atualizado_em)) out.payload_atualizado_em_changed++
    if (r.aprovado !== f.aprovado) out.approved_changed++
    if (r.updated_at !== f.updated_at) {
      out.updated_at_changed++
      if (!plan?.will_write) out.updated_at_changed_outside_plan++
    }
    for (const field of PATCHABLE_FIELDS) {
      const planned = plan ? plan[`planned_${field}`] : null
      if (!sameValue(r[field], f[field])) {
        if (isNullish(f[field]) && !isNullish(planned) && sameValue(r[field], planned)) written[field]++
        else unexpectedFieldChanges.push({ tenant: maskId(f.user_id), local_id: maskLocalId(f.local_id), field })
      } else if (!isNullish(planned) && isNullish(r[field])) {
        plannedNotWritten[field]++
      }
    }
  }
  return { ...out, written, planned_not_written: plannedNotWritten, unexpected_field_changes: unexpectedFieldChanges }
}

/** Modo de execução. DRY_RUN é o padrão; APPLY exige --apply explícito. */
export function parseMode(argv) {
  const args = new Set(argv || [])
  const apply = args.has('--apply')
  return Object.freeze({ mode: apply ? 'APPLY' : 'DRY_RUN', writesEnabled: apply })
}

const READ_METHODS = new Set(['GET', 'HEAD'])

/** Envolve fetch: qualquer método diferente de GET/HEAD é rejeitado antes da rede. */
export function createReadOnlyFetch(baseFetch) {
  return async function readOnlyFetch(input, init = {}) {
    const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
    if (!READ_METHODS.has(method)) {
      throw new Error(`WRITE_BLOCKED_IN_DRY_RUN: método ${method} proibido`)
    }
    return baseFetch(input, { ...init, method })
  }
}

/** Leitura paginada via PostgREST (GET). Verifica contagem exata. */
export async function fetchAllOrcamentos({ url, key, fetchImpl, pageSize = 20 }) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/orcamentos?select=${SELECT_COLUMNS}&order=user_id.asc,local_id.asc,id.asc`
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    Prefer: 'count=exact',
    'Range-Unit': 'items',
  }
  const rows = []
  let total = null
  for (let from = 0; total === null || from < total; from += pageSize) {
    const res = await fetchImpl(base, { method: 'GET', headers: { ...headers, Range: `${from}-${from + pageSize - 1}` } })
    if (!res.ok && res.status !== 206) {
      throw new Error(`READ_FAILED status=${res.status}`)
    }
    const range = res.headers.get('content-range') || ''
    const m = range.match(/\/(\d+)$/)
    if (!m) throw new Error('READ_FAILED: content-range ausente')
    total = Number(m[1])
    const page = await res.json()
    rows.push(...page)
    if (!page.length) break
  }
  if (rows.length !== total) throw new Error(`READ_INCOMPLETE: lidas=${rows.length} esperado=${total}`)
  return rows
}
