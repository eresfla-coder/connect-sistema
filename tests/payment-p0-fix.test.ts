import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

type Linha = Record<string, any>
type Banco = Record<string, Linha[]>
type Op = 'select' | 'update' | 'upsert' | 'insert'
type Falha = { tabela: string; op: Op; vezes: number; aplicar?: boolean }
type Gancho = { tabela: string; op: Op; fn: (db: Banco) => void }

const ROOT = new URL('../', import.meta.url)
const ESTADO = '__PAYMENT_P0_FIX_TEST__'
const mod = (codigo: string) => 'data:text/javascript,' + encodeURIComponent(codigo)

const MOCKS: Record<string, string> = {
  '@/lib/supabase-admin': mod(`
    export function getSupabaseAdmin() { return globalThis.${ESTADO}.client }
    export const supabaseAdmin = new Proxy({}, { get(_t, p) {
      const c = globalThis.${ESTADO}.client; const v = c[p]; return typeof v === 'function' ? v.bind(c) : v } })
  `),
  '@supabase/supabase-js': mod(`export function createClient() { return globalThis.${ESTADO}.client }`),
  '@/lib/api-auth': mod(`export async function requireAdminFromRequest() { return { user: { id: 'admin-teste' } } }`),
  '@/lib/admin-tables': mod(`
    export async function probeAdminTables() { return { status: 'ready' } }
    export function respostaAdminTablesNotReady() { return { status: 503, body: { ok: false } } }
    export function respostaAdminTablesProbeError() { return { status: 503, body: { ok: false } } }
  `),
  '@/lib/mercadoPago': mod(`
    export async function chamarMercadoPago(path, init) {
      const s = globalThis.${ESTADO}
      const metodo = String(init?.method || 'GET').toUpperCase()
      s.mpChamadas.push({ path, metodo })
      if (metodo !== 'GET') throw new Error('Cobrança bloqueada no teste.')
      const r = s.mp[path]
      if (!r) throw new Error('MP 404')
      return structuredClone(r)
    }
    export function siteUrlConnect() { return 'https://exemplo.test' }
  `),
  '@/lib/orcamentos-local': mod(`export function contarDocumentosPainelSync() { return 0 }`),
  '@/lib/connect-user-storage': mod(`export function obterUserIdPainelSync() { return null }`),
}

// Rotas e libs reais; somente Supabase, Mercado Pago, auth admin e storage local são substituídos.
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

const SEGREDO_WEBHOOK = 'segredo-webhook-teste'
process.env.MERCADO_PAGO_WEBHOOK_SECRET = SEGREDO_WEBHOOK
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.exemplo.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-teste'

// Dados sintéticos
const A = '11111111-1111-4111-8111-111111111111' // cliente pagante (cenário BIRA)
const B = '22222222-2222-4222-8222-222222222222' // outro cliente Connect
const C = '33333333-3333-4333-8333-333333333333' // cliente sem vínculo admin
const SIS_CONNECT = '44444444-4444-4444-8444-444444444444'
const SIS_TERCEIRO = '55555555-5555-4555-8555-555555555555'
const CLI_A = '66666666-6666-4666-8666-666666666666'
const CLI_B = '77777777-7777-4777-8777-777777777777'
const VIN_A = '88888888-8888-4888-8888-888888888888'
const VIN_A_TERCEIRO = '99999999-9999-4999-8999-999999999999'
const VIN_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PAG_A1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PAG_A2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PAG_C1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const JWT_A = 'jwt-cliente-a'

/** 02/10/2026 21:29 em Brasília (= 03/10 00:29 UTC). */
const MOMENTO_PIX = Date.parse('2026-10-03T00:29:00Z')

function bancoInicial(): Banco {
  return {
    perfis: [
      { id: A, email: 'cliente-a@exemplo.test', status: 'ativo', ativo: true, vencimento: '2026-09-25', status_pagamento: 'pendente', ultimo_pagamento: '2026-08-25', valor_plano: 49.9, plano_tier: 'starter' },
      { id: B, email: 'cliente-b@exemplo.test', status: 'ativo', ativo: true, vencimento: '2026-10-10', status_pagamento: 'em_dia', ultimo_pagamento: '2026-09-10', valor_plano: 49.9, plano_tier: 'starter' },
      { id: C, email: 'cliente-c@exemplo.test', status: 'ativo', ativo: true, vencimento: '2026-09-30', status_pagamento: 'pendente', ultimo_pagamento: null, valor_plano: 49.9, plano_tier: 'starter' },
    ],
    assinaturas: [
      { user_id: A, status: 'ativa', plano: 'starter_mensal', data_fim: '2026-09-25T23:59:59.999Z', gateway: 'manual' },
      { user_id: B, status: 'ativa', plano: 'starter_mensal', data_fim: '2026-10-10T23:59:59.999Z', gateway: 'manual' },
    ],
    pagamentos: [
      { id: PAG_A1, user_id: A, valor: 49.9, status: 'pendente', plano: 'starter_mensal', metodo: 'pix', gateway_pagamento_id: 'MP-A1' },
      { id: PAG_A2, user_id: A, valor: 49.9, status: 'pendente', plano: 'starter_mensal', metodo: 'pix', gateway_pagamento_id: 'MP-A2' },
      { id: PAG_C1, user_id: C, valor: 49.9, status: 'pendente', plano: 'starter_mensal', metodo: 'pix', gateway_pagamento_id: 'MP-C1' },
    ],
    admin_clientes: [
      { id: CLI_A, nome: 'Cliente A', nome_empresa: 'Empresa A', email: 'cliente-a@exemplo.test', ativo: true, created_at: '2026-01-01T12:00:00Z' },
      { id: CLI_B, nome: 'Cliente B', nome_empresa: 'Empresa B', email: 'cliente-b@exemplo.test', ativo: true, created_at: '2026-01-02T12:00:00Z' },
    ],
    admin_sistemas: [
      { id: SIS_CONNECT, nome: 'Connect Sistema', origem: 'connect' },
      { id: SIS_TERCEIRO, nome: 'Sistema Terceiro', origem: 'terceiro' },
    ],
    admin_cliente_sistemas: [
      { id: VIN_A, cliente_id: CLI_A, sistema_id: SIS_CONNECT, perfil_id: A, auth_user_id: A, acesso_connect: true, status: 'ativo', status_pagamento: 'em_dia', data_vencimento: '2026-10-01', ultimo_pagamento: '2026-09-01', dia_vencimento: 1, valor: 49.9, observacoes: null, fim_trial: null },
      { id: VIN_A_TERCEIRO, cliente_id: CLI_A, sistema_id: SIS_TERCEIRO, perfil_id: null, auth_user_id: null, acesso_connect: false, status: 'ativo', status_pagamento: 'pendente', data_vencimento: '2026-10-05', ultimo_pagamento: null, dia_vencimento: 5, valor: 80, observacoes: null, fim_trial: null },
      { id: VIN_B, cliente_id: CLI_B, sistema_id: SIS_CONNECT, perfil_id: B, auth_user_id: B, acesso_connect: true, status: 'ativo', status_pagamento: 'em_dia', data_vencimento: '2026-10-10', ultimo_pagamento: '2026-09-10', dia_vencimento: 10, valor: 49.9, observacoes: null, fim_trial: null },
    ],
    webhook_events: [],
  }
}

function pagamentoMp(id: string, ref: string, userId: string, aprovadoEm: string) {
  return {
    id,
    status: 'approved',
    transaction_amount: 49.9,
    external_reference: ref,
    date_approved: aprovadoEm,
    payment_method_id: 'pix',
    payer: { id: `payer-${id}` },
    metadata: { tipo: 'pix', plano: 'starter', user_id: userId },
  }
}

type Estado = {
  db: Banco
  client: any
  falhas: Falha[]
  ganchos: Gancho[]
  escritas: { tabela: string; op: Op; chaves: string[] }[]
  mp: Record<string, unknown>
  mpChamadas: { path: string; metodo: string }[]
}

function criarClient(estado: Estado) {
  const usuarios: Record<string, { id: string; email: string }> = {
    [JWT_A]: { id: A, email: 'cliente-a@exemplo.test' },
  }
  return {
    auth: {
      getUser: async (jwt: string) =>
        usuarios[jwt]
          ? { data: { user: usuarios[jwt] }, error: null }
          : { data: { user: null }, error: { message: 'sem sessão' } },
    },
    from(nome: string) {
      const filtros: ((r: Linha) => boolean)[] = []
      const presente = (v: unknown) => v !== null && v !== undefined
      let op: Op = 'select'
      let patch: Linha | Linha[] | null = null
      let onConflict = 'id'
      let colunas = '*'
      let retornar = false

      const comSistema = (v: Linha) => {
        const s = (estado.db.admin_sistemas || []).find((x) => x.id === v.sistema_id)
        return { ...structuredClone(v), sistema: s ? structuredClone(s) : null }
      }
      const projetar = (r: Linha) => {
        if (colunas.includes('vinculos:admin_cliente_sistemas')) {
          const vinculos = (estado.db.admin_cliente_sistemas || []).filter((v) => v.cliente_id === r.id)
          return { ...structuredClone(r), vinculos: vinculos.map(comSistema) }
        }
        if (colunas.includes('sistema:admin_sistemas')) return comSistema(r)
        return structuredClone(r)
      }

      async function executar(modo: 'lista' | 'maybe' | 'single') {
        await new Promise((r) => setImmediate(r))
        const tabela = (estado.db[nome] ??= [])
        for (const g of estado.ganchos.filter((x) => x.tabela === nome && x.op === op)) {
          estado.ganchos.splice(estado.ganchos.indexOf(g), 1)
          g.fn(estado.db)
        }
        const falha = estado.falhas.find((f) => f.tabela === nome && f.op === op && f.vezes > 0)
        if (falha) falha.vezes -= 1
        const erro = { data: null, error: { message: 'falha simulada', code: 'XX000' } }
        if (falha && !falha.aplicar) return erro

        let linhas: Linha[] = []
        if (op === 'select') {
          linhas = tabela.filter((r) => filtros.every((f) => f(r)))
        } else if (op === 'update') {
          linhas = tabela.filter((r) => filtros.every((f) => f(r)))
          for (const r of linhas) Object.assign(r, structuredClone(patch))
        } else {
          for (const nova of Array.isArray(patch) ? patch : [patch as Linha]) {
            const existente = op === 'upsert' ? tabela.find((r) => r[onConflict] === nova[onConflict]) : null
            if (existente) {
              Object.assign(existente, structuredClone(nova))
              linhas.push(existente)
            } else {
              const linha = structuredClone(nova)
              tabela.push(linha)
              linhas.push(linha)
            }
          }
        }
        if (op !== 'select') {
          estado.escritas.push({ tabela: nome, op, chaves: linhas.map((r) => String(r.id ?? r.user_id ?? r.event_id)) })
        }
        if (falha?.aplicar) return erro

        const dados = linhas.map(projetar)
        if (modo === 'maybe') {
          if (dados.length > 1) return { data: null, error: { message: 'multiple rows' } }
          return { data: dados[0] ?? null, error: null }
        }
        if (modo === 'single') {
          if (dados.length !== 1) return { data: null, error: { message: 'single row expected' } }
          return { data: dados[0], error: null }
        }
        return { data: op === 'select' || retornar ? dados : null, error: null }
      }

      const q: any = {
        select(cols = '*') {
          colunas = cols
          if (op !== 'select') retornar = true
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
        maybeSingle: () => executar('maybe'),
        single: () => executar('single'),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => executar('lista').then(res, rej),
      }
      return q
    },
  }
}

let estado: Estado

function novoEstado() {
  estado = {
    db: bancoInicial(),
    client: null,
    falhas: [],
    ganchos: [],
    escritas: [],
    mp: {
      '/v1/payments/MP-A1': pagamentoMp('MP-A1', PAG_A1, A, '2026-10-02T21:29:00.000-03:00'),
      '/v1/payments/MP-A2': pagamentoMp('MP-A2', PAG_A2, A, '2026-10-20T10:00:00.000-03:00'),
      '/v1/payments/MP-C1': pagamentoMp('MP-C1', PAG_C1, C, '2026-10-02T15:00:00.000-03:00'),
    },
    mpChamadas: [],
  }
  estado.client = criarClient(estado)
  ;(globalThis as any)[ESTADO] = estado
}

const linha = (tabela: string, campo: string, valor: string) =>
  estado.db[tabela].find((r) => String(r[campo]) === valor) as Linha
const perfil = (id: string) => linha('perfis', 'id', id)
const vinculo = (id: string) => linha('admin_cliente_sistemas', 'id', id)
const pagamento = (id: string) => linha('pagamentos', 'id', id)
const assinatura = (userId: string) => linha('assinaturas', 'user_id', userId)
const evento = (id: string) => linha('webhook_events', 'event_id', id)

const rota = (caminho: string) => import(new URL(caminho, ROOT).href)

let webhook: any
let pix: any
let sistemas: any
let carteiraRota: any
let acesso: any
let ativacao: typeof import('../lib/pagamentoAtivacao.ts')
let vigencia: typeof import('../lib/vigencia.ts')
let assinaturaAcesso: typeof import('../lib/assinaturaAcesso.ts')
let carteira: typeof import('../lib/admin-carteira.ts')
let NextRequestCls: any

async function carregar() {
  if (webhook) return
  novoEstado()
  webhook = await rota('app/api/webhooks/mercado-pago/route.ts')
  pix = await rota('app/api/mercado-pago/pix/route.ts')
  sistemas = await rota('app/api/admin/carteira/[id]/sistemas/route.ts')
  carteiraRota = await rota('app/api/admin/carteira/route.ts')
  acesso = await rota('app/api/painel/acesso/route.ts')
  ativacao = await rota('lib/pagamentoAtivacao.ts')
  vigencia = await rota('lib/vigencia.ts')
  assinaturaAcesso = await rota('lib/assinaturaAcesso.ts')
  carteira = await rota('lib/admin-carteira.ts')
  NextRequestCls = (await import('next/server.js' as string)).NextRequest
}

function relogio(t: any, iso: string | number) {
  t.mock.timers.enable({ apis: ['Date'], now: typeof iso === 'number' ? iso : Date.parse(iso) })
}

async function chamarWebhook(paymentId: string) {
  const ts = '1760000000'
  const requestId = `req-${paymentId}-${Math.random().toString(36).slice(2)}`
  const v1 = createHmac('sha256', SEGREDO_WEBHOOK)
    .update(`id:${paymentId};request-id:${requestId};ts:${ts};`)
    .digest('hex')
  const req = new NextRequestCls(`https://exemplo.test/api/webhooks/mercado-pago?type=payment&data.id=${paymentId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    body: JSON.stringify({ type: 'payment', data: { id: paymentId } }),
  })
  const res = await webhook.POST(req)
  return { status: res.status as number, body: (await res.json()) as Linha }
}

async function consultarPix(pagamentoId: string) {
  const req = new NextRequestCls(`https://exemplo.test/api/mercado-pago/pix?pagamentoId=${pagamentoId}`, {
    headers: { authorization: `Bearer ${JWT_A}` },
  })
  const res = await pix.GET(req)
  return { status: res.status as number, body: (await res.json()) as Linha }
}

async function patchAdmin(clienteId: string, body: Linha) {
  const req = new Request(`https://exemplo.test/api/admin/carteira/${clienteId}/sistemas`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await sistemas.PATCH(req, { params: Promise.resolve({ id: clienteId }) })
  return { status: res.status as number, body: (await res.json()) as Linha }
}

async function listarCarteira() {
  const res = await carteiraRota.GET(new Request('https://exemplo.test/api/admin/carteira'))
  const body = (await res.json()) as Linha
  assert.equal(res.status, 200, JSON.stringify(body))
  return body.itens as Linha[]
}

async function acessoPainel() {
  const req = new NextRequestCls('https://exemplo.test/api/painel/acesso', {
    headers: { authorization: `Bearer ${JWT_A}` },
  })
  const res = await acesso.GET(req)
  return { status: res.status as number, body: (await res.json()) as Linha }
}

/** Formulário de edição do admin: reenvia os valores atuais do vínculo. */
function formularioEdicao(v: Linha, extra: Linha = {}) {
  return {
    vinculo_id: v.id,
    acao: 'atualizar',
    status: v.status,
    valor: v.valor,
    dia_vencimento: v.dia_vencimento,
    data_vencimento: v.data_vencimento,
    observacoes: 'telefone atualizado',
    ...extra,
  }
}

async function pagarA1ViaWebhook(t: any) {
  relogio(t, MOMENTO_PIX)
  const r = await chamarWebhook('MP-A1')
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r
}

describe('PAYMENT.P0.FIX.1 — renovações', () => {
  beforeEach(async () => {
    await carregar()
    novoEstado()
  })

  it('1) aprovação PIX (polling) atualiza o período pago: vencimento 01/11, assinatura até 23:59:59 de Brasília', async (t) => {
    relogio(t, MOMENTO_PIX)
    const r = await consultarPix(PAG_A1)

    assert.equal(r.status, 200)
    assert.equal(r.body.aprovado, true)
    assert.equal(pagamento(PAG_A1).status, 'pago')
    assert.equal(pagamento(PAG_A1).gateway_pagamento_id, 'MP-A1')
    assert.equal(perfil(A).vencimento, '2026-11-01')
    assert.equal(perfil(A).status_pagamento, 'pago')
    assert.equal(perfil(A).ultimo_pagamento, '2026-10-02')
    assert.equal(assinatura(A).data_fim, '2026-11-02T02:59:59.999Z')
    assert.equal(assinatura(A).gateway_assinatura_id, 'MP-A1')
    assert.ok(estado.mpChamadas.every((c) => c.metodo === 'GET'), 'nenhuma cobrança criada')
  })

  it('2) pagamento aprovado atualiza SOMENTE o vínculo administrativo Connect do cliente', async (t) => {
    const terceiroAntes = structuredClone(vinculo(VIN_A_TERCEIRO))
    const r = await pagarA1ViaWebhook(t)

    assert.equal(r.body.vinculo, 'atualizado')
    assert.equal(vinculo(VIN_A).data_vencimento, '2026-11-01')
    assert.equal(vinculo(VIN_A).status, 'ativo')
    assert.equal(vinculo(VIN_A).status_pagamento, 'em_dia')
    assert.equal(vinculo(VIN_A).ultimo_pagamento, '2026-10-02')
    assert.deepEqual(vinculo(VIN_A_TERCEIRO), terceiroAntes)
    assert.equal(evento('mercado_pago:payment:MP-A1').status, 'processed')
    const vinculosEscritos = estado.escritas.filter((e) => e.tabela === 'admin_cliente_sistemas')
    assert.deepEqual(vinculosEscritos.map((e) => e.op), ['update'])
    assert.deepEqual(vinculosEscritos[0].chaves, [VIN_A])
  })

  describe('3) ação administrativa posterior não reverte vencimento pago', () => {
    async function cenarioBiraComVinculoAntigo(t: any) {
      await pagarA1ViaWebhook(t)
      // Vínculo desatualizado como estava antes da correção (pagamento não sincronizava o admin).
      Object.assign(vinculo(VIN_A), { data_vencimento: '2026-10-01', ultimo_pagamento: '2026-09-01' })
      t.mock.timers.reset()
      relogio(t, '2026-10-09T18:22:00Z')
    }

    it('edição de cadastro (form reenvia data antiga do vínculo) preserva 01/11 no perfil e corrige o vínculo', async (t) => {
      await cenarioBiraComVinculoAntigo(t)
      const r = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A)))

      assert.equal(r.status, 200, JSON.stringify(r.body))
      assert.equal(r.body.vencimentoPagoPreservado, true)
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal(perfil(A).ativo, true)
      assert.ok(['pago', 'em_dia'].includes(perfil(A).status_pagamento))
      assert.equal(perfil(A).ultimo_pagamento, '2026-10-02')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-11-01')
      assert.equal(vinculo(VIN_A).observacoes, 'telefone atualizado')
    })

    it('desbloquear, renovar e marcar pago não reduzem o período pago', async (t) => {
      await cenarioBiraComVinculoAntigo(t)
      for (const acao of ['desbloquear', 'renovar', 'marcar_pago']) {
        Object.assign(vinculo(VIN_A), { data_vencimento: '2026-10-01' })
        const r = await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao })
        assert.equal(r.status, 200, `${acao}: ${JSON.stringify(r.body)}`)
        assert.ok(perfil(A).vencimento >= '2026-11-01', `${acao} reduziu para ${perfil(A).vencimento}`)
      }
    })

    it('alteração deliberada da data pelo admin continua valendo (para mais e para menos)', async (t) => {
      await cenarioBiraComVinculoAntigo(t)
      const mais = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A), { data_vencimento: '2026-12-15' }))
      assert.equal(mais.status, 200)
      assert.equal(mais.body.vencimentoPagoPreservado, false)
      assert.equal(perfil(A).vencimento, '2026-12-15')

      const menos = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A), { data_vencimento: '2026-10-20' }))
      assert.equal(menos.status, 200)
      assert.equal(perfil(A).vencimento, '2026-10-20')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-10-20')
    })

    it('pagamento concorrente entre a leitura e a escrita do admin: perfil não é sobrescrito', async (t) => {
      await cenarioBiraComVinculoAntigo(t)
      estado.ganchos.push({
        tabela: 'perfis',
        op: 'update',
        fn: (db) => {
          const p = db.perfis.find((x) => x.id === A) as Linha
          p.vencimento = '2026-12-01'
        },
      })
      const r = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A)))

      assert.equal(r.status, 422)
      assert.equal(r.body.ok, false)
      assert.equal(perfil(A).vencimento, '2026-12-01')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-10-01', 'vínculo restaurado pelo snapshot')
    })
  })

  describe('4) idempotência', () => {
    it('mesmo pagamento via webhook e via polling PIX estende uma única vez', async (t) => {
      await pagarA1ViaWebhook(t)
      const r = await consultarPix(PAG_A1)
      assert.equal(r.body.aprovado, true)
      const replay = await chamarWebhook('MP-A1')
      assert.equal(replay.body.alreadyProcessed, true)
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })

    it('processamentos simultâneos do mesmo pagamento: apenas um aplica o período', async (t) => {
      relogio(t, MOMENTO_PIX)
      const mp = estado.mp['/v1/payments/MP-A1'] as Linha
      const alvo = { id: PAG_A1, user_id: A, valor: 49.9, plano: 'starter_mensal' }
      const resultados = await Promise.all([
        ativacao.ativarPagamentoAprovado(alvo, mp),
        ativacao.ativarPagamentoAprovado(alvo, mp),
        ativacao.ativarPagamentoAprovado(alvo, mp),
      ])
      assert.equal(resultados.filter((x) => !x.jaProcessado).length, 1)
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-11-01')
    })

    it('novo mês pago estende exatamente uma vez a partir do vencimento vigente', async (t) => {
      await pagarA1ViaWebhook(t)
      t.mock.timers.reset()
      relogio(t, '2026-10-20T13:00:00Z')
      const r = await chamarWebhook('MP-A2')
      assert.equal(r.status, 200)
      assert.equal(perfil(A).vencimento, '2026-12-01')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-12-01')
      await consultarPix(PAG_A2)
      await chamarWebhook('MP-A2')
      assert.equal(perfil(A).vencimento, '2026-12-01')
    })

    it('notificação posterior não aprovada não tira o pagamento de "pago"', async (t) => {
      await pagarA1ViaWebhook(t)
      estado.mp['/v1/payments/MP-A1-RECUSADO'] = { ...pagamentoMp('MP-A1-RECUSADO', PAG_A1, A, ''), status: 'rejected' }
      const r = await chamarWebhook('MP-A1-RECUSADO')
      assert.equal(r.status, 200)
      assert.equal(pagamento(PAG_A1).status, 'pago')
      await consultarPix(PAG_A1)
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })
  })

  describe('5) falha parcial não gera sucesso falso', () => {
    it('falha ao gravar o perfil: 500, evento em erro, pagamento volta a pendente, acesso inalterado', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.falhas.push({ tabela: 'perfis', op: 'update', vezes: 1 })
      const r = await chamarWebhook('MP-A1')

      assert.equal(r.status, 500)
      assert.equal(r.body.ok, false)
      assert.equal(evento('mercado_pago:payment:MP-A1').status, 'error')
      assert.equal(pagamento(PAG_A1).status, 'pendente')
      assert.equal(perfil(A).vencimento, '2026-09-25')
      const gate = await acessoPainel()
      assert.equal(gate.body.bloqueado, true)
    })

    it('falha ao gravar o vínculo admin: perfil não é tocado e o pagamento volta a pendente', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.falhas.push({ tabela: 'admin_cliente_sistemas', op: 'update', vezes: 1 })
      const r = await consultarPix(PAG_A1)

      assert.equal(r.status, 500)
      assert.notEqual(r.body.aprovado, true)
      assert.equal(pagamento(PAG_A1).status, 'pendente')
      assert.equal(perfil(A).vencimento, '2026-09-25')
    })

    it('falha da assinatura: nada é marcado como concluído', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.falhas.push({ tabela: 'assinaturas', op: 'upsert', vezes: 1 })
      const r = await chamarWebhook('MP-A1')
      assert.equal(r.status, 500)
      assert.equal(pagamento(PAG_A1).status, 'pendente')
      assert.equal(perfil(A).vencimento, '2026-09-25')
    })

    it('se nem a liberação do claim funcionar, o erro informa que o retry NÃO é seguro', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.falhas.push({ tabela: 'admin_cliente_sistemas', op: 'update', vezes: 1 })
      estado.ganchos.push({
        tabela: 'admin_cliente_sistemas',
        op: 'update',
        fn: () => estado.falhas.push({ tabela: 'pagamentos', op: 'update', vezes: 1 }),
      })
      const mp = estado.mp['/v1/payments/MP-A1'] as Linha
      await assert.rejects(
        ativacao.ativarPagamentoAprovado({ id: PAG_A1, user_id: A, valor: 49.9, plano: 'starter_mensal' }, mp),
        (e: any) => e.code === ativacao.CODIGO_ATIVACAO_INCOMPLETA && e.retrySeguro === false,
      )
      assert.equal(perfil(A).vencimento, '2026-09-25')
    })
  })

  describe('6) retry recupera ativação incompleta sem duplicar', () => {
    it('após falha do perfil, novo webhook conclui com 01/11 (não 01/12)', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.falhas.push({ tabela: 'perfis', op: 'update', vezes: 1 })
      assert.equal((await chamarWebhook('MP-A1')).status, 500)

      const retry = await chamarWebhook('MP-A1')
      assert.equal(retry.status, 200, JSON.stringify(retry.body))
      assert.equal(evento('mercado_pago:payment:MP-A1').status, 'processed')
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-11-01')
      assert.equal(assinatura(A).data_fim, '2026-11-02T02:59:59.999Z')

      await consultarPix(PAG_A1)
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })

    it('após falha do vínculo, polling PIX conclui uma única vez', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.falhas.push({ tabela: 'admin_cliente_sistemas', op: 'update', vezes: 1 })
      assert.equal((await consultarPix(PAG_A1)).status, 500)
      const retry = await consultarPix(PAG_A1)
      assert.equal(retry.body.aprovado, true)
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-11-01')
    })

    it('resposta perdida após o perfil gravar: confirma pela releitura, sem liberar o claim', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.falhas.push({ tabela: 'perfis', op: 'update', vezes: 1, aplicar: true })
      const r = await chamarWebhook('MP-A1')
      assert.equal(r.status, 200)
      assert.equal(pagamento(PAG_A1).status, 'pago')
      assert.equal(perfil(A).vencimento, '2026-11-01')
      await chamarWebhook('MP-A1')
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })
  })

  describe('7) bloqueio administrativo explícito', () => {
    it('bloquear cliente pago bloqueia o acesso sem apagar o período pago; desbloquear restaura', async (t) => {
      await pagarA1ViaWebhook(t)
      t.mock.timers.reset()
      relogio(t, '2026-10-09T18:22:00Z')

      const b = await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao: 'bloquear' })
      assert.equal(b.status, 200)
      assert.equal(perfil(A).status, 'bloqueado')
      assert.equal(perfil(A).ativo, false)
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal((await acessoPainel()).body.bloqueado, true)

      const d = await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao: 'desbloquear' })
      assert.equal(d.status, 200)
      assert.equal((await acessoPainel()).body.bloqueado, false)
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })

    it('editar status para bloqueado continua bloqueando', async (t) => {
      await pagarA1ViaWebhook(t)
      const r = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A), { status: 'bloqueado' }))
      assert.equal(r.status, 200)
      assert.equal(perfil(A).ativo, false)
      assert.equal((await acessoPainel()).body.bloqueado, true)
    })
  })

  describe('8) vencimento 01/11 segue o fuso America/Sao_Paulo', () => {
    it('regra pura: vale até 01/11 23:59:59.999 de Brasília', () => {
      const v = '2026-11-01'
      assert.equal(vigencia.vencimentoExpirado(v, new Date('2026-11-01T00:00:00Z')), false) // 31/10 21:00 BRT
      assert.equal(vigencia.diasAteVencimento(v, new Date('2026-11-01T00:00:00Z')), 1)
      assert.equal(vigencia.diasAteVencimento(v, new Date('2026-11-02T02:59:59Z')), 0) // 01/11 23:59 BRT
      assert.equal(vigencia.vencimentoExpirado(v, new Date('2026-11-02T03:00:00Z')), true) // 02/11 00:00 BRT
      assert.equal(vigencia.fimDoDiaNegocioIso(v), '2026-11-02T02:59:59.999Z')
      assert.equal(vigencia.diaVencimento('2026-11-01T23:59:59.999Z'), '2026-11-01')
      assert.equal(vigencia.dataNegocio(new Date('2026-11-01T01:00:00Z')), '2026-10-31')
      assert.equal(vigencia.calcularNovoVencimentoPago('2026-09-25', 30, new Date(MOMENTO_PIX)), '2026-11-01')
      assert.equal(vigencia.calcularNovoVencimentoPago('2026-11-01', 30, new Date('2026-10-20T13:00:00Z')), '2026-12-01')
    })

    it('gate do painel não bloqueia em 31/10 às 21h nem em 01/11 às 23h59; bloqueia em 02/11 00h', async (t) => {
      perfil(A).vencimento = '2026-11-01'
      perfil(A).status_pagamento = 'pago'
      for (const [instante, bloqueado] of [
        ['2026-11-01T00:00:00Z', false],
        ['2026-11-02T02:59:59Z', false],
        ['2026-11-02T03:00:00Z', true],
      ] as const) {
        t.mock.timers.reset()
        relogio(t, instante)
        const r = await acessoPainel()
        assert.equal(r.body.bloqueado, bloqueado, instante)
        assert.equal(r.body.assinaturaVencida, bloqueado, instante)
      }
    })

    it('banner (snapshot) e métricas do admin usam a mesma regra', (t) => {
      relogio(t, '2026-11-01T00:00:00Z')
      const perfilPago = { status: 'ativo', ativo: true, vencimento: '2026-11-01', status_pagamento: 'pago', valor_plano: 49.9 }
      assert.equal(assinaturaAcesso.resolverSnapshotAssinatura(perfilPago, null).ativo, true)
      const m = carteira.calcularMetricasCarteiraAdmin([{ status: 'ativo', ativo: true, valor_plano: 49.9, vencimento: '2026-11-01' }])
      assert.equal(m.vencidos, 0)

      t.mock.timers.reset()
      relogio(t, '2026-11-02T03:00:00Z')
      assert.equal(assinaturaAcesso.resolverSnapshotAssinatura(perfilPago, null).ativo, false)
      const m2 = carteira.calcularMetricasCarteiraAdmin([{ status: 'ativo', ativo: true, valor_plano: 49.9, vencimento: '2026-11-01' }])
      assert.equal(m2.vencidos, 1)
    })
  })

  describe('9) clientes sem vínculo administrativo', () => {
    it('pagamento ativa normalmente sem criar vínculo', async (t) => {
      relogio(t, MOMENTO_PIX)
      const antes = estado.db.admin_cliente_sistemas.length
      const r = await chamarWebhook('MP-C1')
      assert.equal(r.status, 200)
      assert.equal(r.body.vinculo, 'sem_vinculo')
      assert.equal(perfil(C).vencimento, '2026-11-01')
      assert.equal(estado.db.admin_cliente_sistemas.length, antes)
      assert.equal(estado.escritas.filter((e) => e.tabela === 'admin_cliente_sistemas').length, 0)
    })

    it('vínculo Connect ambíguo: ativa o acesso e não altera nenhum vínculo', async (t) => {
      relogio(t, MOMENTO_PIX)
      estado.db.admin_cliente_sistemas.push({
        ...structuredClone(vinculo(VIN_A)),
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        cliente_id: CLI_B,
      })
      const r = await chamarWebhook('MP-A1')
      assert.equal(r.status, 200)
      assert.equal(r.body.vinculo, 'ambiguo')
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal(estado.escritas.filter((e) => e.tabela === 'admin_cliente_sistemas').length, 0)
    })
  })

  describe('11) regras comerciais aprovadas', () => {
    const suspenderA = () => {
      Object.assign(perfil(A), { status: 'bloqueado', ativo: false })
      Object.assign(vinculo(VIN_A), { status: 'bloqueado' })
    }

    it('pagamento regulariza inadimplência (vencido sem bloqueio gravado) e libera o acesso', async (t) => {
      relogio(t, MOMENTO_PIX)
      vinculo(VIN_A).status = 'inadimplente'
      assert.equal((await acessoPainel()).body.bloqueado, true)

      const r = await chamarWebhook('MP-A1')
      assert.equal(r.status, 200)
      assert.equal(r.body.bloqueioPreservado, false)
      assert.equal(perfil(A).status, 'ativo')
      assert.equal(perfil(A).ativo, true)
      assert.equal(vinculo(VIN_A).status, 'ativo')
      assert.equal((await acessoPainel()).body.bloqueado, false)
    })

    it('pagamento durante suspensão administrativa credita o período mas mantém o bloqueio', async (t) => {
      relogio(t, MOMENTO_PIX)
      suspenderA()
      const r = await chamarWebhook('MP-A1')

      assert.equal(r.status, 200)
      assert.equal(r.body.bloqueioPreservado, true)
      assert.equal(pagamento(PAG_A1).status, 'pago')
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal(perfil(A).status_pagamento, 'pago')
      assert.equal(perfil(A).status, 'bloqueado')
      assert.equal(perfil(A).ativo, false)
      assert.equal(vinculo(VIN_A).status, 'bloqueado')
      assert.equal(vinculo(VIN_A).status_pagamento, 'em_dia')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-11-01')
      assert.equal((await acessoPainel()).body.bloqueado, true)

      const d = await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao: 'desbloquear' })
      assert.equal(d.status, 200)
      assert.equal((await acessoPainel()).body.bloqueado, false)
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })

    it('status gravado de origem não rastreável (expirado/cancelado/inativo) não é tratado como inadimplência', async (t) => {
      for (const status of ['expirado', 'cancelado', 'inativo']) {
        novoEstado()
        t.mock.timers.reset()
        relogio(t, MOMENTO_PIX)
        perfil(A).status = status
        const r = await chamarWebhook('MP-A1')
        assert.equal(r.status, 200, status)
        assert.equal(r.body.bloqueioPreservado, true, status)
        assert.equal(perfil(A).status, status, status)
        assert.equal(vinculo(VIN_A).status, 'ativo', `${status}: vínculo não é alterado para liberar`)
        assert.equal(perfil(A).vencimento, '2026-11-01', status)
      }
    })

    it('bloqueio só no perfil ou vínculo cancelado também é preservado', async (t) => {
      relogio(t, MOMENTO_PIX)
      Object.assign(perfil(A), { ativo: false })
      await chamarWebhook('MP-A1')
      assert.equal(perfil(A).ativo, false)

      novoEstado()
      vinculo(VIN_A).status = 'cancelado'
      await chamarWebhook('MP-A1')
      assert.equal(vinculo(VIN_A).status, 'cancelado')
      assert.equal(vinculo(VIN_A).status_pagamento, 'em_dia')
    })

    it('pagamento aprovado com vínculo financeiro vencido atualiza o vínculo e a carteira', async (t) => {
      relogio(t, MOMENTO_PIX)
      Object.assign(vinculo(VIN_A), { data_vencimento: '2026-08-01', status_pagamento: 'pendente' })
      assert.equal((await listarCarteira()).find((i) => i.id === CLI_A)?.status_pagamento, 'pendente')

      await chamarWebhook('MP-A1')
      assert.equal(vinculo(VIN_A).data_vencimento, '2026-11-01')
      assert.equal(vinculo(VIN_A).status_pagamento, 'em_dia')
      const item = (await listarCarteira()).find((i) => i.id === CLI_A) as Linha
      assert.equal(item.vencimento, '2026-11-01')
      assert.equal(item.status_pagamento, 'em_dia')
    })

    it('selo em_dia vale até o vencimento; depois a carteira mostra pendente e libera "Marcar pago"', async (t) => {
      await pagarA1ViaWebhook(t)
      const { podeAcionarMarcarPago, calcularMetricasCicloComercial } = await rota('lib/admin-ciclo-comercial.ts')

      t.mock.timers.reset()
      relogio(t, '2026-11-02T02:59:00Z') // 01/11 23:59 BRT
      const noPrazo = (await listarCarteira()).find((i) => i.id === CLI_A) as Linha
      assert.equal(noPrazo.status_pagamento, 'em_dia')
      assert.equal(podeAcionarMarcarPago({ statusPagamento: noPrazo.status_pagamento }), false)

      t.mock.timers.reset()
      relogio(t, '2026-11-02T03:00:00Z') // 02/11 00:00 BRT
      const escritasAntes = estado.escritas.length
      const vencido = (await listarCarteira()).find((i) => i.id === CLI_A) as Linha
      assert.equal(vencido.status_pagamento, 'pendente')
      assert.equal(vencido.sistemas[0].status_pagamento, 'pendente')
      assert.equal(podeAcionarMarcarPago({ statusPagamento: vencido.status_pagamento }), true)
      const m = calcularMetricasCicloComercial({
        clientes: [{ vinculos: [{ status: 'ativo', valor: 49.9, data_vencimento: vencido.vencimento, status_pagamento: vencido.status_pagamento }] }],
      })
      assert.equal(m.recebido, 0)
      assert.equal(m.vencidos, 1)
      assert.equal(vinculo(VIN_A).status_pagamento, 'em_dia', 'leitura não grava')
      assert.equal(estado.escritas.length, escritasAntes)
    })

    it('trial antigo vira ativo com pagamento confirmado e sem suspensão', async (t) => {
      relogio(t, MOMENTO_PIX)
      Object.assign(perfil(A), { status: 'trial' })
      Object.assign(vinculo(VIN_A), { status: 'trial', status_pagamento: 'trial' })
      await chamarWebhook('MP-A1')
      assert.equal(perfil(A).status, 'ativo')
      assert.equal(vinculo(VIN_A).status, 'ativo')

      // Vínculo ainda em trial (dado antigo) + edição admin sem mudar status → ativo, período preservado
      Object.assign(vinculo(VIN_A), { status: 'trial', status_pagamento: 'trial', data_vencimento: '2026-10-01' })
      const r = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A)))
      assert.equal(r.status, 200)
      assert.equal(vinculo(VIN_A).status, 'ativo')
      assert.equal(perfil(A).status, 'ativo')
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })

    it('trial com perfil suspenso não é promovido a ativo', async (t) => {
      relogio(t, MOMENTO_PIX)
      Object.assign(perfil(A), { status: 'bloqueado', ativo: false })
      Object.assign(vinculo(VIN_A), { status: 'trial' })
      const r = await chamarWebhook('MP-A1')
      assert.equal(r.body.bloqueioPreservado, true)
      assert.equal(vinculo(VIN_A).status, 'trial')
      assert.equal(perfil(A).ativo, false)
      assert.equal((await acessoPainel()).body.bloqueado, true)
    })

    it('bloqueio administrativo explícito sobrevive a pagamentos posteriores', async (t) => {
      await pagarA1ViaWebhook(t)
      const b = await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao: 'bloquear' })
      assert.equal(b.status, 200)

      t.mock.timers.reset()
      relogio(t, '2026-10-20T13:00:00Z')
      const r = await chamarWebhook('MP-A2')
      assert.equal(r.status, 200)
      assert.equal(r.body.bloqueioPreservado, true)
      assert.equal(perfil(A).vencimento, '2026-12-01')
      assert.equal(perfil(A).status, 'bloqueado')
      assert.equal(perfil(A).ativo, false)
      assert.equal(vinculo(VIN_A).status, 'bloqueado')
      assert.equal((await acessoPainel()).body.bloqueado, true)
    })

    it('idempotência durante suspensão: sem extensão dupla e sem cobrança nova', async (t) => {
      relogio(t, MOMENTO_PIX)
      suspenderA()
      const pagamentosAntes = estado.db.pagamentos.length
      await chamarWebhook('MP-A1')
      await chamarWebhook('MP-A1')
      await consultarPix(PAG_A1)
      const mp = estado.mp['/v1/payments/MP-A1'] as Linha
      const alvo = { id: PAG_A1, user_id: A, valor: 49.9, plano: 'starter_mensal' }
      const extra = await ativacao.ativarPagamentoAprovado(alvo, mp)

      assert.equal(extra.jaProcessado, true)
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal(estado.db.pagamentos.length, pagamentosAntes)
      assert.equal(estado.escritas.filter((e) => e.tabela === 'pagamentos' && e.op === 'insert').length, 0)
      assert.ok(estado.mpChamadas.every((c) => c.metodo === 'GET'))
      assert.equal(perfil(A).ativo, false)
    })
  })

  describe('12) contenção: suspensão administrativa só sai com desbloqueio explícito', () => {
    async function pagoESuspenso(t: any, statusVinculo: string) {
      await pagarA1ViaWebhook(t)
      Object.assign(perfil(A), { status: 'bloqueado', ativo: false })
      Object.assign(vinculo(VIN_A), { status: statusVinculo })
      t.mock.timers.reset()
      relogio(t, '2026-10-09T18:22:00Z')
    }

    const assertSuspensoComPeriodo = async (msg: string) => {
      assert.equal(perfil(A).status, 'bloqueado', msg)
      assert.equal(perfil(A).ativo, false, msg)
      assert.equal(perfil(A).vencimento, '2026-11-01', msg)
      assert.equal((await acessoPainel()).body.bloqueado, true, msg)
    }

    it('perfil suspenso + vínculo trial + edição comum: suspensão preservada', async (t) => {
      await pagoESuspenso(t, 'trial')
      const r = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A)))
      assert.equal(r.status, 200, JSON.stringify(r.body))
      assert.equal(r.body.bloqueioPreservado, true)
      await assertSuspensoComPeriodo('edição comum')

      const r2 = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A), { status: 'ativo' }))
      assert.equal(r2.status, 200)
      await assertSuspensoComPeriodo('trial → ativo no formulário não é desbloqueio')
    })

    it('perfil suspenso + alteração de dados comerciais (valor, dia, renovar, marcar pago): suspensão preservada', async (t) => {
      await pagoESuspenso(t, 'bloqueado')
      const r = await patchAdmin(
        CLI_A,
        formularioEdicao(vinculo(VIN_A), { valor: 59.9, dia_vencimento: 5, observacoes: 'novo valor' }),
      )
      assert.equal(r.status, 200, JSON.stringify(r.body))
      assert.equal(vinculo(VIN_A).valor, 59.9)
      await assertSuspensoComPeriodo('dados comerciais')

      for (const acao of ['renovar', 'marcar_pago']) {
        const a = await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao })
        assert.equal(a.status, 200, `${acao}: ${JSON.stringify(a.body)}`)
        assert.equal(vinculo(VIN_A).status, 'bloqueado', acao)
        assert.equal(perfil(A).status, 'bloqueado', acao)
        assert.equal(perfil(A).ativo, false, acao)
        assert.ok(perfil(A).vencimento >= '2026-11-01', `${acao} reduziu o vencimento`)
      }
    })

    it('perfil suspenso + "Desbloquear" explícito: desbloqueio permitido com período pago intacto', async (t) => {
      await pagoESuspenso(t, 'bloqueado')
      const r = await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao: 'desbloquear' })
      assert.equal(r.status, 200)
      assert.equal(r.body.bloqueioPreservado, false)
      assert.equal(perfil(A).status, 'ativo')
      assert.equal(perfil(A).ativo, true)
      assert.equal(perfil(A).vencimento, '2026-11-01')
      assert.equal((await acessoPainel()).body.bloqueado, false)
    })

    it('perfil suspenso + troca explícita de "bloqueado" no formulário: desbloqueio permitido', async (t) => {
      await pagoESuspenso(t, 'bloqueado')
      const r = await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A), { status: 'ativo' }))
      assert.equal(r.status, 200)
      assert.equal(perfil(A).ativo, true)
      assert.equal((await acessoPainel()).body.bloqueado, false)
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })

    it('pagamento durante suspensão: crédito aplicado, bloqueio preservado', async (t) => {
      relogio(t, MOMENTO_PIX)
      Object.assign(perfil(A), { status: 'bloqueado', ativo: false })
      Object.assign(vinculo(VIN_A), { status: 'trial' })
      const r = await chamarWebhook('MP-A1')
      assert.equal(r.status, 200)
      assert.equal(r.body.bloqueioPreservado, true)
      await assertSuspensoComPeriodo('pagamento')
      assert.equal(pagamento(PAG_A1).status, 'pago')
    })

    it('pagamento de cliente apenas vencido: acesso recuperado', async (t) => {
      relogio(t, MOMENTO_PIX)
      assert.equal((await acessoPainel()).body.bloqueado, true)
      await chamarWebhook('MP-A1')
      assert.equal((await acessoPainel()).body.bloqueado, false)
      assert.equal(perfil(A).vencimento, '2026-11-01')
    })
  })

  it('10) outros clientes e outros sistemas permanecem isolados', async (t) => {
    const intocados = {
      perfilB: structuredClone(perfil(B)),
      perfilC: structuredClone(perfil(C)),
      assinaturaB: structuredClone(assinatura(B)),
      vinculoB: structuredClone(vinculo(VIN_B)),
      vinculoTerceiro: structuredClone(vinculo(VIN_A_TERCEIRO)),
      pagamentoC: structuredClone(pagamento(PAG_C1)),
      pagamentoA2: structuredClone(pagamento(PAG_A2)),
    }
    await pagarA1ViaWebhook(t)
    await consultarPix(PAG_A1)
    await patchAdmin(CLI_A, formularioEdicao(vinculo(VIN_A)))
    await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao: 'bloquear' })
    await patchAdmin(CLI_A, { vinculo_id: VIN_A, acao: 'desbloquear' })

    assert.deepEqual(perfil(B), intocados.perfilB)
    assert.deepEqual(perfil(C), intocados.perfilC)
    assert.deepEqual(assinatura(B), intocados.assinaturaB)
    assert.deepEqual(vinculo(VIN_B), intocados.vinculoB)
    assert.deepEqual(vinculo(VIN_A_TERCEIRO), intocados.vinculoTerceiro)
    assert.deepEqual(pagamento(PAG_C1), intocados.pagamentoC)
    assert.deepEqual(pagamento(PAG_A2), intocados.pagamentoA2)

    const chavesEscritas = new Set(estado.escritas.flatMap((e) => e.chaves))
    for (const alheia of [B, C, VIN_B, VIN_A_TERCEIRO, PAG_C1, PAG_A2]) {
      assert.equal(chavesEscritas.has(alheia), false, `escrita indevida em ${alheia.slice(0, 8)}`)
    }
    assert.ok(estado.mpChamadas.every((c) => c.metodo === 'GET'))
  })
})
