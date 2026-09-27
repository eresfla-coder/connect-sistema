/**
 * Backfill resumo de orçamentos (ADMIN.4.3.8).
 * Somente fixtures sintéticas em memória e fetch falso. ZERO banco real.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  CATEGORY,
  applyPatchInMemory,
  applyUpdateQuery,
  buildConditionalUpdates,
  buildPlan,
  buildPostApplyAudit,
  buildRollbackUpdates,
  buildRowFingerprints,
  buildSnapshotRows,
  computePlanId,
  conditionalUpdateQuery,
  createReadOnlyFetch,
  evaluateApplyGate,
  fetchAllOrcamentos,
  parseMode,
  parsePlanIdArg,
  payloadFingerprint,
  planRow,
  sanitizePatch,
  simulateConditionalApply,
  verifyAppliedRow,
} from '../scripts/backfill-orcamentos-resumo-lib.mjs'
import { applyConditionalUpdates } from '../scripts/backfill-orcamentos-resumo-apply.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function row(over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    user_id: TENANT_A,
    local_id: '17900000000001',
    status: null,
    total: null,
    cliente: null,
    aprovado: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    payload: {
      id: 17900000000001,
      status: 'Pendente',
      total: 90,
      subtotal: 100,
      desconto: 10,
      entrega: 0,
      cliente: { nome: 'Cliente Fixture' },
      aprovado: false,
      itens: [{ descricao: 'Item', quantidade: 2, valor: 50, metragem: 2, valorM2: 25 }],
      ...payloadOver,
    },
    ...over,
  }
}

describe('ADMIN.4.3.8b — regras de patch', () => {
  it('1) status canônico preenche', () => {
    const p = planRow(row({}, { status: 'Aprovado' }))
    assert.equal(p.patch.status, 'Aprovado')
  })

  it('2) status existente é preservado', () => {
    const p = planRow(row({ status: 'Cancelado' }, { status: 'Pendente' }))
    assert.equal('status' in p.patch, false)
    const legado = planRow(row({ status: 'gerado', total: 1, cliente: 'X' }))
    assert.equal(legado.category, CATEGORY.ALREADY_NORMALIZED)
    assert.equal(legado.flags.legacyGeradoTopLevel, true)
  })

  it('3) status payload "gerado" não preenche', () => {
    const p = planRow(row({}, { status: 'gerado' }))
    assert.equal('status' in p.patch, false)
    assert.equal(p.flags.legacyGeradoPayloadNullColumn, true)
  })

  it('4) status desconhecido não preenche (nem minúsculo)', () => {
    for (const st of ['pendente', 'recusado', 'Aberto', '']) {
      const p = planRow(row({}, { status: st }))
      assert.equal('status' in p.patch, false, st)
    }
  })

  it('5) total válido preenche', () => {
    assert.equal(planRow(row({}, { total: 1234.56 })).patch.total, 1234.56)
  })

  it('6) total 0 preenche 0', () => {
    const p = planRow(row({}, { total: 0 }))
    assert.equal(p.patch.total, 0)
    assert.equal('total' in p.patch, true)
  })

  it('7) total string não preenche', () => {
    const p = planRow(row({}, { total: '90' }))
    assert.equal('total' in p.patch, false)
    assert.equal(p.flags.invalidTotalPayload, true)
  })

  it('8) total ausente não preenche', () => {
    const r = row()
    delete (r.payload as Record<string, unknown>).total
    const p = planRow(r)
    assert.equal('total' in p.patch, false)
    assert.equal(p.flags.missingTotalPayload, true)
    assert.equal('total' in planRow(row({}, { total: { v: 1 } })).patch, false)
    assert.equal('total' in planRow(row({}, { total: Number.NaN })).patch, false)
  })

  it('9) cliente.nome preenche (trim)', () => {
    assert.equal(planRow(row({}, { cliente: { nome: '  Maria  ' } })).patch.cliente, 'Maria')
  })

  it('10) cliente string preenche', () => {
    assert.equal(planRow(row({}, { cliente: 'João' })).patch.cliente, 'João')
  })

  it('11) cliente inválido não preenche', () => {
    for (const c of ['', '   ', 'undefined', 'NULL', { nome: 'Undefined' }, { nome: '' }, {}, null, 42]) {
      const p = planRow(row({}, { cliente: c }))
      assert.equal('cliente' in p.patch, false, JSON.stringify(c))
    }
  })

  it('total não é recalculado de itens/subtotal/desconto/entrega/m²', () => {
    const p = planRow(row({}, { total: 77, subtotal: 999, desconto: 1, entrega: 5 }))
    assert.equal(p.patch.total, 77)
  })
})

describe('ADMIN.4.3.8b — classificação', () => {
  it('12) full patch', () => {
    const p = planRow(row())
    assert.equal(p.category, CATEGORY.SAFE_FULL)
    assert.deepEqual(p.patch, { status: 'Pendente', total: 90, cliente: 'Cliente Fixture' })
  })

  it('13) partial patch — não inclui cliente: null', () => {
    const p = planRow(row({}, { cliente: undefined }))
    assert.equal(p.category, CATEGORY.SAFE_PARTIAL)
    assert.deepEqual(p.patch, { status: 'Pendente', total: 90 })
    assert.equal('cliente' in p.patch, false)
  })

  it('14) no-safe-data', () => {
    const p = planRow(row({}, { status: 'gerado', total: '1', cliente: null }))
    assert.equal(p.category, CATEGORY.NO_SAFE_DATA)
    assert.deepEqual(p.patch, {})
  })

  it('15) already-normalized', () => {
    const p = planRow(row({ status: 'Pendente', total: 90, cliente: 'X' }))
    assert.equal(p.category, CATEGORY.ALREADY_NORMALIZED)
    assert.deepEqual(p.patch, {})
  })

  it('16–19) payload/aprovado/user_id/local_id/created_at nunca entram no patch', () => {
    const p = planRow(row())
    for (const k of ['payload', 'aprovado', 'user_id', 'local_id', 'created_at', 'updated_at', 'id']) {
      assert.equal(k in p.patch, false, k)
    }
    assert.deepEqual(
      sanitizePatch({ status: 'Pendente', payload: {}, aprovado: true, user_id: 'x', local_id: 'y', cliente: null }),
      { status: 'Pendente' },
    )
  })

  it('linha TESTE NORMALIZACAO 436B normalizada = NO-OP; com campo ausente = ANOMALY (nunca candidata a write)', () => {
    const ok = planRow(row({ status: 'Pendente', total: 90, cliente: 'TESTE NORMALIZACAO 436B' }))
    assert.equal(ok.category, CATEGORY.ALREADY_NORMALIZED)
    const broken = planRow(row({ status: 'Pendente', total: null, cliente: 'TESTE NORMALIZACAO 436B' }))
    assert.equal(broken.category, CATEGORY.ANOMALY)
    assert.deepEqual(broken.patch, {})
  })

  it('duplicata user_id+local_id e user_id divergente no payload viram ANOMALY sem patch', () => {
    const plan = buildPlan([row(), row({ id: 'row-2' })])
    assert.equal(plan.duplicateKeys.size, 1)
    assert.ok(plan.plans.every((p) => p.category === CATEGORY.ANOMALY && Object.keys(p.patch).length === 0))
    const t = planRow(row({}, { user_id: 'bbbbbbbb-0000-0000-0000-000000000000' }))
    assert.equal(t.category, CATEGORY.ANOMALY)
    assert.equal(t.flags.tenantInconsistency, true)
  })

  it('conflito top-level vs payload é reportado e top-level prevalece', () => {
    const p = planRow(row({ status: 'Aprovado', total: 90, cliente: 'A' }, { status: 'Pendente', total: 80, cliente: { nome: 'B' } }))
    assert.deepEqual(p.conflicts.sort(), ['cliente', 'status', 'total'])
    assert.deepEqual(p.patch, {})
  })

  it('payload não é mutado pelo planejamento', () => {
    const r = row()
    const before = JSON.stringify(r)
    buildPlan([r])
    assert.equal(JSON.stringify(r), before)
  })
})

describe('ADMIN.4.3.8b — idempotência, race e rollback', () => {
  it('20) rerun após aplicar é idempotente', () => {
    const rows = [row(), row({ id: 'row-2', local_id: '2' }, { cliente: undefined })]
    const first = buildPlan(rows)
    const applied = rows.map((r, i) => applyPatchInMemory(r, first.plans[i].patch))
    const second = buildPlan(applied)
    assert.equal(second.plans[0].category, CATEGORY.ALREADY_NORMALIZED)
    assert.equal(second.plans[1].category, CATEGORY.NO_SAFE_DATA)
    assert.equal(buildConditionalUpdates(second.plans).length, 0)
    assert.equal(second.statsAfter.total_rows, rows.length)
  })

  it('21) race protection: campo preenchido pela aplicação após o SELECT não é sobrescrito', () => {
    const observed = [row()]
    const plan = buildPlan(observed)
    const updates = buildConditionalUpdates(plan.plans)
    assert.equal(updates.length, 3)
    const concurrent = [{ ...observed[0], status: 'Aprovado', total: 150 }]
    const res = simulateConditionalApply(concurrent, updates)
    assert.equal(res.rows[0].status, 'Aprovado')
    assert.equal(res.rows[0].total, 150)
    assert.equal(res.rows[0].cliente, 'Cliente Fixture')
    assert.equal(res.applied, 1)
    assert.equal(res.skipped, 2)
  })

  it('race: update condicional valida identidade/tenant e exige campo null', () => {
    const [u] = buildConditionalUpdates(buildPlan([row()]).plans)
    const q = new URLSearchParams(conditionalUpdateQuery(u))
    assert.equal(q.get('id'), 'eq.row-1')
    assert.equal(q.get('user_id'), `eq.${TENANT_A}`)
    assert.equal(q.get('local_id'), 'eq.17900000000001')
    assert.equal(q.get(u.requireNull), 'is.null')
    const otherTenant = [{ ...row(), user_id: 'cccccccc-0000-0000-0000-000000000000' }]
    assert.equal(simulateConditionalApply(otherTenant, [u]).applied, 0)
  })

  it('snapshot não contém payload; rollback só reverte valor ainda igual ao planejado', () => {
    const rows = [row()]
    const plan = buildPlan(rows)
    const snap = buildSnapshotRows(rows, plan.plans)
    assert.equal(snap.length, 1)
    assert.equal('payload' in snap[0], false)
    assert.equal(snap[0].planned_total, 90)
    const rb = buildRollbackUpdates(snap)
    assert.equal(rb.length, 3)
    assert.ok(rb.every((u) => Object.values(u.set).every((v) => v === null)))
  })
})

describe('ADMIN.4.3.8b — fail-closed para escrita', () => {
  it('modo padrão é DRY_RUN sem escrita; APPLY só com --apply', () => {
    assert.deepEqual({ ...parseMode([]) }, { mode: 'DRY_RUN', writesEnabled: false })
    assert.deepEqual({ ...parseMode(['--dry-run', '--verbose']) }, { mode: 'DRY_RUN', writesEnabled: false })
    assert.deepEqual({ ...parseMode(['--apply']) }, { mode: 'APPLY', writesEnabled: true })
  })

  it('fetch read-only rejeita POST/PATCH/PUT/DELETE antes de chegar à rede', async () => {
    let calls = 0
    const ro = createReadOnlyFetch(async () => {
      calls++
      return new Response('[]')
    })
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'patch']) {
      await assert.rejects(ro('https://x/rest/v1/orcamentos', { method }), /WRITE_BLOCKED_IN_DRY_RUN/)
    }
    await assert.rejects(ro(new Request('https://x', { method: 'POST' })), /WRITE_BLOCKED_IN_DRY_RUN/)
    assert.equal(calls, 0)
    await ro('https://x', { method: 'GET' })
    assert.equal(calls, 1)
  })

  it('leitor paginado usa somente GET e confere contagem exata', async () => {
    const methods: string[] = []
    const data = [row(), row({ id: 'row-2', local_id: '2' }), row({ id: 'row-3', local_id: '3' })]
    const fake = async (_url: string, init: RequestInit) => {
      methods.push(String(init.method))
      const [from, to] = String((init.headers as Record<string, string>).Range).split('-').map(Number)
      const page = data.slice(from, to + 1)
      return new Response(JSON.stringify(page), {
        status: 206,
        headers: { 'content-range': `${from}-${from + page.length - 1}/${data.length}` },
      })
    }
    const rows = await fetchAllOrcamentos({ url: 'https://x', key: 'k', fetchImpl: fake, pageSize: 2 })
    assert.equal(rows.length, 3)
    assert.ok(methods.every((m) => m === 'GET'))
  })

  it('entrypoint: guarda instalada antes da leitura; módulo de escrita só via import dinâmico pós-confirmação', () => {
    const src = read('scripts/backfill-orcamentos-resumo.mjs')
    assert.equal(/^import .*backfill-orcamentos-resumo-apply/m.test(src), false)
    assert.ok(src.indexOf('createReadOnlyFetch(globalThis.fetch') < src.indexOf('fetchAllOrcamentos({'))
    const importAt = src.indexOf("import('./backfill-orcamentos-resumo-apply.mjs')")
    for (const gate of ['DRY_RUN_COMPLETE', 'evaluateApplyGate({', 'if (!gate.ok) throw', 'READY=${gate.ok}']) {
      assert.ok(src.indexOf(gate) > 0 && importAt > src.indexOf(gate), gate)
    }
    assert.ok(src.includes('providedPlanId: parsePlanIdArg(args)') && src.includes('currentPlanId: planId'))
    assert.ok(src.includes('WRITES_ENABLED=${mode.writesEnabled}'))
    // fetch real só existe em APPLY e só é entregue ao módulo de escrita; leituras sempre via guarda
    assert.ok(src.includes('const rawFetch = mode.writesEnabled ? globalThis.fetch.bind(globalThis) : null'))
    assert.equal((src.match(/rawFetch/g) || []).length, 3)
    assert.ok(/fetchAllOrcamentos\(\{ url, key, fetchImpl: globalThis\.fetch \}\)/.test(src))
    const lib = read('scripts/backfill-orcamentos-resumo-lib.mjs')
    assert.equal(/method:\s*'(PATCH|POST|PUT|DELETE)'/.test(lib), false)
    assert.equal(/supabase-js|createClient/.test(lib), false)
  })

  it('ferramenta não carrega autorização fixa, UUID live, token estático nem path local', () => {
    for (const f of ['scripts/backfill-orcamentos-resumo.mjs', 'scripts/backfill-orcamentos-resumo-lib.mjs', 'scripts/backfill-orcamentos-resumo-apply.mjs']) {
      const src = read(f)
      assert.equal(/APPROVED_PLAN|BASELINE\s*=|APPLY_ADMIN_4_3_8/.test(src), false, f)
      assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(src), false, f)
      assert.equal(/eyJ[A-Za-z0-9_-]{10,}|[A-Za-z]:\\+Users|AppData/.test(src), false, f)
    }
  })
})

describe('ADMIN.4.3.8e — apply exige PLAN_ID do dry-run atual (fail-closed)', () => {
  const state = () => [row(), row({ id: 'row-2', local_id: '2' }, { cliente: undefined })]
  const planIdOf = (rows: ReturnType<typeof row>[]) =>
    computePlanId({ fingerprints: buildRowFingerprints(rows), updates: buildConditionalUpdates(buildPlan(rows).plans) })
  const gate = (over: Record<string, unknown> = {}) => {
    const id = planIdOf(state())
    return evaluateApplyGate({ writesEnabled: true, providedPlanId: id, confirm: id, currentPlanId: id, ready: true, updatesCount: 5, ...over })
  }

  it('PLAN_ID é determinístico e independe da ordem das rows', () => {
    const a = planIdOf(state())
    assert.match(a, /^bf1-[0-9a-f]{32}$/)
    assert.equal(planIdOf(state()), a)
    assert.equal(planIdOf([...state()].reverse()), a)
  })

  it('PLAN_ID muda se o banco mudar (valor, updated_at, payload, aprovado, row nova/removida)', () => {
    const base = planIdOf(state())
    const [r1, r2] = state()
    const variants = [
      [{ ...r1, status: 'Aprovado' }, r2],
      [{ ...r1, updated_at: '2026-02-02T00:00:00Z' }, r2],
      [{ ...r1, payload: { ...r1.payload, total: 91 } }, r2],
      [{ ...r1, aprovado: true }, r2],
      [r1],
      [r1, r2, row({ id: 'row-3', local_id: '3' })],
    ]
    for (const v of variants) assert.notEqual(planIdOf(v as ReturnType<typeof row>[]), base)
  })

  it('apply sem plano aprovado → recusado', () => {
    const g = gate({ providedPlanId: null })
    assert.equal(g.ok, false)
    assert.match(String(g.reason), /--plan-id/)
  })

  it('apply com PLAN_ID errado → recusado', () => {
    const g = gate({ providedPlanId: 'bf1-errado', confirm: 'bf1-errado' })
    assert.equal(g.ok, false)
    assert.match(String(g.reason), /PLAN_ID divergente/)
  })

  it('banco mudou entre dry-run e apply (fingerprint divergente) → recusado', () => {
    const approved = planIdOf(state())
    const [r1, r2] = state()
    const current = planIdOf([{ ...r1, status: 'Cancelado' }, r2])
    const g = evaluateApplyGate({ writesEnabled: true, providedPlanId: approved, confirm: approved, currentPlanId: current, ready: true, updatesCount: 4 })
    assert.equal(g.ok, false)
    assert.match(String(g.reason), /PLAN_ID divergente/)
  })

  it('confirmação ausente/diferente do PLAN_ID → recusado', () => {
    assert.match(String(gate({ confirm: undefined }).reason), /APPLY_NOT_CONFIRMED/)
    assert.match(String(gate({ confirm: 'APPLY' }).reason), /APPLY_NOT_CONFIRMED/)
  })

  it('plano inseguro ou vazio → recusado mesmo com PLAN_ID correto', () => {
    assert.equal(gate({ ready: false }).ok, false)
    assert.equal(gate({ updatesCount: 0 }).ok, false)
  })

  it('dry-run nunca passa no portão; apply válido só com o plano correspondente', () => {
    assert.deepEqual(gate({ writesEnabled: false }), { ok: false, reason: 'DRY_RUN' })
    assert.deepEqual(gate(), { ok: true, reason: null })
  })

  it('--plan-id é lido só da flag explícita', () => {
    assert.equal(parsePlanIdArg(['--apply']), null)
    assert.equal(parsePlanIdArg(['--apply', '--plan-id=']), null)
    assert.equal(parsePlanIdArg(['--apply', '--plan-id=bf1-abc']), 'bf1-abc')
  })
})

describe('ADMIN.4.3.8d — PATCH mínimo e apply controlado (fetch falso)', () => {
  const plannedUpdates = () => buildConditionalUpdates(buildPlan([row()]).plans)

  it('PATCH devolve somente id,updated_at,campo — nunca payload; filtros condicionais preservados', () => {
    for (const u of plannedUpdates()) {
      const q = new URLSearchParams(applyUpdateQuery(u))
      assert.equal(q.get('select'), `id,updated_at,${u.requireNull}`)
      assert.equal(q.get('select')!.includes('payload'), false)
      assert.equal(q.get('id'), 'eq.row-1')
      assert.equal(q.get('user_id'), `eq.${TENANT_A}`)
      assert.equal(q.get('local_id'), 'eq.17900000000001')
      assert.equal(q.get(u.requireNull), 'is.null')
    }
  })

  it('verifyAppliedRow exige mesmo id e valor exato planejado', () => {
    const [st, tot] = plannedUpdates()
    assert.equal(verifyAppliedRow(st, { id: 'row-1', status: 'Pendente', updated_at: 'x' }), null)
    assert.equal(verifyAppliedRow(st, { id: 'row-X', status: 'Pendente' }), 'id_divergente')
    assert.equal(verifyAppliedRow(st, { id: 'row-1', status: 'Aprovado' }), 'valor_divergente')
    assert.equal(verifyAppliedRow(tot, { id: 'row-1', total: 90 }), null)
    assert.equal(verifyAppliedRow(tot, { id: 'row-1', total: 91 }), 'valor_divergente')
  })

  function fakeServer(handler: (url: URL, body: Record<string, unknown>) => unknown[] | Response) {
    const calls: { method: string; url: URL; body: Record<string, unknown> }[] = []
    const fetchImpl = async (input: string, init: RequestInit) => {
      const url = new URL(input)
      const body = JSON.parse(String(init.body))
      calls.push({ method: String(init.method), url, body })
      const out = handler(url, body)
      return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 })
    }
    return { calls, fetchImpl }
  }

  it('apply sequencial: 1 campo por PATCH, body sem payload/aprovado/updated_at, representação mínima', async () => {
    const updates = plannedUpdates()
    const { calls, fetchImpl } = fakeServer((url, body) => [{ id: 'row-1', updated_at: 'T', ...body }])
    const res = await applyConditionalUpdates({ url: 'https://x', key: 'k', updates, fetchImpl })
    assert.equal(res.error, null)
    assert.equal(res.applied, 3)
    assert.equal(calls.length, 3)
    for (const c of calls) {
      assert.equal(c.method, 'PATCH')
      assert.equal(Object.keys(c.body).length, 1)
      for (const k of ['payload', 'aprovado', 'user_id', 'local_id', 'created_at', 'updated_at']) assert.equal(k in c.body, false, k)
      assert.equal(c.url.searchParams.get('select')!.startsWith('id,updated_at,'), true)
    }
  })

  it('0 rows = RACE_SKIP (sem retry/relaxar filtro); >1 row = ABORT imediato com progresso', async () => {
    const updates = plannedUpdates()
    const skip = fakeServer(() => [])
    const r1 = await applyConditionalUpdates({ url: 'https://x', key: 'k', updates, fetchImpl: skip.fetchImpl })
    assert.equal(r1.skipped, 3)
    assert.equal(skip.calls.length, 3)
    assert.ok(r1.results.every((r) => (r as { outcome?: string }).outcome === 'RACE_SKIP'))

    let n = 0
    const many = fakeServer((_u, body) => (++n === 2 ? [{ id: 'row-1', ...body }, { id: 'row-2', ...body }] : [{ id: 'row-1', ...body }]))
    const r2 = await applyConditionalUpdates({ url: 'https://x', key: 'k', updates, fetchImpl: many.fetchImpl })
    assert.match(String(r2.error), /APPLY_ABORT: 2 rows/)
    assert.equal(r2.applied, 1)
    assert.equal(many.calls.length, 2)
  })

  it('erro HTTP para no primeiro erro e devolve o que concluiu (sem rollback automático)', async () => {
    const updates = plannedUpdates()
    let n = 0
    const srv = fakeServer((_u, body) => (++n === 2 ? new Response('{"message":"x"}', { status: 500 }) : [{ id: 'row-1', ...body }]))
    const res = await applyConditionalUpdates({ url: 'https://x', key: 'k', updates, fetchImpl: srv.fetchImpl })
    assert.match(String(res.error), /APPLY_FAILED status=500/)
    assert.equal(res.applied, 1)
    assert.equal(res.results.length, 2)
    assert.equal(srv.calls.length, 2)
    assert.equal(srv.calls.every((c) => c.method === 'PATCH'), true)
  })

  it('id/valor divergente na resposta aborta', async () => {
    const srv = fakeServer((_u, body) => [{ id: 'outra', ...body }])
    const res = await applyConditionalUpdates({ url: 'https://x', key: 'k', updates: plannedUpdates(), fetchImpl: srv.fetchImpl })
    assert.match(String(res.error), /id_divergente/)
    assert.equal(srv.calls.length, 1)
  })
})

describe('ADMIN.4.3.8d — snapshot, plano aprovado e auditoria pós-apply', () => {
  it('fingerprint: sha256 + atualizadoEm, sem conteúdo do payload', () => {
    const fp = payloadFingerprint({ a: 1, atualizadoEm: 123 })
    assert.match(String(fp.payload_sha256), /^[0-9a-f]{64}$/)
    assert.equal(fp.payload_atualizado_em, 123)
    const snap = buildSnapshotRows([row()], buildPlan([row()]).plans)[0]
    assert.equal('payload' in snap, false)
    assert.equal(snap.old_aprovado, false)
    assert.equal(typeof snap.payload_sha256, 'string')
    const f = buildRowFingerprints([row()])[0]
    assert.equal('payload' in f, false)
  })

  function scenario() {
    const before = [
      row(),
      row({ id: 'row-2', local_id: '2' }, { cliente: undefined }),
      row({ id: 'row-3', local_id: '3', status: 'Pendente', total: 90, cliente: 'TESTE NORMALIZACAO 436B' }),
    ]
    const plan = buildPlan(before)
    return { before, plan, fingerprints: buildRowFingerprints(before), snapshotRows: buildSnapshotRows(before, plan.plans) }
  }

  it('auditoria pós-apply: apply limpo = só campos planejados, payload/aprovado/tenant intactos', () => {
    const { before, plan, fingerprints, snapshotRows } = scenario()
    const after = before.map((r, i) => {
      const next = applyPatchInMemory(r, plan.plans[i].patch)
      if (Object.keys(plan.plans[i].patch).length) next.updated_at = '2026-09-27T13:00:00Z'
      return next
    })
    const a = buildPostApplyAudit({ fingerprints, snapshotRows, rowsNow: after })
    assert.deepEqual(a.written, { status: 2, total: 2, cliente: 1 })
    assert.deepEqual(a.planned_not_written, { status: 0, total: 0, cliente: 0 })
    assert.deepEqual(a.unexpected_field_changes, [])
    for (const k of ['payload_changed', 'payload_atualizado_em_changed', 'approved_changed', 'user_id_changed', 'local_id_changed', 'rows_missing', 'rows_new', 'updated_at_changed_outside_plan']) {
      assert.equal((a as Record<string, unknown>)[k], 0, k)
    }
    assert.equal(a.updated_at_changed, 2)
  })

  it('auditoria pós-apply detecta payload/aprovado/tenant/row alterados e campo fora do plano', () => {
    const { before, fingerprints, snapshotRows } = scenario()
    const after = [
      { ...before[0], payload: { ...before[0].payload, atualizadoEm: 999 }, aprovado: true },
      { ...before[1], user_id: 'outro', cliente: 'Inventado' },
      { ...before[2], id: 'row-nova' },
    ]
    const a = buildPostApplyAudit({ fingerprints, snapshotRows, rowsNow: after })
    assert.equal(a.payload_changed, 1)
    assert.equal(a.payload_atualizado_em_changed, 1)
    assert.equal(a.approved_changed, 1)
    assert.equal(a.user_id_changed, 1)
    assert.equal(a.rows_missing, 1)
    assert.equal(a.rows_new, 1)
    assert.equal(a.unexpected_field_changes.length, 1)
    assert.equal(a.planned_not_written.status, 2)
  })
})
