import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FORMAS_PAGAMENTO_PADRAO,
  alternarFormaAtiva,
  formasVisiveis,
  marcarFormaExcluida,
  mesclarFormasPagamento,
  nomesFormasAtivas,
  normalizarListaFormasPagamento,
  opcoesFormasPagamentoOrcamento,
  upsertFormaPagamento,
  type FormaPagamentoCadastro,
} from '../lib/formas-pagamento.ts'
import { mergeConnectValue } from '../lib/connect-cloud-storage.ts'
import { montarFormasPagamentoOrcamento, extrairFormasPagamentoOrcamento } from '../lib/orcamento-pagamento.ts'

describe('formas-pagamento — normalização', () => {
  it('aceita string[] legado e {id,nome,ativo}[] sem perder ativo', () => {
    const misto = normalizarListaFormasPagamento([
      'PIX',
      { id: 10, nome: 'TED', ativo: false, atualizadoEm: 100 },
      { nome: 'Boleto', ativo: true },
      { id: 11, nome: 'pix', ativo: true, atualizadoEm: 50 },
    ])
    const pix = misto.find((f) => f.nome.toLowerCase() === 'pix')
    assert.ok(pix)
    assert.equal(pix!.ativo, true)
    assert.equal(misto.find((f) => f.nome === 'TED')?.ativo, false)
    assert.equal(misto.find((f) => f.nome === 'Boleto')?.ativo, true)
  })

  it('nomesFormasAtivas ignora inativas', () => {
    const lista: FormaPagamentoCadastro[] = [
      { id: 1, nome: 'PIX', ativo: true },
      { id: 2, nome: 'Cheque', ativo: false },
    ]
    assert.deepEqual(nomesFormasAtivas(lista), ['PIX'])
  })
})

describe('formas-pagamento — merge local/nuvem', () => {
  it('não sobrescreve remoto mais recente com local antigo', () => {
    const local = [{ id: 1, nome: 'PIX', ativo: true, atualizadoEm: 10 }]
    const nuvem = [{ id: 1, nome: 'PIX', ativo: false, atualizadoEm: 99 }, { id: 2, nome: 'TED', ativo: true, atualizadoEm: 99 }]
    const mescla = mesclarFormasPagamento(local, nuvem)
    assert.equal(mescla.find((f) => f.nome === 'PIX')?.ativo, false)
    assert.ok(mescla.some((f) => f.nome === 'TED'))
  })

  it('local mais novo vence e preserva forma personalizada', () => {
    const local = [{ id: 3, nome: 'Cartão Loja', ativo: true, atualizadoEm: 200 }]
    const nuvem = [{ id: 1, nome: 'PIX', ativo: true, atualizadoEm: 50 }]
    const mescla = mesclarFormasPagamento(local, nuvem)
    assert.ok(mescla.some((f) => f.nome === 'Cartão Loja'))
    assert.ok(mescla.some((f) => f.nome === 'PIX'))
  })

  it('mergeConnectValue da chave connect_formas_pagamento não duplica strings', () => {
    const merged = mergeConnectValue(['PIX', 'Dinheiro'], ['PIX', 'TED'], 'connect_formas_pagamento') as any[]
    const nomes = merged.map((f) => String(f.nome || f).toLowerCase())
    assert.equal(nomes.filter((n) => n === 'pix').length, 1)
    assert.ok(nomes.includes('ted'))
    assert.ok(nomes.includes('dinheiro'))
  })

  it('reativação local mais recente vence nuvem inativa', () => {
    const nuvem = [{ id: 1, nome: 'PIX', ativo: false, atualizadoEm: 100 }]
    const local = [{ id: 1, nome: 'PIX', ativo: true, atualizadoEm: 200 }]
    const mescla = mesclarFormasPagamento(local, nuvem)
    assert.equal(mescla.find((f) => f.nome === 'PIX')?.ativo, true)
  })

  it('empate de timestamp não bloqueia reativação (local por último vence)', () => {
    const nuvem = [{ id: 1, nome: 'PIX', ativo: false, atualizadoEm: 50 }]
    const local = [{ id: 1, nome: 'PIX', ativo: true, atualizadoEm: 50 }]
    const mescla = mesclarFormasPagamento(local, nuvem)
    assert.equal(mescla.find((f) => f.nome === 'PIX')?.ativo, true)
  })

  it('exclusão com tombstone não reaparece após sync com nuvem antiga', () => {
    const base: FormaPagamentoCadastro[] = [
      { id: 1, nome: 'PIX', ativo: true, atualizadoEm: 10 },
      { id: 2, nome: 'TED', ativo: true, atualizadoEm: 10 },
    ]
    const local = marcarFormaExcluida(base, 2)
    const nuvem = [
      { id: 1, nome: 'PIX', ativo: true, atualizadoEm: 10 },
      { id: 2, nome: 'TED', ativo: true, atualizadoEm: 10 },
    ]
    const mescla = mesclarFormasPagamento(local, nuvem)
    assert.equal(mescla.find((f) => f.nome === 'TED')?.excluido, true)
    assert.equal(formasVisiveis(mescla).some((f) => f.nome === 'TED'), false)
    assert.ok(formasVisiveis(mescla).some((f) => f.nome === 'PIX'))
  })

  it('duas gravações próximas: só o item alterado muda de timestamp', () => {
    const base: FormaPagamentoCadastro[] = [
      { id: 1, nome: 'PIX', ativo: true, atualizadoEm: 10 },
      { id: 2, nome: 'TED', ativo: true, atualizadoEm: 10 },
    ]
    const apos = alternarFormaAtiva(base, 1)
    assert.ok((apos.find((f) => f.id === 1)?.atualizadoEm || 0) > 10)
    assert.equal(apos.find((f) => f.id === 2)?.atualizadoEm, 10)
  })

  it('gravação B mais nova de outro campo não apaga alteração A no merge', () => {
    // A criou "Cartão Loja" (t=100). B inativou PIX (t=200) sem ter Cartão Loja localmente.
    // Após B fazer GET da nuvem com A, o merge deve manter ambos.
    const aposA = [
      { id: 1, nome: 'PIX', ativo: true, atualizadoEm: 50 },
      { id: 3, nome: 'Cartão Loja', ativo: true, atualizadoEm: 100 },
    ]
    const localB = [{ id: 1, nome: 'PIX', ativo: false, atualizadoEm: 200 }]
    const mescla = mesclarFormasPagamento(localB, aposA)
    assert.equal(mescla.find((f) => f.nome === 'PIX')?.ativo, false)
    assert.ok(mescla.some((f) => f.nome === 'Cartão Loja' && f.ativo === true))
  })

  it('recriar nome excluído limpa tombstone', () => {
    const comTomb = marcarFormaExcluida([{ id: 2, nome: 'TED', ativo: true, atualizadoEm: 10 }], 2)
    const recriada = upsertFormaPagamento(comTomb, { nome: 'TED', ativo: true })
    const ted = recriada.find((f) => f.nome === 'TED')
    assert.equal(ted?.excluido, false)
    assert.equal(ted?.ativo, true)
  })
})

describe('formas-pagamento — isolamento por usuário', () => {
  it('API connect-storage amarra payload ao user_id do token (contrato de código)', async () => {
    const { readFileSync } = await import('node:fs')
    const rota = readFileSync(new URL('../app/api/connect-storage/route.ts', import.meta.url), 'utf8')
    const keys = readFileSync(new URL('../lib/connect-cloud-storage.ts', import.meta.url), 'utf8')
    assert.match(rota, /\.eq\('user_id',\s*userId\)/)
    assert.match(rota, /onConflict:\s*'user_id,storage_key'/)
    assert.match(rota, /getUser\(token\)/)
    assert.match(keys, /'connect_formas_pagamento'/)
  })
})

describe('formas-pagamento — opções do orçamento', () => {
  it('usa cadastro personalizado em vez da lista fixa', () => {
    const cadastro: FormaPagamentoCadastro[] = [
      { id: 1, nome: 'PIX Empresa', ativo: true },
      { id: 2, nome: 'Cheque', ativo: true },
      { id: 3, nome: 'Antiga', ativo: false },
    ]
    const opcoes = opcoesFormasPagamentoOrcamento(cadastro, [])
    const labels = opcoes.map((o) => o.label)
    assert.ok(labels.includes('PIX Empresa'))
    assert.ok(labels.includes('Cheque'))
    assert.equal(labels.includes('Antiga'), false)
    assert.equal(labels.includes('Personalizado'), false)
  })

  it('fallback para opções padrão quando não há cadastro ativo', () => {
    const opcoes = opcoesFormasPagamentoOrcamento([], [])
    assert.ok(opcoes.some((o) => o.label === 'Pix'))
    assert.ok(opcoes.some((o) => o.label === 'Boleto'))
  })

  it('preserva forma selecionada removida/inativa na edição', () => {
    const cadastro: FormaPagamentoCadastro[] = [
      { id: 1, nome: 'PIX', ativo: true },
      { id: 2, nome: 'Cheque pré', ativo: false },
    ]
    const opcoes = opcoesFormasPagamentoOrcamento(cadastro, ['Cheque pré', 'Forma Extinta'])
    const labels = opcoes.map((o) => o.label)
    assert.ok(labels.includes('PIX'))
    assert.ok(labels.includes('Cheque pré'))
    assert.ok(labels.includes('Forma Extinta'))
  })

  it('múltiplas formas montam texto estável para PDF/WhatsApp', () => {
    const texto = montarFormasPagamentoOrcamento(['PIX Empresa', 'Boleto'], '', '30 dias')
    assert.match(texto, /PIX Empresa/)
    assert.match(texto, /Boleto \(30 dias\)/)
    const extraido = extrairFormasPagamentoOrcamento({
      formaPagamento: texto,
      formasPagamentoLista: ['PIX Empresa', 'Boleto'],
    })
    assert.deepEqual(extraido.formas, ['PIX Empresa', 'Boleto'])
  })

  it('padrões locais existem para seed sem nuvem', () => {
    assert.ok(FORMAS_PAGAMENTO_PADRAO.length >= 3)
  })
})
