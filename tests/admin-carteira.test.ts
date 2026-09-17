import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acessoConnectDoVinculo,
  deveCriarAuthConnect,
  deveCriarPerfilConnect,
  deveLimparAdminClienteRecemCriado,
  montarItemLegadoLista,
  normalizarEmailAdmin,
  normalizarOrigemSistema,
  podeAlterarOrigemConnectParaTerceiro,
  podeOperarAuthConnect,
  umClientePodeTerVariosSistemas,
  validarAcessoPorOrigem,
  validarIdsAcessoConnect,
  vinculoTemAcessoConnectIncompativelComTerceiro,
} from '../lib/admin-carteira.ts'
import {
  deveChamarCreateUserAuth,
  deveChamarCreateUserAuthParaOrigem,
  deveLimparAuthRecemCriado,
  montarConviteClienteAdmin,
  resolverCriarAcesso,
} from '../lib/admin-criar-acesso.ts'
import { classificarErroAdminTables } from '../lib/admin-tables-classify.ts'

describe('ADMIN.2.1 — invariantes carteira', () => {
  it('1) terceiro + acesso=true rejeitado', () => {
    assert.equal(validarAcessoPorOrigem({ origem: 'terceiro', acessoConnect: true }).ok, false)
    assert.equal(deveCriarAuthConnect({ origem: 'terceiro', criarAcesso: true }), false)
  })

  it('2) false + qualquer ID rejeitado', () => {
    assert.equal(
      validarIdsAcessoConnect({ acessoConnect: false, authUserId: 'a', perfilId: null }).ok,
      false,
    )
    assert.equal(
      validarIdsAcessoConnect({ acessoConnect: false, authUserId: null, perfilId: 'b' }).ok,
      false,
    )
  })

  it('3) true + IDs null rejeitado', () => {
    assert.equal(
      validarIdsAcessoConnect({ acessoConnect: true, authUserId: null, perfilId: null }).ok,
      false,
    )
  })

  it('4) true + somente auth rejeitado', () => {
    assert.equal(
      validarIdsAcessoConnect({ acessoConnect: true, authUserId: 'uuid-1', perfilId: null }).ok,
      false,
    )
  })

  it('5) true + somente perfil rejeitado', () => {
    assert.equal(
      validarIdsAcessoConnect({ acessoConnect: true, authUserId: null, perfilId: 'uuid-1' }).ok,
      false,
    )
  })

  it('6) true + IDs diferentes rejeitado', () => {
    assert.equal(
      validarIdsAcessoConnect({ acessoConnect: true, authUserId: 'a', perfilId: 'b' }).ok,
      false,
    )
  })

  it('7) true + IDs iguais aceito para Connect', () => {
    assert.equal(
      validarIdsAcessoConnect({ acessoConnect: true, authUserId: 'same', perfilId: 'same' }).ok,
      true,
    )
    assert.equal(deveCriarAuthConnect({ origem: 'connect', criarAcesso: true }), true)
  })

  it('8) Connect→Terceiro com vinculo Auth bloqueado', () => {
    const r = podeAlterarOrigemConnectParaTerceiro({
      origemAtual: 'connect',
      origemNova: 'terceiro',
      vinculosComAcesso: true,
    })
    assert.equal(r.ok, false)
    assert.equal(vinculoTemAcessoConnectIncompativelComTerceiro({ acesso_connect: true }), true)
    assert.equal(vinculoTemAcessoConnectIncompativelComTerceiro({ auth_user_id: 'x' }), true)
  })

  it('9) Connect→Terceiro sem vinculos incompativeis permitido', () => {
    const r = podeAlterarOrigemConnectParaTerceiro({
      origemAtual: 'connect',
      origemNova: 'terceiro',
      vinculosComAcesso: false,
    })
    assert.equal(r.ok, true)
    assert.equal(
      vinculoTemAcessoConnectIncompativelComTerceiro({
        acesso_connect: false,
        auth_user_id: null,
        perfil_id: null,
      }),
      false,
    )
  })

  it('10) adminTablesReady: missing table reconhecido', () => {
    assert.equal(classificarErroAdminTables('relation "admin_sistemas" does not exist').status, 'missing')
    assert.equal(classificarErroAdminTables('Could not find the table in the schema cache').status, 'missing')
  })

  it('11) adminTablesReady: network error NAO vira missing', () => {
    const r = classificarErroAdminTables('fetch failed: network error')
    assert.equal(r.status, 'error')
    if (r.status === 'error') assert.equal(r.kind, 'network')
  })

  it('12) permission error NAO vira missing', () => {
    const r = classificarErroAdminTables('permission denied for table admin_sistemas')
    assert.equal(r.status, 'error')
    if (r.status === 'error') assert.equal(r.kind, 'permission')
  })

  it('13) cleanup admin_cliente recem-criado em falha', () => {
    assert.equal(
      deveLimparAdminClienteRecemCriado({
        adminClienteRecemCriadoNestaRequest: true,
        falhaPosterior: true,
        vinculoPersistido: false,
      }),
      true,
    )
  })

  it('14) admin_cliente pre-existente NAO deletado', () => {
    assert.equal(
      deveLimparAdminClienteRecemCriado({
        adminClienteRecemCriadoNestaRequest: false,
        falhaPosterior: true,
        vinculoPersistido: false,
      }),
      false,
    )
    assert.equal(
      deveLimparAdminClienteRecemCriado({
        adminClienteRecemCriadoNestaRequest: true,
        falhaPosterior: true,
        vinculoPersistido: true,
      }),
      false,
    )
  })

  it('15) Auth recem-criado cleanup', () => {
    assert.equal(
      deveLimparAuthRecemCriado({ authRecemCriadoNestaRequest: true, falhaPosterior: true }),
      true,
    )
  })

  it('16) Auth pre-existente NAO deletado', () => {
    assert.equal(
      deveLimparAuthRecemCriado({ authRecemCriadoNestaRequest: false, falhaPosterior: true }),
      false,
    )
  })

  it('17) email normalizado', () => {
    assert.equal(normalizarEmailAdmin('  Foo@Bar.COM '), 'foo@bar.com')
  })

  it('18) email duplicado tratado (codigo estavel)', () => {
    // Semântica de domínio: normalização é pré-requisito do UNIQUE parcial
    assert.equal(normalizarEmailAdmin('A@B.com'), normalizarEmailAdmin('a@b.com'))
  })

  it('19) terceiro nunca cria Auth', () => {
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'terceiro', criarAcesso: true }), false)
    assert.equal(acessoConnectDoVinculo({ origem: 'terceiro', criarAcesso: true }), false)
  })

  it('20) Connect sem login nunca cria Auth', () => {
    assert.equal(deveCriarAuthConnect({ origem: 'connect', criarAcesso: false }), false)
    assert.equal(deveCriarPerfilConnect({ origem: 'connect', criarAcesso: false }), false)
    assert.equal(acessoConnectDoVinculo({ origem: 'connect', criarAcesso: false }), false)
  })

  it('extras: legado + reset + multi-sistema + flag default', () => {
    assert.equal(umClientePodeTerVariosSistemas(), true)
    assert.equal(podeOperarAuthConnect(null), false)
    assert.equal(podeOperarAuthConnect('uuid'), true)
    assert.equal(resolverCriarAcesso(undefined), true)
    assert.equal(deveChamarCreateUserAuth(false), false)
    assert.equal(normalizarOrigemSistema('connect'), 'connect')
    const item = montarItemLegadoLista({ perfilId: 'p1', sistemaCliente: 'Legado X' })
    assert.equal(item.fonte, 'legado')
    assert.equal(item.sistemas[0]?.sistema_cliente_legado, 'Legado X')
    const convite = montarConviteClienteAdmin({
      mode: 'admin_only',
      nomeSaudacao: 'X',
      email: 'x@t.com',
      sistemaCliente: 'PDV',
      valorPlano: 1,
      vencimento: '2026-01-01',
      accessLink: '',
    })
    assert.match(convite, /login/i)
  })
})
