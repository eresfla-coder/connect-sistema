/**
 * ADMIN.4.3.6 — contrato do mapper write-path de public.orcamentos.
 * Sem SQL, sem backfill, sem orçamento real.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  clienteNomeParaColuna,
  orcamentoParaUpsertSupabase,
  serializarPayloadOrcamento,
  totalCanonicoParaColuna,
  type OrcamentoSalvoUpsertInput,
} from '../lib/orcamento-supabase-upsert.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

function fixtureBase(over: Partial<OrcamentoSalvoUpsertInput> = {}): OrcamentoSalvoUpsertInput {
  return {
    id: 17896507466501,
    numero: '0003',
    titulo: 'Orçamento Comercial',
    status: 'Pendente',
    total: 1000,
    subtotal: 1000,
    desconto: 0,
    entrega: 0,
    cliente: { nome: 'Cliente Teste', telefone: '84999999999' },
    aprovado: false,
    itens: [{ descricao: 'Item', quantidade: 1, valor: 1000, total: 1000 }],
    ...over,
  }
}

describe('ADMIN.4.3.6 — orcamentoParaUpsertSupabase', () => {
  it('A) mapper mantém user_id', () => {
    const uid = 'dd1f6a30-73a4-459f-9335-96dc56523089'
    const row = orcamentoParaUpsertSupabase(fixtureBase(), uid)
    assert.equal(row.user_id, uid)
  })

  it('B) mapper mantém local_id', () => {
    const orc = fixtureBase({ id: 17901655837811 })
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.equal(row.local_id, '17901655837811')
  })

  it('C) mapper mantém aprovado', () => {
    const row = orcamentoParaUpsertSupabase(fixtureBase({ status: 'Aprovado', aprovado: true }), 'u1')
    assert.equal(row.aprovado, true)
    const pend = orcamentoParaUpsertSupabase(fixtureBase({ status: 'Pendente', aprovado: false }), 'u1')
    assert.equal(pend.aprovado, false)
  })

  it('D) mapper mantém payload', () => {
    const orc = fixtureBase()
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.ok(row.payload && typeof row.payload === 'object')
    assert.equal(row.payload.id, orc.id)
  })

  it('E) mapper adiciona status', () => {
    const row = orcamentoParaUpsertSupabase(fixtureBase({ status: 'Pendente' }), 'u1')
    assert.equal(row.status, 'Pendente')
  })

  it('F) status corresponde ao OrcamentoSalvo', () => {
    for (const st of ['Pendente', 'Aprovado', 'Convertido', 'Cancelado'] as const) {
      const row = orcamentoParaUpsertSupabase(fixtureBase({ status: st, aprovado: st !== 'Pendente' && st !== 'Cancelado' }), 'u1')
      assert.equal(row.status, st)
    }
  })

  it('G) mapper adiciona total', () => {
    const row = orcamentoParaUpsertSupabase(fixtureBase({ total: 850.5 }), 'u1')
    assert.equal(row.total, 850.5)
  })

  it('H) total corresponde ao total canônico', () => {
    const orc = fixtureBase({ total: 1234.56, subtotal: 9999, desconto: 1, entrega: 2 })
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.equal(row.total, 1234.56)
    assert.equal(row.total, totalCanonicoParaColuna(orc.total))
  })

  it('I) desconto não é recalculado no mapper', () => {
    const orc = fixtureBase({
      subtotal: 1000,
      desconto: 150,
      entrega: 0,
      total: 850,
    })
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.equal(row.total, 850)
    assert.equal(row.payload.desconto, 150)
    assert.equal(row.payload.total, 850)
  })

  it('J) frete não é recalculado no mapper', () => {
    const orc = fixtureBase({
      subtotal: 1000,
      desconto: 0,
      entrega: 50,
      total: 1050,
    })
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.equal(row.total, 1050)
    assert.equal(row.payload.entrega, 50)
  })

  it('K) m² não é recalculado no mapper', () => {
    const orc = fixtureBase({
      itens: [
        {
          descricao: 'Adesivo',
          tipoCalculo: 'm2',
          largura: 2,
          altura: 3,
          metragem: 6,
          valorM2: 10,
          quantidade: 1,
          valor: 60,
          total: 60,
        },
      ],
      subtotal: 60,
      desconto: 0,
      entrega: 0,
      total: 60,
    })
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.equal(row.total, 60)
    const itens = row.payload.itens as Array<Record<string, unknown>>
    assert.equal(itens[0].metragem, 6)
    assert.equal(itens[0].total, 60)
  })

  it('L) mapper adiciona cliente', () => {
    const row = orcamentoParaUpsertSupabase(fixtureBase({ cliente: { nome: 'BIRA MOVEIS' } }), 'u1')
    assert.equal(row.cliente, 'BIRA MOVEIS')
  })

  it('M) cliente corresponde à fonte canônica', () => {
    const orc = fixtureBase({ cliente: { nome: '  Samyr  ', telefone: '1' } })
    assert.equal(orcamentoParaUpsertSupabase(orc, 'u1').cliente, 'Samyr')
    assert.equal(clienteNomeParaColuna(orc.cliente), 'Samyr')
  })

  it('N) nunca gera "undefined"', () => {
    const row = orcamentoParaUpsertSupabase(fixtureBase({ cliente: { nome: undefined } }), 'u1')
    assert.notEqual(row.cliente, 'undefined')
    assert.equal(row.cliente, null)
  })

  it('O) nunca gera "null" textual', () => {
    assert.equal(clienteNomeParaColuna({ nome: 'null' }), null)
    assert.equal(clienteNomeParaColuna('null'), null)
    const row = orcamentoParaUpsertSupabase(fixtureBase({ cliente: null }), 'u1')
    assert.equal(row.cliente, null)
    assert.equal(typeof row.cliente === 'string' && row.cliente === 'null', false)
  })

  it('P–S) create/edit/status/sync usam mapper no page.tsx', () => {
    const page = read('app/(painel)/orcamentos/page.tsx')
    assert.ok(page.includes("from '@/lib/orcamento-supabase-upsert'"))
    assert.ok(page.includes('mapearOrcamentoParaUpsertSupabase'))
    assert.ok(page.includes('function orcamentoParaUpsertSupabase'))
    assert.ok(page.includes('aplicarStatusResolvido(orc)'))
    // create/edit → persistirOrcamentoComRetry → persistirOrcamentoSupabase → mapper
    assert.ok(page.includes('persistirOrcamentoComRetry(atualizadoBase)'))
    assert.ok(page.includes('persistirOrcamentoComRetry(novoBase)') || page.includes('persistirOrcamentoComRetry(novo'))
    assert.ok(page.includes('void persistirOrcamentoSupabase(atualizado)'))
    assert.ok(page.includes('persistirOrcamentoComRetry(orcamento, userId)'))
  })

  it('T) payload permanece estruturalmente idêntico', () => {
    const orc = fixtureBase({
      desconto: 100,
      entrega: 25,
      total: 925,
      aprovacaoDigital: { status: 'aprovado', nome: 'X', data: '01/01/2026' },
    })
    const esperado = serializarPayloadOrcamento(orc)
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.deepEqual(row.payload, esperado)
  })

  it('U) itens permanecem no payload', () => {
    const orc = fixtureBase()
    const row = orcamentoParaUpsertSupabase(orc, 'u1')
    assert.deepEqual(row.payload.itens, orc.itens)
  })

  it('V) desconto permanece no payload', () => {
    const orc = fixtureBase({ desconto: 150, total: 850 })
    assert.equal(orcamentoParaUpsertSupabase(orc, 'u1').payload.desconto, 150)
  })

  it('W) frete permanece no payload', () => {
    const orc = fixtureBase({ entrega: 40, total: 1040 })
    assert.equal(orcamentoParaUpsertSupabase(orc, 'u1').payload.entrega, 40)
  })

  it('X) user_id não muda', () => {
    const a = orcamentoParaUpsertSupabase(fixtureBase(), 'aaa')
    const b = orcamentoParaUpsertSupabase(fixtureBase(), 'aaa')
    assert.equal(a.user_id, b.user_id)
    assert.equal(a.user_id, 'aaa')
  })

  it('Y) local_id não muda', () => {
    const orc = fixtureBase({ id: 42 })
    assert.equal(orcamentoParaUpsertSupabase(orc, 'u1').local_id, '42')
    assert.equal(orcamentoParaUpsertSupabase(orc, 'u2').local_id, '42')
  })

  it('Z) nenhuma coluna inexistente cliente_nome é enviada', () => {
    const row = orcamentoParaUpsertSupabase(fixtureBase(), 'u1')
    assert.equal('cliente_nome' in row, false)
    assert.ok('cliente' in row)
    const page = read('app/(painel)/orcamentos/page.tsx')
    const lib = read('lib/orcamento-supabase-upsert.ts')
    assert.equal(lib.includes('cliente_nome'), false)
    // page may still mention cliente_nome no reader legado — upsert row não deve incluir
    assert.ok(page.includes('mapearOrcamentoParaUpsertSupabase(aplicarStatusResolvido(orc), userId)'))
  })

  it('caso simples + desconto + frete + m² misto', () => {
    const simples = orcamentoParaUpsertSupabase(fixtureBase(), 'u1')
    assert.equal(simples.status, 'Pendente')
    assert.equal(simples.total, 1000)
    assert.equal(simples.cliente, 'Cliente Teste')

    const comDesconto = orcamentoParaUpsertSupabase(
      fixtureBase({ subtotal: 1000, desconto: 100, entrega: 0, total: 900 }),
      'u1',
    )
    assert.equal(comDesconto.total, 900)

    const comFrete = orcamentoParaUpsertSupabase(
      fixtureBase({ subtotal: 1000, desconto: 0, entrega: 30, total: 1030 }),
      'u1',
    )
    assert.equal(comFrete.total, 1030)

    const misto = orcamentoParaUpsertSupabase(
      fixtureBase({
        itens: [
          { descricao: 'Prod', quantidade: 1, valor: 100, total: 100 },
          {
            descricao: 'M2',
            tipoCalculo: 'm2',
            metragem: 2,
            valorM2: 50,
            quantidade: 1,
            valor: 100,
            total: 100,
          },
        ],
        subtotal: 200,
        desconto: 20,
        entrega: 10,
        total: 190,
      }),
      'u1',
    )
    assert.equal(misto.total, 190)
    assert.equal((misto.payload.itens as unknown[]).length, 2)
  })

  it('escopo: backup/gateway/UI suporte não alterados nesta rodada', () => {
    // sanity — arquivos existem; contratos de não-touch verificados via diff report
    assert.ok(read('lib/backup-server.ts').includes("upsertEmLotes('orcamentos'"))
    assert.ok(read('lib/admin-support-gateway.ts').includes('ADMIN_SUPPORT_ORCAMENTOS_SELECT'))
  })
})
