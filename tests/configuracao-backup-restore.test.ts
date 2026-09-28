import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  CONFIG_EMPRESA_CAMPOS_RESTAURAVEIS,
  configuracaoBackupParaRestoreRow,
} from '../lib/configuracao-backup-restore.ts'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const AGORA = '2026-09-28T12:00:00.000Z'

/** Lógica antiga de backup-server.ts (spread do backup depois do user_id autenticado). */
function rowLogicaAntiga(cfg: Record<string, unknown>, userId: string) {
  return { user_id: userId, ...cfg, updated_at: AGORA }
}

describe('SECURITY.1 HIGH #1 — restore de configuracoes_empresa', () => {
  it('backup malicioso com user_id de outro tenant: upsert usa o usuário autenticado', () => {
    const cfg = { user_id: UUID_B, nome_empresa: 'Empresa A' }
    const row = configuracaoBackupParaRestoreRow(cfg, UUID_A, AGORA)
    assert.ok(row)
    assert.equal(row.user_id, UUID_A)
    assert.equal(row.nome_empresa, 'Empresa A')
  })

  it('a lógica antiga deixava o backup vencer (prova de regressão)', () => {
    const antiga = rowLogicaAntiga({ user_id: UUID_B, nome_empresa: 'X' }, UUID_A)
    assert.equal(antiga.user_id, UUID_B)
    const nova = configuracaoBackupParaRestoreRow({ user_id: UUID_B, nome_empresa: 'X' }, UUID_A, AGORA)
    assert.equal(nova?.user_id, UUID_A)
  })

  it('TENANT A não restaura config como TENANT B (nenhum campo de ownership passa)', () => {
    const cfg = {
      user_id: UUID_B,
      owner_user_id: UUID_B,
      auth_user_id: UUID_B,
      perfil_id: UUID_B,
      empresa_id: UUID_B,
      tenant_id: UUID_B,
      id: 999,
      nome_empresa: 'Empresa A',
    }
    const row = configuracaoBackupParaRestoreRow(cfg, UUID_A, AGORA)
    assert.ok(row)
    for (const campo of ['owner_user_id', 'auth_user_id', 'perfil_id', 'empresa_id', 'tenant_id', 'id']) {
      assert.equal(campo in row, false, `campo de ownership vazou: ${campo}`)
    }
    assert.equal(JSON.stringify(row).includes(UUID_B), false)
  })

  it('updated_at vem do servidor, não do backup', () => {
    const row = configuracaoBackupParaRestoreRow(
      { nome_empresa: 'A', updated_at: '1999-01-01T00:00:00.000Z' },
      UUID_A,
      AGORA,
    )
    assert.equal(row?.updated_at, AGORA)
  })

  it('só colunas da allowlist são restauradas', () => {
    const cfg: Record<string, unknown> = { coluna_inexistente: 'x', nomeEmpresa: 'camelCase' }
    for (const campo of CONFIG_EMPRESA_CAMPOS_RESTAURAVEIS) cfg[campo] = `v-${campo}`
    const row = configuracaoBackupParaRestoreRow(cfg, UUID_A, AGORA)
    assert.ok(row)
    assert.deepEqual(
      Object.keys(row).sort(),
      [...CONFIG_EMPRESA_CAMPOS_RESTAURAVEIS, 'user_id', 'updated_at'].sort(),
    )
  })

  it('backup legítimo (formato exportado) é preservado integralmente', () => {
    const exportado = {
      user_id: UUID_A,
      nome_empresa: 'Empresa A',
      tipo_pessoa: 'PJ',
      cnpj: '00.000.000/0001-00',
      telefone: '84999990000',
      logo_url: 'https://exemplo/logo.png',
      cor_primaria: '#16a34a',
      cor_secundaria: '#dcfce7',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const row = configuracaoBackupParaRestoreRow(exportado, UUID_A, AGORA)
    assert.deepEqual(row, {
      nome_empresa: 'Empresa A',
      tipo_pessoa: 'PJ',
      cnpj: '00.000.000/0001-00',
      telefone: '84999990000',
      logo_url: 'https://exemplo/logo.png',
      cor_primaria: '#16a34a',
      cor_secundaria: '#dcfce7',
      user_id: UUID_A,
      updated_at: AGORA,
    })
  })

  it('sem campo restaurável, sem usuário autorizado ou formato inválido → null (sem upsert)', () => {
    assert.equal(configuracaoBackupParaRestoreRow({ user_id: UUID_B }, UUID_A, AGORA), null)
    assert.equal(configuracaoBackupParaRestoreRow({ nome_empresa: 'A' }, '', AGORA), null)
    assert.equal(configuracaoBackupParaRestoreRow(null, UUID_A, AGORA), null)
    assert.equal(configuracaoBackupParaRestoreRow([{ nome_empresa: 'A' }], UUID_A, AGORA), null)
    assert.equal(configuracaoBackupParaRestoreRow('x', UUID_A, AGORA), null)
  })

  it('backup-server.ts usa o helper e não faz spread do backup no upsert', () => {
    const src = readFileSync(new URL('../lib/backup-server.ts', import.meta.url), 'utf8')
    assert.ok(src.includes('configuracaoBackupParaRestoreRow(d.configuracoes, userId'))
    assert.equal(/user_id:\s*userId,\s*\.\.\.cfg/.test(src), false)
    assert.equal(/\.\.\.\s*cfg\b/.test(src), false)
  })
})
