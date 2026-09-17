import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deveChamarCreateUserAuth,
  deveGerarSenhaTemporaria,
  deveLimparAuthRecemCriado,
  montarConviteClienteAdmin,
  resolverCriarAcesso,
} from '../lib/admin-criar-acesso.ts'

describe('ADMIN.1C/2 — criar_acesso helpers', () => {
  it('1) flag ausente → true por compatibilidade', () => {
    assert.equal(resolverCriarAcesso(undefined), true)
    assert.equal(resolverCriarAcesso(null), true)
    assert.equal(resolverCriarAcesso(''), true)
    assert.equal(deveChamarCreateUserAuth(resolverCriarAcesso(undefined)), true)
  })

  it('2) true → createUser permitido (sem origem)', () => {
    assert.equal(resolverCriarAcesso(true), true)
    assert.equal(deveChamarCreateUserAuth(true), true)
    assert.equal(deveGerarSenhaTemporaria(true), true)
  })

  it('3) false → createUser proibido', () => {
    assert.equal(resolverCriarAcesso(false), false)
    assert.equal(deveChamarCreateUserAuth(false), false)
    assert.equal(deveGerarSenhaTemporaria(false), false)
  })

  it('4) string "false" → sem Auth', () => {
    assert.equal(resolverCriarAcesso('false'), false)
  })

  it('5) cleanup Auth recém-criado vs pré-existente', () => {
    assert.equal(
      deveLimparAuthRecemCriado({ authRecemCriadoNestaRequest: true, falhaPosterior: true }),
      true,
    )
    assert.equal(
      deveLimparAuthRecemCriado({ authRecemCriadoNestaRequest: false, falhaPosterior: true }),
      false,
    )
  })

  it('6) fluxo Connect compatível (convite com senha)', () => {
    const texto = montarConviteClienteAdmin({
      mode: 'created',
      nomeSaudacao: 'Cliente',
      email: 'c@test.com',
      sistemaCliente: 'Connect Sistema',
      valorPlano: 99,
      vencimento: '2026-10-01',
      accessLink: 'https://app.example/login',
      senhaInicial: 'Connect@abc123',
    })
    assert.match(texto, /Senha provisória: Connect@abc123/)
  })
})
