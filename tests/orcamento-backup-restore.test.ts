/**
 * ADMIN.4.3.7a — revisão semântica do restore de orçamentos.
 * Unitário / fixtures locais. ZERO SQL, ZERO banco, ZERO restore real.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  aprovadoOrcamentoBackup,
  clienteOrcamentoBackup,
  orcamentoBackupParaRestoreRow,
  statusOrcamentoBackupResolvido,
  totalOrcamentoBackup,
} from '../lib/orcamento-backup-restore.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const AUTH_UID = 'ace94ffa-5d0d-45ae-88dd-2af7179607a1'
const MALICIOUS_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function deepFreezeClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function assertPayloadDeepEqual(before: unknown, after: unknown) {
  assert.deepEqual(after, before)
}

function payloadDoc(over: Record<string, unknown> = {}) {
  return {
    id: 17902800004171,
    numero: '0009',
    status: 'Pendente',
    total: 90,
    subtotal: 100,
    desconto: 10,
    entrega: 0,
    cliente: { nome: 'TESTE NORMALIZACAO 436B', telefone: '84999999999' },
    aprovado: false,
    itens: [
      {
        descricao: 'TESTE WRITE PATH 436B',
        quantidade: 2,
        valor: 50,
        total: 100,
        tipoCalculo: 'm2',
        metragem: 2,
        valorM2: 50,
      },
    ],
    ...over,
  }
}

/** Backup novo (row DB com resumo top-level). */
function fixtureNovo(over: Record<string, unknown> = {}) {
  const payload = payloadDoc()
  return {
    local_id: String(payload.id),
    user_id: MALICIOUS_UID,
    status: 'Pendente',
    total: 90,
    cliente: 'TESTE NORMALIZACAO 436B',
    aprovado: false,
    payload,
    created_at: '2026-09-24T21:32:51.569802+00:00',
    updated_at: '2026-09-24T21:33:22.25995+00:00',
    ...over,
  }
}

/** A) antigo com tudo no payload */
function fixtureAntigoCompleto(payloadOver: Record<string, unknown> = {}) {
  const payload = payloadDoc(payloadOver)
  return {
    local_id: String(payload.id),
    user_id: MALICIOUS_UID,
    payload,
  }
}

/** B) antigo sem status */
function fixtureAntigoSemStatus() {
  const payload = payloadDoc()
  delete (payload as { status?: string }).status
  return { local_id: String(payload.id), user_id: MALICIOUS_UID, payload }
}

/** C) antigo com status desconhecido (legado DB: gerado) */
function fixtureAntigoStatusDesconhecido() {
  return fixtureAntigoCompleto({ status: 'gerado' })
}

/** D) antigo sem total */
function fixtureAntigoSemTotal() {
  const payload = payloadDoc()
  delete (payload as { total?: number }).total
  return { local_id: String(payload.id), user_id: MALICIOUS_UID, payload }
}

/** E) antigo com total=0 */
function fixtureAntigoTotalZero() {
  return fixtureAntigoCompleto({ total: 0, subtotal: 0, desconto: 0 })
}

/** F) antigo sem cliente */
function fixtureAntigoSemCliente() {
  const payload = payloadDoc()
  delete (payload as { cliente?: unknown }).cliente
  return { local_id: String(payload.id), user_id: MALICIOUS_UID, payload }
}

/** G) antigo sem aprovado */
function fixtureAntigoSemAprovado() {
  const payload = payloadDoc({ status: 'Pendente' })
  delete (payload as { aprovado?: boolean }).aprovado
  return { local_id: String(payload.id), user_id: MALICIOUS_UID, payload }
}

/** H) antigo com payload mínimo */
function fixtureAntigoMinimo() {
  return {
    local_id: '17902800009999',
    user_id: MALICIOUS_UID,
    payload: { id: 17902800009999 },
  }
}

describe('ADMIN.4.3.7a — semântica restore orçamentos', () => {
  it('A) antigo com tudo no payload → status/total/cliente preenchidos; payload intacto', () => {
    const item = fixtureAntigoCompleto()
    const payloadAntes = deepFreezeClone(item.payload)
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.status, 'Pendente')
    assert.equal(row.total, 90)
    assert.equal(row.cliente, 'TESTE NORMALIZACAO 436B')
    assert.equal(row.aprovado, false)
    assertPayloadDeepEqual(payloadAntes, row.payload)
  })

  it('B) antigo sem status → status null; payload intacto', () => {
    const item = fixtureAntigoSemStatus()
    const payloadAntes = deepFreezeClone(item.payload)
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.status, null)
    assert.equal(row.total, 90)
    assertPayloadDeepEqual(payloadAntes, row.payload)
    assert.equal('status' in (row.payload as object), false)
  })

  it('C) antigo status desconhecido "gerado" → status null; payload.status permanece gerado', () => {
    const item = fixtureAntigoStatusDesconhecido()
    const payloadAntes = deepFreezeClone(item.payload)
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.status, null)
    assert.equal((row.payload as { status: string }).status, 'gerado')
    assertPayloadDeepEqual(payloadAntes, row.payload)
    assert.equal(row.aprovado, false)
  })

  it('D) antigo sem total → total null (não inventar 0)', () => {
    const item = fixtureAntigoSemTotal()
    const payloadAntes = deepFreezeClone(item.payload)
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.total, null)
    assertPayloadDeepEqual(payloadAntes, row.payload)
  })

  it('E) antigo com total=0 → preserva 0', () => {
    const item = fixtureAntigoTotalZero()
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.total, 0)
    assert.equal(totalOrcamentoBackup(undefined, { total: 0 }), 0)
  })

  it('F) antigo sem cliente → cliente null', () => {
    const item = fixtureAntigoSemCliente()
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.cliente, null)
  })

  it('G) antigo sem aprovado + status Pendente → aprovado false (NOT NULL / DEFAULT)', () => {
    const item = fixtureAntigoSemAprovado()
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.aprovado, false)
  })

  it('H) antigo payload mínimo → nulls seguros; aprovado false; payload deepEqual', () => {
    const item = fixtureAntigoMinimo()
    const payloadAntes = deepFreezeClone(item.payload)
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.status, null)
    assert.equal(row.total, null)
    assert.equal(row.cliente, null)
    assert.equal(row.aprovado, false)
    assert.equal(row.local_id, '17902800009999')
    assertPayloadDeepEqual(payloadAntes, row.payload)
  })

  it('backup novo restaura status/total/cliente/aprovado', () => {
    const row = orcamentoBackupParaRestoreRow(
      fixtureNovo({ status: 'Aprovado', aprovado: true, total: 90 }),
      AUTH_UID,
    )!
    assert.equal(row.status, 'Aprovado')
    assert.equal(row.total, 90)
    assert.equal(row.cliente, 'TESTE NORMALIZACAO 436B')
    assert.equal(row.aprovado, true)
  })

  it('explicit total 0 top-level permanece 0 mesmo se payload tiver outro', () => {
    const row = orcamentoBackupParaRestoreRow(
      fixtureNovo({ total: 0, payload: payloadDoc({ total: 999 }) }),
      AUTH_UID,
    )!
    assert.equal(row.total, 0)
  })

  it('total ausente NÃO é confundido com 0', () => {
    assert.equal(totalOrcamentoBackup(undefined, {}), null)
    assert.equal(totalOrcamentoBackup(null, { id: 1 }), null)
    assert.notEqual(totalOrcamentoBackup(undefined, {}), 0)
  })

  it('status válido preservado; desconhecido não altera payload', () => {
    assert.equal(statusOrcamentoBackupResolvido('Convertido', { status: 'Pendente' }), 'Convertido')
    const item = fixtureAntigoCompleto({ status: 'recusado_xyz' })
    const before = deepFreezeClone(item.payload)
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.status, null)
    assert.equal((row.payload as { status: string }).status, 'recusado_xyz')
    assertPayloadDeepEqual(before, row.payload)
  })

  it('status ausente tratado explicitamente como null', () => {
    assert.equal(statusOrcamentoBackupResolvido(undefined, {}), null)
    assert.equal(statusOrcamentoBackupResolvido(null, { id: 1 }), null)
  })

  it('cliente "" / undefined / null textuais → null', () => {
    assert.equal(clienteOrcamentoBackup('', { cliente: { nome: 'undefined' } }), null)
    assert.equal(clienteOrcamentoBackup('null', { cliente: 'null' }), null)
    assert.equal(clienteOrcamentoBackup(undefined, { cliente: { nome: '   ' } }), null)
  })

  it('aprovado: explícito; derivado de status canônico; ausente → false', () => {
    assert.equal(aprovadoOrcamentoBackup(true, {}, null), true)
    assert.equal(aprovadoOrcamentoBackup(false, { aprovado: true }, 'Aprovado'), false)
    assert.equal(aprovadoOrcamentoBackup(undefined, { aprovado: true }, null), true)
    assert.equal(aprovadoOrcamentoBackup(undefined, {}, 'Aprovado'), true)
    assert.equal(aprovadoOrcamentoBackup(undefined, {}, 'Convertido'), true)
    assert.equal(aprovadoOrcamentoBackup(undefined, {}, null), false)
    assert.equal(aprovadoOrcamentoBackup(undefined, {}, 'Pendente'), false)
  })

  it('desconto/frete/m²/itens não recalculados; payload deepEqual', () => {
    const item = fixtureAntigoCompleto({
      subtotal: 1000,
      desconto: 150,
      entrega: 25,
      total: 875,
      itens: [{ descricao: 'M2', tipoCalculo: 'm2', metragem: 4, valorM2: 30, total: 120 }],
    })
    const before = deepFreezeClone(item.payload)
    const hashItens = createHash('sha256').update(JSON.stringify((before as { itens: unknown }).itens)).digest('hex')
    const row = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(row.total, 875)
    assertPayloadDeepEqual(before, row.payload)
    assert.equal(
      createHash('sha256').update(JSON.stringify((row.payload as { itens: unknown }).itens)).digest('hex'),
      hashItens,
    )
  })

  it('tenant authority: user_id arquivo = B, autorizado = A → row.user_id = A', () => {
    const row = orcamentoBackupParaRestoreRow(fixtureNovo({ user_id: MALICIOUS_UID }), AUTH_UID)!
    assert.equal(row.user_id, AUTH_UID)
    assert.notEqual(row.user_id, MALICIOUS_UID)
  })

  it('idempotência: mesma chave user_id|local_id', () => {
    const item = fixtureNovo()
    const a = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    const b = orcamentoBackupParaRestoreRow(item, AUTH_UID)!
    assert.equal(`${a.user_id}|${a.local_id}`, `${b.user_id}|${b.local_id}`)
  })

  it('cloud legado (item = documento) aceito; status Cancelado canônico', () => {
    const doc = { ...payloadDoc({ status: 'Cancelado' }), user_id: MALICIOUS_UID }
    const before = deepFreezeClone(doc)
    const row = orcamentoBackupParaRestoreRow(doc, AUTH_UID)!
    assert.equal(row.status, 'Cancelado')
    assert.equal(row.user_id, AUTH_UID)
    // payload é o próprio doc — deepEqual estrutural do documento
    assert.deepEqual(row.payload, before)
  })

  it('escopo: mapper/gateway intactos; backup exporta resumo; onConflict preservado', () => {
    const mapper = read('lib/orcamento-supabase-upsert.ts')
    assert.match(mapper, /ADMIN\.4\.3\.6/)
    assert.equal(/from\s+['"].*orcamento-backup-restore/.test(mapper), false)

    const gw = read('lib/admin-support-gateway.ts')
    assert.match(gw, /ADMIN_SUPPORT_ORCAMENTOS_SELECT/)
    assert.equal(gw.includes('orcamento-backup-restore'), false)

    const src = read('lib/backup-server.ts')
    assert.match(src, /status,total,cliente,aprovado/)
    assert.match(src, /orcamentoBackupParaRestoreRow/)
    assert.match(src, /onConflict: 'user_id,local_id'/)

    const helper = read('lib/orcamento-backup-restore.ts')
    assert.equal(/from\s+['"].*orcamento-supabase-upsert/.test(helper), false)
  })
})
