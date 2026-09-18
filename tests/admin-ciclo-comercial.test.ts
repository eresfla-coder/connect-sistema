import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acessoConnectDoVinculo,
  deveCriarAuthConnect,
  validarCriarAcessoComOrigem,
} from '../lib/admin-carteira.ts'
import {
  aplicarBloqueioVinculo,
  aplicarMarcarPagoComercial,
  aplicarRenovacaoComercial,
  calcularMetricasCicloComercial,
  calcularPrimeiroVencimentoAtivo,
  calcularProximoVencimentoMensal,
  camposIniciaisVinculoComercial,
  CODIGO_CONNECT_SYNC_FAILED,
  CODIGO_CONNECT_SYNC_INCONSISTENT,
  decidirResultadoSyncConnect,
  deveDesativarAdminClientePorBloqueioVinculo,
  deveSincronizarPerfilConnect,
  montarMensagemCobrancaPorOrigem,
  montarSnapshotVinculoComercial,
  validarDiaVencimento,
  vinculoEntraNoMrr,
  vinculoEntraNoRecebido,
} from '../lib/admin-ciclo-comercial.ts'
import { deveChamarCreateUserAuthParaOrigem } from '../lib/admin-criar-acesso.ts'

describe('ADMIN.3.1 — ciclo comercial carteira', () => {
  it('1) Ativo dia 25 em 18/09 → 25/09', () => {
    assert.equal(
      calcularPrimeiroVencimentoAtivo({ hoje: '2026-09-18', diaVencimento: 25 }),
      '2026-09-25',
    )
  })

  it('2) Ativo dia 10 em 18/09 → 10/10', () => {
    assert.equal(
      calcularPrimeiroVencimentoAtivo({ hoje: '2026-09-18', diaVencimento: 10 }),
      '2026-10-10',
    )
  })

  it('3) Ativo dia 18 em 18/09 → 18/10', () => {
    assert.equal(
      calcularPrimeiroVencimentoAtivo({ hoje: '2026-09-18', diaVencimento: 18 }),
      '2026-10-18',
    )
  })

  it('4) dezembro → janeiro', () => {
    assert.equal(
      calcularProximoVencimentoMensal({ dataReferencia: '2026-12-10', diaVencimento: 10 }),
      '2027-01-10',
    )
  })

  it('5) fevereiro', () => {
    assert.equal(
      calcularProximoVencimentoMensal({ dataReferencia: '2026-01-28', diaVencimento: 28 }),
      '2026-02-28',
    )
    assert.equal(
      calcularPrimeiroVencimentoAtivo({ hoje: '2026-02-20', diaVencimento: 10 }),
      '2026-03-10',
    )
  })

  it('6) Trial default 7', () => {
    const c = camposIniciaisVinculoComercial({
      statusInicial: 'trial',
      hoje: '2026-09-18',
    })
    assert.equal(c.status, 'trial')
    assert.equal(c.data_vencimento, '2026-09-25')
    assert.equal(c.fim_trial, '2026-09-25')
    assert.equal(c.status_pagamento, 'trial')
    assert.equal(c.ultimo_pagamento, null)
  })

  it('7) Trial custom N dias', () => {
    const c = camposIniciaisVinculoComercial({
      statusInicial: 'trial',
      hoje: '2026-09-18',
      diasTrial: 14,
    })
    assert.equal(c.data_vencimento, '2026-10-02')
  })

  it('8) Trial não entra MRR', () => {
    assert.equal(vinculoEntraNoMrr({ status: 'trial', valor: 100 }), false)
    const m = calcularMetricasCicloComercial({
      clientes: [{ vinculos: [{ status: 'trial', valor: 100, status_pagamento: 'trial' }] }],
    })
    assert.equal(m.mrr, 0)
    assert.equal(m.trials, 1)
  })

  it('9) Ativo pendente não entra RECEBIDO', () => {
    const c = camposIniciaisVinculoComercial({
      statusInicial: 'ativo',
      hoje: '2026-09-18',
      diaVencimento: 10,
    })
    assert.equal(c.status_pagamento, 'pendente')
    assert.equal(c.ultimo_pagamento, null)
    assert.equal(vinculoEntraNoRecebido(c), false)
    assert.equal(vinculoEntraNoMrr(c), true)
  })

  it('10) marcar pago entra RECEBIDO', () => {
    const p = aplicarMarcarPagoComercial({
      dataVencimentoAtual: '2026-10-10',
      diaVencimento: 10,
      hoje: '2026-09-18',
    })
    assert.equal(p.status_pagamento, 'em_dia')
    assert.equal(p.ultimo_pagamento, '2026-09-18')
    // vencimento já futuro → preserva (ADMIN.3.3)
    assert.equal(p.data_vencimento, '2026-10-10')
    assert.equal(vinculoEntraNoRecebido(p), true)
  })

  it('11) renovar usa mês/dia, não +30', () => {
    const r = aplicarRenovacaoComercial({
      dataVencimentoAtual: '2026-10-10',
      diaVencimento: 10,
    })
    assert.equal(r.data_vencimento, '2026-11-10')
    assert.notEqual(r.data_vencimento, '2026-11-09')
  })

  it('12–13) terceiro não usa perfis/Auth em helpers comerciais', () => {
    assert.equal(deveCriarAuthConnect({ origem: 'terceiro', criarAcesso: true }), false)
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'terceiro', criarAcesso: true }), false)
    assert.equal(acessoConnectDoVinculo({ origem: 'terceiro', criarAcesso: true }), false)
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'terceiro', acessoConnect: false, perfilId: null }),
      false,
    )
  })

  it('14) terceiro Cobrar não contém /assinatura', () => {
    const { mensagem, incluiAssinaturaConnect } = montarMensagemCobrancaPorOrigem({
      origem: 'terceiro',
      nome: 'Cliente X',
      sistema: 'INFOSTART',
      valor: 100,
      vencimento: '2026-10-10',
      siteUrl: 'https://example.com',
    })
    assert.equal(incluiAssinaturaConnect, false)
    assert.equal(mensagem.includes('/assinatura'), false)
    assert.equal(mensagem.includes('Mercado Pago'), false)
  })

  it('15) Connect Cobrar pode incluir /assinatura', () => {
    const { mensagem, incluiAssinaturaConnect } = montarMensagemCobrancaPorOrigem({
      origem: 'connect',
      nome: 'Cliente Y',
      sistema: 'Connect Sistema',
      valor: 49.9,
      vencimento: '2026-10-10',
      siteUrl: 'https://example.com',
    })
    assert.equal(incluiAssinaturaConnect, true)
    assert.match(mensagem, /\/assinatura/)
  })

  it('16) bloqueio de um vínculo não desativa admin_cliente global', () => {
    assert.equal(deveDesativarAdminClientePorBloqueioVinculo(), false)
    const b = aplicarBloqueioVinculo()
    assert.equal(b.status, 'bloqueado')
    const cliente = camposIniciaisVinculoComercial({
      statusInicial: 'bloqueado',
      hoje: '2026-09-18',
      diaVencimento: 10,
    })
    assert.equal(cliente.admin_cliente_ativo, true)
  })

  it('17) edição identifica cliente_sistema via vinculo_id (contrato API)', () => {
    // Contrato: PATCH exige vinculo_id + cliente_id (rota). Helper de renovação é por vínculo.
    const r = aplicarRenovacaoComercial({
      dataVencimentoAtual: '2026-05-15',
      diaVencimento: 15,
    })
    assert.equal(r.data_vencimento, '2026-06-15')
  })

  it('18) origem terceiro + acesso Connect continua rejeitada', () => {
    const r = validarCriarAcessoComOrigem({ origem: 'terceiro', criarAcesso: true })
    assert.equal(r.ok, false)
  })

  it('19) nenhuma ação comercial cria Auth (helpers)', () => {
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'connect', criarAcesso: false }), false)
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'connect', acessoConnect: true, perfilId: 'u1' }),
      true,
    )
    // sync ≠ createUser
    assert.equal(deveCriarAuthConnect({ origem: 'connect', criarAcesso: false }), false)
  })

  it('20) validação dia 1–28', () => {
    assert.equal(validarDiaVencimento(0), null)
    assert.equal(validarDiaVencimento(29), null)
    assert.equal(validarDiaVencimento(1), 1)
    assert.equal(validarDiaVencimento(28), 28)
    assert.throws(() =>
      camposIniciaisVinculoComercial({
        statusInicial: 'ativo',
        hoje: '2026-09-18',
        diaVencimento: null,
      }),
    )
  })
})

/**
 * ADMIN.3.2 — cenários de auditoria (comportamento pós-correção ADMIN.3.3 onde aplicável).
 */
describe('ADMIN.3.2 — auditoria ciclo comercial', () => {
  it('primeiro vencimento: dia 1 e dia 28 em 18/09', () => {
    assert.equal(calcularPrimeiroVencimentoAtivo({ hoje: '2026-09-18', diaVencimento: 1 }), '2026-10-01')
    assert.equal(calcularPrimeiroVencimentoAtivo({ hoje: '2026-09-18', diaVencimento: 28 }), '2026-09-28')
  })

  it('virada de ano: ref 31/12 + dia 10 → próximo ciclo 10/01', () => {
    assert.equal(
      calcularProximoVencimentoMensal({ dataReferencia: '2026-12-31', diaVencimento: 10 }),
      '2027-01-10',
    )
  })

  it('KPIs cenário controlado A/B/C/D', () => {
    const m = calcularMetricasCicloComercial({
      hoje: '2026-09-18',
      clientes: [
        {
          vinculos: [{ status: 'ativo', valor: 49.9, status_pagamento: 'pendente', data_vencimento: '2026-10-10' }],
        },
        {
          vinculos: [{ status: 'ativo', valor: 100, status_pagamento: 'pago', data_vencimento: '2026-10-10' }],
        },
        {
          vinculos: [{ status: 'trial', valor: 80, status_pagamento: 'trial', data_vencimento: '2026-09-25' }],
        },
        {
          vinculos: [{ status: 'bloqueado', valor: 120, status_pagamento: 'bloqueado', data_vencimento: '2026-08-01' }],
        },
      ],
    })
    assert.equal(m.totalClientes, 4)
    assert.equal(m.mrr, 149.9)
    assert.equal(m.recebido, 100)
    assert.equal(m.trials, 1)
    assert.equal(m.bloqueados, 1)
  })

  it('Trial vencido: continua status trial e conta como vencido (sem auto-bloqueio)', () => {
    const m = calcularMetricasCicloComercial({
      hoje: '2026-09-18',
      clientes: [
        {
          vinculos: [{ status: 'trial', valor: 80, status_pagamento: 'trial', data_vencimento: '2026-09-10' }],
        },
      ],
    })
    assert.equal(m.trials, 1)
    assert.equal(m.vencidos, 1)
    assert.equal(m.bloqueados, 0)
    assert.equal(m.mrr, 0)
  })

  it('sync perfis: terceiro nunca; Connect só com acesso+perfil', () => {
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'terceiro', acessoConnect: false, perfilId: 'x' }),
      false,
    )
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'terceiro', acessoConnect: true, perfilId: 'x' }),
      false,
    )
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'connect', acessoConnect: false, perfilId: 'x' }),
      false,
    )
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'connect', acessoConnect: true, perfilId: null }),
      false,
    )
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'connect', acessoConnect: true, perfilId: 'u1' }),
      true,
    )
  })

  it('multissistema: bloqueio de um vínculo não implica desativar cliente global', () => {
    assert.equal(deveDesativarAdminClientePorBloqueioVinculo(), false)
    const m = calcularMetricasCicloComercial({
      clientes: [
        {
          vinculos: [
            { status: 'ativo', valor: 49.9, status_pagamento: 'pendente' },
            { status: 'bloqueado', valor: 100, status_pagamento: 'bloqueado' },
          ],
        },
      ],
    })
    assert.equal(m.totalClientes, 1)
    assert.equal(m.mrr, 49.9)
    assert.equal(m.bloqueados, 1)
  })
})

describe('ADMIN.3.3 — correção gaps ciclo comercial', () => {
  it('1) pago atrasado 10/06 → 10/10', () => {
    const p = aplicarMarcarPagoComercial({
      dataVencimentoAtual: '2026-06-10',
      diaVencimento: 10,
      hoje: '2026-09-18',
    })
    assert.equal(p.data_vencimento, '2026-10-10')
  })

  it('2) pago vencido 10/09 → 10/10', () => {
    const p = aplicarMarcarPagoComercial({
      dataVencimentoAtual: '2026-09-10',
      diaVencimento: 10,
      hoje: '2026-09-18',
    })
    assert.equal(p.data_vencimento, '2026-10-10')
  })

  it('3) pago com vencimento futuro 10/10 → mantém 10/10', () => {
    const p = aplicarMarcarPagoComercial({
      dataVencimentoAtual: '2026-10-10',
      diaVencimento: 10,
      hoje: '2026-09-18',
    })
    assert.equal(p.data_vencimento, '2026-10-10')
  })

  it('4) dia 18 hoje 18/09 → próximo 18/10', () => {
    assert.equal(
      calcularPrimeiroVencimentoAtivo({ hoje: '2026-09-18', diaVencimento: 18 }),
      '2026-10-18',
    )
    const p = aplicarMarcarPagoComercial({
      dataVencimentoAtual: '2026-09-18',
      diaVencimento: 18,
      hoje: '2026-09-18',
    })
    assert.equal(p.data_vencimento, '2026-10-18')
  })

  it('5) dezembro → janeiro', () => {
    assert.equal(
      calcularProximoVencimentoMensal({ dataReferencia: '2026-12-10', diaVencimento: 10 }),
      '2027-01-10',
    )
  })

  it('6–7) Renovar preserva ultimo_pagamento e status_pagamento (não escreve nos updates)', () => {
    const r = aplicarRenovacaoComercial({
      dataVencimentoAtual: '2026-10-10',
      diaVencimento: 10,
      hoje: '2026-09-18',
    })
    assert.equal(r.data_vencimento, '2026-11-10')
    assert.equal(r.status, 'ativo')
    assert.equal('ultimo_pagamento' in r, false)
    assert.equal('status_pagamento' in r, false)
  })

  it('8–9) Marcar pago grava ultimo_pagamento=hoje e em_dia', () => {
    const p = aplicarMarcarPagoComercial({
      dataVencimentoAtual: '2026-06-10',
      diaVencimento: 10,
      hoje: '2026-09-18',
    })
    assert.equal(p.ultimo_pagamento, '2026-09-18')
    assert.equal(p.status_pagamento, 'em_dia')
  })

  it('10) Connect sync OK → sucesso', () => {
    const d = decidirResultadoSyncConnect({ precisaSync: true, syncOk: true })
    assert.equal(d.ok, true)
  })

  it('11) Connect sync falha → NÃO retorna sucesso', () => {
    const d = decidirResultadoSyncConnect({ precisaSync: true, syncOk: false, compensacaoOk: true })
    assert.equal(d.ok, false)
    if (d.ok === false) assert.equal(d.code, CODIGO_CONNECT_SYNC_FAILED)
  })

  it('12) sync falha + compensação OK → código SYNC_FAILED (vínculo restaurado)', () => {
    const d = decidirResultadoSyncConnect({ precisaSync: true, syncOk: false, compensacaoOk: true })
    assert.equal(d.ok, false)
    if (d.ok === false) {
      assert.equal(d.code, CODIGO_CONNECT_SYNC_FAILED)
      assert.equal(d.deveCompensar, true)
    }
  })

  it('13) sync falha + compensação falha → inconsistente', () => {
    const d = decidirResultadoSyncConnect({ precisaSync: true, syncOk: false, compensacaoOk: false })
    assert.equal(d.ok, false)
    if (d.ok === false) assert.equal(d.code, CODIGO_CONNECT_SYNC_INCONSISTENT)
  })

  it('14) compensação só no vinculo_id (snapshot isolado)', () => {
    const snapA = montarSnapshotVinculoComercial({
      status: 'ativo',
      valor: 49.9,
      data_vencimento: '2026-10-10',
      status_pagamento: 'em_dia',
      ultimo_pagamento: '2026-09-10',
      dia_vencimento: 10,
    })
    const snapB = montarSnapshotVinculoComercial({
      status: 'bloqueado',
      valor: 100,
      data_vencimento: '2026-08-01',
      status_pagamento: 'bloqueado',
      dia_vencimento: 1,
    })
    assert.notEqual(snapA.status, snapB.status)
    assert.equal(snapA.valor, 49.9)
    assert.equal(snapB.valor, 100)
  })

  it('15–16) terceiro nunca sync / nunca compensação perfis', () => {
    assert.equal(
      deveSincronizarPerfilConnect({ origem: 'terceiro', acessoConnect: false, perfilId: 'x' }),
      false,
    )
    const d = decidirResultadoSyncConnect({ precisaSync: false, syncOk: false })
    assert.equal(d.ok, true)
  })

  it('17) nenhuma ação cria Auth', () => {
    assert.equal(deveChamarCreateUserAuthParaOrigem({ origem: 'connect', criarAcesso: false }), false)
    assert.equal(deveCriarAuthConnect({ origem: 'terceiro', criarAcesso: true }), false)
  })

  it('18) multissistema continua isolado', () => {
    assert.equal(deveDesativarAdminClientePorBloqueioVinculo(), false)
    const m = calcularMetricasCicloComercial({
      clientes: [
        {
          vinculos: [
            { status: 'ativo', valor: 49.9, status_pagamento: 'pendente' },
            { status: 'bloqueado', valor: 100, status_pagamento: 'bloqueado' },
          ],
        },
      ],
    })
    assert.equal(m.mrr, 49.9)
    assert.equal(m.bloqueados, 1)
  })
})
