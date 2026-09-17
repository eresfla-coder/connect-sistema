import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acessoConfigPorUserIdAnonimoPermitido,
  CAMPOS_CONFIG_PUBLICA_PERMITIDOS,
  montarConfigPublicaBranding,
  montarUrlLogoOgPublica,
  respostaContemPayloadProibido,
  respostaPublicaNegada,
  sanitizarRespostaConfigPublica,
  tokenPertenceAoDocumento,
  tokenPublicoValido,
} from '../lib/public-docs-auth.ts'
import {
  calcularDescontoEmReais,
  calcularTotalFinalOrcamento,
  prepararTotaisOrcamentoCliente,
} from '../lib/orcamento-desconto.ts'

describe('SEC.1 — token público', () => {
  it('1) sem token / token curto → inválido', () => {
    assert.equal(tokenPublicoValido(''), '')
    assert.equal(tokenPublicoValido('abc'), '')
    assert.equal(tokenPublicoValido('123456789'), '')
    assert.ok(tokenPublicoValido('abcdefghij').length >= 10)
  })

  it('2) token inválido / ausente → resposta uniforme 404 (sem enumeração)', () => {
    const r = respostaPublicaNegada()
    assert.equal(r.status, 404)
    assert.equal(r.body.error, 'Documento não encontrado.')
  })

  it('3) token do documento A usado no documento B → bloqueado', () => {
    const docA = { token: 'token-doc-aaaa', tipo: 'orcamento', documento_id: '100' }
    assert.equal(
      tokenPertenceAoDocumento(docA, {
        token: 'token-doc-aaaa',
        tipo: 'orcamento',
        documentoId: '999',
      }),
      false
    )
    assert.equal(
      tokenPertenceAoDocumento(docA, {
        token: 'token-outro-bbbb',
        tipo: 'orcamento',
        documentoId: '100',
      }),
      false
    )
  })

  it('4) token válido + mesmo documento → autorizado', () => {
    const doc = { token: 'token-doc-aaaa', tipo: 'orcamento', documento_id: '100' }
    assert.equal(
      tokenPertenceAoDocumento(doc, { token: 'token-doc-aaaa', tipo: 'orcamento', documentoId: '100' }),
      true
    )
    assert.equal(tokenPertenceAoDocumento(doc, { token: 'token-doc-aaaa' }), true)
  })

  it('OS aliases ordem_servico/os aceitos', () => {
    const doc = { token: 'token-os-xxxxxx', tipo: 'ordem_servico', documento_id: '55' }
    assert.equal(
      tokenPertenceAoDocumento(doc, { token: 'token-os-xxxxxx', tipo: 'os', documentoId: '55' }),
      true
    )
  })
})

describe('SEC.1 — payload e campos públicos', () => {
  it('5) userId arbitrário NÃO autoriza config privada', () => {
    assert.equal(acessoConfigPorUserIdAnonimoPermitido(), false)
  })

  it('6) resposta pública não inclui payload / user_id / itens', () => {
    const raw = montarConfigPublicaBranding({
      nomeEmpresa: 'Empresa Teste',
      cfgMerged: { logoUrl: '/logo.png', telefone: '84999990000' },
      configAtual: { cnpj: '123', celular_empresa: '84999990000' },
      telefoneFinal: '84999990000',
      empresaLogoOg: 'https://appconnectpro.com.br/api/og/empresa-logo?token=token-doc-aaaa&v=1',
    })
    const config = sanitizarRespostaConfigPublica(raw as Record<string, unknown>)
    const body = {
      found: true,
      config,
    }

    assert.equal(respostaContemPayloadProibido(body), false)
    assert.equal('payload' in body, false)
    assert.equal('user_id' in config, false)
    assert.equal('owner_user_id' in config, false)
    assert.equal('itens' in config, false)

    for (const key of Object.keys(config)) {
      assert.ok(
        (CAMPOS_CONFIG_PUBLICA_PERMITIDOS as readonly string[]).includes(key),
        `campo inesperado: ${key}`
      )
    }
  })

  it('detecta payload proibido se alguém incluir', () => {
    assert.equal(respostaContemPayloadProibido({ payload: { itens: [] }, config: {} }), true)
    assert.equal(respostaContemPayloadProibido({ config: { user_id: 'x' } }), true)
  })
})

describe('SEC.1 — OG / logo', () => {
  it('7) OG sem token não gera URL enumerável por userId', () => {
    const url = montarUrlLogoOgPublica({
      siteBase: 'https://appconnectpro.com.br',
      token: '',
      v: 1,
    })
    assert.equal(url.includes('userId='), false)
    assert.equal(url.includes('/api/og/empresa-logo'), false)
    assert.match(url, /logo-connect\.png/)
  })

  it('OG com token aponta para endpoint tokenizado', () => {
    const url = montarUrlLogoOgPublica({
      siteBase: 'https://appconnectpro.com.br',
      token: 'token-publico-valido',
      v: 42,
    })
    assert.match(url, /\/api\/og\/empresa-logo\?/)
    assert.match(url, /token=token-publico-valido/)
    assert.equal(url.includes('userId='), false)
  })
})

describe('SEC.1 — fluxo link público + desconto intacto', () => {
  it('8) totais públicos usam dados persistidos (não formulário)', () => {
    const dados = {
      itens: [{ quantidade: 1, valor: 1000, total: 1000, mostrarCliente: true }],
      desconto: 100,
      entrega: 0,
      subtotal: 1000,
      total: 900,
    }
    const totais = prepararTotaisOrcamentoCliente(dados)
    assert.equal(totais.desconto, 100)
    assert.equal(totais.total, 900)
    assert.equal(
      calcularDescontoEmReais({ subtotal: 1000, descontoTipo: 'valor', descontoInput: 100 }),
      100
    )
    assert.equal(calcularTotalFinalOrcamento({ subtotal: 1000, desconto: 100, entrega: 0 }), 900)
  })

  it('9) metadata/OG helper: token válido é pré-requisito (tokenPublicoValido)', () => {
    assert.equal(tokenPublicoValido(null), '')
    assert.ok(tokenPublicoValido('abcdefghijklmnop'))
  })
})
