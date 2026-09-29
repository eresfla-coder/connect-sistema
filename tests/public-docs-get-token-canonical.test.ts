import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

type Linha = Record<string, unknown>
type Resposta = { status: number; json: () => Promise<any> }

const ROOT = new URL('../', import.meta.url)
const ESTADO = '__PUBLIC_DOCS_GET_TOKEN_TEST__'
const SUPABASE_ADMIN_MOCK =
  'data:text/javascript,' +
  encodeURIComponent(`export function getSupabaseAdmin() { return globalThis.${ESTADO}.client }`)

// Carrega o route.ts real: resolve o alias '@/' e troca apenas o client Supabase por um banco em memória.
;(nodeModule as any).registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) {
    if (specifier === '@/lib/supabase-admin') return { url: SUPABASE_ADMIN_MOCK, shortCircuit: true }
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (specifier.startsWith('@/')) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const url = new URL(specifier.slice(2) + ext, ROOT)
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const OWNER = '11111111-1111-4111-8111-111111111111'
const BEARER_OWNER = 'jwt-do-owner'

function criarClient(tabela: Linha[]) {
  return {
    auth: {
      getUser: async (jwt: string) =>
        jwt === BEARER_OWNER
          ? { data: { user: { id: OWNER } }, error: null }
          : { data: { user: null }, error: { message: 'sem sessão' } },
    },
    from(nome: string) {
      assert.equal(nome, 'public_documents')
      const filtros: ((r: Linha) => boolean)[] = []
      const presente = (v: unknown) => v !== null && v !== undefined
      const q: any = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq(coluna: string, valor: unknown) {
          filtros.push((r) => presente(r[coluna]) && String(r[coluna]) === String(valor))
          return q
        },
        in(coluna: string, valores: unknown[]) {
          filtros.push((r) => presente(r[coluna]) && valores.map(String).includes(String(r[coluna])))
          return q
        },
        async maybeSingle() {
          const rows = tabela.filter((r) => filtros.every((f) => f(r)))
          if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } }
          return { data: rows[0] ? { ...rows[0] } : null, error: null }
        },
      }
      return q
    },
  }
}

let GET: (req: any) => Promise<Resposta>

before(async () => {
  ;(globalThis as any)[ESTADO] = { client: criarClient([]) }
  const mod = await import('../app/api/public-docs/route.ts')
  GET = mod.GET as unknown as typeof GET
})

const ID_LINHA = '9f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607'
const REAL_ID = '1716000000000'
const OUTRO_ID = '1716000000999'
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaa11'
const TOKEN_ERRADO = 'bbbbbbbbbbbbbbbbbbbbbb22'

function linha(tipo: string, extra: Linha = {}): Linha {
  return {
    id: ID_LINHA,
    token: TOKEN,
    document_type: tipo,
    document_id: REAL_ID,
    tipo,
    documento_id: REAL_ID,
    user_id: null,
    payload: {},
    ...extra,
  }
}

async function get(tabela: Linha[], query: Record<string, string>, bearer = '') {
  ;(globalThis as any)[ESTADO] = { client: criarClient(tabela) }
  const url = `http://localhost/api/public-docs?${new URLSearchParams(query).toString()}`
  const headers: Record<string, string> = bearer ? { authorization: `Bearer ${bearer}` } : {}
  const res = await GET(new Request(url, { headers }))
  return { status: res.status, body: await res.json() }
}

/** Ramo específico (document_type/document_id) e ramo legado (tipo/documentoId) devem concordar. */
async function statusNosDoisRamos(tipo: string, row: Linha, id = REAL_ID, token = TOKEN) {
  const especifico = await get([row], { document_type: tipo, document_id: id, token })
  const legado = await get([row], { tipo, documentoId: id, token })
  if (especifico.status === 200) assert.equal(especifico.body.token, TOKEN)
  if (especifico.status === 404) assert.equal(especifico.body.token, undefined, 'nenhum dado da publicação é devolvido')
  return [especifico.status, legado.status]
}

describe('SECURITY.1d.2 — GET de orçamento por token aplica a validação canônica', () => {
  const casos: [string, Linha, number][] = [
    ['1) moderno coerente', linha('orcamento'), 200],
    ['2) legado coerente (só tipo/documento_id)', linha('orcamento', { document_type: null, document_id: null }), 200],
    ['3) artefato 1c coerente (document_id = id da linha)', linha('orcamento', { document_id: ID_LINHA }), 200],
    ['4) tipo divergente (document_type=ordem_servico, tipo=orcamento)', linha('orcamento', { document_type: 'ordem_servico' }), 404],
    ['4b) tipo divergente (document_type=recibo, tipo=orcamento)', linha('orcamento', { document_type: 'recibo' }), 404],
    ['4c) artefato 1c + tipo divergente', linha('orcamento', { document_type: 'ordem_servico', document_id: ID_LINHA }), 404],
    ['5) documento divergente sem artefato (document_id ≠ documento_id)', linha('orcamento', { document_id: OUTRO_ID }), 404],
  ]
  for (const [nome, row, esperado] of casos) {
    it(`${nome} → ${esperado} nos dois ramos`, async () => {
      assert.deepEqual(await statusNosDoisRamos('orcamento', row), [esperado, esperado])
    })
  }

  it('6) token errado → 404', async () => {
    assert.deepEqual(await statusNosDoisRamos('orcamento', linha('orcamento'), REAL_ID, TOKEN_ERRADO), [404, 404])
  })

  it('7) documento errado (inclusive o id artefato) → 404', async () => {
    assert.deepEqual(await statusNosDoisRamos('orcamento', linha('orcamento'), OUTRO_ID), [404, 404])
    assert.deepEqual(await statusNosDoisRamos('orcamento', linha('orcamento', { document_id: ID_LINHA }), ID_LINHA), [404, 404])
  })

  it('sem token e sem Bearer continua 401', async () => {
    const r = await get([linha('orcamento')], { document_type: 'orcamento', document_id: REAL_ID })
    assert.equal(r.status, 401)
  })

  it('view=aprovacao (owner, sem token) inalterada', async () => {
    const row = linha('orcamento', { user_id: OWNER, status: 'aprovado', aprovado: true })
    const r = await get([row], { document_type: 'orcamento', document_id: REAL_ID, view: 'aprovacao' }, BEARER_OWNER)
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { payload: { status: 'aprovado', aprovado: true } })
  })

  it('owner path (Bearer, sem token) inalterado', async () => {
    const row = linha('orcamento', { user_id: OWNER })
    const r = await get([row], { document_type: 'orcamento', document_id: REAL_ID }, BEARER_OWNER)
    assert.equal(r.status, 200)
    assert.equal(r.body.documento_id, REAL_ID)
  })
})

for (const tipo of ['recibo', 'contrato']) {
  describe(`SECURITY.1d.2 — GET de ${tipo} por token aplica a validação canônica`, () => {
    const outroTipo = tipo === 'recibo' ? 'contrato' : 'recibo'
    const casos: [string, Linha, number][] = [
      ['coerente', linha(tipo), 200],
      ['coerente via fallback legado (artefato 1c)', linha(tipo, { document_id: ID_LINHA }), 200],
      [`tipo divergente (document_type=${tipo}, tipo=orcamento)`, linha(tipo, { tipo: 'orcamento' }), 404],
      [`tipo divergente (document_type=${tipo}, tipo=${outroTipo})`, linha(tipo, { tipo: outroTipo }), 404],
      ['tipo divergente via fallback legado (document_type=orcamento + artefato)', linha(tipo, { document_type: 'orcamento', document_id: ID_LINHA }), 404],
      ['documento divergente (document_id ≠ documento_id)', linha(tipo, { documento_id: OUTRO_ID }), 404],
      ['documento divergente via fallback legado (document_id ≠ id da linha)', linha(tipo, { document_id: OUTRO_ID }), 404],
    ]
    for (const [nome, row, esperado] of casos) {
      it(`${nome} → ${esperado} nos dois ramos`, async () => {
        assert.deepEqual(await statusNosDoisRamos(tipo, row), [esperado, esperado])
      })
    }

    it('token errado → 404', async () => {
      assert.deepEqual(await statusNosDoisRamos(tipo, linha(tipo), REAL_ID, TOKEN_ERRADO), [404, 404])
    })

    it('documento errado → 404', async () => {
      assert.deepEqual(await statusNosDoisRamos(tipo, linha(tipo), OUTRO_ID), [404, 404])
    })

    it('token ausente ou malformado continua 400', async () => {
      for (const token of ['', 'nao-hex']) {
        const r = await get([linha(tipo)], { document_type: tipo, document_id: REAL_ID, token })
        assert.equal(r.status, 400)
      }
    })
  })
}
