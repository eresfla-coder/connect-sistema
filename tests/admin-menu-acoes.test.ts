import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LABEL_EXCLUIR_CLIENTE_CARTEIRA,
  TEXTO_CONFIRMACAO_EXCLUIR_CARTEIRA,
  menuTemAcao,
  menuAcaoDisabled,
  resolverAcoesMenuCarteira,
} from '../lib/admin-menu-acoes.ts'

function labels(itens: ReturnType<typeof resolverAcoesMenuCarteira>) {
  return itens.map((i) => i.label)
}

describe('ADMIN.3.11 — matriz menu Ações carteira', () => {
  it('1) terceiro ativo + pendente', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      statusPagamento: 'pendente',
    })
    assert.equal(menuTemAcao(itens, 'editar'), true)
    assert.equal(menuTemAcao(itens, 'marcar_pago'), true)
    assert.equal(menuTemAcao(itens, 'renovar'), true)
    assert.equal(menuTemAcao(itens, 'bloquear'), true)
    assert.equal(menuTemAcao(itens, 'desbloquear'), false)
    assert.equal(menuTemAcao(itens, 'reset_senha'), false)
    assert.equal(menuTemAcao(itens, 'backups'), false)
    assert.equal(menuTemAcao(itens, 'oferta_upgrade'), false)
    assert.match(itens.find((i) => i.id === 'marcar_pago')!.label, /Marcar pago/i)
  })

  it('2) terceiro ativo + em_dia', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      statusPagamento: 'em_dia',
    })
    assert.equal(menuTemAcao(itens, 'marcar_pago'), true)
    assert.equal(menuAcaoDisabled(itens, 'marcar_pago'), true)
    assert.equal(itens.find((i) => i.id === 'marcar_pago')!.label, 'Já está em dia')
    assert.equal(menuTemAcao(itens, 'renovar'), true)
    assert.equal(menuTemAcao(itens, 'bloquear'), true)
    assert.equal(menuTemAcao(itens, 'desbloquear'), false)
    assert.deepEqual(
      labels(itens).filter((l) =>
        /Sem login|Resetar senha|Trial 7|Oferta upgrade|Backups|Desbloquear/i.test(l),
      ),
      [],
    )
  })

  it('3) terceiro bloqueado', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'bloqueado',
      statusPagamento: 'bloqueado',
    })
    assert.equal(menuTemAcao(itens, 'desbloquear'), true)
    assert.equal(menuTemAcao(itens, 'bloquear'), false)
    assert.equal(menuTemAcao(itens, 'marcar_pago'), false)
    assert.equal(menuTemAcao(itens, 'renovar'), false)
    assert.equal(menuTemAcao(itens, 'reset_senha'), false)
    assert.equal(menuTemAcao(itens, 'backups'), false)
    assert.equal(menuTemAcao(itens, 'oferta_upgrade'), false)
  })

  it('4) connect ativo + acesso', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'connect',
      statusVinculo: 'ativo',
      statusPagamento: 'pendente',
      acessoConnect: true,
      perfilId: 'p1',
      authUserId: 'p1',
      podeResetSenha: true,
    })
    assert.equal(menuTemAcao(itens, 'reset_senha'), true)
    assert.equal(menuTemAcao(itens, 'backups'), true)
    assert.equal(menuTemAcao(itens, 'oferta_upgrade'), true)
    assert.equal(menuTemAcao(itens, 'bloquear'), true)
    assert.equal(menuTemAcao(itens, 'desbloquear'), false)
    assert.equal(menuTemAcao(itens, 'renovar'), true)
  })

  it('5) connect ativo sem acesso', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'connect',
      statusVinculo: 'ativo',
      statusPagamento: 'pendente',
      acessoConnect: false,
    })
    assert.equal(menuTemAcao(itens, 'reset_senha'), false)
    assert.equal(menuTemAcao(itens, 'backups'), false)
    assert.equal(menuTemAcao(itens, 'oferta_upgrade'), true)
    assert.equal(menuTemAcao(itens, 'editar'), true)
    assert.equal(menuTemAcao(itens, 'marcar_pago'), true)
    assert.equal(menuTemAcao(itens, 'renovar'), true)
    assert.equal(menuTemAcao(itens, 'bloquear'), true)
    assert.equal(
      labels(itens).some((l) => /Sem login Connect/i.test(l)),
      false,
    )
  })

  it('6) connect bloqueado + acesso', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'connect',
      statusVinculo: 'bloqueado',
      statusPagamento: 'bloqueado',
      acessoConnect: true,
      perfilId: 'p1',
      authUserId: 'p1',
      podeResetSenha: true,
    })
    assert.equal(menuTemAcao(itens, 'desbloquear'), true)
    assert.equal(menuTemAcao(itens, 'bloquear'), false)
    assert.equal(menuTemAcao(itens, 'reset_senha'), true)
    assert.equal(menuTemAcao(itens, 'backups'), true)
    assert.equal(menuTemAcao(itens, 'marcar_pago'), false)
    assert.equal(menuTemAcao(itens, 'renovar'), false)
  })

  it('7) ativo nunca mostra desbloquear', () => {
    for (const origem of ['terceiro', 'connect'] as const) {
      const itens = resolverAcoesMenuCarteira({
        origem,
        statusVinculo: 'ativo',
        statusPagamento: 'pendente',
        acessoConnect: origem === 'connect',
        perfilId: origem === 'connect' ? 'x' : null,
        authUserId: origem === 'connect' ? 'x' : null,
      })
      assert.equal(menuTemAcao(itens, 'desbloquear'), false)
      assert.equal(menuTemAcao(itens, 'bloquear'), true)
    }
  })

  it('8) bloqueado nunca mostra bloquear', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'bloqueado',
    })
    assert.equal(menuTemAcao(itens, 'bloquear'), false)
    assert.equal(menuTemAcao(itens, 'desbloquear'), true)
  })

  it('9) terceiro nunca mostra reset senha', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      acessoConnect: true,
      perfilId: 'hack',
      podeResetSenha: true,
    })
    assert.equal(menuTemAcao(itens, 'reset_senha'), false)
  })

  it('10) terceiro nunca mostra backups', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
      acessoConnect: true,
      authUserId: 'u1',
    })
    assert.equal(menuTemAcao(itens, 'backups'), false)
  })

  it('11) terceiro nunca mostra oferta Connect', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
    })
    assert.equal(menuTemAcao(itens, 'oferta_upgrade'), false)
  })

  it('12) Trial 7 dias não aparece', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
    })
    assert.equal(
      labels(itens).some((l) => /Trial 7/i.test(l)),
      false,
    )
  })

  it('13) em_dia mostra Já está em dia disabled', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'connect',
      statusVinculo: 'ativo',
      statusPagamento: 'em_dia',
      acessoConnect: false,
    })
    const m = itens.find((i) => i.id === 'marcar_pago')!
    assert.equal(m.label, 'Já está em dia')
    assert.equal(m.disabled, true)
  })

  it('14) bloqueado não mostra marcar pago', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'bloqueado',
      statusPagamento: 'pendente',
    })
    assert.equal(menuTemAcao(itens, 'marcar_pago'), false)
  })

  it('15) bloqueado não mostra renovar', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'connect',
      statusVinculo: 'bloqueado',
      acessoConnect: true,
      perfilId: 'p',
    })
    assert.equal(menuTemAcao(itens, 'renovar'), false)
  })

  it('16) excluir usa label Excluir cliente da carteira', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'ativo',
    })
    const ex = itens.find((i) => i.id === 'excluir')!
    assert.equal(ex.label, LABEL_EXCLUIR_CLIENTE_CARTEIRA)
    assert.equal(ex.label, 'Excluir cliente da carteira')
  })

  it('17) confirmação informa que TODOS os sistemas serão removidos', () => {
    assert.match(TEXTO_CONFIRMACAO_EXCLUIR_CARTEIRA, /todos os sistemas vinculados/i)
  })

  it('18) confirmação informa que login Connect não é automaticamente excluído', () => {
    assert.match(TEXTO_CONFIRMACAO_EXCLUIR_CARTEIRA, /não exclui automaticamente o usuário\/login do Connect/i)
  })

  it('extra: trial ativo mostra bloquear e não desbloquear', () => {
    const itens = resolverAcoesMenuCarteira({
      origem: 'terceiro',
      statusVinculo: 'trial',
      statusPagamento: 'trial',
    })
    assert.equal(menuTemAcao(itens, 'bloquear'), true)
    assert.equal(menuTemAcao(itens, 'desbloquear'), false)
    assert.equal(menuTemAcao(itens, 'renovar'), false)
  })
})
