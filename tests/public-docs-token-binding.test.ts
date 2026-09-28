import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  documentoCanonicoDaPublicacao,
  normalizarTipoDocumentoPublico,
  publicacaoCorrespondeAoPedido,
  resolverAlvoPublicacaoPost,
  type PublicacaoVinculo,
} from '../lib/public-docs-token-binding.ts'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

const TK_CONTRATO_A = 'aaaaaaaaaaaaaaaaaaaaaaa1'
const TK_CONTRATO_B = 'bbbbbbbbbbbbbbbbbbbbbbb1'
const TK_ORC_A = 'aaaaaaaaaaaaaaaaaaaaaaa2'
const TK_OS_A = 'aaaaaaaaaaaaaaaaaaaaaaa3'
const TK_OS_B = 'bbbbbbbbbbbbbbbbbbbbbbb3'
const TK_ALEATORIO = 'cccccccccccccccccccccccc'

const pubContratoA: PublicacaoVinculo = {
  token: TK_CONTRATO_A,
  document_type: 'contrato',
  document_id: 'ctr-A',
  tipo: 'contrato',
  documento_id: 'ctr-A',
  user_id: UUID_A,
}
const pubContratoB: PublicacaoVinculo = {
  token: TK_CONTRATO_B,
  document_type: 'contrato',
  document_id: 'ctr-B',
  tipo: 'contrato',
  documento_id: 'ctr-B',
  user_id: UUID_B,
}
const pubOrcA: PublicacaoVinculo = {
  token: TK_ORC_A,
  document_type: 'orcamento',
  document_id: '100',
  tipo: 'orcamento',
  documento_id: '100',
  user_id: UUID_A,
}
/** Linha legada: só colunas antigas, tipo 'os'. */
const pubOsA: PublicacaoVinculo = {
  token: TK_OS_A,
  document_type: null,
  document_id: null,
  tipo: 'os',
  documento_id: 55,
  user_id: UUID_A,
}
const pubOsB: PublicacaoVinculo = {
  token: TK_OS_B,
  document_type: 'ordem_servico',
  document_id: '77',
  tipo: 'ordem_servico',
  documento_id: '77',
  user_id: UUID_B,
}
const TABELA = [pubContratoA, pubContratoB, pubOrcA, pubOsA, pubOsB]

const ROUTE_SRC = readFileSync(new URL('../app/api/public-docs/route.ts', import.meta.url), 'utf8')
const POST_SRC = ROUTE_SRC.slice(ROUTE_SRC.indexOf('export async function POST'))

/** Consulta legada de OS do GET antes da correção: sem filtro de token. */
function consultaLegadaOsAntiga(documentoId: string) {
  return (
    TABELA.find(
      (r) => ['ordem_servico', 'os'].includes(String(r.tipo)) && String(r.documento_id) === documentoId,
    ) || null
  )
}

/** Consulta legada de OS do GET após a correção: filtro de token + checagem de vínculo. */
function consultaLegadaOsNova(tipo: string, documentoId: string, token: string) {
  const row =
    TABELA.find(
      (r) =>
        ['ordem_servico', 'os'].includes(String(r.tipo)) &&
        String(r.documento_id) === documentoId &&
        r.token === token,
    ) || null
  return row && publicacaoCorrespondeAoPedido(row, { token, tipo, documentoId }) ? row : null
}

describe('SECURITY.1 — normalização canônica da publicação', () => {
  it('aliases de OS convergem para ordem_servico', () => {
    assert.equal(normalizarTipoDocumentoPublico('os'), 'ordem_servico')
    assert.equal(normalizarTipoDocumentoPublico(' ORDEM_SERVICO '), 'ordem_servico')
    assert.equal(normalizarTipoDocumentoPublico('contrato'), 'contrato')
  })

  it('lê colunas novas e legadas; divergência entre elas invalida a publicação', () => {
    assert.deepEqual(documentoCanonicoDaPublicacao(pubOsA), { tipo: 'ordem_servico', documentoId: '55' })
    assert.deepEqual(documentoCanonicoDaPublicacao(pubContratoA), { tipo: 'contrato', documentoId: 'ctr-A' })
    assert.equal(
      documentoCanonicoDaPublicacao({ ...pubContratoA, documento_id: 'ctr-B' }),
      null,
    )
    assert.equal(documentoCanonicoDaPublicacao({ ...pubContratoA, tipo: 'orcamento' }), null)
    assert.equal(documentoCanonicoDaPublicacao({ token: TK_CONTRATO_A }), null)
    assert.equal(documentoCanonicoDaPublicacao(null), null)
  })
})

describe('SECURITY.1 HIGH #2 — GET legado ordem_servico exige token do MESMO documento', () => {
  it('1) token válido + documento correto → sucesso', () => {
    assert.equal(
      publicacaoCorrespondeAoPedido(pubOsA, { token: TK_OS_A, tipo: 'os', documentoId: '55' }),
      true,
    )
    assert.equal(consultaLegadaOsNova('os', '55', TK_OS_A), pubOsA)
  })

  it('2) TOKEN A não lê DOC B (lógica antiga vazava; nova recusa)', () => {
    assert.equal(consultaLegadaOsAntiga('77'), pubOsB)
    assert.equal(consultaLegadaOsNova('os', '77', TK_OS_A), null)
    assert.equal(
      publicacaoCorrespondeAoPedido(pubOsB, { token: TK_OS_A, tipo: 'os', documentoId: '77' }),
      false,
    )
  })

  it('3) token aleatório bem formado → recusado', () => {
    assert.equal(consultaLegadaOsNova('os', '55', TK_ALEATORIO), null)
    assert.equal(
      publicacaoCorrespondeAoPedido(pubOsA, { token: TK_ALEATORIO, tipo: 'os', documentoId: '55' }),
      false,
    )
  })

  it('4) token inválido/vazio → recusado', () => {
    for (const token of ['', '   ', 'zzz', null, undefined]) {
      assert.equal(
        publicacaoCorrespondeAoPedido(pubOsA, { token, tipo: 'os', documentoId: '55' }),
        false,
      )
    }
  })

  it('5) token de orçamento usado para OS → recusado', () => {
    assert.equal(
      publicacaoCorrespondeAoPedido(pubOrcA, { token: TK_ORC_A, tipo: 'os', documentoId: '100' }),
      false,
    )
    assert.equal(consultaLegadaOsNova('ordem_servico', '100', TK_ORC_A), null)
  })

  it('6) token de outro tenant → recusado', () => {
    assert.equal(consultaLegadaOsNova('os', '55', TK_OS_B), null)
    assert.equal(
      publicacaoCorrespondeAoPedido(pubOsB, { token: TK_OS_B, tipo: 'os', documentoId: '55' }),
      false,
    )
  })

  it('7) fluxo legado legítimo continua funcionando (aliases os/ordem_servico, colunas antigas)', () => {
    assert.equal(consultaLegadaOsNova('ordem_servico', '55', TK_OS_A), pubOsA)
    assert.equal(consultaLegadaOsNova('os', '77', TK_OS_B), pubOsB)
    assert.equal(
      publicacaoCorrespondeAoPedido(pubOrcA, { token: TK_ORC_A, tipo: 'orcamento', documentoId: '100' }),
      true,
    )
  })

  it('route.ts: consulta legada de OS filtra por token e valida vínculo', () => {
    const inicio = ROUTE_SRC.indexOf('const legadoQuery =')
    const fim = ROUTE_SRC.indexOf('legadoQuery.maybeSingle()')
    assert.ok(inicio > 0 && fim > inicio)
    const trecho = ROUTE_SRC.slice(inicio, fim)
    const ramoOs = trecho.slice(0, trecho.indexOf(':'))
    assert.ok(ramoOs.includes(".in('tipo', ['ordem_servico', 'os'])"))
    assert.ok(ramoOs.includes(".eq('token', token)"), 'ramo OS legado sem filtro de token')
    assert.equal(trecho.split(".eq('token', token)").length - 1, 2)
    assert.ok(ROUTE_SRC.includes('publicacaoCorrespondeAoPedido(data, { token, tipo, documentoId })'))
  })

  it('route.ts: demais ramos tokenizados do GET continuam filtrando por token', () => {
    const get = ROUTE_SRC.slice(ROUTE_SRC.indexOf('export async function GET'), ROUTE_SRC.indexOf('export async function POST'))
    assert.ok(get.split(".eq('token', token)").length - 1 >= 6)
  })
})

describe('SECURITY.1 HIGH #3 — POST público usa tipo/id/owner canônicos da publicação', () => {
  it('1) token contrato A + body A → funciona, owner e id canônicos', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubContratoA,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.deepEqual(r, {
      ok: true,
      tipo: 'contrato',
      documentoId: 'ctr-A',
      userId: UUID_A,
      podeAtualizarStatusContrato: true,
    })
  })

  it('2) TOKEN A não altera CONTRATO B (body B recusado)', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubContratoA,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-B',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.status, 403)
  })

  it('3) token de orçamento + body contrato → recusado', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubOrcA,
      tipoPedido: 'contrato',
      documentoIdPedido: '100',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(r.ok, false)
  })

  it('4) token de outro tenant + id alvo → recusado', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubContratoB,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(r.ok, false)
  })

  it('5) body.user_id diferente não muda o owner (lógica antiga mudava em publicação sem owner)', () => {
    const semOwner = { ...pubContratoA, user_id: null }
    const body = { user_id: UUID_B, payload: { user_id: UUID_B, owner_user_id: UUID_B } }
    const userIdBearerAusente: string = ''
    const ownerAntigo = String(
      userIdBearerAusente ||
        semOwner.user_id ||
        body.user_id ||
        body.payload.user_id ||
        body.payload.owner_user_id ||
        '',
    )
    assert.equal(ownerAntigo, UUID_B)

    const r = resolverAlvoPublicacaoPost({
      existente: semOwner,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(r.ok && r.userId, '')

    const comOwner = resolverAlvoPublicacaoPost({
      existente: pubContratoA,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(comOwner.ok && comOwner.userId, UUID_A)
  })

  it('6) document_type diferente não muda a publicação', () => {
    for (const tipoPedido of ['recibo', 'orcamento', 'os', '']) {
      const r = resolverAlvoPublicacaoPost({
        existente: pubContratoA,
        tipoPedido,
        documentoIdPedido: 'ctr-A',
        userIdBearer: '',
        tokenConfere: true,
        buscaConclusiva: true,
      })
      assert.equal(r.ok, false, `tipo ${tipoPedido} deveria ser recusado`)
    }
  })

  it('7) assinatura legítima atualiza somente o contrato canônico', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubContratoA,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.ok(r.ok)
    assert.equal(r.documentoId, 'ctr-A')
    assert.equal(r.podeAtualizarStatusContrato, true)

    const orc = resolverAlvoPublicacaoPost({
      existente: pubOrcA,
      tipoPedido: 'orcamento',
      documentoIdPedido: '100',
      userIdBearer: '',
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(orc.ok && orc.podeAtualizarStatusContrato, false)
  })

  it('8) nenhum update/insert acontece antes da validação completa (route.ts)', () => {
    const idxAlvo = POST_SRC.indexOf('resolverAlvoPublicacaoPost(')
    const idxRecusa = POST_SRC.indexOf('if (alvo.ok === false)')
    assert.ok(idxAlvo > 0 && idxRecusa > idxAlvo)
    for (const escrita of ['.update(', '.insert(', '.upsert(']) {
      const idx = POST_SRC.indexOf(escrita)
      if (idx >= 0) assert.ok(idx > idxRecusa, `${escrita} antes da validação`)
    }
  })

  it('TOKEN A não se religa ao DOC B nem com Bearer do próprio dono', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubContratoA,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-X',
      userIdBearer: UUID_A,
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(r.ok, false)
  })

  it('Bearer de outro tenant não altera publicação alheia', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubContratoA,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: UUID_B,
      tokenConfere: true,
      buscaConclusiva: true,
    })
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.status, 403)
  })

  it('sem Bearer: sem publicação ou token não conferido → 401', () => {
    const semPub = resolverAlvoPublicacaoPost({
      existente: null,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: '',
      tokenConfere: false,
      buscaConclusiva: true,
    })
    assert.equal(semPub.ok === false && semPub.status, 401)
    const tokenErrado = resolverAlvoPublicacaoPost({
      existente: pubContratoA,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-A',
      userIdBearer: '',
      tokenConfere: false,
      buscaConclusiva: true,
    })
    assert.equal(tokenErrado.ok === false && tokenErrado.status, 401)
  })

  it('emitente autenticado publica documento novo: owner = Bearer, sem update de contrato pelo body', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: null,
      tipoPedido: 'contrato',
      documentoIdPedido: 'ctr-novo',
      userIdBearer: UUID_A,
      tokenConfere: false,
      buscaConclusiva: true,
    })
    assert.deepEqual(r, {
      ok: true,
      tipo: 'contrato',
      documentoId: 'ctr-novo',
      userId: UUID_A,
      podeAtualizarStatusContrato: false,
    })
  })

  it('emitente autenticado republica o próprio documento (fluxo do painel preservado)', () => {
    const r = resolverAlvoPublicacaoPost({
      existente: pubOsB,
      tipoPedido: 'os',
      documentoIdPedido: '77',
      userIdBearer: UUID_B,
      tokenConfere: false,
      buscaConclusiva: true,
    })
    assert.ok(r.ok)
    assert.equal(r.tipo, 'ordem_servico')
    assert.equal(r.userId, UUID_B)
  })

  it('route.ts: owner nunca vem de body.user_id / payload.user_id', () => {
    assert.equal(POST_SRC.includes('body?.user_id'), false)
    assert.equal(POST_SRC.includes('payloadRecebido?.user_id'), false)
    assert.equal(POST_SRC.includes('payloadRecebido?.owner_user_id'), false)
    assert.ok(POST_SRC.includes('const userId = alvo.userId'))
  })

  it('route.ts: update de contrato e linha salva usam somente ids canônicos', () => {
    assert.ok(POST_SRC.includes(".eq('id', canonicalDocumentId)"))
    assert.equal(POST_SRC.includes(".eq('id', documentoId)"), false)
    assert.ok(POST_SRC.includes('alvo.podeAtualizarStatusContrato'))
    assert.ok(/linhaPublicDocument\(\s*canonicalDocumentType,\s*canonicalDocumentId,/.test(POST_SRC))
  })

  it('route.ts: fluxos preservados (aprovação pública, projeção ADMIN.4.3.13)', () => {
    assert.ok(POST_SRC.includes('mesclarPayloadAprovacaoPublica('))
    assert.ok(POST_SRC.includes('payloadIndicaAprovacaoPublica('))
    assert.ok(ROUTE_SRC.includes('deveUsarViewAprovacao('))
    assert.ok(ROUTE_SRC.includes('montarRespostaViewAprovacao('))
  })
})
