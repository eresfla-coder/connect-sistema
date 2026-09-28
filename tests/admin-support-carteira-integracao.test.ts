/**
 * ADMIN.4.4.2 — integração do Modo Suporte à carteira Admin (UI pura + contratos de source).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ADMIN_SUPPORT_ENCERRAR_PATH,
  ADMIN_SUPPORT_INICIAR_PATH,
  ADMIN_SUPPORT_MODULOS_DISPONIVEIS,
  ADMIN_SUPPORT_ORCAMENTOS_GATEWAY_PATH,
  ADMIN_SUPPORT_STATUS_PATH,
  ADMIN_SUPPORT_UI_DURACAO_DEFAULT,
  ADMIN_SUPPORT_UI_DURACOES,
  AVISO_SUPORTE_BLOQUEADO,
  AVISO_SUPORTE_VENCIDO,
  TEXTO_MODULOS_GRADUAIS_SUPORTE,
  contextoSuporteDeResposta,
  deveLimparContextoSuportePorHttp,
  interpretarRespostaStatusSuporte,
  isAdminSupportUiEnabledFromValues,
  montarPayloadIniciarSuporte,
  motivoSuporteUiValido,
  payloadIniciarTemCamposProibidos,
  situacaoComercialSuporte,
  vinculoSuporteDoCliente,
} from '../lib/admin-support-ui.ts'
import {
  LABEL_ENTRAR_MODO_SUPORTE,
  menuAcaoDisabled,
  menuTemAcao,
  resolverAcoesMenuCarteira,
} from '../lib/admin-menu-acoes.ts'
import { ADMIN_SUPPORT_UI_ENABLED } from '../lib/admin-support.ts'

const root = join(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const modal = read('components/admin/AdminModoSuporteModal.tsx')
const banner = read('components/admin/AdminModoSuporteBanner.tsx')
const page = read('app/admin/page.tsx')
const uiLib = read('lib/admin-support-ui.ts')
const menuLib = read('lib/admin-menu-acoes.ts')

const connectOk = {
  vinculo_id: 'vin-connect',
  nome: 'Connect Sistema',
  origem: 'connect',
  status: 'ativo',
  acesso_connect: true,
  auth_user_id: 'au-1',
  perfil_id: 'pf-1',
}

const terceiro = {
  vinculo_id: 'vin-infostart',
  nome: 'INFOSTART',
  origem: 'terceiro',
  status: 'ativo',
  acesso_connect: false,
  auth_user_id: null,
  perfil_id: null,
}

function menuSuporte(vinculos: unknown[], extra: Record<string, unknown> = {}) {
  return resolverAcoesMenuCarteira({
    origem: 'connect',
    statusVinculo: 'ativo',
    acessoConnect: true,
    perfilId: 'pf-1',
    authUserId: 'au-1',
    vinculosSuporte: vinculos as never,
    suporteMasterPermitido: true,
    ...extra,
  })
}

const respostaIniciar = {
  ok: true,
  support_session_id: 'ss-1',
  modo: 'read_only',
  motivo: 'Atendimento sobre orçamentos',
  iniciado_em: '2026-09-27T12:00:00.000Z',
  expira_em: '2026-09-27T12:15:00.000Z',
  cliente: { id: 'ac-bira', nome: 'BIRA MOVEIS' },
  sistema: { vinculo_id: 'vin-connect', nome: 'Connect Sistema' },
}

describe('ADMIN.4.4.2 menu — elegibilidade (1–6)', () => {
  it('1) Master recebe ação para vínculo Connect elegível', () => {
    const itens = menuSuporte([connectOk])
    assert.equal(menuTemAcao(itens, 'modo_suporte'), true)
    assert.equal(itens.find((i) => i.id === 'modo_suporte')?.label, LABEL_ENTRAR_MODO_SUPORTE)
    assert.equal(LABEL_ENTRAR_MODO_SUPORTE, 'Entrar em modo suporte')
    assert.equal(menuAcaoDisabled(itens, 'modo_suporte'), false)
  })

  it('2) terceiro (CLIENTE TESTE / INFOSTART) não recebe ação', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      vinculosSuporte: [terceiro],
      suporteMasterPermitido: true,
    })
    assert.equal(menuTemAcao(itens, 'modo_suporte'), false)
    assert.equal(vinculoSuporteDoCliente({ sistemasResumo: [terceiro] }), null)
  })

  it('3) seleciona vínculo Connect mesmo que não seja [0]', () => {
    const cliente = { sistemasResumo: [terceiro, connectOk] }
    assert.equal(vinculoSuporteDoCliente(cliente)?.vinculo_id, 'vin-connect')
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      vinculosSuporte: cliente.sistemasResumo,
      suporteMasterPermitido: true,
    })
    assert.equal(menuTemAcao(itens, 'modo_suporte'), true)
    assert.ok(page.includes('vinculoSuporteDoCliente(suporteModalCliente)'))
    assert.ok(page.includes('vinculosSuporte: cliente.sistemasResumo || null'))
  })

  it('4) sem acesso_connect não mostra', () => {
    assert.equal(menuTemAcao(menuSuporte([{ ...connectOk, acesso_connect: false }]), 'modo_suporte'), false)
  })

  it('5) sem auth_user_id não mostra', () => {
    assert.equal(menuTemAcao(menuSuporte([{ ...connectOk, auth_user_id: null }]), 'modo_suporte'), false)
  })

  it('6) sem perfil_id não mostra', () => {
    assert.equal(menuTemAcao(menuSuporte([{ ...connectOk, perfil_id: '' }]), 'modo_suporte'), false)
  })

  it('sem vinculo_id não mostra; sessão ativa desabilita', () => {
    assert.equal(menuTemAcao(menuSuporte([{ ...connectOk, vinculo_id: undefined }]), 'modo_suporte'), false)
    const itens = menuSuporte([connectOk], { sessaoSuporteAtiva: true })
    assert.equal(menuAcaoDisabled(itens, 'modo_suporte'), true)
  })
})

describe('ADMIN.4.4.2 modal — motivo / duração / payload (7–13)', () => {
  it('7) motivo < 10 rejeitado', () => {
    assert.equal(motivoSuporteUiValido('curto'), false)
    assert.equal(motivoSuporteUiValido('         a'), false)
    assert.equal(motivoSuporteUiValido('x'.repeat(501)), false)
    assert.throws(() =>
      montarPayloadIniciarSuporte({ admin_cliente_id: 'a', vinculo_id: 'v', motivo: 'curto', duracao_minutos: 15 }),
    )
    assert.ok(modal.includes('disabled={enviando || !motivoOk}'))
  })

  it('8) motivo válido aceito', () => {
    assert.equal(motivoSuporteUiValido('Atendimento sobre orçamentos'), true)
    assert.equal(motivoSuporteUiValido('x'.repeat(500)), true)
  })

  it('9) duração default = 15', () => {
    assert.equal(ADMIN_SUPPORT_UI_DURACAO_DEFAULT, 15)
    assert.ok(modal.includes('useState<number>(ADMIN_SUPPORT_UI_DURACAO_DEFAULT)'))
  })

  it('10) durações permitidas 15/30/60', () => {
    assert.deepEqual([...ADMIN_SUPPORT_UI_DURACOES], [15, 30, 60])
    assert.throws(() =>
      montarPayloadIniciarSuporte({
        admin_cliente_id: 'a',
        vinculo_id: 'v',
        motivo: 'Motivo válido de suporte',
        duracao_minutos: 45,
      }),
    )
    assert.ok(modal.includes('ADMIN_SUPPORT_UI_DURACOES.map'))
  })

  it('11) cliente não envia campo tenant', () => {
    const p = montarPayloadIniciarSuporte({
      admin_cliente_id: 'ac-1',
      vinculo_id: 'vin-1',
      motivo: 'Atendimento sobre orçamentos',
      duracao_minutos: 15,
    }) as unknown as Record<string, unknown>
    assert.equal(payloadIniciarTemCamposProibidos(p), false)
    for (const campo of ['auth_user_id', 'perfil_id', 'empresa_id', 'target_auth_user_id', 'user_id', 'modo']) {
      assert.equal(campo in p, false, campo)
    }
    for (const bad of ['auth_user_id', 'perfil_id', 'empresa_id', 'target_auth_user_id', 'user_id', "modo:"]) {
      assert.equal(modal.includes(bad), false, bad)
    }
    assert.ok(modal.includes('body: JSON.stringify(payload)'))
    assert.ok(modal.includes('montarPayloadIniciarSuporte({'))
  })

  it('12) payload exatamente 4 chaves', () => {
    const p = montarPayloadIniciarSuporte({
      admin_cliente_id: 'ac-1',
      vinculo_id: 'vin-1',
      motivo: 'Atendimento sobre orçamentos',
      duracao_minutos: 30,
    })
    assert.deepEqual(Object.keys(p).sort(), ['admin_cliente_id', 'duracao_minutos', 'motivo', 'vinculo_id'])
  })

  it('13) sessão recebida permanece read_only (outro modo é rejeitado)', () => {
    const ctx = contextoSuporteDeResposta(respostaIniciar)
    assert.equal(ctx?.modo, 'read_only')
    assert.equal(contextoSuporteDeResposta({ ...respostaIniciar, modo: 'write' }), null)
    assert.equal(contextoSuporteDeResposta({ ...respostaIniciar, modo: undefined }), null)
    assert.equal(contextoSuporteDeResposta({ ...respostaIniciar, support_session_id: null }), null)
    assert.ok(modal.includes('contextoSuporteDeResposta(body)'))
  })

  it('modal: textos, duplo submit bloqueado, sem opção de escrita', () => {
    assert.ok(modal.includes('MODO SUPORTE'))
    assert.ok(modal.includes('Somente leitura'))
    assert.ok(modal.includes('Cancelar'))
    assert.ok(modal.includes('Confirmar e iniciar'))
    assert.ok(modal.includes('if (enviandoRef.current || !motivoOk) return'))
    assert.equal(/escrita|write/i.test(modal.replace('(esperado somente leitura)', '')), false)
  })
})

describe('ADMIN.4.4.2 banner / situação comercial (14–17)', () => {
  it('14) banner mostra cliente correto', () => {
    const ctx = contextoSuporteDeResposta(respostaIniciar)
    assert.equal(ctx?.clienteNome, 'BIRA MOVEIS')
    assert.equal(ctx?.admin_cliente_id, 'ac-bira')
    assert.ok(banner.includes('{contexto.clienteNome}'))
    assert.ok(banner.includes('MODO SUPORTE ATIVO'))
    assert.ok(banner.includes('SOMENTE LEITURA'))
    assert.ok(banner.includes('Expira: {expira}'))
  })

  it('15) banner mostra sistema correto', () => {
    const ctx = contextoSuporteDeResposta(respostaIniciar)
    assert.equal(ctx?.sistemaNome, 'Connect Sistema')
    assert.equal(ctx?.vinculo_id, 'vin-connect')
    assert.ok(banner.includes('{contexto.sistemaNome}'))
  })

  it('16) bloqueado continua elegível e mostra aviso', () => {
    const itens = menuSuporte([{ ...connectOk, status: 'bloqueado' }], { statusVinculo: 'bloqueado' })
    assert.equal(menuTemAcao(itens, 'modo_suporte'), true)
    const s = situacaoComercialSuporte({ status: 'bloqueado', vencimento: '2026-12-31', hojeIso: '2026-09-27' })
    assert.equal(s.bloqueado, true)
    assert.equal(s.rotulo, 'Bloqueado')
    assert.deepEqual(s.avisos, [AVISO_SUPORTE_BLOQUEADO])
    assert.equal(
      AVISO_SUPORTE_BLOQUEADO,
      'Este cliente está bloqueado comercialmente. O Modo Suporte não altera o bloqueio.',
    )
    assert.ok(modal.includes('situacao.avisos.map'))
    assert.ok(banner.includes('avisos.map'))
  })

  it('17) vencido continua elegível e mostra aviso', () => {
    const itens = menuSuporte([{ ...connectOk, data_vencimento: '2026-01-10' }])
    assert.equal(menuTemAcao(itens, 'modo_suporte'), true)
    const s = situacaoComercialSuporte({ status: 'ativo', vencimento: '2026-09-26', hojeIso: '2026-09-27' })
    assert.equal(s.vencido, true)
    assert.equal(s.rotulo, 'Vencido')
    assert.deepEqual(s.avisos, [AVISO_SUPORTE_VENCIDO])
    assert.equal(AVISO_SUPORTE_VENCIDO, 'Este cliente está vencido. O Modo Suporte não altera o vencimento.')
    assert.equal(
      situacaoComercialSuporte({ status: 'ativo', vencimento: '2026-09-26', permanente: true, hojeIso: '2026-09-27' })
        .vencido,
      false,
    )
    assert.equal(situacaoComercialSuporte({ status: 'ativo', vencimento: '2026-09-27', hojeIso: '2026-09-27' }).vencido, false)
    assert.equal(situacaoComercialSuporte({ status: 'ativo', hojeIso: '2026-09-27' }).rotulo, 'Ativo')
  })
})

describe('ADMIN.4.4.2 status / encerrar / expiração (18–21)', () => {
  it('18) refresh via status recupera sessão', () => {
    const r = interpretarRespostaStatusSuporte(200, { ...respostaIniciar, active: true })
    assert.equal(r.tipo, 'ativo')
    assert.equal(r.masterPermitido, true)
    if (r.tipo === 'ativo') assert.equal(r.contexto.support_session_id, 'ss-1')
    assert.equal(interpretarRespostaStatusSuporte(200, { ok: true, active: false }).tipo, 'inativo')
    assert.ok(page.includes('void verificarStatusSuporte(session.access_token)'))
    assert.ok(page.includes('fetch(ADMIN_SUPPORT_STATUS_PATH'))
    assert.ok(page.includes('setSuporteContexto(resultado.tipo === \'ativo\' ? resultado.contexto : null)'))
    assert.equal(banner.includes('setInterval'), false)
    assert.equal(modal.includes('setInterval'), false)
  })

  it('19) MASTER_ONLY esconde ação', () => {
    const r = interpretarRespostaStatusSuporte(403, { ok: false, code: 'ADMIN_SUPPORT_MASTER_ONLY' })
    assert.equal(r.tipo, 'master_only')
    assert.equal(r.masterPermitido, false)
    assert.equal(menuTemAcao(menuSuporte([connectOk], { suporteMasterPermitido: false }), 'modo_suporte'), false)
    assert.equal(menuTemAcao(menuSuporte([connectOk], { suporteMasterPermitido: undefined }), 'modo_suporte'), false)
    assert.equal(interpretarRespostaStatusSuporte(500, {}).masterPermitido, false)
    assert.equal(interpretarRespostaStatusSuporte(403, { code: 'ADMIN_SUPPORT_CONTEXTO_INVALIDO' }).tipo, 'inativo')
    assert.ok(page.includes('setSuporteMasterPermitido(resultado.masterPermitido)'))
    assert.ok(page.includes('suporteMasterPermitido,'))
  })

  it('20) encerrar limpa contexto local', () => {
    assert.ok(banner.includes('fetch(ADMIN_SUPPORT_ENCERRAR_PATH'))
    const idx = banner.indexOf('async function encerrarSuporte')
    const corpo = banner.slice(idx, idx + 1600)
    assert.ok(corpo.includes('limparOrcamentosMemoria()'))
    assert.ok(corpo.includes('setAreaAberta(false)'))
    assert.ok(corpo.includes('onEncerrado()'))
    const idxPage = page.indexOf('const limparContextoSuporte = useCallback')
    assert.ok(page.slice(idxPage, idxPage + 200).includes('setSuporteContexto(null)'))
    assert.ok(page.includes('{suporteContexto ? ('))
  })

  it('21) expiração limpa contexto local (sem recriar sessão)', () => {
    assert.equal(deveLimparContextoSuportePorHttp(401), true)
    assert.equal(deveLimparContextoSuportePorHttp(403), true)
    assert.equal(deveLimparContextoSuportePorHttp(500), false)
    assert.equal(deveLimparContextoSuportePorHttp(null), false)
    const expirada = interpretarRespostaStatusSuporte(200, { ok: true, active: false, reason: 'expirada' })
    assert.equal(expirada.tipo, 'inativo')
    assert.ok(banner.includes('if (deveLimparContextoSuportePorHttp(res.status)) {'))
    assert.ok(banner.includes('onSessaoInvalida()'))
    assert.ok(banner.includes('onExpiracaoLocal()'))
    const idx = page.indexOf('const aoSuporteInvalido = useCallback')
    assert.ok(page.slice(idx, idx + 300).includes('limparContextoSuporte()'))
    assert.equal(banner.includes(ADMIN_SUPPORT_INICIAR_PATH), false)
    assert.equal(banner.includes('ADMIN_SUPPORT_INICIAR_PATH'), false)
    assert.equal(page.includes('ADMIN_SUPPORT_INICIAR_PATH'), false)
  })
})

describe('ADMIN.4.4.2 área de suporte (22–24)', () => {
  it('22) área lista apenas Orçamentos como disponível', () => {
    assert.deepEqual(
      ADMIN_SUPPORT_MODULOS_DISPONIVEIS.map((m) => m.id),
      ['orcamentos'],
    )
    assert.equal(ADMIN_SUPPORT_MODULOS_DISPONIVEIS[0]?.label, 'Orçamentos — Resumo')
    assert.equal(TEXTO_MODULOS_GRADUAIS_SUPORTE, 'Outros módulos serão disponibilizados gradualmente.')
    assert.ok(banner.includes('Disponível atualmente'))
    assert.ok(banner.includes('SUPORTE — {contexto.clienteNome}'))
    assert.ok(banner.includes('ADMIN_SUPPORT_MODULOS_DISPONIVEIS.map'))
    assert.ok(banner.includes('Abrir área de suporte'))
    assert.ok(banner.includes('Encerrar suporte'))
  })

  it('23) módulos não implementados não aparecem como disponíveis', () => {
    for (const bad of [
      'Clientes',
      'Ordens',
      'Recibos',
      'Contratos',
      'Produtos',
      'Configurações',
      'Financeiro',
      'Manutenções',
      'CRM',
      'Agenda',
    ]) {
      assert.equal(banner.includes(bad), false, bad)
      assert.equal(ADMIN_SUPPORT_MODULOS_DISPONIVEIS.some((m) => m.label.includes(bad)), false, bad)
    }
  })

  it('24) nenhum botão de escrita na área de suporte', () => {
    for (const bad of ['Editar', 'Excluir', 'Criar', 'Salvar', 'Aprovar', 'Converter', 'Gerar OS', 'Compartilhar', 'PDF']) {
      assert.equal(banner.includes(bad), false, bad)
    }
    assert.equal((banner.match(/method: 'POST'/g) || []).length, 1)
    for (const m of ['PATCH', 'PUT', 'DELETE']) assert.equal(banner.includes(`method: '${m}'`), false, m)
    assert.ok(banner.includes("method: 'GET'"))
  })
})

describe('ADMIN.4.4.2 segurança (25–30)', () => {
  const novos = { modal, banner, page, uiLib, menuLib }

  it('25) sem signInWithPassword / signInWithOtp / generateLink / setSession', () => {
    for (const [nome, src] of Object.entries(novos)) {
      for (const bad of ['signInWithPassword', 'signInWithOtp', 'generateLink', 'setSession', 'magiclink']) {
        assert.equal(src.includes(bad), false, `${nome}:${bad}`)
      }
    }
    assert.equal(modal.includes('signOut'), false)
    assert.equal(banner.includes('signOut'), false)
  })

  it('26) sem sessoes_ativas nos arquivos novos', () => {
    for (const [nome, src] of Object.entries(novos)) {
      assert.equal(src.includes('sessoes_ativas'), false, nome)
    }
  })

  it('27) nenhum endpoint operacional normal é chamado', () => {
    for (const src of [modal, banner]) {
      for (const bad of [
        '/api/orcamentos',
        "from('",
        '/api/clientes',
        'ordens-servico',
        '/api/admin/carteira',
        '/api/public-docs',
        'service_role',
        'SUPABASE_SERVICE',
        'localStorage',
        'sessionStorage',
        "router.push('/orcamentos",
        'window.location',
      ]) {
        assert.equal(src.includes(bad), false, bad)
      }
    }
    assert.equal(page.includes("router.push('/orcamentos"), false)
  })

  it('28) UI usa apenas /api/admin/suporte/* para contexto delegado', () => {
    for (const path of [
      ADMIN_SUPPORT_STATUS_PATH,
      ADMIN_SUPPORT_INICIAR_PATH,
      ADMIN_SUPPORT_ENCERRAR_PATH,
      ADMIN_SUPPORT_ORCAMENTOS_GATEWAY_PATH,
    ]) {
      assert.ok(path.startsWith('/api/admin/suporte/'), path)
    }
    assert.equal(modal.includes("'/api/"), false)
    assert.equal(banner.includes("'/api/"), false)
    assert.equal((modal.match(/fetch\(/g) || []).length, 1)
    assert.ok(modal.includes('fetch(ADMIN_SUPPORT_INICIAR_PATH'))
    assert.equal((banner.match(/fetch\(/g) || []).length, 2)
    assert.ok(banner.includes('fetch(montarUrlGatewayOrcamentosSuporte('))
    assert.ok(banner.includes('fetch(ADMIN_SUPPORT_ENCERRAR_PATH'))
    for (const src of [modal, banner]) {
      assert.ok(src.includes('Authorization: `Bearer ${token}`'))
      assert.ok(src.includes("credentials: 'include'"))
    }
  })

  it('29) painel antigo não é renderizado', () => {
    assert.equal(page.includes('<AdminModoSuportePanel'), false)
    assert.equal(page.includes("from '@/components/admin/AdminModoSuportePanel'"), false)
    assert.ok(page.includes('<AdminModoSuporteBanner'))
    assert.ok(page.includes('<AdminModoSuporteModal'))
  })

  it('30) flags antigas não habilitadas', () => {
    assert.equal(ADMIN_SUPPORT_UI_ENABLED, false)
    assert.equal(isAdminSupportUiEnabledFromValues(undefined, undefined), false)
    for (const src of [modal, banner, page]) {
      assert.equal(src.includes('NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED'), false)
      assert.equal(src.includes('NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV'), false)
      assert.equal(src.includes('isAdminSupportUiEnabled'), false)
    }
  })
})
