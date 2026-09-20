import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MSG_OPERACAO_NAO_CONFIRMADA,
  MSG_REFRESH_APOS_SUCESSO,
  MSG_SUCESSO_BLOQUEAR,
  MSG_SUCESSO_DESBLOQUEAR,
  MSG_SUCESSO_MARCAR_PAGO,
  MSG_SUCESSO_RENOVAR,
  criarLockAcaoComercial,
  deveFazerRetryEscritaComercial,
  executarFluxoAcaoComercialSemRetry,
  feedbackAposPatchComercial,
  interpretarExcecaoPatchComercial,
  interpretarRespostaPatchComercial,
  resolverFeedbackAcaoComercialCompleta,
} from '../lib/admin-acao-comercial-ux.ts'
import {
  aplicarRenovacaoComercial,
  deveBloquearReentradaAcaoComercial,
} from '../lib/admin-ciclo-comercial.ts'
import {
  menuTemAcao,
  resolverAcoesMenuCarteira,
} from '../lib/admin-menu-acoes.ts'

describe('ADMIN.3.14 — robustez ações comerciais', () => {
  it('1) renovar sucesso', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'renovar',
      resultadoPatch: { kind: 'ok' },
      refreshOk: true,
    })
    assert.equal(fb.tipo, 'sucesso')
    assert.equal(fb.mensagem, MSG_SUCESSO_RENOVAR)
    assert.equal(fb.escritaConfirmada, true)
  })

  it('2) renovar HTTP erro', () => {
    const resultado = interpretarRespostaPatchComercial({
      ok: false,
      status: 500,
      errorMessage: 'Erro interno',
    })
    const fb = feedbackAposPatchComercial({ acao: 'renovar', resultado })
    assert.equal(fb.tipo, 'erro')
    assert.equal(fb.escritaConfirmada, false)
    assert.equal(fb.mensagem, 'Erro interno')
    assert.match(fb.mensagem, /Erro interno/)
    assert.equal(fb.mensagem.includes('Falha ao renovar'), false)
  })

  it('3) renovar Failed to fetch', () => {
    const resultado = interpretarExcecaoPatchComercial(new TypeError('Failed to fetch'))
    assert.equal(resultado.kind, 'sem_resposta')
    const fb = feedbackAposPatchComercial({ acao: 'renovar', resultado })
    assert.equal(fb.mensagem, MSG_OPERACAO_NAO_CONFIRMADA)
    assert.equal(fb.escritaConfirmada, false)
    assert.equal(fb.tentarRefresh, false)
  })

  it('4) renovar PATCH 200 + refresh falha', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'renovar',
      resultadoPatch: { kind: 'ok' },
      refreshOk: false,
    })
    assert.equal(fb.tipo, 'aviso')
    assert.equal(fb.mensagem, MSG_REFRESH_APOS_SUCESSO)
    assert.equal(fb.escritaConfirmada, true)
    assert.equal(fb.mensagem.includes('Falha ao renovar'), false)
  })

  it('5) Failed to fetch não faz retry do PATCH', async () => {
    assert.equal(deveFazerRetryEscritaComercial(), false)
    const fluxo = await executarFluxoAcaoComercialSemRetry({
      escrever: async () => {
        throw new TypeError('Failed to fetch')
      },
      refresh: async () => {
        throw new Error('não deve chamar refresh')
      },
    })
    assert.equal(fluxo.escritaChamadas, 1)
    assert.equal(fluxo.resultadoPatch.kind, 'sem_resposta')
    assert.equal(fluxo.refreshOk, false)
  })

  it('6) segundo clique bloqueado', () => {
    const lock = criarLockAcaoComercial()
    assert.equal(lock.iniciar('c1'), true)
    assert.equal(lock.iniciar('c1'), false)
    assert.equal(
      deveBloquearReentradaAcaoComercial({ processandoId: lock.getProcessandoId(), clienteId: 'c1' }),
      true,
    )
  })

  it('7) finally libera lock', () => {
    const lock = criarLockAcaoComercial()
    assert.equal(lock.iniciar('c1'), true)
    try {
      throw new Error('simula falha')
    } catch {
      // ignore
    } finally {
      lock.finalizar()
    }
    assert.equal(lock.getProcessandoId(), null)
    assert.equal(lock.iniciar('c1'), true)
  })

  it('8) bloquear sucesso', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'bloquear',
      resultadoPatch: { kind: 'ok' },
      refreshOk: true,
    })
    assert.equal(fb.mensagem, MSG_SUCESSO_BLOQUEAR)
    assert.equal(fb.tipo, 'sucesso')
  })

  it('9) bloquear erro', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'bloquear',
      resultadoPatch: { kind: 'http_error', status: 400, mensagem: 'Vínculo inválido' },
    })
    assert.equal(fb.tipo, 'erro')
    assert.equal(fb.mensagem, 'Vínculo inválido')
    assert.equal(fb.escritaConfirmada, false)
  })

  it('10) desbloquear sucesso', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'desbloquear',
      resultadoPatch: { kind: 'ok' },
      refreshOk: true,
    })
    assert.equal(fb.mensagem, MSG_SUCESSO_DESBLOQUEAR)
  })

  it('11) desbloquear erro', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'desbloquear',
      resultadoPatch: interpretarExcecaoPatchComercial(new TypeError('Failed to fetch')),
    })
    assert.equal(fb.mensagem, MSG_OPERACAO_NAO_CONFIRMADA)
  })

  it('12) marcar pago continua funcionando', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'marcar_pago',
      resultadoPatch: { kind: 'ok' },
      refreshOk: true,
    })
    assert.equal(fb.mensagem, MSG_SUCESSO_MARCAR_PAGO)
    assert.equal(fb.tipo, 'sucesso')
  })

  it('13) marcar pago 200 + refresh falha não aparece como falha do pagamento', () => {
    const fb = resolverFeedbackAcaoComercialCompleta({
      acao: 'marcar_pago',
      resultadoPatch: { kind: 'ok' },
      refreshOk: false,
    })
    assert.equal(fb.tipo, 'aviso')
    assert.equal(fb.mensagem, MSG_REFRESH_APOS_SUCESSO)
    assert.equal(fb.escritaConfirmada, true)
    assert.equal(/falha ao marcar/i.test(fb.mensagem), false)
  })

  it('14) status_pagamento/ultimo_pagamento preservados ao renovar', () => {
    const estado = {
      data_vencimento: '2026-09-25',
      status: 'ativo' as const,
      status_pagamento: 'em_dia',
      ultimo_pagamento: '2026-09-19',
      dia_vencimento: 25,
    }
    const updates = aplicarRenovacaoComercial({
      dataVencimentoAtual: estado.data_vencimento,
      diaVencimento: estado.dia_vencimento,
      hoje: '2026-09-20',
    })
    assert.equal(updates.data_vencimento, '2026-10-25')
    assert.equal(updates.status, 'ativo')
    assert.equal('status_pagamento' in updates, false)
    assert.equal('ultimo_pagamento' in updates, false)

    const apos = { ...estado, ...updates }
    assert.equal(apos.status_pagamento, 'em_dia')
    assert.equal(apos.ultimo_pagamento, '2026-09-19')
  })

  it('15) matriz ADMIN.3.11 continua igual (terceiro ativo + em_dia)', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      statusPagamento: 'em_dia',
    })
    assert.deepEqual(
      itens.map((i) => i.label),
      [
        'Editar cliente',
        'Já está em dia',
        'Renovar ciclo',
        'Bloquear',
        'Excluir cliente da carteira',
      ],
    )
    assert.equal(itens.find((i) => i.id === 'marcar_pago')!.disabled, true)
  })

  it('16) terceiro continua sem ações Connect', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      statusPagamento: 'em_dia',
    })
    assert.equal(menuTemAcao(itens, 'reset_senha'), false)
    assert.equal(menuTemAcao(itens, 'backups'), false)
    assert.equal(menuTemAcao(itens, 'oferta_upgrade'), false)
    assert.equal(
      itens.some((i) => /Resetar senha|Backups|Oferta upgrade|Sem login/i.test(i.label)),
      false,
    )
  })

  it('processando mostra Processando… em renovar/bloquear', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      statusPagamento: 'pendente',
      processando: true,
    })
    assert.equal(itens.find((i) => i.id === 'renovar')!.label, 'Processando…')
    assert.equal(itens.find((i) => i.id === 'bloquear')!.label, 'Processando…')
    assert.equal(itens.find((i) => i.id === 'marcar_pago')!.label, 'Processando…')
  })
})
