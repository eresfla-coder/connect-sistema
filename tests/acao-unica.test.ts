import assert from 'node:assert/strict'
import test from 'node:test'
import { criarGuardaAcaoUnica, deveLiberarNoRetorno } from '../lib/acao-unica.ts'

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

test('reset ao voltar para a página limpa overlay/botão e permite abrir outro documento', async () => {
  const estados: (number | null)[] = []
  const guarda = criarGuardaAcaoUnica<number>({
    aoMudar: (pendente) => estados.push(pendente),
    liberarNoSucesso: false,
  })

  assert.equal(await guarda.executar(10, async () => {}), 'executado')
  assert.equal(guarda.ocupado(), true)

  guarda.liberar()

  assert.equal(guarda.ocupado(), false)
  assert.equal(guarda.pendente(), null)
  assert.deepEqual(estados, [10, null])
  assert.equal(await guarda.executar(11, async () => {}), 'executado')
})

test('deveLiberarNoRetorno libera quando a página volta do BFCache ou do histórico', () => {
  assert.equal(deveLiberarNoRetorno({ tipo: 'pageshow', persisted: true }), true)
  assert.equal(deveLiberarNoRetorno({ tipo: 'pageshow', persisted: false, saiuDaPagina: true }), true)
  assert.equal(deveLiberarNoRetorno({ tipo: 'popstate' }), true)
  assert.equal(
    deveLiberarNoRetorno({ tipo: 'visibilitychange', visivel: true, saiuDaPagina: true }),
    true,
  )
})

test('deveLiberarNoRetorno não libera enquanto o usuário aguarda na própria página', () => {
  assert.equal(deveLiberarNoRetorno({ tipo: 'pageshow', persisted: false, saiuDaPagina: false }), false)
  assert.equal(
    deveLiberarNoRetorno({ tipo: 'visibilitychange', visivel: true, saiuDaPagina: false }),
    false,
  )
  assert.equal(
    deveLiberarNoRetorno({ tipo: 'visibilitychange', visivel: false, saiuDaPagina: true }),
    false,
  )
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
