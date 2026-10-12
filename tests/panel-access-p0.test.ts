import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

type Linha = Record<string, any>
type Op = 'select' | 'update' | 'upsert' | 'insert' | 'delete'
type Papel = 'service' | 'authenticated'

const ROOT = new URL('../', import.meta.url)
const ESTADO = '__PANEL_ACCESS_P0_TEST__'
const mod = (codigo: string) => 'data:text/javascript,' + encodeURIComponent(codigo)

const MOCKS: Record<string, string> = {
  '@/lib/supabase-admin': mod(`
    export function getSupabaseAdmin() { return globalThis.${ESTADO}.clientes.service }
    export const supabaseAdmin = new Proxy({}, { get(_t, p) {
      const c = globalThis.${ESTADO}.clientes.service; const v = c[p]; return typeof v === 'function' ? v.bind(c) : v } })
  `),
  '@supabase/supabase-js': mod(`export function createClient() { return globalThis.${ESTADO}.clientes.authenticated }`),
  '@/lib/admin-tables': mod(`
    export async function probeAdminTables() { return { status: 'ready' } }
    export function respostaAdminTablesNotReady() { return { status: 503, body: { ok: false } } }
    export function respostaAdminTablesProbeError() { return { status: 503, body: { ok: false } } }
  `),
  '@/lib/mercadoPago': mod(`
    export async function chamarMercadoPago() { throw new Error('Mercado Pago bloqueado no teste.') }
    export function siteUrlConnect() { return 'https://exemplo.test' }
    export function usarAssinaturaRecorrenteMp() { return true }
  `),
  '@/lib/sessao-server': mod(`
    export async function encerrarSessaoUsuario() { return { ok: true } }
    export async function verificarSessaoUsuario() { return { ok: true, active: true } }
    export async function registrarSessaoUsuario() { return { ok: true, substituida: false } }
  `),
  '@/lib/orcamentos-local': mod(`export function contarDocumentosPainelSync() { return 0 }`),
  '@/lib/connect-user-storage': mod(`export function obterUserIdPainelSync() { return null }`),
}

;(nodeModule as any).registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) {
    if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true }
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

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.exemplo.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-teste'
process.env.ADMIN_EMAILS = 'admin@exemplo.test'

// Colunas reais de public.perfis (metadados PostgREST de produção, 12/10/2026).
const COLUNAS_PERFIS = new Set([
  'id', 'email', 'ativo', 'vencimento', 'status', 'data_criacao', 'nome_empresa', 'telefone', 'valor_plano',
  'ultimo_pagamento', 'status_pagamento', 'sistema_cliente', 'observacoes', 'empresa_id', 'nome', 'created_at',
  'plano_tier',
])

const ADMIN = '00000000-0000-4000-8000-000000000001'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const TOKEN: Record<string, string> = { admin: 'jwt-admin', A: 'jwt-a', B: 'jwt-b' }

const hoje = () => new Date().toISOString().slice(0, 10)
const emDias = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

type Estado = {
  db: Record<string, Linha[]>
  usuarios: Record<string, { id: string; email: string; app_metadata: Record<string, any>; banned_until: string | null }>
  tokens: Record<string, string>
  clientes: Record<Papel, any>
  falhaLeituraPerfis: { code: string; message: string } | null
  rlsNegaInsertPerfis: boolean
  escritas: { papel: Papel; tabela: string; op: Op }[]
}

let estado: Estado

function novoEstado() {
  const u = (id: string, email: string) => ({ id, email, app_metadata: { provider: 'email' }, banned_until: null })
  estado = {
    db: {
      perfis: [],
      pagamentos: [],
      assinaturas: [],
      admin_cliente_sistemas: [],
    },
    usuarios: { [ADMIN]: u(ADMIN, 'admin@exemplo.test'), [A]: u(A, 'cliente-a@exemplo.test'), [B]: u(B, 'cliente-b@exemplo.test') },
    tokens: { [TOKEN.admin]: ADMIN, [TOKEN.A]: A, [TOKEN.B]: B },
    clientes: {} as Record<Papel, any>,
    falhaLeituraPerfis: null,
    rlsNegaInsertPerfis: true,
    escritas: [],
  }
  estado.clientes = { service: criarClient('service'), authenticated: criarClient('authenticated') }
  ;(globalThis as any)[ESTADO] = estado
}

function criarClient(papel: Papel) {
  return {
    auth: {
      async getUser(jwt: string) {
        const id = estado.tokens[jwt]
        const user = id ? estado.usuarios[id] : undefined
        return user ? { data: { user: structuredClone(user) }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
      },
    },
    from(nome: string) {
      const filtros: ((r: Linha) => boolean)[] = []
      const presente = (v: unknown) => v !== null && v !== undefined
      let op: Op = 'select'
      let patch: Linha | Linha[] | null = null
      let onConflict = 'id'
      let colunas: string[] = []
      let retornar = false

      async function executar(modo: 'lista' | 'maybe' | 'single') {
        await new Promise((r) => setImmediate(r))
        const tabela = (estado.db[nome] ||= [])
        if (nome === 'perfis') {
          const usadas = [
            ...colunas,
            ...(op === 'select' ? [] : (Array.isArray(patch) ? patch : [patch || {}]).flatMap((p) => Object.keys(p))),
          ]
          const ausente = usadas.find((c) => c !== '*' && !COLUNAS_PERFIS.has(c))
          if (ausente) return { data: null, error: { code: '42703', message: `column perfis.${ausente} does not exist` } }
          if (op === 'select' && estado.falhaLeituraPerfis) return { data: null, error: estado.falhaLeituraPerfis }
          if (papel === 'authenticated' && (op === 'insert' || op === 'upsert') && estado.rlsNegaInsertPerfis) {
            return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "perfis"' } }
          }
        }
        let linhas: Linha[] = []
        if (op === 'select') {
          linhas = tabela.filter((r) => filtros.every((f) => f(r)))
        } else if (op === 'update') {
          linhas = tabela.filter((r) => filtros.every((f) => f(r)))
          for (const r of linhas) Object.assign(r, structuredClone(patch))
        } else if (op === 'delete') {
          linhas = tabela.filter((r) => filtros.every((f) => f(r)))
          estado.db[nome] = tabela.filter((r) => !linhas.includes(r))
        } else {
          const chaves = onConflict.split(',').map((c) => c.trim())
          for (const nova of Array.isArray(patch) ? patch : [patch as Linha]) {
            const existente = tabela.find((r) => chaves.every((c) => r[c] === nova[c]))
            if (existente && op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' } }
            if (existente) {
              Object.assign(existente, structuredClone(nova))
              linhas.push(existente)
            } else {
              const l = structuredClone(nova)
              tabela.push(l)
              linhas.push(l)
            }
          }
        }
        if (op !== 'select') estado.escritas.push({ papel, tabela: nome, op })
        const dados = linhas.map((r) => structuredClone(r))
        if (modo === 'maybe') return dados.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: dados[0] ?? null, error: null }
        if (modo === 'single') return dados.length !== 1 ? { data: null, error: { message: 'single row expected' } } : { data: dados[0], error: null }
        return { data: op === 'select' || retornar ? dados : null, error: null }
      }

      const q: any = {
        select(cols = '*') {
          if (op !== 'select') retornar = true
          colunas = String(cols).split(',').map((c) => c.trim()).filter((c) => !c.includes('(') && !c.includes(':'))
          return q
        },
        eq(c: string, v: unknown) {
          filtros.push((r) => presente(r[c]) && String(r[c]) === String(v))
          return q
        },
        neq(c: string, v: unknown) {
          filtros.push((r) => presente(r[c]) && String(r[c]) !== String(v))
          return q
        },
        is(c: string, v: unknown) {
          filtros.push((r) => (v === null ? !presente(r[c]) : r[c] === v))
          return q
        },
        in(c: string, vs: unknown[]) {
          filtros.push((r) => presente(r[c]) && vs.map(String).includes(String(r[c])))
          return q
        },
        gte(c: string, v: unknown) {
          filtros.push((r) => presente(r[c]) && String(r[c]) >= String(v))
          return q
        },
        order: () => q,
        limit: () => q,
        update(p: Linha) {
          op = 'update'
          patch = p
          return q
        },
        upsert(p: Linha | Linha[], opts?: { onConflict?: string }) {
          op = 'upsert'
          patch = p
          onConflict = opts?.onConflict || 'id'
          return q
        },
        insert(p: Linha | Linha[]) {
          op = 'insert'
          patch = p
          return q
        },
        delete() {
          op = 'delete'
          return q
        },
        maybeSingle: () => executar('maybe'),
        single: () => executar('single'),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => executar('lista').then(res, rej),
      }
      return q
    },
  }
}

const rota = (caminho: string) => import(new URL(caminho, ROOT).href)
const ler = (rel: string) => readFileSync(new URL(rel, ROOT), 'utf8')

let NextRequestCls: any
let acessoRota: any
let apiAuth: typeof import('../lib/api-auth.ts')
let accessServer: typeof import('../lib/access-server.ts')
let access: typeof import('../lib/access.ts')
let ativacao: typeof import('../lib/pagamentoAtivacao.ts')
let guard: typeof import('../lib/painel-acesso-guard.ts')
let authClient: typeof import('../lib/connect-auth-client.ts')

async function carregar() {
  if (acessoRota) return
  novoEstado()
  NextRequestCls = (await import('next/server.js' as string)).NextRequest
  acessoRota = await rota('app/api/painel/acesso/route.ts')
  apiAuth = await rota('lib/api-auth.ts')
  accessServer = await rota('lib/access-server.ts')
  access = await rota('lib/access.ts')
  ativacao = await rota('lib/pagamentoAtivacao.ts')
  guard = await rota('lib/painel-acesso-guard.ts')
  authClient = await rota('lib/connect-auth-client.ts')
}

function req(token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new NextRequestCls('https://exemplo.test/api/painel/acesso', { headers })
}

async function acessoPainel(token: string) {
  const r: Response = await acessoRota.GET(req(token))
  return { status: r.status, body: (await r.json()) as any }
}

function perfil(id: string, campos: Linha = {}) {
  const p = { id, email: estado.usuarios[id]?.email ?? null, ativo: true, status: 'ativo', vencimento: emDias(20), plano_tier: 'starter', ...campos }
  estado.db.perfis.push(p)
  return p
}

const escritasPerfis = () => estado.escritas.filter((e) => e.tabela === 'perfis')

beforeEach(async () => {
  await carregar()
  novoEstado()
})

describe('PANEL.ACCESS.P0 — /api/painel/acesso', () => {
  it('1. perfil ativo permite acesso', async () => {
    perfil(A)
    const r = await acessoPainel(TOKEN.A)
    assert.equal(r.status, 200)
    assert.equal(r.body.ok, true)
    assert.equal(r.body.bloqueado, false)
    assert.equal(r.body.adminLogado, false)
    assert.equal(r.body.perfil.vencimento, emDias(20))
  })

  it('2. perfil vencido é bloqueado (sem perfil trial fictício)', async () => {
    perfil(A, { vencimento: '2026-01-10' })
    const r = await acessoPainel(TOKEN.A)
    assert.equal(r.body.ok, true)
    assert.equal(r.body.bloqueado, true)
    assert.equal(r.body.assinaturaVencida, true)
    assert.equal(r.body.perfil.vencimento, '2026-01-10')
    assert.equal(r.body.isTrial, false)
    assert.equal(escritasPerfis().length, 0)
  })

  it('3. perfil bloqueado administrativamente é bloqueado', async () => {
    perfil(A, { status: 'bloqueado', ativo: false, vencimento: emDias(30) })
    const r = await acessoPainel(TOKEN.A)
    assert.equal(r.body.bloqueado, true)
    assert.equal(r.body.assinaturaVencida, false)
    assert.equal(r.body.statusNormalizado, 'bloqueado')
  })

  it('4. erro 42703 não concede acesso', async () => {
    perfil(A, { vencimento: '2026-01-10' })
    estado.falhaLeituraPerfis = { code: '42703', message: 'column perfis.role does not exist' }
    const r = await acessoPainel(TOKEN.A)
    assert.equal(r.status, 503)
    assert.equal(r.body.ok, false)
    assert.equal(r.body.reason, 'perfil_indisponivel')
    assert.equal(r.body.bloqueado, undefined)
    assert.equal(r.body.perfil, undefined)
    assert.equal(escritasPerfis().length, 0)
  })

  it('5. erro de conexão não cria trial nem tenta gravar perfil', async () => {
    estado.rlsNegaInsertPerfis = false
    estado.falhaLeituraPerfis = { code: '', message: 'TypeError: fetch failed' }
    const r = await acessoPainel(TOKEN.A)
    assert.equal(r.status, 503)
    assert.equal(r.body.reason, 'perfil_indisponivel')
    assert.equal(estado.db.perfis.length, 0)
    assert.equal(escritasPerfis().length, 0)
  })

  it('6. perfil inexistente: criação legítima, sem confundir com erro de banco', async () => {
    const negado = await acessoPainel(TOKEN.A)
    assert.equal(negado.status, 403, 'RLS de produção nega o INSERT: sem perfil, sem acesso')
    assert.equal(negado.body.reason, 'sem_perfil')
    assert.equal(estado.db.perfis.length, 0)

    estado.rlsNegaInsertPerfis = false
    const criado = await acessoPainel(TOKEN.A)
    assert.equal(criado.status, 200)
    assert.equal(criado.body.ok, true)
    assert.equal(criado.body.isTrial, true)
    assert.equal(estado.db.perfis.length, 1)
    assert.equal(estado.db.perfis[0].status, 'teste')
    assert.equal(criado.body.perfil.vencimento, estado.db.perfis[0].vencimento, 'resposta reflete o perfil gravado')

    const segunda = await acessoPainel(TOKEN.A)
    assert.equal(segunda.body.ok, true)
    assert.equal(estado.db.perfis.length, 1, 'perfil existente não é recriado')
  })

  it('6b. perfil criado em paralelo (conflito) é relido, não sobrescrito', async () => {
    estado.rlsNegaInsertPerfis = false
    const original = perfil(A, { vencimento: '2026-01-10' })
    estado.db.perfis = []
    const leitura = estado.clientes.authenticated.from
    let primeira = true
    estado.clientes.authenticated.from = (nome: string) => {
      const q = leitura(nome)
      if (nome === 'perfis' && primeira) {
        primeira = false
        const maybe = q.maybeSingle
        q.maybeSingle = async () => {
          const r = await maybe()
          estado.db.perfis.push(structuredClone(original))
          return r
        }
      }
      return q
    }
    const r = await acessoPainel(TOKEN.A)
    assert.equal(r.body.bloqueado, true)
    assert.equal(estado.db.perfis.length, 1)
    assert.equal(estado.db.perfis[0].vencimento, '2026-01-10')
  })

  it('7. pagamento aprovado libera o vencido; bloqueio gravado continua (PAYMENT.P0)', async () => {
    perfil(A, { vencimento: '2026-01-10', status: 'ativo' })
    assert.equal((await acessoPainel(TOKEN.A)).body.bloqueado, true)
    estado.db.pagamentos.push({ id: 'pag-a', user_id: A, valor: 49.9, status: 'pendente', plano: 'starter_mensal', metodo: 'pix' })
    await ativacao.ativarPagamentoAprovado(
      { id: 'pag-a', user_id: A, valor: 49.9, plano: 'starter_mensal' },
      { id: 'MP-A', status: 'approved', metadata: { tipo: 'pix', plano: 'starter' }, date_approved: new Date().toISOString() },
    )
    const depois = await acessoPainel(TOKEN.A)
    assert.equal(depois.body.bloqueado, false)
    assert.ok(String(depois.body.perfil.vencimento) > hoje())

    perfil(B, { vencimento: '2026-01-10', status: 'bloqueado', ativo: false })
    estado.db.pagamentos.push({ id: 'pag-b', user_id: B, valor: 49.9, status: 'pendente', plano: 'starter_mensal', metodo: 'pix' })
    await ativacao.ativarPagamentoAprovado(
      { id: 'pag-b', user_id: B, valor: 49.9, plano: 'starter_mensal' },
      { id: 'MP-B', status: 'approved', metadata: { tipo: 'pix', plano: 'starter' }, date_approved: new Date().toISOString() },
    )
    const bloqueado = await acessoPainel(TOKEN.B)
    assert.equal(bloqueado.body.bloqueado, true, 'pagamento não remove bloqueio gravado')
  })
})

describe('PANEL.ACCESS.P0 — autorização administrativa', () => {
  it('8. usuário comum não vira admin por role/plano_tier/status em perfis', async () => {
    for (const campos of [{ role: 'admin' }, { plano_tier: 'admin' }, { status: 'master' }, { plano_tier: 'master', status: 'admin' }]) {
      assert.equal(accessServer.isUsuarioAdminServer({ email: 'cliente-a@exemplo.test', ...({ perfil: campos } as any) }), false)
      assert.equal(access.isUsuarioAdmin({ email: 'cliente-a@exemplo.test', perfil: campos as any }), false)
    }
    perfil(A, { plano_tier: 'master', status: 'admin', vencimento: '2026-01-10' })
    await assert.rejects(apiAuth.requireAdminFromRequest(req(TOKEN.A)), /Acesso negado\./)
    const r = await acessoPainel(TOKEN.A)
    assert.equal(r.body.adminLogado, false)
    assert.equal(r.body.bloqueado, true, 'tier/status "admin" não isenta de vencimento')
    assert.equal(escritasPerfis().length, 0)
  })

  it('9. admin por ADMIN_EMAILS continua acessando', async () => {
    const user = await apiAuth.requireAdminFromRequest(req(TOKEN.admin))
    assert.equal(user.id, ADMIN)
    const semPerfil = await acessoPainel(TOKEN.admin)
    assert.equal(semPerfil.body.ok, true, 'admin não depende de perfis')
    assert.equal(semPerfil.body.adminLogado, true)
    assert.equal(semPerfil.body.bloqueado, false)

    perfil(ADMIN, { vencimento: '2026-01-10' })
    const vencido = await acessoPainel(TOKEN.admin)
    assert.equal(vencido.body.adminLogado, true)
    assert.equal(vencido.body.bloqueado, false)
  })

  it('requireAdminFromRequest não consulta perfis; sem sessão é recusado', async () => {
    const fonte = ler('lib/api-auth.ts')
    const inicio = fonte.indexOf('export async function requireAdminFromRequest')
    const fn = fonte.slice(inicio, fonte.indexOf('\n}', inicio))
    assert.doesNotMatch(fn, /perfis|from\(/)
    await assert.rejects(apiAuth.requireAdminFromRequest(req()), /Sessão ausente\./)
    await assert.rejects(apiAuth.requireAdminFromRequest(req('jwt-invalido')), /Sessão inválida\./)
  })

  it('painel/acesso só seleciona colunas existentes e não cria perfil como fallback de erro', () => {
    const fonte = ler('app/api/painel/acesso/route.ts')
    const cols = fonte.match(/COLUNAS_PERFIL_PAINEL = '([^']+)'/)?.[1] || ''
    assert.ok(cols, 'lista de colunas declarada')
    for (const c of cols.split(',')) assert.ok(COLUNAS_PERFIS.has(c), `coluna ${c} existe em perfis`)
    assert.doesNotMatch(fonte, /\brole\b/)
    assert.doesNotMatch(fonte, /perfil = perfilNovo/)
    assert.doesNotMatch(fonte, /isUsuarioAdmin\(/)
  })

})

describe('PANEL.ACCESS.P0 — layout só libera com confirmação positiva', () => {
  type Chamada = { forcar?: boolean }
  const fetchOriginal = globalThis.fetch
  let chamadasFetch = 0

  const sessao = (token: string, id: string) => async () => ({ data: { session: { user: { id }, access_token: token } }, error: null })

  /** fetch do browser apontado para a rota real (banco falso com esquema de produção). */
  function fetchParaRota() {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      chamadasFetch += 1
      const headers = new Headers(init?.headers)
      return acessoRota.GET(req(String(headers.get('authorization') || '').replace(/^Bearer /, '')))
    }) as typeof fetch
  }

  function fetchCom(resposta: () => Response | Promise<Response>) {
    globalThis.fetch = (async () => {
      chamadasFetch += 1
      return resposta()
    }) as typeof fetch
  }

  function verificar(opts: { token?: string; id?: string; rotaLivreAssinatura?: boolean; forcar?: boolean; consultar?: any; agendar?: any; obterSessao?: any } = {}) {
    return guard.executarVerificacaoPainel({
      obterSessao: opts.obterSessao || sessao(opts.token ?? TOKEN.A, opts.id ?? A),
      consultar: opts.consultar || ((t: string, o?: Chamada) => authClient.consultarAcessoPainel(t, o) as any),
      esperar: async () => {},
      demo: () => false,
      rotaLivreAssinatura: Boolean(opts.rotaLivreAssinatura),
      forcar: opts.forcar,
      agendar: opts.agendar,
      cancelar: opts.agendar ? () => {} : undefined,
    })
  }

  beforeEach(() => {
    chamadasFetch = 0
    authClient.limparCacheAcessoPainel()
  })

  const restaurarFetch = () => {
    globalThis.fetch = fetchOriginal
  }

  it('1. timeout de rede não libera o painel (repete e termina indisponível)', async () => {
    perfil(A)
    fetchCom(() => {
      const e = new Error('The operation was aborted.')
      e.name = 'AbortError'
      throw e
    })
    try {
      const d = await verificar()
      assert.equal(d.acao, 'indisponivel')
      assert.equal(d.motivo, 'timeout')
      assert.equal(d.mensagem, guard.MENSAGEM_ACESSO_INDISPONIVEL)
      assert.equal(chamadasFetch, guard.ACESSO_MAX_TENTATIVAS)
    } finally {
      restaurarFetch()
    }
  })

  it('1b. exceção inesperada na consulta ou na sessão não libera', async () => {
    const d1 = await verificar({ consultar: async () => { throw new Error('boom') } })
    assert.equal(d1.acao, 'indisponivel')
    const d2 = await verificar({ obterSessao: async () => { throw new Error('storage corrompido') } })
    assert.equal(d2.acao, 'indisponivel')
    assert.equal(d2.motivo, 'excecao')
  })

  it('2. timer de segurança de 20 s não libera o painel', async () => {
    let disparar: () => void = () => {}
    let prazo = 0
    const agendar = (fn: () => void, ms: number) => {
      disparar = fn
      prazo = ms
      return 1
    }
    let resolverConsulta: (v: unknown) => void = () => {}
    const pendente = verificar({ agendar, consultar: () => new Promise((r) => (resolverConsulta = r)) })
    await new Promise((r) => setImmediate(r))
    assert.equal(prazo, 20000)
    disparar()
    const d = await pendente
    assert.equal(d.acao, 'indisponivel')
    assert.equal(d.motivo, 'timer_seguranca')
    resolverConsulta({ ok: true, userId: A, bloqueado: false })

    const sessaoTravada = verificar({ agendar, obterSessao: () => new Promise(() => {}) })
    await new Promise((r) => setImmediate(r))
    disparar()
    assert.equal((await sessaoTravada).acao, 'indisponivel')
  })

  it('3. HTTP 503 não libera o painel — nem com corpo ok:true', async () => {
    perfil(A)
    estado.falhaLeituraPerfis = { code: '', message: 'TypeError: fetch failed' }
    fetchParaRota()
    try {
      const d = await verificar()
      assert.equal(d.acao, 'indisponivel')
      assert.equal(d.motivo, 'perfil_indisponivel')
      assert.match(String(d.mensagem), /Não foi possível validar seu acesso agora/)
      assert.doesNotMatch(String(d.mensagem), /venc|bloque|pagamento|inadimpl/i)
      assert.equal(chamadasFetch, guard.ACESSO_MAX_TENTATIVAS)

      fetchCom(() => new Response('<html>Service Unavailable</html>', { status: 503 }))
      assert.equal((await verificar()).motivo, 'http_503')
      fetchCom(() => Response.json({ ok: true, userId: A, bloqueado: false }, { status: 503 }))
      const enganoso = await verificar()
      assert.equal(enganoso.acao, 'indisponivel')
      assert.equal(enganoso.motivo, 'http_503')
    } finally {
      restaurarFetch()
    }
  })

  it('4. resposta inválida não libera o painel', async () => {
    const invalidas: (() => Response)[] = [
      () => Response.json({ ok: true }),
      () => Response.json({ ok: true, userId: A }),
      () => Response.json({ ok: true, userId: A, bloqueado: 'false' }),
      () => Response.json({ ok: true, bloqueado: false }),
      () => Response.json(null),
      () => Response.json([1, 2]),
      () => new Response('não é json', { status: 200 }),
    ]
    try {
      for (const r of invalidas) {
        fetchCom(r)
        const d = await verificar()
        assert.equal(d.acao, 'indisponivel', 'resposta inválida não pode liberar')
      }
      for (const lixo of [undefined, null, {}, { ok: 'true', bloqueado: false, userId: A }, { ok: false }]) {
        assert.equal(guard.decidirAcessoPainel(lixo as any, { rotaLivreAssinatura: false }).acao, 'indisponivel')
      }
    } finally {
      restaurarFetch()
    }
  })

  it('5. cliente ativo com verificação válida entra', async () => {
    perfil(A)
    fetchParaRota()
    try {
      const d = await verificar()
      assert.equal(d.acao, 'liberar')
      assert.equal(d.acesso?.bloqueado, false)
      assert.equal(chamadasFetch, 1)
    } finally {
      restaurarFetch()
    }
  })

  it('6. cliente vencido continua bloqueado (fora das rotas de assinatura)', async () => {
    perfil(A, { vencimento: '2026-01-10' })
    fetchParaRota()
    try {
      const d = await verificar()
      assert.equal(d.acao, 'bloquear')
      assert.match(String(d.destino), /^\/bloqueado\?status=vencido&dias=\d+&vencimento=2026-01-10$/)
      assert.equal((await verificar({ rotaLivreAssinatura: true })).acao, 'liberar', '/planos e /assinatura seguem acessíveis para pagar')
    } finally {
      restaurarFetch()
    }
  })

  it('7. cliente bloqueado pelo admin continua bloqueado', async () => {
    perfil(A, { status: 'bloqueado', ativo: false, vencimento: emDias(30) })
    fetchParaRota()
    try {
      const d = await verificar()
      assert.equal(d.acao, 'bloquear')
      assert.match(String(d.destino), /^\/bloqueado\?status=bloqueado&/)
    } finally {
      restaurarFetch()
    }
  })

  it('8. "Tentar novamente" executa nova verificação forçada', async () => {
    perfil(A)
    const opcoes: (Chamada | undefined)[] = []
    let falhar = true
    const consultar = async (t: string, o?: Chamada) => {
      opcoes.push(o)
      if (falhar) return { ok: false, reason: 'timeout' }
      return authClient.consultarAcessoPainel(t, o)
    }
    fetchParaRota()
    try {
      assert.equal((await verificar({ consultar })).acao, 'indisponivel')
      falhar = false
      opcoes.length = 0
      const d = await verificar({ consultar, forcar: true })
      assert.equal(d.acao, 'liberar')
      assert.equal(opcoes[0]?.forcar, true, 'retry ignora consulta deduplicada')
    } finally {
      restaurarFetch()
    }

    const layout = ler('app/(painel)/layout.tsx')
    assert.match(layout, /onClick=\{\(\) => setTentativaVerificacao\(\(n\) => n \+ 1\)\}/)
    assert.match(layout, /forcar: tentativaVerificacao > 0/)
    assert.match(layout, /\[router, rotaPublicaImpressao, rotaLivreAssinatura, tentativaVerificacao\]/)
    assert.doesNotMatch(layout, /window\.location\.reload/)
  })

  it('9. nenhum perfil trial fictício é criado após erro', async () => {
    estado.rlsNegaInsertPerfis = false
    for (const falha of [{ code: '42703', message: 'column perfis.role does not exist' }, { code: '', message: 'TypeError: fetch failed' }]) {
      estado.falhaLeituraPerfis = falha
      fetchParaRota()
      try {
        const d = await verificar()
        assert.equal(d.acao, 'indisponivel')
        assert.equal(d.acesso, undefined)
      } finally {
        restaurarFetch()
      }
    }
    assert.equal(estado.db.perfis.length, 0)
    assert.equal(escritasPerfis().length, 0)
  })

  it('layout: só os ramos de liberação positiva (e rotas de impressão/demo) encerram a verificação', () => {
    const layout = ler('app/(painel)/layout.tsx')
    assert.doesNotMatch(layout, /safetyTimer|SAFETY_TIMEOUT_MS|validação parcial|liberando painel/)
    const liberacoes = layout.match(/setVerificando\(false\)/g) || []
    assert.equal(liberacoes.length, 4, 'impressão, liberar, liberar_demo e SIGNED_OUT em demo')
    const bloco = layout.slice(layout.indexOf("case 'liberar': {"), layout.indexOf("case 'bloquear':"))
    assert.match(bloco, /setVerificando\(false\)/)
    const padrao = layout.slice(layout.indexOf('default:'), layout.indexOf('default:') + 300)
    assert.match(padrao, /setErroValidacao/)
    assert.doesNotMatch(padrao, /setVerificando\(false\)/)
    assert.match(layout, /setVerificando\(true\)\s*\n\s*setErroValidacao\(''\)/, 'reverificação começa fechada')
  })
})
