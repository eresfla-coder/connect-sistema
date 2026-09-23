/**
 * ADMIN.4.2.7 — UI mínima Modo Suporte (feature flag, elegibilidade, payload, source).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  isAdminSupportUiEnabled,
  isVinculoElegivelSuporteUi,
  isVinculoTerceiroSuporteUi,
  listarCandidatosSuporteUi,
  montarPayloadIniciarSuporte,
  payloadIniciarTemCamposProibidos,
  ADMIN_SUPPORT_UI_DURACOES,
} from '../lib/admin-support-ui.ts'
import { ADMIN_SUPPORT_UI_ENABLED } from '../lib/admin-support.ts'

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('ADMIN.4.2.8a feature gate fail-closed', () => {
  it('A) {} => false', () => {
    assert.equal(isAdminSupportUiEnabled({}), false)
  })

  it('B) ENABLED=true + ENV ausente => false', () => {
    assert.equal(
      isAdminSupportUiEnabled({ NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'true' }),
      false,
    )
  })

  it('C) ENABLED ausente + ENV=preview => false', () => {
    assert.equal(
      isAdminSupportUiEnabled({ NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: 'preview' }),
      false,
    )
  })

  it('D) ENABLED=true + ENV=preview => true', () => {
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'true',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: 'preview',
      }),
      true,
    )
  })

  it('E) ENABLED=true + ENV=production => false', () => {
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'true',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: 'production',
      }),
      false,
    )
  })

  it('F) ENABLED=true + ENV="" => false', () => {
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'true',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: '',
      }),
      false,
    )
  })

  it('G) ENABLED=false + ENV=preview => false', () => {
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'false',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: 'preview',
      }),
      false,
    )
  })

  it('H) ENABLED=true + ENV=development => false', () => {
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'true',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: 'development',
      }),
      false,
    )
  })

  it('I) whitespace/case: " true " + " PREVIEW " => true', () => {
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: ' true ',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: ' PREVIEW ',
      }),
      true,
    )
  })

  it('J) valor desconhecido => false', () => {
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'true',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: 'staging',
      }),
      false,
    )
    assert.equal(
      isAdminSupportUiEnabled({
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED: 'yes',
        NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV: 'preview',
      }),
      false,
    )
  })

  it('não usa env de runtime do host no gate; compile-time default permanece false', () => {
    const uiLib = read('lib/admin-support-ui.ts')
    assert.equal(/\bVERCEL_ENV\b/.test(uiLib), false)
    assert.equal(uiLib.includes('NEXT_PUBLIC_VERCEL_ENV'), false)
    assert.ok(uiLib.includes('NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV'))
    assert.equal(ADMIN_SUPPORT_UI_ENABLED, false)
  })
})

describe('ADMIN.4.2.7 elegibilidade lista', () => {
  const connectOk = {
    vinculo_id: 'v1',
    nome: 'Connect Sistema',
    origem: 'connect',
    status: 'ativo',
    acesso_connect: true,
    auth_user_id: 'au-1',
    perfil_id: 'pf-1',
  }

  it('C) terceiro sem botão iniciar (não elegível)', () => {
    const terceiro = { ...connectOk, origem: 'terceiro', acesso_connect: false }
    assert.equal(isVinculoTerceiroSuporteUi(terceiro), true)
    assert.equal(isVinculoElegivelSuporteUi(terceiro), false)
    const lista = listarCandidatosSuporteUi([
      {
        admin_cliente_id: 'c1',
        nome_empresa: 'Revenda X',
        sistemasResumo: [terceiro],
      },
    ])
    assert.equal(lista[0]?.elegivel, false)
    assert.equal(lista[0]?.terceiro, true)
  })

  it('D) Connect elegível permite iniciar', () => {
    assert.equal(isVinculoElegivelSuporteUi(connectOk), true)
    const lista = listarCandidatosSuporteUi([
      {
        admin_cliente_id: 'c-bira',
        nome_empresa: 'BIRA MOVEIS',
        sistemasResumo: [connectOk],
      },
    ])
    assert.equal(lista.length, 1)
    assert.equal(lista[0]?.elegivel, true)
    assert.equal(lista[0]?.admin_cliente_id, 'c-bira')
  })
})

describe('ADMIN.4.2.7 payload / duração / motivo', () => {
  it('E/F) motivo obrigatório; duração 15/30/60', () => {
    assert.deepEqual([...ADMIN_SUPPORT_UI_DURACOES], [15, 30, 60])
    assert.throws(() =>
      montarPayloadIniciarSuporte({
        admin_cliente_id: 'a',
        vinculo_id: 'v',
        motivo: 'curto',
        duracao_minutos: 15,
      }),
    )
    assert.throws(() =>
      montarPayloadIniciarSuporte({
        admin_cliente_id: 'a',
        vinculo_id: 'v',
        motivo: 'Motivo válido com tamanho ok',
        duracao_minutos: 45,
      }),
    )
    const p = montarPayloadIniciarSuporte({
      admin_cliente_id: 'a',
      vinculo_id: 'v',
      motivo: 'Validação controlada do Modo Suporte',
      duracao_minutos: 15,
    })
    assert.equal(p.duracao_minutos, 15)
  })

  it('G/H) payload não contém target IDs sensíveis nem modo', () => {
    const p = montarPayloadIniciarSuporte({
      admin_cliente_id: 'ac-1',
      vinculo_id: 'vin-1',
      motivo: 'Smoke controlado ADMIN.4.2.7 lifecycle',
      duracao_minutos: 30,
    }) as unknown as Record<string, unknown>
    assert.equal(payloadIniciarTemCamposProibidos(p), false)
    assert.deepEqual(Object.keys(p).sort(), [
      'admin_cliente_id',
      'duracao_minutos',
      'motivo',
      'vinculo_id',
    ])
  })
})

describe('ADMIN.4.2.7 source contracts UI', () => {
  const panel = read('components/admin/AdminModoSuportePanel.tsx')
  const page = read('app/admin/page.tsx')
  const uiLib = read('lib/admin-support-ui.ts')

  it('I) token não aparece em log/UI source', () => {
    assert.equal(panel.includes('console.log(token'), false)
    assert.equal(panel.includes('console.log(session'), false)
    assert.equal(panel.includes('localStorage'), false)
    assert.ok(panel.includes('Bearer ${token}'))
  })

  it('J) iniciar possui lock', () => {
    assert.ok(panel.includes('setLocked(true)'))
    assert.ok(panel.includes('disabled={locked'))
  })

  it('K) status active restaura card', () => {
    assert.ok(panel.includes('/api/admin/suporte/status'))
    assert.ok(panel.includes('admin-modo-suporte-ativo'))
    assert.ok(panel.includes("setFase('ativo')"))
  })

  it('L) encerrar possui confirmação', () => {
    assert.ok(panel.includes('Encerrar a sessão de suporte atual?'))
    assert.ok(panel.includes('confirmEncerrar'))
  })

  it('M) encerrar não chama signOut', () => {
    assert.equal(panel.includes('signOut'), false)
    assert.equal(panel.includes('auth.signOut'), false)
  })

  it('N) nenhuma referência a sessoes_ativas', () => {
    assert.equal(panel.includes('sessoes_ativas'), false)
    assert.equal(uiLib.includes('sessoes_ativas'), false)
  })

  it('O) nenhuma chamada a dados operacionais', () => {
    for (const bad of [
      '/api/orcamentos',
      'from(\'orcamentos\')',
      'ordens-servico',
      'produtos',
      'from(\'clientes\')',
    ]) {
      assert.equal(panel.includes(bad), false, bad)
    }
    assert.ok(panel.includes('/api/admin/suporte/iniciar'))
    assert.ok(panel.includes('/api/admin/suporte/encerrar'))
  })

  it('wire no /admin + Auth V1 getSession', () => {
    assert.ok(page.includes('AdminModoSuportePanel'))
    assert.ok(panel.includes("from '@/lib/supabase-browser'"))
    assert.ok(panel.includes('supabase.auth.getSession()'))
    assert.ok(uiLib.includes('NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED'))
    assert.ok(uiLib.includes('NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV'))
    assert.equal(/\bVERCEL_ENV\b/.test(uiLib), false)
    assert.equal(panel.includes('esm.sh'), false)
    assert.equal(panel.includes('service_role'), false)
  })
})
