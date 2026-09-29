import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

type Linha = Record<string, unknown>
type Resposta = { status: number; json: () => Promise<any> }

const ROOT = new URL('../', import.meta.url)
const ESTADO = '__PUBLIC_DOCS_GET_OS_TEST__'
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

function criarClient(tabela: Linha[]) {
  return {
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'sem sessão' } }) },
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

function linha(extra: Linha): Linha {
  return {
    id: ID_LINHA,
    token: TOKEN,
    document_type: 'ordem_servico',
    document_id: REAL_ID,
    tipo: 'ordem_servico',
    documento_id: REAL_ID,
    user_id: null,
    payload: {},
    ...extra,
  }
}

/** Formas de URL que pedem uma OS por token (as duas primeiras caem no ramo especial de OS do GET). */
const FORMAS_OS = [
  (id: string, token: string) => ({ tipo: 'os', documentoId: id, token }),
  (id: string, token: string) => ({ document_type: 'ordem_servico', document_id: id, token }),
  (id: string, token: string) => ({ tipo: 'ordem_servico', documentoId: id, token }),
]

async function getOs(tabela: Linha[], query: Record<string, string>) {
  ;(globalThis as any)[ESTADO] = { client: criarClient(tabela) }
  const url = `http://localhost/api/public-docs?${new URLSearchParams(query).toString()}`
  const res = await GET(new Request(url))
  return { status: res.status, body: await res.json() }
}

async function statusEmTodasAsFormas(row: Linha, id = REAL_ID, token = TOKEN) {
  const out: number[] = []
  for (const forma of FORMAS_OS) out.push((await getOs([row], forma(id, token))).status)
  return out
}

describe('SECURITY.1d — GET de OS aplica a validação canônica', () => {
  it('regressão do smoke: document_type=orcamento, tipo=os, document_id=id da linha → 404 com tipo=os', async () => {
    const row = linha({ document_type: 'orcamento', tipo: 'os', document_id: ID_LINHA, documento_id: REAL_ID })
    const r = await getOs([row], { tipo: 'os', documentoId: REAL_ID, token: TOKEN })
    assert.equal(r.status, 404)
    assert.equal(r.body.success, false)
    assert.equal(r.body.token, undefined, 'nenhum dado da publicação é devolvido')
  })

  const casos: [string, Linha, number][] = [
    ['A) OS moderna legítima (ordem_servico/ordem_servico)', linha({}), 200],
    ['B) OS legítima com alias (document_type=ordem_servico, tipo=os)', linha({ tipo: 'os' }), 200],
    ['C) representação inversa (document_type=os, tipo=ordem_servico)', linha({ document_type: 'os' }), 200],
    ['D) orçamento coerente não aparece pelo GET de OS', linha({ document_type: 'orcamento', tipo: 'orcamento' }), 404],
    ['E) divergente document_type=orcamento, tipo=os', linha({ document_type: 'orcamento', tipo: 'os' }), 404],
    ['F) divergente document_type=ordem_servico, tipo=orcamento', linha({ tipo: 'orcamento' }), 404],
    ['I) artefato 1c coerente (document_id=id da linha, tipos OS)', linha({ tipo: 'os', document_id: ID_LINHA }), 200],
    ['J) artefato 1c + tipos divergentes', linha({ document_type: 'orcamento', tipo: 'os', document_id: ID_LINHA }), 404],
    ['divergência de documento (document_id ≠ documento_id, sem artefato)', linha({ document_id: OUTRO_ID }), 404],
  ]
  for (const [nome, row, esperado] of casos) {
    it(`${nome} → ${esperado} em todas as formas de URL`, async () => {
      assert.deepEqual(await statusEmTodasAsFormas(row), FORMAS_OS.map(() => esperado))
    })
  }

  it('A) resposta legítima devolve a publicação solicitada', async () => {
    const r = await getOs([linha({ tipo: 'os' })], { tipo: 'os', documentoId: REAL_ID, token: TOKEN })
    assert.equal(r.status, 200)
    assert.equal(r.body.documento_id, REAL_ID)
  })

  it('G) token errado → 404 em todas as formas', async () => {
    assert.deepEqual(await statusEmTodasAsFormas(linha({}), REAL_ID, TOKEN_ERRADO), [404, 404, 404])
    assert.deepEqual(await statusEmTodasAsFormas(linha({ tipo: 'os', document_id: ID_LINHA }), REAL_ID, TOKEN_ERRADO), [404, 404, 404])
  })

  it('H) documento errado (token de outra OS) → 404 em todas as formas', async () => {
    assert.deepEqual(await statusEmTodasAsFormas(linha({}), OUTRO_ID), [404, 404, 404])
    assert.deepEqual(await statusEmTodasAsFormas(linha({ tipo: 'os', document_id: ID_LINHA }), ID_LINHA), [404, 404, 404])
  })

  it('sem token e sem Bearer continua 401 no ramo de OS', async () => {
    const r = await getOs([linha({})], { tipo: 'os', documentoId: REAL_ID })
    assert.equal(r.status, 401)
  })
})
