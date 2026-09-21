/**
 * ADMIN.4.2 / 4.2.2 / 4.2.3b — testes de segurança do Modo Suporte.
 *
 * Tipos:
 *   UNIT              — lógica pura (elegibilidade, token, ciclo, concorrência)
 *   SOURCE CONTRACT   — inspeção de código (Auth, ownership, encerrar)
 *   SQL CONTRACT      — inspeção de SQL docs
 *   INTEGRATION       — NÃO EXECUTADA neste npm test
 *
 * Concurrency manual (docs/admin-support-concurrency-manual.sql):
 *   NÃO seguro para execução automática no banco compartilhado
 *   por depender de FKs reais.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ADMIN_SUPPORT_COOKIE_NAME,
  ADMIN_SUPPORT_DURACOES_MINUTOS,
  ADMIN_SUPPORT_MODO_FASE,
  ADMIN_SUPPORT_MOTIVO_MAX,
  ADMIN_SUPPORT_MOTIVO_MIN,
  ADMIN_SUPPORT_TOKEN_BYTES,
  ADMIN_SUPPORT_TOKEN_HASH_LEN,
  ADMIN_SUPPORT_UI_ENABLED,
  CODIGO_SUPPORT_DURACAO_INVALIDA,
  CODIGO_SUPPORT_MOTIVO_INVALIDO,
  CODIGO_SUPPORT_TERCEIRO,
  calcularExpiraEmIso,
  cookieConteudoPareceCredencial,
  gerarContextTokenBruto,
  hashContextToken,
  isContextTokenHashShape,
  resolverConflitoSessoesAtivas,
  sessaoSuporteEstaAtiva,
  simularDuasTentativasIniciar,
  validarDuracaoSuporte,
  validarElegibilidadeModoSuporte,
  validarMotivoSuporte,
} from '../lib/admin-support.ts'
import { isPerfilRoleAdmin } from '../lib/access.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const UUID_C = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const UUID_V = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const UUID_S = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const UUID_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const UUID_P = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const UUID_OTHER = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const ADMIN_1 = '11111111-1111-1111-1111-111111111111'
const ADMIN_2 = '22222222-2222-2222-2222-222222222222'

/** Espelha parseAdminEmails / isAdminMasterServer sem importar @/access-server. */
function emailNaListaMaster(email: string, listaCsv: string): boolean {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return false
  const lista = String(listaCsv || '')
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return lista.includes(normalized)
}

/** Espelha resolução ADMIN_EMAILS || CONNECT_ADMIN_EMAILS. */
function listaMasterDeEnv(adminEmails: string, connectEmails: string): string {
  return String(adminEmails || connectEmails || '').trim()
}

/** Espelha ownership de status/encerrar (cookie sozinho não autoriza). */
function ownershipSuporteOk(sessionAdminUserId: string, jwtUserId: string): boolean {
  return Boolean(sessionAdminUserId) && sessionAdminUserId === jwtUserId
}

function baseElegivel(overrides: Record<string, unknown> = {}) {
  const base = {
    adminClienteIdInformado: UUID_C,
    vinculoIdInformado: UUID_V,
    cliente: { id: UUID_C },
    vinculo: {
      id: UUID_V,
      cliente_id: UUID_C,
      sistema_id: UUID_S,
      acesso_connect: true,
      auth_user_id: UUID_A,
      perfil_id: UUID_P,
    },
    sistema: { id: UUID_S, origem: 'connect', nome: 'Connect' },
  }
  const merged = { ...base, ...overrides }
  if (overrides.vinculo && typeof overrides.vinculo === 'object' && overrides.vinculo !== null) {
    merged.vinculo = { ...base.vinculo, ...(overrides.vinculo as object) }
  }
  if (overrides.sistema && typeof overrides.sistema === 'object' && overrides.sistema !== null) {
    merged.sistema = { ...base.sistema, ...(overrides.sistema as object) }
  }
  return merged
}

// =============================================================================
// UNIT — token (4.2.2 preservado) + cookie anti-credencial (4.2 restaurado)
// =============================================================================
describe('ADMIN.4.2.3b UNIT — token CSPRNG + hash + cookie', () => {
  it('gera 256 bits hex; hash SHA-256; bruto != hash', () => {
    const bruto = gerarContextTokenBruto()
    assert.equal(bruto.length, ADMIN_SUPPORT_TOKEN_BYTES * 2)
    assert.match(bruto, /^[a-f0-9]+$/)
    const hash = hashContextToken(bruto)
    assert.equal(hash.length, ADMIN_SUPPORT_TOKEN_HASH_LEN)
    assert.ok(isContextTokenHashShape(hash))
    assert.notEqual(bruto, hash)
  })

  it('hash é determinístico', () => {
    const bruto = gerarContextTokenBruto()
    assert.equal(hashContextToken(bruto), hashContextToken(bruto))
  })

  it('cookieConteudoPareceCredencial: token opaco ok; JWT/service_role rejeitados', () => {
    const bruto = gerarContextTokenBruto()
    assert.equal(cookieConteudoPareceCredencial(bruto), false)
    assert.equal(cookieConteudoPareceCredencial('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb'), true)
    assert.equal(cookieConteudoPareceCredencial('x.service_role.y'), true)
    assert.ok(ADMIN_SUPPORT_COOKIE_NAME.includes('support'))
  })

  it('token bruto não embute auth_user_id / perfil_id / admin_user_id alvo', () => {
    const bruto = gerarContextTokenBruto()
    assert.equal(bruto.includes(UUID_A), false)
    assert.equal(bruto.includes(UUID_P), false)
    assert.equal(bruto.includes(ADMIN_1), false)
    assert.equal(bruto.includes('{'), false)
    assert.equal(bruto.includes('eyJ'), false)
  })
})

describe('ADMIN.4.2.3b SOURCE — token/hash no código', () => {
  it('source: sem Math.random; usa randomBytes + createHash', () => {
    const src = readFileSync(join(root, 'lib/admin-support.ts'), 'utf8')
    assert.equal(src.includes('Math.random'), false)
    assert.ok(src.includes('randomBytes'))
    assert.ok(src.includes('createHash'))
    assert.ok(src.includes('sha256'))
  })

  it('server hasheia antes do lookup; cookie recebe bruto', () => {
    const server = readFileSync(join(root, 'lib/admin-support-server.ts'), 'utf8')
    assert.ok(server.includes('hashContextToken'))
    assert.ok(server.includes('context_token_hash'))
    assert.ok(server.includes('aplicarCookieSuporte'))
    assert.ok(server.includes('tokenBruto'))
    assert.equal(server.includes('.insert(payload)'), false)
    assert.ok(server.includes("rpc('admin_support_iniciar_sessao'"))
  })
})

describe('ADMIN.4.2.3b SQL CONTRACT — token hash', () => {
  it('SQL não contém context_token bruto; tem context_token_hash', () => {
    const sql = readFileSync(join(root, 'docs/admin-support-sessions.sql'), 'utf8')
    assert.ok(sql.includes('context_token_hash'))
    assert.equal(/\bcontext_token\b/.test(sql.replace(/context_token_hash/g, '')), false)
    assert.ok(sql.includes("check (modo in ('read_only'))"))
  })
})

// =============================================================================
// UNIT — elegibilidade (matriz 4.2 restaurada)
// =============================================================================
describe('ADMIN.4.2.3b UNIT — elegibilidade', () => {
  it('A) Connect elegível → permitido', () => {
    const r = validarElegibilidadeModoSuporte(baseElegivel())
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.origem, 'connect')
      assert.equal(r.targetAuthUserId, UUID_A)
      assert.equal(r.targetPerfilId, UUID_P)
    }
  })

  it('B) acesso_connect=false → rejeitado', () => {
    const r = validarElegibilidadeModoSuporte(
      baseElegivel({ vinculo: { acesso_connect: false } }),
    )
    assert.equal(r.ok, false)
  })

  it('C) auth_user_id=null → rejeitado', () => {
    const r = validarElegibilidadeModoSuporte(
      baseElegivel({ vinculo: { auth_user_id: null } }),
    )
    assert.equal(r.ok, false)
  })

  it('D) perfil_id=null → rejeitado', () => {
    const r = validarElegibilidadeModoSuporte(
      baseElegivel({ vinculo: { perfil_id: null } }),
    )
    assert.equal(r.ok, false)
  })

  it('E) cliente informado != cliente do vínculo → rejeitado', () => {
    const r = validarElegibilidadeModoSuporte(
      baseElegivel({ vinculo: { cliente_id: UUID_OTHER } }),
    )
    assert.equal(r.ok, false)
  })

  it('F) vínculo inexistente → rejeitado', () => {
    const r = validarElegibilidadeModoSuporte(baseElegivel({ vinculo: null }))
    assert.equal(r.ok, false)
  })

  it('G) sistema divergente do vínculo → rejeitado', () => {
    const r = validarElegibilidadeModoSuporte(
      baseElegivel({ sistema: { id: UUID_OTHER, origem: 'connect' } }),
    )
    assert.equal(r.ok, false)
  })

  it('G2) sistema inexistente → rejeitado', () => {
    const r = validarElegibilidadeModoSuporte(baseElegivel({ sistema: null }))
    assert.equal(r.ok, false)
  })

  it('H) origem=terceiro INFOSTART → ADMIN_SUPPORT_TERCEIRO', () => {
    const r = validarElegibilidadeModoSuporte(
      baseElegivel({ sistema: { id: UUID_S, origem: 'terceiro', nome: 'INFOSTART' } }),
    )
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, CODIGO_SUPPORT_TERCEIRO)
  })
})

// =============================================================================
// UNIT — motivo / duração
// =============================================================================
describe('ADMIN.4.2.3b UNIT — motivo', () => {
  it('vazio → rejeitado', () => {
    const r = validarMotivoSuporte('')
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, CODIGO_SUPPORT_MOTIVO_INVALIDO)
  })

  it('somente espaços → rejeitado (trim)', () => {
    assert.equal(validarMotivoSuporte('          ').ok, false)
  })

  it('abaixo do mínimo → rejeitado', () => {
    assert.equal(validarMotivoSuporte('x'.repeat(ADMIN_SUPPORT_MOTIVO_MIN - 1)).ok, false)
  })

  it('mínimo válido → aceito', () => {
    const r = validarMotivoSuporte('x'.repeat(ADMIN_SUPPORT_MOTIVO_MIN))
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.motivo.length, ADMIN_SUPPORT_MOTIVO_MIN)
  })

  it('máximo válido → aceito', () => {
    const r = validarMotivoSuporte('y'.repeat(ADMIN_SUPPORT_MOTIVO_MAX))
    assert.equal(r.ok, true)
  })

  it('acima de 500 → rejeitado', () => {
    assert.equal(validarMotivoSuporte('z'.repeat(ADMIN_SUPPORT_MOTIVO_MAX + 1)).ok, false)
  })

  it('trim remove espaços laterais', () => {
    const r = validarMotivoSuporte('  Cliente sem PDF  ')
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.motivo, 'Cliente sem PDF')
  })
})

describe('ADMIN.4.2.3b UNIT — duração allowlist', () => {
  it('15 → aceita', () => assert.equal(validarDuracaoSuporte(15).ok, true))
  it('30 → aceita', () => assert.equal(validarDuracaoSuporte(30).ok, true))
  it('60 → aceita', () => assert.equal(validarDuracaoSuporte(60).ok, true))
  it('0 → rejeita', () => {
    const r = validarDuracaoSuporte(0)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, CODIGO_SUPPORT_DURACAO_INVALIDA)
  })
  it('14 → rejeita', () => assert.equal(validarDuracaoSuporte(14).ok, false))
  it('61 → rejeita', () => assert.equal(validarDuracaoSuporte(61).ok, false))
  it('45 → rejeita (fora da allowlist)', () => assert.equal(validarDuracaoSuporte(45).ok, false))
  it('>60 → rejeita', () => assert.equal(validarDuracaoSuporte(120).ok, false))
  it('allowlist constante = 15|30|60', () => {
    assert.deepEqual([...ADMIN_SUPPORT_DURACOES_MINUTOS], [15, 30, 60])
  })
})

// =============================================================================
// UNIT — ciclo de vida
// =============================================================================
describe('ADMIN.4.2.3b UNIT — lifecycle', () => {
  it('sem contexto → inactive', () => {
    assert.equal(sessaoSuporteEstaAtiva({}), false)
  })

  it('ativa válida → active', () => {
    const inicio = new Date().toISOString()
    const expira = calcularExpiraEmIso(inicio, 30)
    assert.equal(
      sessaoSuporteEstaAtiva({
        encerrado_em: null,
        revogado_em: null,
        expira_em: expira,
      }),
      true,
    )
  })

  it('expirada → inactive', () => {
    assert.equal(
      sessaoSuporteEstaAtiva({
        encerrado_em: null,
        revogado_em: null,
        expira_em: new Date(Date.now() - 1000).toISOString(),
      }),
      false,
    )
  })

  it('encerrada → inactive', () => {
    assert.equal(
      sessaoSuporteEstaAtiva({
        encerrado_em: new Date().toISOString(),
        revogado_em: null,
        expira_em: new Date(Date.now() + 3_600_000).toISOString(),
      }),
      false,
    )
  })

  it('revogada → inactive', () => {
    assert.equal(
      sessaoSuporteEstaAtiva({
        encerrado_em: null,
        revogado_em: new Date().toISOString(),
        expira_em: new Date(Date.now() + 3_600_000).toISOString(),
      }),
      false,
    )
  })
})

// =============================================================================
// UNIT — ownership
// =============================================================================
describe('ADMIN.4.2.3b UNIT — ownership', () => {
  it('Master A session + Master B JWT → rejeitado', () => {
    assert.equal(ownershipSuporteOk(ADMIN_1, ADMIN_2), false)
  })

  it('mesmo Master → ok', () => {
    assert.equal(ownershipSuporteOk(ADMIN_1, ADMIN_1), true)
  })

  it('cookie sozinho sem match de admin → não autoriza', () => {
    assert.equal(ownershipSuporteOk('', ADMIN_1), false)
  })
})

describe('ADMIN.4.2.3b SOURCE — ownership nas rotas', () => {
  it('status e encerrar comparam admin_user_id com JWT', () => {
    const status = readFileSync(join(root, 'app/api/admin/suporte/status/route.ts'), 'utf8')
    const encerrar = readFileSync(join(root, 'app/api/admin/suporte/encerrar/route.ts'), 'utf8')
    const server = readFileSync(join(root, 'lib/admin-support-server.ts'), 'utf8')
    assert.ok(status.includes('row.admin_user_id !== user.id'))
    assert.ok(server.includes('row.admin_user_id !== opts.adminUserId'))
    assert.ok(status.includes('requireMasterAdminFromRequest'))
    assert.ok(encerrar.includes('requireMasterAdminFromRequest'))
    assert.ok(status.includes('ADMIN_SUPPORT_CONTEXTO_INVALIDO') || status.includes('Contexto de suporte inválido'))
  })
})

// =============================================================================
// UNIT + SOURCE — Master guard
// =============================================================================
describe('ADMIN.4.2.3b UNIT — Master guard (lista e-mail)', () => {
  it('perfis.role=admin sozinho NÃO basta (lista vazia / outro e-mail)', () => {
    assert.equal(isPerfilRoleAdmin({ role: 'admin' }), true)
    assert.equal(emailNaListaMaster('role-only@x.com', 'master@connect.test'), false)
  })

  it('Master por ADMIN_EMAILS → aceita', () => {
    const lista = listaMasterDeEnv('a@t.com,master@t.com', '')
    assert.equal(emailNaListaMaster('master@t.com', lista), true)
  })

  it('Master por CONNECT_ADMIN_EMAILS quando ADMIN_EMAILS vazio → aceita', () => {
    const lista = listaMasterDeEnv('', 'm@connect.test')
    assert.equal(emailNaListaMaster('m@connect.test', lista), true)
  })

  it('e-mail normalizado trim/lowercase', () => {
    assert.equal(emailNaListaMaster('  Master@T.COM  ', 'master@t.com'), true)
  })

  it('e-mail fora da lista → rejeita', () => {
    assert.equal(emailNaListaMaster('user@x.com', 'master@t.com'), false)
  })
})

describe('ADMIN.4.2.3b SOURCE — Master guard / Bearer', () => {
  it('requireMasterAdminFromRequest: JWT + isAdminMasterServer; sem role/perfis', () => {
    const api = readFileSync(join(root, 'lib/api-auth.ts'), 'utf8')
    const marker = 'export async function requireMasterAdminFromRequest'
    assert.ok(api.includes(marker))
    const fn = api.slice(api.indexOf(marker))
    assert.ok(fn.includes('getUserFromRequest'))
    assert.ok(fn.includes('isAdminMasterServer'))
    assert.equal(fn.includes('isUsuarioAdminServer'), false)
    assert.equal(fn.includes('perfis'), false)
    assert.ok(fn.includes('trim().toLowerCase()') || fn.includes(".trim().toLowerCase()"))
  })

  it('getUserFromRequest exige Bearer; e-mail vem do user Auth (não do body)', () => {
    const api = readFileSync(join(root, 'lib/api-auth.ts'), 'utf8')
    assert.ok(api.includes('getBearerToken'))
    assert.ok(api.includes("startsWith('bearer ')"))
    assert.ok(api.includes('Sessão ausente.'))
    assert.ok(api.includes('Sessão inválida.'))
    assert.ok(api.includes('auth.getUser(token)'))
    const iniciar = readFileSync(join(root, 'app/api/admin/suporte/iniciar/route.ts'), 'utf8')
    assert.ok(iniciar.includes('user.email'))
    assert.equal(iniciar.includes('body.email'), false)
    assert.equal(iniciar.includes('body.admin_email'), false)
  })

  it('access-server lê ADMIN_EMAILS || CONNECT_ADMIN_EMAILS', () => {
    const src = readFileSync(join(root, 'lib/access-server.ts'), 'utf8')
    assert.ok(src.includes('ADMIN_EMAILS'))
    assert.ok(src.includes('CONNECT_ADMIN_EMAILS'))
  })
})

// =============================================================================
// SOURCE — terceiro via endpoint / modo / encerrar
// =============================================================================
describe('ADMIN.4.2.3b SOURCE — terceiro / modo / encerrar', () => {
  it('iniciar resolve elegibilidade no server (terceiro impossível via request manual)', () => {
    const iniciar = readFileSync(join(root, 'app/api/admin/suporte/iniciar/route.ts'), 'utf8')
    const server = readFileSync(join(root, 'lib/admin-support-server.ts'), 'utf8')
    assert.ok(iniciar.includes('criarSessaoSuporte'))
    assert.ok(server.includes('resolverElegibilidadeSuporteDoBanco'))
    assert.ok(server.includes('validarElegibilidadeModoSuporte'))
    assert.equal(iniciar.includes('origem'), false) // não aceita origem do body
  })

  it('modo=full do client ignorado; servidor força read_only', () => {
    const iniciar = readFileSync(join(root, 'app/api/admin/suporte/iniciar/route.ts'), 'utf8')
    assert.ok(iniciar.includes('void body.modo'))
    assert.ok(iniciar.includes('ADMIN_SUPPORT_MODO_FASE'))
    assert.equal(ADMIN_SUPPORT_MODO_FASE, 'read_only')
    assert.equal(ADMIN_SUPPORT_UI_ENABLED, false)
  })

  it('encerrar: ownership, Auth intacta, sem signOut / sessoes_ativas / perfis write', () => {
    const encerrar = readFileSync(join(root, 'app/api/admin/suporte/encerrar/route.ts'), 'utf8')
    const server = readFileSync(join(root, 'lib/admin-support-server.ts'), 'utf8')
    assert.ok(encerrar.includes('auth_admin_intacta'))
    assert.ok(encerrar.includes('limparCookieSuporte'))
    assert.equal(encerrar.includes('.signOut('), false)
    assert.equal(encerrar.includes('auth.signOut'), false)
    assert.equal(server.includes("from('sessoes_ativas')"), false)
    assert.equal(server.includes("from('perfis').update"), false)
    assert.equal(server.includes("from('auth.users')"), false)
    assert.ok(server.includes('ADMIN_SUPPORT_CONTEXTO_INVALIDO') || server.includes('não pertence'))
  })
})

// =============================================================================
// UNIT — concorrência (4.2.2 preservada)
// =============================================================================
describe('ADMIN.4.2.3b UNIT — concorrência (preservada 4.2.2)', () => {
  it('duas tentativas mesmo admin: primeira ok, segunda conflito', () => {
    const r = simularDuasTentativasIniciar({ adminUserId: ADMIN_1, sessoesAntes: [] })
    assert.equal(r.primeira, 'ok')
    assert.equal(r.segunda, 'conflito')
  })

  it('sessão já ativa → ambas conflitam', () => {
    const agora = Date.now()
    const r = simularDuasTentativasIniciar({
      adminUserId: ADMIN_1,
      agoraMs: agora,
      sessoesAntes: [
        {
          id: 'ativa',
          admin_user_id: ADMIN_1,
          encerrado_em: null,
          revogado_em: null,
          expira_em: new Date(agora + 600_000).toISOString(),
        },
      ],
    })
    assert.equal(r.primeira, 'conflito')
    assert.equal(r.segunda, 'conflito')
  })

  it('expirada não bloqueia; marcada antes da nova', () => {
    const agora = Date.now()
    const r = resolverConflitoSessoesAtivas({
      adminUserId: ADMIN_1,
      agoraMs: agora,
      sessoes: [
        {
          id: 'exp',
          admin_user_id: ADMIN_1,
          encerrado_em: null,
          revogado_em: null,
          expira_em: new Date(agora - 1000).toISOString(),
        },
      ],
    })
    assert.deepEqual(r.expiradasParaMarcar, ['exp'])
    assert.deepEqual(r.ativas, [])
    const sim = simularDuasTentativasIniciar({
      adminUserId: ADMIN_1,
      agoraMs: agora,
      sessoesAntes: [
        {
          id: 'exp',
          admin_user_id: ADMIN_1,
          encerrado_em: null,
          revogado_em: null,
          expira_em: new Date(agora - 1000).toISOString(),
        },
      ],
    })
    assert.equal(sim.primeira, 'ok')
    assert.equal(sim.segunda, 'conflito')
  })

  it('admins diferentes não conflitam entre si', () => {
    const agora = Date.now()
    const sessoes = [
      {
        id: 'a1',
        admin_user_id: ADMIN_1,
        encerrado_em: null as string | null,
        revogado_em: null as string | null,
        expira_em: new Date(agora + 600_000).toISOString(),
      },
    ]
    assert.deepEqual(
      resolverConflitoSessoesAtivas({ adminUserId: ADMIN_2, agoraMs: agora, sessoes }).ativas,
      [],
    )
    assert.equal(
      simularDuasTentativasIniciar({ adminUserId: ADMIN_2, agoraMs: agora, sessoesAntes: sessoes })
        .primeira,
      'ok',
    )
  })
})

// =============================================================================
// SQL / SOURCE contracts 4.2.2 preservados + regressão anti-sharing
// =============================================================================
describe('ADMIN.4.2.3b SQL/SOURCE CONTRACT — RPC / verify / rollback', () => {
  it('RPC + advisory lock + unique parcial + evento expirada idempotente', () => {
    const sql = readFileSync(join(root, 'docs/admin-support-sessions.sql'), 'utf8')
    assert.ok(sql.includes('admin_support_iniciar_sessao'))
    assert.ok(sql.includes('pg_advisory_xact_lock'))
    assert.ok(sql.includes('admin_support_sessions_uma_aberta_por_admin_uidx'))
    assert.ok(sql.includes('admin_support_events_expirada_unica_uidx'))
    assert.ok(sql.includes('security definer'))
    assert.ok(sql.includes('search_path = public'))
    assert.ok(sql.includes('revoke all on function'))
    assert.ok(sql.includes('grant execute') && sql.includes('service_role'))
    assert.ok(sql.includes('force row level security'))
    assert.ok(sql.includes('admin_support_marcar_expiradas_admin'))
  })

  it('verify cobre hash, RPC, privileges, unique', () => {
    const v = readFileSync(join(root, 'docs/admin-support-sessions-verify.sql'), 'utf8')
    assert.ok(v.includes('context_token_hash'))
    assert.ok(v.includes('context_token bruto'))
    assert.ok(v.includes('admin_support_iniciar_sessao'))
    assert.ok(v.includes('pg_advisory_xact_lock'))
    assert.ok(v.includes('uma_aberta_por_admin'))
    assert.ok(v.includes('READ-ONLY') || v.includes('100% READ-ONLY'))
    assert.equal(/\binsert\s+into\b/i.test(v), false)
    assert.equal(/\bdelete\s+from\b/i.test(v), false)
    assert.equal(/\btruncate\s+table\b/i.test(v), false)
  })

  it('rollback remove funções e tabelas na ordem sem DROP CASCADE', () => {
    const r = readFileSync(join(root, 'docs/admin-support-sessions-rollback.sql'), 'utf8')
    assert.ok(r.includes('drop function if exists public.admin_support_iniciar_sessao'))
    const idxEvents = r.indexOf('drop table if exists public.admin_support_events')
    const idxSessions = r.indexOf('drop table if exists public.admin_support_sessions')
    assert.ok(idxEvents > 0 && idxSessions > idxEvents)
    assert.equal(/\bdrop\s+.*\bcascade\b/i.test(r), false)
  })

  it('iniciar usa RPC; sem SELECT-then-INSERT legado', () => {
    const server = readFileSync(join(root, 'lib/admin-support-server.ts'), 'utf8')
    assert.ok(server.includes('EXCLUSIVAMENTE via RPC') || server.includes('rpc('))
    assert.equal(server.includes('buscarSessaoAtivaDoAdmin'), false)
  })

  it('módulos suporte sem escrita em anti-sharing / Auth signOut', () => {
    for (const f of [
      'lib/admin-support.ts',
      'lib/admin-support-server.ts',
      'app/api/admin/suporte/iniciar/route.ts',
      'app/api/admin/suporte/status/route.ts',
      'app/api/admin/suporte/encerrar/route.ts',
    ]) {
      const src = readFileSync(join(root, f), 'utf8')
      assert.equal(src.includes("from('sessoes_ativas')"), false, f)
      assert.equal(src.includes('sessao-server'), false, f)
      assert.equal(src.includes('.signOut('), false, f)
      assert.equal(src.includes('auth.signOut'), false, f)
    }
  })
})

/*
 * INTEGRATION RUNTIME: NÃO EXECUTADA.
 * docs/admin-support-concurrency-manual.sql — não seguro para execução
 * automática no banco compartilhado (depende de FKs reais).
 */
