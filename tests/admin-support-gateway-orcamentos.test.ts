/**
 * ADMIN.4.3.2 / 4.3.2a — Gateway read-only orçamentos (unit + source contract).
 * Sem smoke real, sem SQL write, sem support session live.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  ADMIN_SUPPORT_MODO_FASE,
  CODIGO_SUPPORT_TERCEIRO,
} from '../lib/admin-support.ts'
import {
  ADMIN_SUPPORT_ORCAMENTOS_LIMIT_DEFAULT,
  ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MAX,
  ADMIN_SUPPORT_ORCAMENTOS_SELECT,
  assertTargetAuthUserIdParaQuery,
  CODIGO_SUPPORT_ACESSO_CONNECT,
  CODIGO_SUPPORT_MODO_INVALIDO,
  CODIGO_SUPPORT_QUERY_INVALIDA,
  CODIGO_SUPPORT_SESSAO_ENCERRADA,
  CODIGO_SUPPORT_SESSAO_EXPIRADA,
  CODIGO_SUPPORT_SESSAO_REVOGADA,
  CODIGO_SUPPORT_TARGET_AUSENTE,
  CODIGO_SUPPORT_TENANT_OVERRIDE,
  CODIGO_SUPPORT_VINCULO_INVALIDO,
  detectarTenantOverrideHeaders,
  detectarTenantOverrideQuery,
  headersGatewayNoStore,
  mapearAdminSupportOrcamentoResumo,
  parseOrcamentosGatewayQuery,
  validarSessaoGatewayReadOnly,
  validarVinculoGatewayRevalidado,
  type SupportSessionGatewayRow,
} from '../lib/admin-support-gateway.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

/** Espelha statusAuthMasterSuporte — evita import @/ via admin-support-server no node:test. */
function statusAuthMasterSuporte(error: unknown): number {
  const msg = error instanceof Error ? error.message : String(error || '')
  if (msg === 'Sessão ausente.' || msg === 'Sessão inválida.') return 401
  if (msg === 'Acesso negado.' || msg.includes('Master')) return 403
  return 500
}

const MASTER = '11111111-1111-1111-1111-111111111111'
const BIRA_AUTH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const BIRA_PERFIL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CLIENTE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const VINCULO = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const SISTEMA = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const OTHER = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function sessaoBase(overrides: Partial<SupportSessionGatewayRow> = {}): SupportSessionGatewayRow {
  const futuro = new Date(Date.now() + 30 * 60_000).toISOString()
  return {
    id: 'sess-1',
    context_token_hash: 'a'.repeat(64),
    admin_user_id: MASTER,
    admin_email: 'master@example.com',
    admin_cliente_id: CLIENTE,
    admin_cliente_sistema_id: VINCULO,
    target_auth_user_id: BIRA_AUTH,
    target_perfil_id: BIRA_PERFIL,
    target_empresa_id: null,
    modo: ADMIN_SUPPORT_MODO_FASE,
    motivo: 'diagnostico suporte bira',
    iniciado_em: new Date().toISOString(),
    expira_em: futuro,
    encerrado_em: null,
    revogado_em: null,
    ...overrides,
  }
}

function vinculoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: VINCULO,
    cliente_id: CLIENTE,
    sistema_id: SISTEMA,
    acesso_connect: true,
    auth_user_id: BIRA_AUTH,
    perfil_id: BIRA_PERFIL,
    ...overrides,
  }
}

function sistemaBase(overrides: Record<string, unknown> = {}) {
  return { id: SISTEMA, origem: 'connect', ...overrides }
}

describe('ADMIN.4.3.2a gateway — auth Master (B–C)', () => {
  it('B) sem Bearer => bloqueado (401) + rota usa statusAuthMasterSuporte', () => {
    assert.equal(statusAuthMasterSuporte(new Error('Sessão ausente.')), 401)
    const route = read('app/api/admin/suporte/dados/orcamentos/route.ts')
    assert.ok(route.includes('statusAuthMasterSuporte'))
    assert.ok(route.includes('requireMasterAdminFromRequest'))
  })

  it('C) não Master => bloqueado (403)', () => {
    assert.equal(statusAuthMasterSuporte(new Error('Acesso negado.')), 403)
    const api = read('lib/api-auth.ts')
    assert.ok(api.includes('requireMasterAdminFromRequest'))
    assert.ok(api.includes('isAdminMasterServer'))
  })
})

describe('ADMIN.4.3.2a gateway — sessão / auth gates (A, D–J)', () => {
  it('A) Master + sessão válida + BIRA => permitido', () => {
    const row = sessaoBase()
    const r = validarSessaoGatewayReadOnly(row, MASTER)
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.targetAuthUserId, BIRA_AUTH)
      assert.equal(r.targetPerfilId, BIRA_PERFIL)
    }
    const v = validarVinculoGatewayRevalidado({
      session: row,
      vinculo: vinculoBase(),
      sistema: sistemaBase(),
    })
    assert.equal(v.ok, true)
  })

  it('D) sem cookie / sessão null => bloqueado', () => {
    const r = validarSessaoGatewayReadOnly(null, MASTER)
    assert.equal(r.ok, false)
    if (r.ok === false) assert.ok(r.httpStatus === 403)
  })

  it('E) cookie inválido (sessão null após lookup) => bloqueado', () => {
    const r = validarSessaoGatewayReadOnly(null, MASTER)
    assert.equal(r.ok, false)
  })

  it('F) sessão encerrada => bloqueado', () => {
    const r = validarSessaoGatewayReadOnly(
      sessaoBase({ encerrado_em: new Date().toISOString() }),
      MASTER,
    )
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_SESSAO_ENCERRADA)
  })

  it('G) sessão expirada => bloqueado', () => {
    const r = validarSessaoGatewayReadOnly(
      sessaoBase({ expira_em: new Date(Date.now() - 60_000).toISOString() }),
      MASTER,
    )
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_SESSAO_EXPIRADA)
  })

  it('H) sessão revogada => bloqueado', () => {
    const r = validarSessaoGatewayReadOnly(
      sessaoBase({ revogado_em: new Date().toISOString() }),
      MASTER,
    )
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_SESSAO_REVOGADA)
  })

  it('I) modo diferente de read_only => bloqueado', () => {
    const r = validarSessaoGatewayReadOnly(sessaoBase({ modo: 'write' }), MASTER)
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_MODO_INVALIDO)
  })

  it('J) target_auth_user_id ausente => fail closed', () => {
    const r = validarSessaoGatewayReadOnly(
      sessaoBase({ target_auth_user_id: '' as unknown as string }),
      MASTER,
    )
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_TARGET_AUSENTE)
    assert.throws(() => assertTargetAuthUserIdParaQuery(''), /ADMIN_SUPPORT_TARGET_AUSENTE/)
    assert.throws(() => assertTargetAuthUserIdParaQuery(null), /ADMIN_SUPPORT_TARGET_AUSENTE/)
    assert.throws(() => assertTargetAuthUserIdParaQuery(undefined), /ADMIN_SUPPORT_TARGET_AUSENTE/)
  })

  it('ownership: admin_user_id !== Master => bloqueado', () => {
    const r = validarSessaoGatewayReadOnly(sessaoBase({ admin_user_id: OTHER }), MASTER)
    assert.equal(r.ok, false)
  })
})

describe('ADMIN.4.3.2a gateway — revalidação vínculo (K–P)', () => {
  const session = sessaoBase()

  it('K) vínculo removido => bloqueado', () => {
    const r = validarVinculoGatewayRevalidado({ session, vinculo: null, sistema: sistemaBase() })
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_VINCULO_INVALIDO)
  })

  it('L) vínculo cliente divergente => bloqueado', () => {
    const r = validarVinculoGatewayRevalidado({
      session,
      vinculo: vinculoBase({ cliente_id: OTHER }),
      sistema: sistemaBase(),
    })
    assert.equal(r.ok, false)
  })

  it('M) terceiro => bloqueado', () => {
    const r = validarVinculoGatewayRevalidado({
      session,
      vinculo: vinculoBase(),
      sistema: sistemaBase({ origem: 'terceiro' }),
    })
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_TERCEIRO)
  })

  it('N) acesso_connect=false => bloqueado', () => {
    const r = validarVinculoGatewayRevalidado({
      session,
      vinculo: vinculoBase({ acesso_connect: false }),
      sistema: sistemaBase(),
    })
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SUPPORT_ACESSO_CONNECT)
  })

  it('O) auth_user_id do vínculo divergente => bloqueado', () => {
    const r = validarVinculoGatewayRevalidado({
      session,
      vinculo: vinculoBase({ auth_user_id: OTHER }),
      sistema: sistemaBase(),
    })
    assert.equal(r.ok, false)
  })

  it('P) perfil_id divergente => bloqueado', () => {
    const r = validarVinculoGatewayRevalidado({
      session,
      vinculo: vinculoBase({ perfil_id: OTHER }),
      sistema: sistemaBase(),
    })
    assert.equal(r.ok, false)
  })
})

describe('ADMIN.4.3.2a gateway — IDOR tenant override + allowlist (Q–U)', () => {
  for (const key of [
    'user_id',
    'perfil_id',
    'empresa_id',
    'cliente_id',
    'vinculo_id',
    'auth_user_id',
    'admin_cliente_id',
    'target_auth_user_id',
    'target_perfil_id',
    'admin_cliente_sistema_id',
  ]) {
    it(`override ?${key}=outro => 400`, () => {
      const sp = new URLSearchParams({ [key]: OTHER })
      assert.equal(detectarTenantOverrideQuery(sp), key)
      const parsed = parseOrcamentosGatewayQuery(sp)
      assert.equal(parsed.ok, false)
      if (parsed.ok === false) {
        assert.equal(parsed.code, CODIGO_SUPPORT_TENANT_OVERRIDE)
        assert.equal(parsed.httpStatus, 400)
      }
    })
  }

  it('casing User_Id => bloqueado pela allowlist/tenant', () => {
    const sp = new URLSearchParams({ User_Id: OTHER })
    const parsed = parseOrcamentosGatewayQuery(sp)
    assert.equal(parsed.ok, false)
  })

  it('param desconhecido foo => 400 allowlist absoluta', () => {
    const parsed = parseOrcamentosGatewayQuery(new URLSearchParams({ foo: '1' }))
    assert.equal(parsed.ok, false)
    if (parsed.ok === false) assert.equal(parsed.code, CODIGO_SUPPORT_QUERY_INVALIDA)
  })

  it('header x-user-id => detectado', () => {
    const h = new Headers({ 'x-user-id': OTHER })
    assert.equal(detectarTenantOverrideHeaders(h), 'x-user-id')
  })
})

describe('ADMIN.4.3.2a gateway — query / DTO / payload REMOVED (V–Z)', () => {
  it('V) filtro user_id obrigatório no source', () => {
    const gw = read('lib/admin-support-gateway.ts')
    assert.ok(gw.includes(".eq('user_id', targetAuthUserId)"))
    assert.ok(gw.includes('assertTargetAuthUserIdParaQuery'))
  })

  it('W) target vazio nunca passa assert (query bloqueada)', () => {
    assert.throws(() => assertTargetAuthUserIdParaQuery(''), Error)
    assert.throws(() => assertTargetAuthUserIdParaQuery('   '), Error)
    assert.throws(() => assertTargetAuthUserIdParaQuery('not-a-uuid'), Error)
  })

  it('X) sem select(*) e sem payload no SELECT', () => {
    const gw = read('lib/admin-support-gateway.ts')
    const route = read('app/api/admin/suporte/dados/orcamentos/route.ts')
    assert.equal(/\.select\(\s*['"]\*['"]\s*\)/.test(gw), false)
    assert.equal(/\.select\(\s*['"]\*['"]\s*\)/.test(route), false)
    assert.ok(!ADMIN_SUPPORT_ORCAMENTOS_SELECT.includes('*'))
    assert.ok(!ADMIN_SUPPORT_ORCAMENTOS_SELECT.includes('payload'))
    assert.ok(ADMIN_SUPPORT_ORCAMENTOS_SELECT.includes('local_id'))
    assert.ok(ADMIN_SUPPORT_ORCAMENTOS_SELECT.includes('cliente'))
    assert.ok(!ADMIN_SUPPORT_ORCAMENTOS_SELECT.includes('cliente_nome'))
    // SELECT constant must not list payload as a selected column
    assert.match(
      gw,
      /ADMIN_SUPPORT_ORCAMENTOS_SELECT\s*=\s*'[^']*'/,
    )
    const m = gw.match(/ADMIN_SUPPORT_ORCAMENTOS_SELECT\s*=\s*'([^']+)'/)
    assert.ok(m)
    assert.equal(m![1].includes('payload'), false)
  })

  it('Y) payload / secrets nunca saem no DTO; sem spread', () => {
    const gw = read('lib/admin-support-gateway.ts')
    assert.equal(/\.\.\.\s*row\b/.test(gw), false)
    assert.equal(gw.includes('...row'), false)

    const dto = mapearAdminSupportOrcamentoResumo({
      local_id: '42',
      aprovado: true,
      status: 'Aprovado',
      total: 100,
      updated_at: '2026-01-01T00:00:00Z',
      created_at: '2025-12-01T00:00:00Z',
      cliente: 'BIRA Cliente',
    })
    const json = JSON.stringify(dto)
    assert.equal('payload' in dto, false)
    assert.equal('user_id' in dto, false)
    assert.equal(json.includes('payload'), false)
    assert.equal(dto.cliente_nome, 'BIRA Cliente')
    assert.equal(dto.status, 'Aprovado')
    assert.equal(dto.total, 100)
  })

  it('Z) DTO allowlisted explícito', () => {
    const dto = mapearAdminSupportOrcamentoResumo({
      local_id: '7',
      aprovado: false,
      status: 'Pendente',
      total: 50,
      cliente: 'X',
    })
    const keys = Object.keys(dto).sort()
    assert.deepEqual(keys, [
      'aprovado',
      'cliente_nome',
      'created_at',
      'local_id',
      'status',
      'total',
      'updated_at',
    ])
    assert.equal(dto.local_id, '7')
    assert.equal(dto.total, 50)
    assert.equal('numero' in dto, false)
    assert.equal('data' in dto, false)
  })
})

describe('ADMIN.4.3.2a gateway — paginação (AA–AF)', () => {
  it('AA) default limit 20', () => {
    const p = parseOrcamentosGatewayQuery(new URLSearchParams())
    assert.equal(p.ok, true)
    if (p.ok) {
      assert.equal(p.limit, ADMIN_SUPPORT_ORCAMENTOS_LIMIT_DEFAULT)
      assert.equal(p.offset, 0)
      assert.equal(p.status, null)
    }
  })

  it('AB) max 50 aceito', () => {
    const p = parseOrcamentosGatewayQuery(new URLSearchParams({ limit: '50' }))
    assert.equal(p.ok, true)
    if (p.ok) assert.equal(p.limit, ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MAX)
  })

  it('AC) limit >50 tratado (400)', () => {
    const p = parseOrcamentosGatewayQuery(new URLSearchParams({ limit: '51' }))
    assert.equal(p.ok, false)
    if (p.ok === false) assert.equal(p.code, CODIGO_SUPPORT_QUERY_INVALIDA)
  })

  it('AD) offset negativo bloqueado', () => {
    const p = parseOrcamentosGatewayQuery(new URLSearchParams({ offset: '-1' }))
    assert.equal(p.ok, false)
  })

  it('AE) status inválido bloqueado', () => {
    const p = parseOrcamentosGatewayQuery(new URLSearchParams({ status: 'Rascunho' }))
    assert.equal(p.ok, false)
  })

  it('AF) sort arbitrário não permitido', () => {
    const p = parseOrcamentosGatewayQuery(new URLSearchParams({ sort: 'total' }))
    assert.equal(p.ok, false)
    const p2 = parseOrcamentosGatewayQuery(new URLSearchParams({ order_by: 'created_at' }))
    assert.equal(p2.ok, false)
  })
})

describe('ADMIN.4.3.2a gateway — cache / read-only / secrets (AG–AR)', () => {
  const route = read('app/api/admin/suporte/dados/orcamentos/route.ts')
  const gw = read('lib/admin-support-gateway.ts')
  const panel = read('components/admin/AdminModoSuportePanel.tsx')

  it('AG) Cache-Control no-store em helper', () => {
    const h = headersGatewayNoStore() as Record<string, string>
    assert.equal(h['Cache-Control'], 'no-store')
    assert.ok(route.includes('headersGatewayNoStore'))
  })

  it('AG2) no-store também nos erros (todas respostas via jsonGateway)', () => {
    assert.ok(route.includes('function jsonGateway'))
    const returns = route.match(/return jsonGateway\(/g) || []
    assert.ok(returns.length >= 4)
    assert.ok(route.includes('headers: headersGatewayNoStore()'))
    // único NextResponse.json da rota está no helper com no-store
    const jsonCalls = route.match(/NextResponse\.json\(/g) || []
    assert.equal(jsonCalls.length, 1)
  })

  it('AH) rota somente GET', () => {
    assert.ok(route.includes('export async function GET'))
    assert.equal(/export async function POST/.test(route), false)
    assert.equal(/export async function PUT/.test(route), false)
    assert.equal(/export async function PATCH/.test(route), false)
    assert.equal(/export async function DELETE/.test(route), false)
  })

  it('AI–AL) nenhum insert/update/delete/RPC mutável no gateway', () => {
    assert.equal(/\.insert\(/.test(gw), false)
    assert.equal(/\.update\(/.test(gw), false)
    assert.equal(/\.delete\(/.test(gw), false)
    assert.equal(/\.upsert\(/.test(gw), false)
    assert.equal(/\.rpc\(/.test(gw), false)
    assert.equal(/\.insert\(/.test(route), false)
    assert.equal(/\.update\(/.test(route), false)
    assert.equal(/\.delete\(/.test(route), false)
    assert.equal(/\.rpc\(/.test(route), false)
  })

  it('AM) nenhum admin_support_events write', () => {
    assert.equal(gw.includes("from('admin_support_events')"), false)
    assert.equal(gw.includes('from("admin_support_events")'), false)
    assert.equal(route.includes('admin_support_events'), false)
    assert.equal(gw.includes('registrarEventoSuporte'), false)
    assert.equal(route.includes('registrarEventoSuporte'), false)
  })

  it('AN) nenhum sessoes_ativas write', () => {
    assert.equal(gw.includes('sessoes_ativas'), false)
    assert.equal(route.includes('sessoes_ativas'), false)
  })

  it('AO) service role não client / não NEXT_PUBLIC', () => {
    assert.equal(gw.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'), false)
    assert.equal(route.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'), false)
    assert.ok(gw.includes("import('./supabase-admin.ts')") || gw.includes('getSupabaseAdmin'))
    assert.equal(panel.includes('admin-support-gateway'), false)
    assert.equal(panel.includes('SERVICE_ROLE'), false)
  })

  it('AP–AQ) JWT/cookie/token/hash não na resposta de sucesso', () => {
    assert.equal(route.includes('context_token_hash'), false)
    assert.ok(route.includes('requireMasterAdminFromRequest'))
    assert.ok(route.includes('pagination: lista.pagination'))
    assert.ok(!route.includes('Bearer'))
  })

  it('AR) payload completo não resposta / não SELECT', () => {
    assert.ok(gw.includes('mapearAdminSupportOrcamentoResumo'))
    assert.equal(route.includes('payload:'), false)
    assert.ok(gw.includes('PAYLOAD_SELECT = REMOVED') || !ADMIN_SUPPORT_ORCAMENTOS_SELECT.includes('payload'))
  })

  it('ZERO write expiração: não chama marcarSessaoExpirada', () => {
    assert.equal(gw.includes('marcarSessaoExpirada'), false)
    assert.equal(route.includes('marcarSessaoExpirada'), false)
  })

  it('UI não alterada nesta rodada (sem Ver Orçamentos)', () => {
    assert.equal(panel.includes('Ver Orçamentos'), false)
    assert.equal(panel.includes('/api/admin/suporte/dados/orcamentos'), false)
  })

  it('validation order: Master antes de listar; listar só após contexto', () => {
    // Usa a chamada no handler GET (não o import no topo).
    const getIdx = route.indexOf('export async function GET')
    assert.ok(getIdx >= 0)
    const body = route.slice(getIdx)
    const idxMaster = body.indexOf('requireMasterAdminFromRequest')
    const idxCtx = body.indexOf('resolverContextoGatewayOrcamentos')
    const idxList = body.indexOf('listarOrcamentosSuporteReadOnly')
    assert.ok(idxMaster >= 0 && idxCtx > idxMaster && idxList > idxCtx)
  })

  it('status filter: somente coluna (sem OR payload)', () => {
    assert.equal(gw.includes('payload->>status'), false)
    assert.ok(gw.includes(".eq('status', opts.status)") || gw.includes('.eq("status", opts.status)'))
  })

  it('ordering determinístico updated_at + local_id', () => {
    assert.ok(gw.includes(".order('updated_at'"))
    assert.ok(gw.includes(".order('local_id'"))
  })

  it('effective tenant = target_auth_user_id (não empresa_id)', () => {
    assert.ok(gw.includes(".eq('user_id', targetAuthUserId)"))
    assert.equal(gw.includes(".eq('empresa_id'"), false)
  })

  it('error sanitization: sem error.message cru do supabase na resposta', () => {
    assert.ok(route.includes("error: 'Não autorizado.'") || route.includes('MSG_SUPPORT_MASTER_ONLY'))
    assert.ok(gw.includes("'Não foi possível listar orçamentos.'"))
    assert.equal(gw.includes('error.message }'), false)
  })
})
