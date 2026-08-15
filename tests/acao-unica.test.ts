import assert from 'node:assert/strict'
import test from 'node:test'
import { criarGuardaAcaoUnica } from '../lib/acao-unica.ts'

function acaoPendente() {
  let resolver: () => void = () => {}
  const promessa = new Promise<void>((resolve) => {
    resolver = resolve
  })
  return { promessa, resolver }
}

test('ignora o segundo toque enquanto a abertura está pendente', async () => {
  const guarda = criarGuardaAcaoUnica<number>()
  const primeira = acaoPendente()
  let execucoes = 0

  const emAndamento = guarda.executar(7, async () => {
    execucoes += 1
    await primeira.promessa
  })

  assert.equal(guarda.ocupado(), true)
  assert.equal(guarda.pendente(), 7)
  assert.equal(await guarda.executar(7, async () => { execucoes += 1 }), 'ignorado')
  assert.equal(await guarda.executar(9, async () => { execucoes += 1 }), 'ignorado')

  primeira.resolver()
  assert.equal(await emAndamento, 'executado')
  assert.equal(execucoes, 1)
})

test('mantém o bloqueio após sucesso quando a ação navega para outra tela', async () => {
  const guarda = criarGuardaAcaoUnica<number>({ liberarNoSucesso: false })

  assert.equal(await guarda.executar(1, async () => {}), 'executado')
  assert.equal(guarda.ocupado(), true)
  assert.equal(await guarda.executar(1, async () => {}), 'ignorado')
})

test('libera o botão e propaga o erro quando a abertura falha', async () => {
  const estados: (number | null)[] = []
  const guarda = criarGuardaAcaoUnica<number>({
    aoMudar: (pendente) => estados.push(pendente),
    liberarNoSucesso: false,
  })

  await assert.rejects(
    guarda.executar(3, async () => {
      throw new Error('Não foi possível abrir o orçamento. Tente novamente.')
    }),
    /Não foi possível abrir o orçamento/,
  )

  assert.equal(guarda.ocupado(), false)
  assert.deepEqual(estados, [3, null])
  assert.equal(await guarda.executar(3, async () => {}), 'executado')
})
