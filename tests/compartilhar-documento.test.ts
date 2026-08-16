import assert from 'node:assert/strict'
import test from 'node:test'
import {
  linkPublicoUtil,
  resolverLinkParaEnvio,
  suporteWebShareArquivos,
  suporteWebShareUrl,
  tentarCompartilharUrlNativa,
} from '../lib/compartilhar-documento.ts'

test('linkPublicoUtil aceita http(s) e rejeita vazio/inválido', () => {
  assert.equal(linkPublicoUtil(''), '')
  assert.equal(linkPublicoUtil('   '), '')
  assert.equal(linkPublicoUtil('javascript:alert(1)'), '')
  assert.match(linkPublicoUtil('https://painel.appconnectpro.com.br/visualizar/recibo/1?token=abc') || '', /^https:\/\//)
})

test('resolverLinkParaEnvio prioriza o link completo preparado', async () => {
  const link = await resolverLinkParaEnvio({
    linkRapido: 'https://exemplo.com/rapido',
    prepararLinkCompleto: async () => 'https://exemplo.com/completo?token=1',
  })
  assert.equal(link, 'https://exemplo.com/completo?token=1')
})

test('resolverLinkParaEnvio nunca abre com link vazio quando a preparação falha e não há fallback', async () => {
  await assert.rejects(
    () => resolverLinkParaEnvio({
      linkRapido: '',
      prepararLinkCompleto: async () => '',
    }),
    /Não foi possível gerar o link público/,
  )
})

test('resolverLinkParaEnvio usa linkRapido se a preparação falhar', async () => {
  const link = await resolverLinkParaEnvio({
    linkRapido: 'https://exemplo.com/fallback-preview',
    prepararLinkCompleto: async () => {
      throw new Error('rede')
    },
  })
  assert.equal(link, 'https://exemplo.com/fallback-preview')
})

test('resolverLinkParaEnvio propaga erro quando não há fallback', async () => {
  await assert.rejects(
    () => resolverLinkParaEnvio({
      linkRapido: '',
      prepararLinkCompleto: async () => {
        throw new Error('Sessão ausente para publicar recibo.')
      },
    }),
    /Sessão ausente/,
  )
})

test('suporteWebShare sem navigator.share retorna false', () => {
  const original = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  })
  try {
    assert.equal(suporteWebShareUrl(), false)
    assert.equal(suporteWebShareArquivos(), false)
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original,
    })
  }
})

test('tentarCompartilharUrlNativa fica indisponível sem Web Share', async () => {
  const original = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  })
  try {
    const r = await tentarCompartilharUrlNativa({
      titulo: 'Recibo',
      texto: 'teste',
      url: 'https://exemplo.com/r',
    })
    assert.deepEqual(r, { modo: 'indisponivel' })
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original,
    })
  }
})

test('tentarCompartilharUrlNativa marca cancelamento do usuário', async () => {
  const original = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      share: async () => {
        const erro = new DOMException('AbortError', 'AbortError')
        throw erro
      },
    },
  })
  try {
    const r = await tentarCompartilharUrlNativa({
      titulo: 'Recibo',
      texto: 'teste',
      url: 'https://exemplo.com/r',
    })
    assert.deepEqual(r, { modo: 'web-share', ok: false, motivo: 'cancelado' })
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original,
    })
  }
})
