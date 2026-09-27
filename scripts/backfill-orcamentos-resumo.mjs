#!/usr/bin/env node
/**
 * Backfill das colunas resumo (status/total/cliente) de public.orcamentos.
 *
 * Uso:
 *   node scripts/backfill-orcamentos-resumo.mjs
 *       → DRY_RUN (padrão, somente leitura). Imprime PLAN_ID e grava snapshot local.
 *   BACKFILL_ORCAMENTOS_CONFIRM=<PLAN_ID> node scripts/backfill-orcamentos-resumo.mjs --apply --plan-id=<PLAN_ID>
 *       → aplica SOMENTE se o PLAN_ID recalculado agora contra o banco for idêntico
 *         ao do dry-run revisado. Qualquer mudança no banco → recusa.
 *   node scripts/backfill-orcamentos-resumo.mjs --verify=<snapshot.json>
 *       → auditoria pós-apply, somente leitura.
 *
 * Opcional: BACKFILL_ORCAMENTOS_WATCH_TENANT=<user_id> destaca um tenant no relatório.
 *
 * Todas as leituras passam pela guarda GET/HEAD. O fetch real só existe em APPLY e
 * só é entregue ao módulo de escrita (import dinâmico) depois do portão do PLAN_ID.
 * Snapshot/journal ficam em os.tmpdir(), fora do Git. Logs sem payload e sem nomes.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CATEGORY,
  buildConditionalUpdates,
  buildPlan,
  buildPostApplyAudit,
  buildRowFingerprints,
  buildSnapshotRows,
  computePlanId,
  computeStats,
  createReadOnlyFetch,
  evaluateApplyGate,
  fetchAllOrcamentos,
  isProtectedTestRow,
  maskId,
  maskLocalId,
  parseMode,
  parsePlanIdArg,
  payloadBytes,
} from './backfill-orcamentos-resumo-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv(file) {
  const out = {}
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      let v = t.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      out[t.slice(0, i).trim()] = v
    }
  } catch {
    /* sem .env.local */
  }
  return out
}

function countBy(items) {
  const m = {}
  for (const it of items) m[it] = (m[it] || 0) + 1
  return m
}

function postApplyReport({ snapshot, rows, watchTenant, applyResult = null }) {
  const audit = buildPostApplyAudit({ fingerprints: snapshot.fingerprints, snapshotRows: snapshot.rows, rowsNow: rows })
  const { plans, duplicateKeys } = buildPlan(rows)
  const fpById = new Map(snapshot.fingerprints.map((f) => [String(f.id), f]))
  const touchedIds = new Set((applyResult?.results || []).filter((r) => r.outcome === 'APPLIED').map((r) => String(r.id)))

  const test436 = rows.filter(isProtectedTestRow).map((r) => {
    const f = fpById.get(String(r.id)) || {}
    const untouched =
      !touchedIds.has(String(r.id)) &&
      r.status === f.status &&
      Number(r.total) === Number(f.total) &&
      r.cliente === f.cliente &&
      r.updated_at === f.updated_at
    return { local_id: maskLocalId(r.local_id), status: r.status, total: r.total, written_by_backfill: !untouched }
  })

  const legacy = snapshot.fingerprints
    .filter((f) => f.status === 'gerado')
    .map((f) => {
      const r = rows.find((x) => String(x.id) === String(f.id))
      return {
        tenant: maskId(f.user_id),
        local_id: maskLocalId(f.local_id),
        status_preserved: r?.status === f.status,
        total_preserved: Number(r?.total) === Number(f.total),
        cliente_preserved: (r?.cliente ?? null) === (f.cliente ?? null),
      }
    })

  const report = {
    POST_STATS: computeStats(rows),
    ...Object.fromEntries(Object.entries(audit).map(([k, v]) => [k.toUpperCase(), v])),
    DUPLICATE_KEYS_POST: duplicateKeys.size,
    TENANT_INCONSISTENCIES_POST: plans.filter((p) => p.flags.tenantInconsistency).length,
    TEST_436B_POST_STATE: test436,
    TEST_436B_WRITTEN_BY_BACKFILL: test436.some((t) => t.written_by_backfill),
    LEGACY_GERADO_POST_STATE: legacy,
  }
  if (watchTenant) {
    const s = computeStats(rows.filter((r) => r.user_id === watchTenant))
    report.WATCH_TENANT_POST_STATE = { tenant: maskId(watchTenant), ...s }
  }
  return report
}

async function main() {
  const args = process.argv.slice(2)
  const mode = parseMode(args)
  const verifyPath = (args.find((a) => a.startsWith('--verify=')) || '').slice('--verify='.length) || null
  if (verifyPath && mode.writesEnabled) throw new Error('ARGS_INVALID: --verify é somente leitura, não combina com --apply')

  const rawFetch = mode.writesEnabled ? globalThis.fetch.bind(globalThis) : null
  globalThis.fetch = createReadOnlyFetch(globalThis.fetch.bind(globalThis))
  console.log(`MODE=${verifyPath ? 'VERIFY' : mode.mode}`)
  console.log(`WRITES_ENABLED=${mode.writesEnabled}`)

  const env = { ...loadEnv(join(root, '.env.local')), ...process.env }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('ENV_MISSING: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const watchTenant = env.BACKFILL_ORCAMENTOS_WATCH_TENANT || null

  if (verifyPath) {
    const snapshot = JSON.parse(readFileSync(verifyPath, 'utf8'))
    if (!Array.isArray(snapshot.fingerprints)) throw new Error('SNAPSHOT_INVALID: sem fingerprints')
    const rowsNow = await fetchAllOrcamentos({ url, key, fetchImpl: globalThis.fetch })
    console.log(JSON.stringify(postApplyReport({ snapshot, rows: rowsNow, watchTenant }), null, 2))
    console.log('VERIFY_COMPLETE: somente leitura')
    return
  }

  const rows = await fetchAllOrcamentos({ url, key, fetchImpl: globalThis.fetch })
  const { plans, byCategory, duplicateKeys, statsBefore, statsAfter } = buildPlan(rows)

  const candidates = plans.filter((p) => p.missing.length > 0)
  const patchPlans = plans.filter((p) => Object.keys(p.patch).length > 0)
  const statusPatches = patchPlans.filter((p) => 'status' in p.patch).length
  const totalPatches = patchPlans.filter((p) => 'total' in p.patch).length
  const clientPatches = patchPlans.filter((p) => 'cliente' in p.patch).length

  const unknownPayloadStatusValues = countBy(
    rows
      .filter((_, i) => plans[i].flags.unknownPayloadStatus)
      .map((r) => (typeof r.payload?.status === 'string' ? r.payload.status : `<${typeof r.payload?.status}>`)),
  )

  const conflicts = []
  const approved = []
  plans.forEach((p) => {
    for (const type of p.conflicts) conflicts.push({ tenant: maskId(p.user_id), local_id: maskLocalId(p.local_id), type })
    approved.push(...p.approvedInconsistencies)
  })

  const test436 = plans.filter((p) => p.flags.protectedTestRow)
  const test436Action = test436.length
    ? test436.map((p) => `${maskLocalId(p.local_id)}:${p.category === CATEGORY.ALREADY_NORMALIZED ? 'NO-OP (ALREADY_NORMALIZED)' : `BLOQUEADO (${p.category})`}`).join(', ')
    : 'NAO_ENCONTRADO'

  const tenants = new Map()
  plans.forEach((p, i) => {
    const t = tenants.get(p.user_id) || { rows: 0, candidates: 0, status: 0, total: 0, cliente: 0, fullyAfter: 0 }
    t.rows++
    if (p.missing.length) t.candidates++
    if ('status' in p.patch) t.status++
    if ('total' in p.patch) t.total++
    if ('cliente' in p.patch) t.cliente++
    const r = rows[i]
    const after = { status: r.status ?? p.patch.status, total: r.total ?? p.patch.total, cliente: r.cliente ?? p.patch.cliente }
    if (after.status != null && after.total != null && after.cliente != null) t.fullyAfter++
    tenants.set(p.user_id, t)
  })
  const tenantLabel = (uid) => (watchTenant && uid === watchTenant ? `WATCH (${maskId(uid)})` : maskId(uid))

  const candidateBytes = rows.filter((_, i) => plans[i].missing.length > 0).map((r) => payloadBytes(r.payload))
  const bytesTotal = candidateBytes.reduce((a, b) => a + b, 0)

  const updates = buildConditionalUpdates(plans)
  const snapshotRows = buildSnapshotRows(rows, plans)
  const fingerprints = buildRowFingerprints(rows)
  const planId = computePlanId({ fingerprints, updates })

  const snapDir = join(tmpdir(), 'connect-backfill-orcamentos')
  mkdirSync(snapDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const snapPath = join(snapDir, `plan-${stamp}.json`)
  writeFileSync(
    snapPath,
    JSON.stringify(
      {
        plan_id: planId,
        generated_at: new Date().toISOString(),
        mode: mode.mode,
        stats_before: statsBefore,
        stats_after_expected: statsAfter,
        rows: snapshotRows,
        fingerprints,
      },
      null,
      2,
    ),
    'utf8',
  )
  const snapCheck = JSON.parse(readFileSync(snapPath, 'utf8'))
  const snapshotOk =
    snapCheck.plan_id === planId &&
    snapCheck.rows?.length === snapshotRows.length &&
    snapCheck.fingerprints?.length === rows.length &&
    snapCheck.rows.every((s) => typeof s.old_updated_at === 'string' && typeof s.payload_sha256 === 'string' && !('payload' in s))

  const tenantInconsistencies = plans.filter((p) => p.flags.tenantInconsistency).length
  const anomalyReasons = countBy(plans.flatMap((p) => (p.category === CATEGORY.ANOMALY ? p.anomalies : [])))
  const totalsMoreThan2Decimals = updates.filter(
    (u) => u.requireNull === 'total' && Math.round(u.set.total * 100) / 100 !== u.set.total,
  ).length

  const ready =
    snapshotOk &&
    duplicateKeys.size === 0 &&
    tenantInconsistencies === 0 &&
    byCategory.ANOMALY === 0 &&
    test436.every((p) => p.category === CATEGORY.ALREADY_NORMALIZED) &&
    plans.every((p) => !p.flags.legacyGeradoTopLevel || Object.keys(p.patch).length === 0) &&
    statsAfter.total_rows === statsBefore.total_rows

  const report = {
    MODE: mode.mode,
    WRITES_ENABLED: mode.writesEnabled,
    PLAN_ID: planId,
    TOTAL_ROWS_NOW: statsBefore.total_rows,
    FULLY_NORMALIZED_NOW: statsBefore.fully_normalized,
    STATUS_NULL_NOW: statsBefore.status_null,
    TOTAL_NULL_NOW: statsBefore.total_null,
    CLIENT_NULL_NOW: statsBefore.client_null,
    ALL_THREE_NULL_NOW: statsBefore.all_three_null,
    PARTIALLY_NORMALIZED_NOW: statsBefore.partially_normalized,
    TOTAL_CANDIDATES: candidates.length,
    ROWS_WITH_PATCH: patchPlans.length,
    STATUS_PATCH_COUNT: statusPatches,
    TOTAL_PATCH_COUNT: totalPatches,
    CLIENT_PATCH_COUNT: clientPatches,
    PLANNED_FIELD_UPDATES: updates.length,
    ...byCategory,
    ANOMALY_REASONS: anomalyReasons,
    EXPECTED_TOTAL_ROWS_AFTER: statsAfter.total_rows,
    EXPECTED_FULLY_NORMALIZED_AFTER: statsAfter.fully_normalized,
    EXPECTED_STATUS_NULL_AFTER: statsAfter.status_null,
    EXPECTED_TOTAL_NULL_AFTER: statsAfter.total_null,
    EXPECTED_CLIENT_NULL_AFTER: statsAfter.client_null,
    EXPECTED_ALL_THREE_NULL_AFTER: statsAfter.all_three_null,
    EXPECTED_PARTIALLY_NORMALIZED_AFTER: statsAfter.partially_normalized,
    DUPLICATE_KEYS: duplicateKeys.size,
    TENANT_INCONSISTENCIES: tenantInconsistencies,
    UNKNOWN_PAYLOAD_STATUS: plans.filter((p) => p.flags.unknownPayloadStatus).length,
    UNKNOWN_PAYLOAD_STATUS_VALUES: unknownPayloadStatusValues,
    LEGACY_GERADO_TOP_LEVEL: plans.filter((p) => p.flags.legacyGeradoTopLevel).length,
    LEGACY_GERADO_PAYLOAD_NULL_COLUMN: plans.filter((p) => p.flags.legacyGeradoPayloadNullColumn).length,
    INVALID_TOTAL_PAYLOAD: plans.filter((p) => p.flags.invalidTotalPayload).length,
    MISSING_TOTAL_PAYLOAD: plans.filter((p) => p.flags.missingTotalPayload).length,
    MISSING_CLIENT_PAYLOAD: plans.filter((p) => p.flags.missingClientPayload).length,
    TOTAL_PATCHES_MORE_THAN_2_DECIMALS: totalsMoreThan2Decimals,
    APPROVED_INCONSISTENCIES: { total: approved.length, ...countBy(approved) },
    EXISTING_VS_PAYLOAD_CONFLICTS: { total: conflicts.length, items: conflicts },
    TEST_436B_ACTION: test436Action,
    PAYLOAD_BYTES_TOTAL: bytesTotal,
    PAYLOAD_BYTES_AVG: candidateBytes.length ? Math.round(bytesTotal / candidateBytes.length) : 0,
    PAYLOAD_BYTES_MAX: candidateBytes.length ? Math.max(...candidateBytes) : 0,
    SNAPSHOT_PATH: snapPath,
    SNAPSHOT_ROW_COUNT: snapshotRows.length,
    SNAPSHOT_FINGERPRINT_ROWS: fingerprints.length,
    SNAPSHOT_VERIFIED: snapshotOk,
    READY_FOR_APPLY_REVIEW: ready && updates.length > 0,
  }
  console.log(JSON.stringify(report, null, 2))

  console.log('TENANT_TABLE')
  console.log('TENANT | ROWS | CANDIDATES | STATUS_PATCHES | TOTAL_PATCHES | CLIENT_PATCHES | EXPECTED_FULLY_NORMALIZED')
  for (const [uid, t] of [...tenants].sort((a, b) => b[1].rows - a[1].rows)) {
    console.log(`${tenantLabel(uid)} | ${t.rows} | ${t.candidates} | ${t.status} | ${t.total} | ${t.cliente} | ${t.fullyAfter}`)
  }
  console.log(`PLAN_ID=${planId}`)

  if (!mode.writesEnabled) {
    console.log('DRY_RUN_COMPLETE: nenhuma escrita executada')
    return
  }

  const gate = evaluateApplyGate({
    writesEnabled: mode.writesEnabled,
    providedPlanId: parsePlanIdArg(args),
    confirm: env.BACKFILL_ORCAMENTOS_CONFIRM,
    currentPlanId: planId,
    ready,
    updatesCount: updates.length,
  })
  console.log(`READY=${gate.ok}`)
  if (!gate.ok) throw new Error(gate.reason)
  if (!rawFetch) throw new Error('APPLY_REFUSED: fetch de escrita indisponível')

  console.log(`APPLY_START plan_id=${planId} field_updates=${updates.length}`)
  const { applyConditionalUpdates } = await import('./backfill-orcamentos-resumo-apply.mjs')
  const result = await applyConditionalUpdates({ url, key, updates, fetchImpl: rawFetch })

  const journalPath = join(snapDir, `apply-${stamp}.json`)
  writeFileSync(journalPath, JSON.stringify({ plan_id: planId, snapshot: snapPath, ...result }, null, 2), 'utf8')

  const appliedBy = (field) => result.results.filter((r) => r.outcome === 'APPLIED' && r.field === field).length
  const bytesById = new Map(rows.map((r) => [String(r.id), payloadBytes(r.payload)]))
  const fullRepresentationBytes = result.results
    .filter((r) => r.outcome === 'APPLIED')
    .reduce((acc, r) => acc + (bytesById.get(String(r.id)) || 0), 0)
  console.log(
    JSON.stringify(
      {
        APPLY_JOURNAL_PATH: journalPath,
        STATUS_WRITES_SUCCESS: appliedBy('status'),
        TOTAL_WRITES_SUCCESS: appliedBy('total'),
        CLIENT_WRITES_SUCCESS: appliedBy('cliente'),
        RACE_SKIPS: result.results.filter((r) => r.outcome === 'RACE_SKIP').map((r) => ({ tenant: maskId(r.user_id), local_id: maskLocalId(r.local_id), field: r.field })),
        APPLY_ERRORS: result.error ? [{ completed_operations: result.results.length - 1, error: result.error }] : [],
        PATCH_RESPONSE_BYTES: result.responseBytes,
        NETWORK_BYTES_AVOIDED_ESTIMATE: Math.max(0, fullRepresentationBytes - result.responseBytes),
      },
      null,
      2,
    ),
  )

  const rowsNow = await fetchAllOrcamentos({ url, key, fetchImpl: globalThis.fetch })
  console.log('POST_APPLY_AUDIT (somente leitura)')
  console.log(
    JSON.stringify(postApplyReport({ snapshot: { rows: snapshotRows, fingerprints }, rows: rowsNow, watchTenant, applyResult: result }), null, 2),
  )
  if (result.error) throw new Error(`APPLY_STOPPED: ${result.error}`)
  console.log('APPLY_COMPLETE')
}

main().catch((err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
