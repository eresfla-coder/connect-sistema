import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  arredondarMoeda,
  calcularDescontoEmReais,
  calcularTotalFinalOrcamento,
  cicloEditarDescontoOrcamento,
  hidratarDescontoEditor,
  mesclarOrcamentoAposEdicao,
  montarTotaisParaSalvar,
  parseDescontoInputEditor,
  prepararTotaisOrcamentoCliente,
  totalItemOrcamento,
} from '../lib/orcamento-desconto.ts'

const ITEM_1000 = [{ quantidade: 1, valor: 1000, total: 1000 }]

describe('orcamento-desconto — cálculo canônico', () => {
  it('A) subtotal 1000 + desconto R$ 100 = total 900', () => {
    const desconto = calcularDescontoEmReais({
      subtotal: 1000,
      descontoTipo: 'valor',
      descontoInput: 100,
    })
    assert.equal(desconto, 100)
    assert.equal(calcularTotalFinalOrcamento({ subtotal: 1000, desconto }), 900)
  })

  it('B) subtotal 1000 + desconto 10% = total 900', () => {
    const desconto = calcularDescontoEmReais({
      subtotal: 1000,
      descontoTipo: 'percentual',
      descontoInput: 10,
    })
    assert.equal(desconto, 100)
    assert.equal(calcularTotalFinalOrcamento({ subtotal: 1000, desconto }), 900)
  })

  it('C) sem desconto mantém total = subtotal', () => {
    assert.equal(calcularTotalFinalOrcamento({ subtotal: 1000, desconto: 0 }), 1000)
  })

  it('D) desconto zero permanece zero (sem inventar valor)', () => {
    const totais = prepararTotaisOrcamentoCliente({
      itens: ITEM_1000,
      subtotal: 1000,
      desconto: 0,
      entrega: 0,
    })
    assert.equal(totais.desconto, 0)
    assert.equal(totais.total, 1000)
  })

  it('E) orçamento recarregado preserva desconto salvo em R$', () => {
    const salvo = {
      itens: [
        { quantidade: 1, valor: 600, total: 600 },
        { quantidade: 2, valor: 200, total: 400 },
      ],
      subtotal: 1000,
      desconto: 150,
      entrega: 0,
      total: 850,
    }
    const totais = prepararTotaisOrcamentoCliente(salvo)
    assert.equal(totais.desconto, 150)
    assert.equal(totais.total, 850)
  })

  it('não gera NaN nem total negativo', () => {
    const totais = prepararTotaisOrcamentoCliente({
      itens: [{ quantidade: 1, valor: 50, total: 50 }],
      subtotal: 50,
      desconto: 999,
      entrega: Number.NaN as unknown as number,
    })
    assert.ok(Number.isFinite(totais.total))
    assert.ok(totais.total >= 0)
    assert.equal(totais.total, 0)
  })

  it('não aplica desconto em dobro — usa dados.desconto, não fórmula externa', () => {
    const totais = prepararTotaisOrcamentoCliente({
      itens: [{ quantidade: 10, valor: 100, total: 1000 }],
      subtotal: 1000,
      desconto: 100,
      entrega: 0,
      total: 900,
    })
    assert.equal(totais.desconto, 100)
    assert.equal(totais.total, 900)
  })

  it('arredonda centavos de forma estável', () => {
    assert.equal(arredondarMoeda(10.005), 10.01)
    assert.equal(arredondarMoeda(10.004), 10)
    const desconto = calcularDescontoEmReais({
      subtotal: 99.99,
      descontoTipo: 'percentual',
      descontoInput: 10,
    })
    assert.equal(desconto, 10)
  })
})

describe('orcamento-desconto — itens e cenários mistos', () => {
  it('vários itens somam subtotal corretamente', () => {
    const totais = prepararTotaisOrcamentoCliente({
      itens: [
        { quantidade: 2, valor: 100, total: 200 },
        { quantidade: 1, valor: 300, total: 300 },
        { quantidade: 5, valor: 20, total: 100 },
      ],
      subtotal: 600,
      desconto: 60,
      entrega: 0,
    })
    assert.equal(totais.subtotal, 600)
    assert.equal(totais.desconto, 60)
    assert.equal(totais.total, 540)
  })

  it('produto normal', () => {
    assert.equal(totalItemOrcamento({ quantidade: 3, valor: 25 }), 75)
  })

  it('somente m²', () => {
    const total = totalItemOrcamento({
      tipoCalculo: 'm2',
      metragem: 2.5,
      valorM2: 40,
      quantidade: 2,
    })
    assert.equal(total, 200)
  })

  it('misto produto + m² com desconto', () => {
    const totais = prepararTotaisOrcamentoCliente({
      itens: [
        { quantidade: 1, valor: 100, total: 100 },
        {
          tipoCalculo: 'm2',
          metragem: 2,
          valorM2: 50,
          quantidade: 1,
          total: 100,
        },
      ],
      subtotal: 200,
      desconto: 20,
      entrega: 10,
    })
    assert.equal(totais.subtotal, 200)
    assert.equal(totais.desconto, 20)
    assert.equal(totais.total, 190)
  })

  it('itens internos ocultos rateiam desconto sem zerar', () => {
    const totais = prepararTotaisOrcamentoCliente({
      itens: [
        { quantidade: 1, valor: 800, total: 800, mostrarCliente: true },
        { quantidade: 1, valor: 200, total: 200, mostrarCliente: false },
      ],
      subtotal: 1000,
      desconto: 100,
      entrega: 0,
    })
    assert.equal(totais.itens.length, 1)
    assert.equal(totais.subtotal, 800)
    assert.equal(totais.desconto, 80)
    assert.equal(totais.total, 720)
  })

  it('NÃO usa estado de formulário — só dados do orçamento (bug visualização)', () => {
    const orcamentoSalvo = {
      itens: ITEM_1000,
      subtotal: 1000,
      desconto: 100,
      entrega: 0,
      total: 900,
    }
    const totais = prepararTotaisOrcamentoCliente(orcamentoSalvo)
    assert.equal(totais.desconto, 100)
    assert.equal(totais.total, 900)
  })
})

describe('orcamento-desconto — EDIÇÃO (relato cliente)', () => {
  it('1) novo orçamento com desconto', () => {
    const totais = montarTotaisParaSalvar({
      itens: ITEM_1000,
      descontoTipo: 'valor',
      descontoInput: '100',
      entrega: 0,
    })
    assert.equal(totais.desconto, 100)
    assert.equal(totais.total, 900)
  })

  it('2) existente sem desconto → editar → adicionar R$ 100 → salvar → reabrir → visualizar', () => {
    const ciclo = cicloEditarDescontoOrcamento({
      orcamentoSalvo: {
        itens: ITEM_1000,
        subtotal: 1000,
        desconto: 0,
        entrega: 0,
        total: 1000,
      },
      novoDescontoTipo: 'valor',
      novoDescontoInput: '100',
    })

    assert.equal(ciclo.hidratado.descontoTipo, 'valor')
    assert.equal(ciclo.hidratado.descontoInput, '')
    assert.equal(ciclo.aposSalvar.desconto, 100)
    assert.equal(ciclo.aposSalvar.total, 900)
    assert.equal(ciclo.aposReabrir.descontoTipo, 'valor')
    assert.equal(parseDescontoInputEditor(ciclo.aposReabrir.descontoInput), 100)
    assert.equal(ciclo.aposVisualizar.desconto, 100)
    assert.equal(ciclo.aposVisualizar.total, 900)
  })

  it('3) existente com R$ 100 → editar → R$ 150', () => {
    const ciclo = cicloEditarDescontoOrcamento({
      orcamentoSalvo: {
        itens: ITEM_1000,
        subtotal: 1000,
        desconto: 100,
        entrega: 0,
        total: 900,
      },
      novoDescontoTipo: 'valor',
      novoDescontoInput: '150',
    })
    assert.equal(parseDescontoInputEditor(ciclo.hidratado.descontoInput), 100)
    assert.equal(ciclo.aposSalvar.desconto, 150)
    assert.equal(ciclo.aposSalvar.total, 850)
    assert.equal(ciclo.aposVisualizar.total, 850)
  })

  it('4) existente com desconto → editar → remover desconto', () => {
    const ciclo = cicloEditarDescontoOrcamento({
      orcamentoSalvo: {
        itens: ITEM_1000,
        subtotal: 1000,
        desconto: 100,
        entrega: 0,
        total: 900,
      },
      novoDescontoTipo: 'valor',
      novoDescontoInput: '',
    })
    assert.equal(ciclo.aposSalvar.desconto, 0)
    assert.equal(ciclo.aposSalvar.total, 1000)
    assert.equal(ciclo.aposVisualizar.desconto, 0)
    assert.equal(ciclo.aposVisualizar.total, 1000)
  })

  it('5) existente → editar → aplicar percentual 10%', () => {
    const ciclo = cicloEditarDescontoOrcamento({
      orcamentoSalvo: {
        itens: ITEM_1000,
        subtotal: 1000,
        desconto: 0,
        entrega: 0,
        total: 1000,
      },
      novoDescontoTipo: 'percentual',
      novoDescontoInput: '10',
    })
    assert.equal(ciclo.aposSalvar.desconto, 100)
    assert.equal(ciclo.aposSalvar.total, 900)
    // Reabrir sempre em R$ canônico — nunca interpreta 100 como 100%
    assert.equal(ciclo.aposReabrir.descontoTipo, 'valor')
    assert.equal(parseDescontoInputEditor(ciclo.aposReabrir.descontoInput), 100)
  })

  it('6) salvar → fechar → reabrir hidrata desconto = 100', () => {
    const hidratado = hidratarDescontoEditor(100)
    assert.equal(hidratado.descontoTipo, 'valor')
    assert.equal(parseDescontoInputEditor(hidratado.descontoInput), 100)
  })

  it('7) reload lógico: entidade com desconto permanece', () => {
    const persistido = {
      itens: ITEM_1000,
      subtotal: 1000,
      desconto: 100,
      entrega: 0,
      total: 900,
    }
    const depoisReload = prepararTotaisOrcamentoCliente(persistido)
    assert.equal(depoisReload.desconto, 100)
    assert.equal(depoisReload.total, 900)
  })

  it('8) visualizar depois da edição usa dados.desconto', () => {
    const aposEdicao = {
      itens: ITEM_1000,
      subtotal: 1000,
      desconto: 100,
      entrega: 0,
      total: 900,
    }
    const view = prepararTotaisOrcamentoCliente(aposEdicao)
    assert.equal(view.subtotal, 1000)
    assert.equal(view.desconto, 100)
    assert.equal(view.total, 900)
  })

  it('9) estado antigo do formulário não prevalece no save', () => {
    const totais = montarTotaisParaSalvar({
      itens: ITEM_1000,
      descontoTipo: 'valor',
      descontoInput: '100',
      descontoAntigo: 0,
      entrega: 0,
    })
    assert.equal(totais.desconto, 100)
    assert.notEqual(totais.desconto, 0)
  })

  it('10) merge: entidade antiga NÃO sobrescreve desconto novo', () => {
    const existente = {
      id: 1,
      subtotal: 1000,
      desconto: 0,
      entrega: 0,
      total: 1000,
      itens: ITEM_1000,
    }
    // Simula bug perigoso: spread na ordem errada
    const buggy = {
      desconto: 100,
      total: 900,
      ...existente,
    }
    assert.equal(buggy.desconto, 0) // prova do antipadrão

    const correto = mesclarOrcamentoAposEdicao({
      existente,
      patchFinanceiro: {
        subtotal: 1000,
        desconto: 100,
        entrega: 0,
        total: 900,
        itens: ITEM_1000,
      },
    })
    assert.equal(correto.desconto, 100)
    assert.equal(correto.total, 900)
  })

  it('R$ 100 persistido NÃO vira 100% ao reabrir', () => {
    const hidratado = hidratarDescontoEditor(100)
    assert.equal(hidratado.descontoTipo, 'valor')
    const valor = parseDescontoInputEditor(hidratado.descontoInput)
    assert.equal(valor, 100)
    // Se fosse interpretado como %, daria desconto de R$ 1000 no subtotal 1000
    const seFossePercentual = calcularDescontoEmReais({
      subtotal: 1000,
      descontoTipo: 'percentual',
      descontoInput: valor,
    })
    assert.equal(seFossePercentual, 1000)
    assert.notEqual(hidratado.descontoTipo, 'percentual')
  })
})
