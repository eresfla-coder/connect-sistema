/**
 * Testes — sync de aprovações públicas (fan-out, gate, cobertura round-robin).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  APROVACOES_SYNC_FANOUT_MAX,
  APROVACOES_SYNC_INITIAL_DELAY_MS,
  APROVACOES_SYNC_INTERVAL_MS,
  APROVACOES_SYNC_UI_COOLDOWN_MS,
  devePularSyncAprovacoes,
  listarOrcamentosElegiveisSyncAprovacao,
  selecionarOrcamentosParaSyncAprovacao,
} from '../lib/aprovacoes-publicas-sync.ts'

const root = process.cwd()
const pageSrc = readFileSync(join(root, 'app/(painel)/orcamentos/page.tsx'), 'utf8')

describe('aprovacoes-publicas-sync constants', () => {
  it('A) limite máximo por ciclo = 5', () => {
    assert.equal(APROVACOES_SYNC_FANOUT_MAX, 5)
    const lista = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, status: 'Pendente' }))
    assert.equal(selecionarOrcamentosParaSyncAprovacao(lista).selecionados.length, 5)
  })

  it('B) intervalo periódico = 5 minutos', () => {
    assert.equal(APROVACOES_SYNC_INTERVAL_MS, 5 * 60 * 1000)
  })

  it('preserva prioridade (ids mais altos primeiro) no 1º ciclo', () => {
    const sel = selecionarOrcamentosParaSyncAprovacao(
      [
        { id: 1, status: 'Pendente' },
        { id: 99, status: 'Aprovado' },
        { id: 50, status: 'Pendente' },
        { id: 40, status: 'Cancelado' },
        { id: 30, status: 'Pendente' },
        { id: 20, status: 'recusado' },
        { id: 10, status: 'Pendente' },
        { id: 5, status: 'Pendente' },
        { id: 4, status: 'Pendente' },
      ],
      5,
      0,
    )
    assert.deepEqual(
      sel.selecionados.map((x) => x.id),
      [50, 30, 10, 5, 4],
    )
  })
})

describe('aprovacoes-publicas-sync round-robin coverage', () => {
  it('18 pendentes: 4 ciclos cobrem todos; nenhum ciclo > 5', () => {
    const lista = Array.from({ length: 18 }, (_, i) => ({ id: i + 1, status: 'Pendente' }))
    // Ordenados elegíveis: 18..1
    assert.deepEqual(
      listarOrcamentosElegiveisSyncAprovacao(lista).map((x) => x.id),
      Array.from({ length: 18 }, (_, i) => 18 - i),
    )

    let cursor = 0
    const ciclos: number[][] = []
    const vistos = new Set<number>()

    for (let c = 0; c < 4; c += 1) {
      const { selecionados, nextCursorOffset } = selecionarOrcamentosParaSyncAprovacao(
        lista,
        APROVACOES_SYNC_FANOUT_MAX,
        cursor,
      )
      assert.ok(selecionados.length <= 5)
      const ids = selecionados.map((x) => Number(x.id))
      ciclos.push(ids)
      for (const id of ids) vistos.add(id)
      cursor = nextCursorOffset
    }

    assert.deepEqual(ciclos[0], [18, 17, 16, 15, 14])
    assert.deepEqual(ciclos[1], [13, 12, 11, 10, 9])
    assert.deepEqual(ciclos[2], [8, 7, 6, 5, 4])
    // ciclo 4: últimos 3 + wrap seguro dos primeiros (ainda ≤5)
    assert.deepEqual(ciclos[3], [3, 2, 1, 18, 17])
    assert.equal(vistos.size, 18)
    for (let id = 1; id <= 18; id += 1) assert.ok(vistos.has(id), `faltou id ${id}`)
  })

  it('após no máximo 4 ciclos todos os 18 foram consultados (sem wrap nos 3 primeiros ciclos)', () => {
    const lista = Array.from({ length: 18 }, (_, i) => ({ id: 100 + i, status: 'Pendente' }))
    let cursor = 0
    const vistosAntesDoWrap = new Set<number>()
    for (let c = 0; c < 3; c += 1) {
      const r = selecionarOrcamentosParaSyncAprovacao(lista, 5, cursor)
      assert.equal(r.selecionados.length, 5)
      for (const item of r.selecionados) vistosAntesDoWrap.add(Number(item.id))
      cursor = r.nextCursorOffset
    }
    assert.equal(vistosAntesDoWrap.size, 15)
    const r4 = selecionarOrcamentosParaSyncAprovacao(lista, 5, cursor)
    for (const item of r4.selecionados.slice(0, 3)) vistosAntesDoWrap.add(Number(item.id))
    assert.equal(vistosAntesDoWrap.size, 18)
  })

  it('mudança da lista entre ciclos não quebra (cursor normalizado)', () => {
    let cursor = 0
    const r1 = selecionarOrcamentosParaSyncAprovacao(
      [
        { id: 10, status: 'Pendente' },
        { id: 9, status: 'Pendente' },
        { id: 8, status: 'Pendente' },
        { id: 7, status: 'Pendente' },
        { id: 6, status: 'Pendente' },
        { id: 5, status: 'Pendente' },
      ],
      5,
      cursor,
    )
    cursor = r1.nextCursorOffset
    assert.deepEqual(
      r1.selecionados.map((x) => x.id),
      [10, 9, 8, 7, 6],
    )

    // id 10 aprovado some da elegibilidade; lista encolhe — cursor % len
    const r2 = selecionarOrcamentosParaSyncAprovacao(
      [
        { id: 10, status: 'Aprovado' },
        { id: 9, status: 'Pendente' },
        { id: 8, status: 'Pendente' },
        { id: 7, status: 'Pendente' },
        { id: 6, status: 'Pendente' },
        { id: 5, status: 'Pendente' },
        { id: 4, status: 'Pendente' },
      ],
      5,
      cursor,
    )
    assert.ok(r2.selecionados.length <= 5)
    assert.ok(r2.selecionados.every((x) => String(x.status).toLowerCase() === 'pendente'))
    assert.ok(Number.isInteger(r2.nextCursorOffset))
    assert.ok(r2.nextCursorOffset >= 0)
    assert.ok(r2.nextCursorOffset < 6)
  })

  it('lista <5 funciona', () => {
    const r = selecionarOrcamentosParaSyncAprovacao(
      [
        { id: 3, status: 'Pendente' },
        { id: 1, status: 'Pendente' },
      ],
      5,
      0,
    )
    assert.deepEqual(
      r.selecionados.map((x) => x.id),
      [3, 1],
    )
    assert.equal(r.nextCursorOffset, 0)
  })

  it('lista vazia funciona', () => {
    const r = selecionarOrcamentosParaSyncAprovacao([], 5, 99)
    assert.deepEqual(r.selecionados, [])
    assert.equal(r.nextCursorOffset, 0)
  })

  it('mesmo cursor estático sem avanço = starvation (prova do bug antigo)', () => {
    const lista = Array.from({ length: 18 }, (_, i) => ({ id: i + 1, status: 'Pendente' }))
    const a = selecionarOrcamentosParaSyncAprovacao(lista, 5, 0).selecionados.map((x) => x.id)
    const b = selecionarOrcamentosParaSyncAprovacao(lista, 5, 0).selecionados.map((x) => x.id)
    assert.deepEqual(a, b)
    assert.deepEqual(a, [18, 17, 16, 15, 14])
  })
})

describe('aprovacoes-publicas-sync gate', () => {
  const base = {
    agoraMs: 1_000_000,
    ultimaSyncMs: 0,
    rodando: false,
    visivel: true,
    temItens: true,
  }

  it('C) focus recente (ui-event) não dispara nova rodada', () => {
    const r = devePularSyncAprovacoes({
      ...base,
      motivo: 'ui-event',
      ultimaSyncMs: base.agoraMs - 30_000,
    })
    assert.equal(r.pular, true)
    assert.equal(r.razao, 'ui-cooldown')
  })

  it('D) visibilitychange recente não dispara', () => {
    const r = devePularSyncAprovacoes({
      ...base,
      motivo: 'ui-event',
      ultimaSyncMs: base.agoraMs - APROVACOES_SYNC_UI_COOLDOWN_MS + 1,
    })
    assert.equal(r.pular, true)
    assert.equal(r.razao, 'ui-cooldown')
  })

  it('E) hidden não dispara sync', () => {
    for (const motivo of ['initial', 'interval', 'ui-event'] as const) {
      const r = devePularSyncAprovacoes({ ...base, motivo, visivel: false })
      assert.equal(r.pular, true)
      assert.equal(r.razao, 'hidden')
    }
  })

  it('F) depois do cooldown, ui-event pode sincronizar', () => {
    const r = devePularSyncAprovacoes({
      ...base,
      motivo: 'ui-event',
      ultimaSyncMs: base.agoraMs - APROVACOES_SYNC_UI_COOLDOWN_MS,
    })
    assert.equal(r.pular, false)
  })

  it('G) duas tentativas simultâneas → single-flight', () => {
    const r = devePularSyncAprovacoes({ ...base, motivo: 'interval', rodando: true })
    assert.equal(r.pular, true)
    assert.equal(r.razao, 'single-flight')
  })

  it('H) lock é liberado mesmo se uma chamada falhar', async () => {
    let rodando = false
    async function executarComLock() {
      const gate = devePularSyncAprovacoes({
        ...base,
        motivo: 'interval',
        rodando,
      })
      if (gate.pular) return 'skipped'
      rodando = true
      try {
        throw new Error('falha simulada')
      } finally {
        rodando = false
      }
    }
    await assert.rejects(() => executarComLock(), /falha simulada/)
    assert.equal(rodando, false)
    assert.equal(
      devePularSyncAprovacoes({ ...base, motivo: 'interval', rodando }).pular,
      false,
    )
  })

  it('interval/initial não usam cooldown de UI', () => {
    assert.equal(
      devePularSyncAprovacoes({
        ...base,
        motivo: 'interval',
        ultimaSyncMs: base.agoraMs - 1000,
      }).pular,
      false,
    )
    assert.equal(
      devePularSyncAprovacoes({
        ...base,
        motivo: 'initial',
        ultimaSyncMs: base.agoraMs - 1000,
      }).pular,
      false,
    )
  })
})

describe('aprovacoes-publicas-sync source contracts (page)', () => {
  it('usa constantes, cursor em memória e fan-out 5', () => {
    assert.ok(pageSrc.includes('APROVACOES_SYNC_INTERVAL_MS'))
    assert.ok(pageSrc.includes('APROVACOES_SYNC_FANOUT_MAX'))
    assert.ok(pageSrc.includes('selecionarOrcamentosParaSyncAprovacao'))
    assert.ok(pageSrc.includes('devePularSyncAprovacoes'))
    assert.ok(pageSrc.includes('syncAprovacaoCursorRef'))
    assert.ok(pageSrc.includes('nextCursorOffset'))
    assert.equal(pageSrc.includes('.slice(0, 18)'), false)
    assert.equal(/,\s*60000\s*\)/.test(pageSrc), false)
    assert.equal(pageSrc.includes('localStorage'), true) // página já usa LS; cursor NÃO deve persistir sync
    assert.equal(pageSrc.includes('syncAprovacaoCursor'), true)
    assert.ok(!/syncAprovacaoCursorRef[\s\S]{0,200}localStorage/.test(pageSrc))
  })

  it('H) lock liberado em finally', () => {
    assert.ok(pageSrc.includes('syncAprovacaoPublicaRodandoRef.current = false'))
    assert.ok(pageSrc.includes('} finally {'))
  })

  it('I) mount continua com sync inicial', () => {
    assert.ok(pageSrc.includes('APROVACOES_SYNC_INITIAL_DELAY_MS'))
    assert.ok(pageSrc.includes("current('initial')") || pageSrc.includes("'initial'"))
    assert.equal(APROVACOES_SYNC_INITIAL_DELAY_MS, 1200)
  })

  it('J) cleanup remove timer/listeners; effect não depende de orcamentosSalvos inteiro', () => {
    assert.ok(pageSrc.includes('clearInterval'))
    assert.ok(pageSrc.includes("removeEventListener('focus'"))
    assert.ok(pageSrc.includes("removeEventListener('visibilitychange'"))
    assert.ok(pageSrc.includes('orcamentosSalvosRef.current = orcamentosSalvos'))
    assert.ok(pageSrc.includes("'ui-event'"))
    assert.ok(pageSrc.includes("'interval'"))
    assert.ok(pageSrc.includes('}, [])'))
  })

  it('K) API public-docs route não alterada nesta rodada (contrato)', () => {
    assert.ok(pageSrc.includes('/api/public-docs?document_type=orcamento&document_id='))
  })

  it('cooldown UI = 60s; volume periódico intacto', () => {
    assert.equal(APROVACOES_SYNC_UI_COOLDOWN_MS, 60 * 1000)
    assert.equal(APROVACOES_SYNC_FANOUT_MAX, 5)
    assert.equal(APROVACOES_SYNC_INTERVAL_MS, 5 * 60 * 1000)
  })
})
