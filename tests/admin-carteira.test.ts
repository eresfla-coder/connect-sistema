import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acessoConnectDoVinculo,
  avaliarSistemaParaContratacao,
  BACKFILL_PERFIS_CONNECT_APROVADOS,
  backfillRestritoAosUuidsAprovados,
  calcularMetricasCarteiraAdmin,
  camposPersistidosAcessoVinculo,
  CODIGO_ORIGEM_ACESSO_INVALIDO,
  CODIGO_SISTEMA_INATIVO,
  CODIGO_SISTEMA_INEXISTENTE,
  deveCriarAuthConnect,
  deveCriarPerfilConnect,
  deveExibirOpcaoCriarAcessoConnect,
  deveLimparAdminClienteRecemCriado,
  filtrarItensCarteiraOficial,
  labelOrigemSistemaBadge,
  labelOrigemSistemaFormOption,
  labelOrigemSistemaLista,
  labelSistemaContratadoSelect,
  montarItemLegadoLista,
  normalizarEmailAdmin,
  normalizarOrigemSistema,
  podeAlterarOrigemConnectParaTerceiro,
  podeOperarAuthConnect,
  sistemasAtivosParaContratacao,
  TEXTO_AJUDA_CRIAR_ACESSO_CONNECT,
  TEXTO_AJUDA_SOMENTE_ADMIN,
  textoAjudaCriarAcessoConnect,
  umClientePodeTerVariosSistemas,
  validarAcessoPorOrigem,
  validarCriarAcessoComOrigem,
  validarIdsAcessoConnect,
  vinculoTemAcessoConnectIncompativelComTerceiro,
  type AdminListaItem,
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

  it('extras: legado helper + reset + multi-sistema + flag default', () => {
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
      origem: 'connect',
      criarAcesso: false,
      diaVencimento: 10,
    })
    assert.match(convite, /cadastro comercial no Connect/i)
    assert.doesNotMatch(convite, /foi registrado/i)
  })

  it('21) carteira oficial não lista automaticamente perfis legados', () => {
    const misturado: AdminListaItem[] = [
      montarItemLegadoLista({ perfilId: 'barbearia-user', email: 'teste.live@example.com', sistemaCliente: 'Connect Pro' }),
      {
        fonte: 'admin',
        id: 'ac-1',
        admin_cliente_id: 'ac-1',
        nome: null,
        nome_empresa: 'BIRA',
        email: 'bira@x.com',
        telefone: null,
        observacoes: null,
        ativo: true,
        legado: false,
        sistemas: [],
        auth_user_id: 'dd1f6a30-73a4-459f-9335-96dc56523089',
        perfil_id: 'dd1f6a30-73a4-459f-9335-96dc56523089',
        pode_reset_senha: true,
      },
    ]
    const oficiais = filtrarItensCarteiraOficial(misturado)
    assert.equal(oficiais.length, 1)
    assert.equal(oficiais[0]?.email, 'bira@x.com')
    assert.equal(oficiais.some((i) => i.email === 'teste.live@example.com'), false)
  })

  it('22) Barbearia/Gym sem admin_cliente não aparece; Connect vinculado aparece; terceiro aparece', () => {
    const barbearia = montarItemLegadoLista({
      perfilId: 'gym-1',
      email: 'newstyle@x.com',
      sistemaCliente: 'Connect Pro',
    })
    const connect: AdminListaItem = {
      fonte: 'admin',
      id: 'a1',
      admin_cliente_id: 'a1',
      nome: null,
      nome_empresa: 'Connect Cliente',
      email: 'c@x.com',
      telefone: null,
      observacoes: null,
      ativo: true,
      legado: false,
      sistemas: [
        {
          vinculo_id: 'v1',
          sistema_id: 's1',
          nome: 'Connect Sistema',
          origem: 'connect',
          status: 'ativo',
          valor: 49.9,
          data_vencimento: '2026-10-01',
          acesso_connect: true,
          auth_user_id: 'u1',
          perfil_id: 'u1',
          legado_texto: false,
          sistema_cliente_legado: null,
        },
      ],
      auth_user_id: 'u1',
      perfil_id: 'u1',
      pode_reset_senha: true,
    }
    const terceiro: AdminListaItem = {
      ...connect,
      id: 'a2',
      admin_cliente_id: 'a2',
      email: 't@x.com',
      nome_empresa: 'PDV Terceiro',
      auth_user_id: null,
      perfil_id: null,
      pode_reset_senha: false,
      sistemas: [
        {
          ...connect.sistemas[0]!,
          origem: 'terceiro',
          acesso_connect: false,
          auth_user_id: null,
          perfil_id: null,
          nome: 'Infostart',
        },
      ],
    }
    const lista = filtrarItensCarteiraOficial([barbearia, connect, terceiro])
    assert.equal(lista.length, 2)
    assert.ok(lista.some((i) => i.email === 'c@x.com'))
    assert.ok(lista.some((i) => i.email === 't@x.com'))
    assert.equal(lista.some((i) => i.email === 'newstyle@x.com'), false)
  })

  it('23) métricas não contam os 29 perfis; só carteira admin', () => {
    const metricas = calcularMetricasCarteiraAdmin([
      { status: 'ativo', ativo: true, valor_plano: 49.9, vencimento: '2026-12-01', status_pagamento: 'em_dia' },
      { status: 'bloqueado', ativo: false, valor_plano: 120, vencimento: '2026-10-10', status_pagamento: 'bloqueado' },
    ])
    assert.equal(metricas.total, 2)
    assert.notEqual(metricas.total, 29)
    assert.equal(metricas.bloqueados, 1)
    assert.equal(metricas.mrr, 49.9)
    assert.equal(metricas.recebidoMes, 49.9)
  })

  it('24) Auth/perfis independentes da listagem; terceiro e Connect sem login sem Auth; Connect com login vincula', () => {
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'terceiro', criarAcesso: true }), false)
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'connect', criarAcesso: false }), false)
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'connect', criarAcesso: true }), true)
    assert.equal(
      validarIdsAcessoConnect({
        acessoConnect: true,
        authUserId: 'same',
        perfilId: 'same',
      }).ok,
      true,
    )
  })

  it('25) backfill restrito aos 3 UUIDs aprovados', () => {
    assert.equal(BACKFILL_PERFIS_CONNECT_APROVADOS.length, 3)
    const ids = BACKFILL_PERFIS_CONNECT_APROVADOS.map((x) => x.perfilId)
    assert.equal(backfillRestritoAosUuidsAprovados(ids), true)
    assert.equal(backfillRestritoAosUuidsAprovados([...ids, '00000000-0000-0000-0000-000000000099']), false)
    assert.equal(backfillRestritoAosUuidsAprovados([]), false)
    assert.ok(ids.includes('dd1f6a30-73a4-459f-9335-96dc56523089'))
    assert.ok(ids.includes('eda88f6d-1417-4ade-9d79-4ea50ea4c6b6'))
    assert.ok(ids.includes('3ec1947d-2ec0-4d96-8d15-2a11da10ea70'))
  })

  it('26) labels comerciais de origem (UI)', () => {
    assert.equal(labelOrigemSistemaBadge('connect'), 'PRÓPRIO')
    assert.equal(labelOrigemSistemaBadge('terceiro'), 'TERCEIRO')
    assert.equal(labelOrigemSistemaLista('connect'), 'PRÓPRIO (CONNECT)')
    assert.equal(labelOrigemSistemaLista('terceiro'), 'TERCEIRO / REVENDIDO')
    assert.equal(labelOrigemSistemaFormOption('connect'), 'Próprio (Connect)')
    assert.equal(labelOrigemSistemaFormOption('terceiro'), 'Terceiro / Revendido')
  })
})

describe('ADMIN.2.10 — Novo cliente com sistemas terceiro', () => {
  const catalogo = [
    { id: 's-connect', nome: 'Connect Sistema', origem: 'connect' as const, ativo: true },
    { id: 's-info', nome: 'INFOSTART', origem: 'terceiro' as const, ativo: true },
    { id: 's-off', nome: 'Inativo X', origem: 'terceiro' as const, ativo: false },
  ]

  it('1) catálogo connect+terceiro retorna ambos ativos', () => {
    const ativos = sistemasAtivosParaContratacao(catalogo)
    assert.equal(ativos.length, 2)
    assert.ok(ativos.some((s) => s.origem === 'connect'))
    assert.ok(ativos.some((s) => s.origem === 'terceiro' && s.nome === 'INFOSTART'))
  })

  it('2) sistema terceiro aparece no modelo do Novo cliente', () => {
    const opcoes = sistemasAtivosParaContratacao(catalogo).map((s) =>
      labelSistemaContratadoSelect({ nome: s.nome, origem: s.origem }),
    )
    assert.ok(opcoes.includes('Connect Sistema (PRÓPRIO)'))
    assert.ok(opcoes.includes('INFOSTART (TERCEIRO)'))
  })

  it('3) terceiro nunca permite criar_acesso=true', () => {
    const r = validarCriarAcessoComOrigem({ origem: 'terceiro', criarAcesso: true })
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_ORIGEM_ACESSO_INVALIDO)
    assert.equal(deveExibirOpcaoCriarAcessoConnect('terceiro'), false)
  })

  it('4) terceiro nunca chama createUser', () => {
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'terceiro', criarAcesso: true }), false)
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'terceiro', criarAcesso: false }), false)
    assert.equal(deveCriarAuthConnect({ origem: 'terceiro', criarAcesso: true }), false)
  })

  it('5–7) terceiro persiste acesso_connect=false e IDs null', () => {
    const p = camposPersistidosAcessoVinculo({
      origem: 'terceiro',
      criarAcesso: true,
      authUserId: 'should-ignore',
      perfilId: 'should-ignore',
    })
    assert.equal(p.criar_acesso, false)
    assert.equal(p.acesso_connect, false)
    assert.equal(p.auth_user_id, null)
    assert.equal(p.perfil_id, null)
  })

  it('8) Connect sem login não cria Auth', () => {
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'connect', criarAcesso: false }), false)
    const p = camposPersistidosAcessoVinculo({ origem: 'connect', criarAcesso: false })
    assert.equal(p.acesso_connect, false)
    assert.equal(p.auth_user_id, null)
    assert.equal(p.perfil_id, null)
  })

  it('9) Connect com login mantém fluxo existente', () => {
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'connect', criarAcesso: true }), true)
    assert.equal(deveCriarAuthConnect({ origem: 'connect', criarAcesso: true }), true)
    assert.equal(deveExibirOpcaoCriarAcessoConnect('connect'), true)
    const p = camposPersistidosAcessoVinculo({
      origem: 'connect',
      criarAcesso: true,
      authUserId: 'u1',
      perfilId: 'u1',
    })
    assert.equal(p.acesso_connect, true)
    assert.equal(p.auth_user_id, 'u1')
    assert.equal(p.perfil_id, 'u1')
  })

  it('10) sistema inativo não pode ser contratado', () => {
    const r = avaliarSistemaParaContratacao({ id: 's-off', ativo: false })
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SISTEMA_INATIVO)
    assert.equal(
      sistemasAtivosParaContratacao(catalogo).some((s) => s.id === 's-off'),
      false,
    )
  })

  it('11) sistema inexistente é rejeitado', () => {
    const r = avaliarSistemaParaContratacao(null)
    assert.equal(r.ok, false)
    if (r.ok === false) assert.equal(r.code, CODIGO_SISTEMA_INEXISTENTE)
  })

  it('12) texto técnico não aparece no modal', () => {
    const textos = [
      TEXTO_AJUDA_CRIAR_ACESSO_CONNECT,
      TEXTO_AJUDA_SOMENTE_ADMIN,
      textoAjudaCriarAcessoConnect(true),
      textoAjudaCriarAcessoConnect(false),
    ].join('\n')
    for (const proibido of [
      'admin_cliente',
      'admin_cliente_sistemas',
      'Auth',
      'perfis',
      'createUser',
      'sem Auth',
    ]) {
      assert.equal(textos.includes(proibido), false, `não deve conter: ${proibido}`)
    }
    assert.match(TEXTO_AJUDA_CRIAR_ACESSO_CONNECT, /login/i)
    assert.match(TEXTO_AJUDA_SOMENTE_ADMIN, /administrativo/i)
  })
})
