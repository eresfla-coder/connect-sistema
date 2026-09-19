import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deveChamarCreateUserAuth,
  deveGerarSenhaTemporaria,
  deveLimparAuthRecemCriado,
  montarConviteClienteAdmin,
  montarMensagemWhatsappCadastroCliente,
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
      origem: 'connect',
      criarAcesso: true,
    })
    assert.match(texto, /Senha provisória: Connect@abc123/)
    assert.match(texto, /acesso ao Connect Sistema/i)
  })
})

describe('ADMIN.3.5 — mensagem WhatsApp cadastro', () => {
  it('1) terceiro não contém login no Connect', () => {
    const texto = montarMensagemWhatsappCadastroCliente({
      origem: 'terceiro',
      criarAcesso: false,
      nomeSaudacao: 'Empresa X',
      sistemaCliente: 'INFOSTART',
      valorPlano: 49.9,
      diaVencimento: 25,
      fase: 'rascunho',
    })
    assert.doesNotMatch(texto, /login no Connect/i)
    assert.doesNotMatch(texto, /\bConnect\b/)
  })

  it('2) terceiro não contém /assinatura', () => {
    const texto = montarMensagemWhatsappCadastroCliente({
      origem: 'terceiro',
      criarAcesso: false,
      nomeSaudacao: 'Empresa X',
      sistemaCliente: 'INFOSTART',
      valorPlano: 49.9,
      diaVencimento: 25,
    })
    assert.doesNotMatch(texto, /\/assinatura/i)
    assert.doesNotMatch(texto, /assinatura/i)
  })

  it('3) terceiro não contém Mercado Pago Connect', () => {
    const texto = montarMensagemWhatsappCadastroCliente({
      origem: 'terceiro',
      criarAcesso: false,
      nomeSaudacao: 'Empresa X',
      sistemaCliente: 'INFOSTART',
      valorPlano: 49.9,
      diaVencimento: 25,
    })
    assert.doesNotMatch(texto, /Mercado Pago/i)
    assert.doesNotMatch(texto, /Mercado\s*Pago\s*Connect/i)
  })

  it('4) terceiro mostra nome do sistema', () => {
    const texto = montarMensagemWhatsappCadastroCliente({
      origem: 'terceiro',
      criarAcesso: false,
      nomeSaudacao: 'Empresa X',
      sistemaCliente: 'INFOSTART',
      valorPlano: 49.9,
      diaVencimento: 25,
    })
    assert.match(texto, /Sistema: INFOSTART/)
  })

  it('5) terceiro mostra valor', () => {
    const texto = montarMensagemWhatsappCadastroCliente({
      origem: 'terceiro',
      criarAcesso: false,
      nomeSaudacao: 'Empresa X',
      sistemaCliente: 'INFOSTART',
      valorPlano: 49.9,
      diaVencimento: 25,
    })
    assert.match(texto, /Valor mensal:.*49,90/)
  })

  it('6) terceiro mostra dia de vencimento', () => {
    const texto = montarMensagemWhatsappCadastroCliente({
      origem: 'terceiro',
      criarAcesso: false,
      nomeSaudacao: 'Empresa X',
      sistemaCliente: 'INFOSTART',
      valorPlano: 49.9,
      diaVencimento: 25,
    })
    assert.match(texto, /Dia de vencimento: 25/)
  })

  it('7) pré-salvamento não contém "foi registrado"', () => {
    for (const origem of ['terceiro', 'connect'] as const) {
      const texto = montarMensagemWhatsappCadastroCliente({
        origem,
        criarAcesso: origem === 'connect',
        nomeSaudacao: 'Cliente',
        sistemaCliente: origem === 'terceiro' ? 'INFOSTART' : 'Connect Sistema',
        valorPlano: 49.9,
        diaVencimento: 10,
        fase: 'rascunho',
      })
      assert.doesNotMatch(texto, /foi registrado/i)
      assert.doesNotMatch(texto, /cadastro realizado/i)
      assert.doesNotMatch(texto, /cadastro concluído/i)
      assert.match(texto, /resumo do seu cadastro/i)
    }
  })

  it('8) Connect com acesso pode usar texto específico Connect', () => {
    const rascunho = montarMensagemWhatsappCadastroCliente({
      origem: 'connect',
      criarAcesso: true,
      nomeSaudacao: 'Cliente',
      sistemaCliente: 'Connect Sistema',
      valorPlano: 99,
      diaVencimento: 10,
      email: 'c@test.com',
      fase: 'rascunho',
    })
    assert.match(rascunho, /Connect/)
    assert.match(rascunho, /E-mail de login: c@test.com/)
    assert.doesNotMatch(rascunho, /foi registrado/i)

    const confirmado = montarConviteClienteAdmin({
      mode: 'created',
      nomeSaudacao: 'Cliente',
      email: 'c@test.com',
      sistemaCliente: 'Connect Sistema',
      valorPlano: 99,
      vencimento: '2026-10-01',
      accessLink: 'https://app.example/login',
      senhaInicial: 'Senha@123',
      origem: 'connect',
      criarAcesso: true,
      diaVencimento: 10,
    })
    assert.match(confirmado, /Senha provisória/)
    assert.match(confirmado, /acesso ao Connect Sistema/i)
  })

  it('9) Connect sem acesso recebe texto apropriado', () => {
    const texto = montarMensagemWhatsappCadastroCliente({
      origem: 'connect',
      criarAcesso: false,
      nomeSaudacao: 'Cliente',
      sistemaCliente: 'Connect Sistema',
      valorPlano: 99,
      diaVencimento: 15,
      fase: 'rascunho',
    })
    assert.match(texto, /cadastro comercial no Connect/i)
    assert.match(texto, /acesso de login ao sistema não está sendo criado/i)
    assert.doesNotMatch(texto, /foi registrado/i)
  })

  it('10) telefone vazio não causa erro na montagem', () => {
    assert.doesNotThrow(() => {
      montarMensagemWhatsappCadastroCliente({
        origem: 'terceiro',
        criarAcesso: false,
        nomeSaudacao: '',
        sistemaCliente: 'INFOSTART',
        valorPlano: '49,90',
        diaVencimento: null,
        fase: 'rascunho',
      })
    })
    const convite = montarConviteClienteAdmin({
      mode: 'admin_only',
      nomeSaudacao: 'X',
      email: 'x@t.com',
      sistemaCliente: 'INFOSTART',
      valorPlano: 49.9,
      vencimento: '2026-01-01',
      accessLink: '',
      origem: 'terceiro',
      criarAcesso: false,
      diaVencimento: 25,
    })
    assert.match(convite, /INFOSTART/)
    assert.doesNotMatch(convite, /Connect/)
    assert.doesNotMatch(convite, /foi registrado/i)
  })
})
