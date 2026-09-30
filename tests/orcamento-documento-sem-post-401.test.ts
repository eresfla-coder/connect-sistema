/**
 * Testes — FIX.PUBLIC-DOCUMENTS.IO.1: a abertura do orçamento não faz mais o POST
 * /api/public-docs sem Authorization e sem token (sempre 401 no servidor).
 * Estrutural: lê o fonte do componente, sem executar React.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const docPageSrc = readFileSync(join(process.cwd(), 'components/documentos/OrcamentoDocumentoPage.tsx'), 'utf8').replace(
  /\r\n/g,
  '\n',
)

function trecho(inicio: string, fim: string) {
  const a = docPageSrc.indexOf(inicio)
  assert.ok(a >= 0, `início não encontrado: ${inicio}`)
  const b = docPageSrc.indexOf(fim, a + inicio.length)
  assert.ok(b > a, `fim não encontrado: ${fim}`)
  return docPageSrc.slice(a, b)
}

const carregarSrc = trecho('async function carregar()', 'carregar()\n    return () => { cancelado = true }')
const resolverLinkQrSrc = trecho('async function resolverLinkQr()', 'void resolverLinkQr()')
const salvarAprovacaoSrc = trecho('async function salvarAprovacaoPublica(', 'async function salvarOrcamentoAprovado(')

describe('FIX.PUBLIC-DOCUMENTS.IO.1 — sem POST 401 na abertura do orçamento', () => {
  it('A) carregar() não faz POST e o bloco sem autenticação foi removido', () => {
    assert.equal(carregarSrc.includes("method: 'POST'"), false)
    assert.equal(docPageSrc.includes('temConfigEmpresaSalva'), false)
    assert.equal(docPageSrc.includes('cfgAtualizado'), false)
  })

  it('A2) só restam os POSTs de resolverLinkQr e salvarAprovacaoPublica', () => {
    const posts = docPageSrc.split("fetch('/api/public-docs', {").length - 1
    assert.equal(posts, 2)
    assert.ok(resolverLinkQrSrc.includes("fetch('/api/public-docs', {"))
    assert.ok(salvarAprovacaoSrc.includes("fetch('/api/public-docs', {"))
  })

  it('B) owner GET autenticado continua na abertura sem token', () => {
    assert.ok(carregarSrc.includes('/api/public-docs?document_type=orcamento&document_id='))
    assert.ok(carregarSrc.includes('headers: { Authorization: `Bearer ${session.access_token}` }'))
  })

  it('C) resolverLinkQr continua publicando com Bearer e com fallback autenticado', () => {
    assert.ok(resolverLinkQrSrc.includes('headers.Authorization = `Bearer ${session.access_token}`'))
    assert.ok(resolverLinkQrSrc.includes("method: 'POST',\n          headers,"))
    assert.ok(resolverLinkQrSrc.includes('/api/public-docs?document_type=orcamento&document_id='))
  })

  it('D) salvarAprovacaoPublica continua enviando o token público da URL', () => {
    assert.ok(salvarAprovacaoSrc.includes('token: tokenAtual || undefined'))
    assert.ok(docPageSrc.includes("await salvarOrcamentoAprovado('Aprovado', assinatura)"))
    assert.ok(docPageSrc.includes("await salvarOrcamentoAprovado('Cancelado')"))
  })

  it('E) abertura com token continua usando /api/public-docs/[token] e config por token', () => {
    assert.ok(carregarSrc.includes('fetch(`/api/public-docs/${encodeURIComponent(tokenPublico)}`'))
    assert.ok(carregarSrc.includes('/api/public-docs/config?token=${encodeURIComponent(tokenPublico)}'))
  })

  it('F) impressão continua presente', () => {
    assert.ok(docPageSrc.includes('window.setTimeout(() => window.print(), 600)'))
    assert.ok(docPageSrc.includes('onClick={() => window.print()}'))
  })
})
