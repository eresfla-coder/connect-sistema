/**
 * Testes — ADMIN.4.3.13: GET /api/public-docs `view=aprovacao` (projeção mínima do sync de aprovação).
 * Sem banco: projeção PostgREST `payload->campo` simulada sobre fixtures sintéticas.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  CAMPOS_VIEW_APROVACAO,
  PUBLIC_DOCS_APROVACAO_VIEW_COLS,
  PUBLIC_DOCS_VIEW_APROVACAO,
  deveUsarViewAprovacao,
  montarRespostaViewAprovacao,
} from '../lib/public-docs-aprovacao-view.ts'
import {
  CAMPOS_PATCH_APROVACAO_PUBLICA,
  extrairPatchAprovacaoPublica,
  serializacaoCanonica,
} from '../lib/aprovacoes-publicas-sync.ts'

const root = process.cwd()
const routeSrc = readFileSync(join(root, 'app/api/public-docs/route.ts'), 'utf8')
const pageSrc = readFileSync(join(root, 'app/(painel)/orcamentos/page.tsx'), 'utf8')
const docPageSrc = readFileSync(join(root, 'components/documentos/OrcamentoDocumentoPage.tsx'), 'utf8')
const osPageSrc = readFileSync(join(root, 'app/(painel)/ordens-servico/page.tsx'), 'utf8')

const OWNER = 'owner-sintetico-0001'
const TOKEN_VALIDO = 'a1b2c3d4e5f60718293a4b5c'

function trecho(src: string, inicio: string, fim: string): string {
  const i = src.indexOf(inicio)
  assert.ok(i >= 0, `marcador não encontrado: ${inicio}`)
  const j = src.indexOf(fim, i + inicio.length)
  assert.ok(j > i, `marcador final não encontrado: ${fim}`)
  return src.slice(i, j)
}

function ocorrencias(src: string, alvo: string): number {
  return src.split(alvo).length - 1
}

const ramoOs = trecho(
  routeSrc,
  "if (documentType === 'ordem_servico' && documentId) {",
  "if ((documentType === 'contrato' || documentType === 'recibo') && documentId) {",
)
const ramoContratoRecibo = trecho(
  routeSrc,
  "if ((documentType === 'contrato' || documentType === 'recibo') && documentId) {",
  "if (documentType === 'orcamento' && documentId) {",
)
const ramoOrcamento = trecho(routeSrc, "if (documentType === 'orcamento' && documentId) {", 'const tipo = tipoLegado')
const ramoLegado = trecho(routeSrc, 'const tipo = tipoLegado', 'export async function POST')
const handlerPost = routeSrc.slice(routeSrc.indexOf('export async function POST'))
const fnBuscarOwner = trecho(routeSrc, 'async function buscarDocumentoOwner', 'async function userIdDoToken')
const blocoView = ramoOrcamento.slice(0, ramoOrcamento.indexOf('let result'))
const fluxoOrcamentoAnterior = ramoOrcamento.slice(ramoOrcamento.indexOf('let result'))

/** Simula PostgREST `alias:payload->campo`: preserva tipo JSON; chave ausente/payload não-objeto → null. */
function projetarComoPostgrest(payload: unknown): Record<string, unknown> {
  const p =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null
  const row: Record<string, unknown> = {}
  for (const campo of CAMPOS_VIEW_APROVACAO) {
    const valor = p ? p[campo] : undefined
    row[campo] = valor === undefined ? null : JSON.parse(JSON.stringify(valor))
  }
  return row
}

/** Simula NextResponse.json → resp.json(). */
function viaHttp<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T
}

function linhaCompleta(payload: unknown): Record<string, unknown> {
  return {
    token: TOKEN_VALIDO,
    document_type: 'orcamento',
    document_id: '1790000000000',
    documento_id: '1790000000000',
    tipo: 'orcamento',
    user_id: OWNER,
    payload,
    updated_at: '2026-09-27T12:00:00.000Z',
    created_at: '2026-09-01T12:00:00.000Z',
  }
}

function bytesUtf8(valor: unknown): number {
  return Buffer.byteLength(JSON.stringify(valor), 'utf8')
}

const ASSINATURA = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'.repeat(60)}`
const LOGO_BASE64 = `data:image/png;base64,${'L'.repeat(300_000)}`

const PAYLOAD_PESADO = {
  id: 1790000000000,
  cliente: 'Cliente Sintético Pesado',
  itens: Array.from({ length: 40 }, (_, i) => ({ descricao: `Item sintético ${i}`, quantidade: 1, valor: 100 + i })),
  status: 'Aprovado',
  aprovado: true,
  aprovadoEm: '2026-09-20T12:00:00.000Z',
  atualizadoEm: 1790000005000,
  aprovacaoDigital: {
    status: 'aprovado',
    nome: 'Fulano Sintético',
    data: '2026-09-20T12:00:00.000Z',
    assinatura: ASSINATURA,
    origem: 'link-publico',
  },
  token: TOKEN_VALIDO,
  user_id: OWNER,
  owner_user_id: OWNER,
  cfg: { nome_empresa: 'Empresa Sintética', logo: LOGO_BASE64, cor_primaria: '#123456' },
  config: { nome_empresa: 'Empresa Sintética', logo: LOGO_BASE64 },
  empresa_nome: 'Empresa Sintética',
  empresa_cnpj: '00.000.000/0000-00',
  empresa_logo: LOGO_BASE64,
  empresa_logo_og: 'https://exemplo.invalid/api/public-docs/logo-og?t=sintetico',
}

const FIXTURES: Array<{ nome: string; payload: unknown }> = [
  {
    nome: 'Pendente',
    payload: {
      status: 'Pendente',
      aprovado: false,
      cliente: 'Cliente Sintético',
      itens: [{ descricao: 'Serviço', quantidade: 1, valor: 100 }],
      atualizadoEm: 1790000000000,
    },
  },
  {
    nome: 'Aprovado com assinatura',
    payload: {
      status: 'Aprovado',
      aprovado: true,
      aprovadoEm: '2026-09-20T12:00:00.000Z',
      atualizadoEm: 1790000001000,
      aprovacaoDigital: {
        status: 'aprovado',
        nome: 'Fulano Sintético',
        data: '2026-09-20T12:00:00.000Z',
        assinatura: ASSINATURA,
        origem: 'link-publico',
      },
    },
  },
  {
    nome: 'Cancelado + aprovacaoDigital recusado',
    payload: {
      status: 'Cancelado',
      aprovado: false,
      atualizadoEm: 1790000002000,
      aprovacaoDigital: { status: 'recusado', nome: 'Beltrano Sintético', data: '2026-09-21T09:00:00.000Z', origem: 'link-publico' },
    },
  },
  { nome: 'Recusado (texto)', payload: { status: 'Recusado', aprovacaoDigital: { status: 'recusado' } } },
  { nome: 'cancelado minúsculo', payload: { status: 'cancelado' } },
  { nome: 'somente aprovadoEm', payload: { aprovadoEm: '2026-09-21T08:30:00.000Z' } },
  { nome: 'atualizadoEm string numérica', payload: { status: 'Pendente', atualizadoEm: '1790000003000' } },
  { nome: 'atualizadoEm zero', payload: { atualizadoEm: 0 } },
  { nome: 'atualizadoEm negativo', payload: { atualizadoEm: -5 } },
  { nome: 'atualizadoEm não numérico', payload: { atualizadoEm: 'abc' } },
  {
    nome: 'aprovacaoDigital aninhada',
    payload: {
      status: 'Aprovado',
      aprovacaoDigital: {
        status: 'aprovado',
        nome: 'X',
        assinatura: ASSINATURA,
        meta: { tentativas: [1, 2, 3], ok: true, vazio: null, sub: { a: 'b' } },
      },
    },
  },
  { nome: 'campos ausentes', payload: { cliente: 'Sem aprovação', itens: [] } },
  {
    nome: 'todos null',
    payload: { status: null, aprovado: null, aprovadoEm: null, aprovacaoDigital: null, atualizadoEm: null },
  },
  { nome: 'null parcial', payload: { status: 'Aprovado', aprovado: true, aprovadoEm: null, aprovacaoDigital: null } },
  { nome: 'payload null', payload: null },
  { nome: 'payload vazio', payload: {} },
  {
    nome: 'tipos incorretos',
    payload: { status: 123, aprovado: 'true', aprovadoEm: 456, aprovacaoDigital: [{ status: 'aprovado' }], atualizadoEm: true },
  },
  { nome: 'aprovacaoDigital string', payload: { aprovacaoDigital: 'aprovado' } },
  { nome: 'pesado com cfg/config/logo base64', payload: PAYLOAD_PESADO },
]

const CHAVES_PROIBIDAS = new Set([
  'token',
  'user_id',
  'owner_user_id',
  'cfg',
  'config',
  'empresa_logo',
  'empresa_logo_og',
  'document_type',
  'document_id',
  'documento_id',
  'tipo',
  'updated_at',
  'created_at',
  'itens',
  'cliente',
])

function chavesProibidasEncontradas(valor: unknown, caminho = ''): string[] {
  if (!valor || typeof valor !== 'object') return []
  const achadas: string[] = []
  for (const [chave, filho] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVES_PROIBIDAS.has(chave) || chave.startsWith('empresa_')) achadas.push(`${caminho}${chave}`)
    achadas.push(...chavesProibidasEncontradas(filho, `${caminho}${chave}.`))
  }
  return achadas
}

describe('ADMIN.4.3.13 — projeção PostgREST', () => {
  it('campos da view = allowlist do patch de aprovação', () => {
    assert.deepEqual([...CAMPOS_VIEW_APROVACAO], [...CAMPOS_PATCH_APROVACAO_PUBLICA])
  })

  it('select usa `alias:payload->campo` (JSON preservado), sem `->>`, `*` ou colunas de metadados', () => {
    assert.equal(
      PUBLIC_DOCS_APROVACAO_VIEW_COLS,
      CAMPOS_PATCH_APROVACAO_PUBLICA.map((c) => `${c}:payload->${c}`).join(','),
    )
    assert.ok(!PUBLIC_DOCS_APROVACAO_VIEW_COLS.includes('->>'))
    assert.ok(!PUBLIC_DOCS_APROVACAO_VIEW_COLS.includes('*'))
    for (const proibida of ['token', 'user_id', 'cfg', 'config', 'empresa_', 'updated_at', 'created_at']) {
      assert.ok(!PUBLIC_DOCS_APROVACAO_VIEW_COLS.includes(proibida), proibida)
    }
  })
})

describe('ADMIN.4.3.13 — segurança', () => {
  it('A) owner autenticado + orçamento + view=aprovacao → resposta mínima', () => {
    assert.equal(PUBLIC_DOCS_VIEW_APROVACAO, 'aprovacao')
    assert.equal(
      deveUsarViewAprovacao({ view: 'aprovacao', documentType: 'orcamento', token: '', userIdOwner: OWNER }),
      true,
    )
    const resposta = viaHttp(montarRespostaViewAprovacao(projetarComoPostgrest(PAYLOAD_PESADO)))
    assert.deepEqual(Object.keys(resposta), ['payload'])
    for (const chave of Object.keys(resposta.payload)) {
      assert.ok((CAMPOS_VIEW_APROVACAO as readonly string[]).includes(chave), chave)
    }
    assert.deepEqual(Object.keys(resposta.payload).sort(), [...CAMPOS_VIEW_APROVACAO].sort())

    assert.ok(blocoView.includes('deveUsarViewAprovacao({ view: url.searchParams.get(\'view\'), documentType, token, userIdOwner })'))
    assert.match(
      blocoView,
      /buscarDocumentoOwner\(\s*supabaseAdmin,\s*'orcamento',\s*documentId,\s*userIdOwner,\s*PUBLIC_DOCS_APROVACAO_VIEW_COLS,\s*\)/,
    )
    assert.ok(blocoView.includes('return NextResponse.json(montarRespostaViewAprovacao(data))'))
    assert.ok(blocoView.includes("{ success: false, error: 'Documento não encontrado.' }"))
    assert.ok(blocoView.includes('return erroApi(error)'))
  })

  it('B) owner autenticado + orçamento sem view (ou view diferente) → contrato anterior', () => {
    for (const view of [null, undefined, '', 'APROVACAO', 'aprovacao ', 'full', 'aprovacao,full']) {
      assert.equal(
        deveUsarViewAprovacao({ view, documentType: 'orcamento', token: '', userIdOwner: OWNER }),
        false,
        String(view),
      )
    }
    assert.ok(fluxoOrcamentoAnterior.includes("result = await buscarDocumentoOwner(supabaseAdmin, 'orcamento', documentId, userIdOwner)"))
    assert.ok(fluxoOrcamentoAnterior.includes('return NextResponse.json(data)'))
    assert.ok(!fluxoOrcamentoAnterior.includes('montarRespostaViewAprovacao'))
    assert.ok(!fluxoOrcamentoAnterior.includes('PUBLIC_DOCS_APROVACAO_VIEW_COLS'))

    assert.ok(fnBuscarOwner.includes("cols: Cols = '*' as Cols"))
    assert.equal(ocorrencias(fnBuscarOwner, '.select(cols)'), 3)
    assert.equal(ocorrencias(fnBuscarOwner, ".select('*')"), 0)
  })

  it('C) token público + view=aprovacao → sem projeção nem privilégio (fluxo anterior)', () => {
    for (const userIdOwner of ['', OWNER]) {
      for (const token of [TOKEN_VALIDO, 'abc', 'token-invalido-nao-hex']) {
        assert.equal(
          deveUsarViewAprovacao({ view: 'aprovacao', documentType: 'orcamento', token, userIdOwner }),
          false,
          `${token}/${userIdOwner ? 'owner' : 'anon'}`,
        )
      }
    }
    assert.equal(
      deveUsarViewAprovacao({ view: 'aprovacao', documentType: 'orcamento', token: '', userIdOwner: '' }),
      false,
    )
    assert.match(
      fluxoOrcamentoAnterior,
      /if \(token && tokenFormatoValido\(token\)\) \{\s*result = await supabaseAdmin\s*\.from\('public_documents'\)\s*\.select\('\*'\)\s*\.eq\('tipo', 'orcamento'\)\s*\.eq\('documento_id', documentId\)\s*\.eq\('token', token\)\s*\.maybeSingle\(\)/,
    )
    assert.ok(fluxoOrcamentoAnterior.includes("'Token obrigatório para acessar este documento.'"))
    assert.ok(!blocoView.includes("eq('token'"))
    assert.ok(!blocoView.includes('tokenFormatoValido'))
  })

  it('D) ordem_servico + view=aprovacao → comportamento anterior', () => {
    for (const documentType of ['ordem_servico', 'os']) {
      assert.equal(
        deveUsarViewAprovacao({ view: 'aprovacao', documentType, token: '', userIdOwner: OWNER }),
        false,
      )
    }
    for (const alvo of ['view', 'PUBLIC_DOCS_APROVACAO_VIEW_COLS', 'montarRespostaViewAprovacao', 'deveUsarViewAprovacao']) {
      assert.ok(!ramoOs.includes(alvo), alvo)
    }
    assert.ok(ramoOs.includes("result = await buscarDocumentoOwner(supabaseAdmin, 'ordem_servico', documentId, userIdOwner)"))
    assert.ok(!osPageSrc.includes('view=aprovacao'))
  })

  it('E) contrato/recibo/legado + view=aprovacao → comportamento anterior', () => {
    for (const documentType of ['contrato', 'recibo', '', 'Orcamento', 'orcamentos']) {
      assert.equal(
        deveUsarViewAprovacao({ view: 'aprovacao', documentType, token: '', userIdOwner: OWNER }),
        false,
        documentType,
      )
    }
    for (const bloco of [ramoContratoRecibo, ramoLegado, handlerPost]) {
      for (const alvo of ['view', 'PUBLIC_DOCS_APROVACAO_VIEW_COLS', 'montarRespostaViewAprovacao', 'deveUsarViewAprovacao']) {
        assert.ok(!bloco.includes(alvo), alvo)
      }
    }
    assert.ok(ramoLegado.includes('buscarDocumentoOwner(supabaseAdmin, tipoNorm, documentoId, userIdOwner)'))
    assert.equal(ocorrencias(routeSrc, 'deveUsarViewAprovacao('), 1)
    assert.equal(ocorrencias(routeSrc, 'montarRespostaViewAprovacao('), 1)
  })

  it('F) resposta projetada não contém token, IDs, cfg/config, logos nem empresa_*', () => {
    for (const { nome, payload } of FIXTURES) {
      const resposta = viaHttp(montarRespostaViewAprovacao(projetarComoPostgrest(payload)))
      assert.deepEqual(chavesProibidasEncontradas(resposta), [], nome)
      const json = JSON.stringify(resposta)
      assert.ok(!json.includes(TOKEN_VALIDO), nome)
      assert.ok(!json.includes(OWNER), nome)
      assert.ok(!json.includes('LLLLLLLLLL'), nome)
      assert.ok(!json.includes('Empresa Sintética'), nome)
    }
    const linhaInteira = montarRespostaViewAprovacao(linhaCompleta(PAYLOAD_PESADO))
    assert.deepEqual(chavesProibidasEncontradas(linhaInteira), [])
    assert.deepEqual(linhaInteira, { payload: {} })
  })
})

describe('ADMIN.4.3.13 — equivalência funcional', () => {
  it('extrairPatchAprovacaoPublica(completo) ≡ extrairPatchAprovacaoPublica(projetado) em todas as fixtures', () => {
    for (const { nome, payload } of FIXTURES) {
      const completo = viaHttp(linhaCompleta(payload))
      const projetado = viaHttp(montarRespostaViewAprovacao(projetarComoPostgrest(payload)))
      const patchCompleto = extrairPatchAprovacaoPublica(completo.payload)
      const patchProjetado = extrairPatchAprovacaoPublica(projetado.payload)
      assert.deepEqual(patchProjetado, patchCompleto, nome)
      assert.equal(serializacaoCanonica(patchProjetado), serializacaoCanonica(patchCompleto), nome)
      for (const campo of CAMPOS_PATCH_APROVACAO_PUBLICA) {
        assert.deepEqual(patchProjetado[campo], patchCompleto[campo], `${nome}.${campo}`)
      }
    }
  })

  it('aprovacaoDigital: objeto JSON íntegro, profundamente idêntico, assinatura byte a byte', () => {
    const comAprovacao = FIXTURES.filter(
      ({ payload }) =>
        !!payload &&
        typeof (payload as Record<string, unknown>).aprovacaoDigital === 'object' &&
        !Array.isArray((payload as Record<string, unknown>).aprovacaoDigital) &&
        (payload as Record<string, unknown>).aprovacaoDigital !== null,
    )
    assert.ok(comAprovacao.length >= 4)
    for (const { nome, payload } of comAprovacao) {
      const original = (payload as Record<string, unknown>).aprovacaoDigital as Record<string, unknown>
      const projetado = viaHttp(montarRespostaViewAprovacao(projetarComoPostgrest(payload)))
      const digital = projetado.payload.aprovacaoDigital as Record<string, unknown>
      assert.equal(typeof digital, 'object', nome)
      assert.ok(!Array.isArray(digital), nome)
      assert.deepEqual(digital, original, nome)
      assert.equal(serializacaoCanonica(digital), serializacaoCanonica(original), nome)
      if (typeof original.assinatura === 'string') {
        assert.equal(digital.assinatura, original.assinatura, nome)
        assert.equal(Buffer.byteLength(String(digital.assinatura)), Buffer.byteLength(original.assinatura), nome)
      }
      const patch = extrairPatchAprovacaoPublica(projetado.payload)
      assert.deepEqual(patch.aprovacaoDigital, original, nome)
    }
  })

  it('null/ausente: campos nulos são omitidos e o patch permanece igual ao atual', () => {
    for (const nome of ['campos ausentes', 'todos null', 'payload null', 'payload vazio']) {
      const { payload } = FIXTURES.find((f) => f.nome === nome)!
      const projetado = viaHttp(montarRespostaViewAprovacao(projetarComoPostgrest(payload)))
      assert.deepEqual(projetado, { payload: {} }, nome)
      assert.deepEqual(extrairPatchAprovacaoPublica(projetado.payload), {}, nome)
      assert.deepEqual(extrairPatchAprovacaoPublica(viaHttp(linhaCompleta(payload)).payload), {}, nome)
    }
    const parcial = FIXTURES.find((f) => f.nome === 'null parcial')!.payload
    const projetado = viaHttp(montarRespostaViewAprovacao(projetarComoPostgrest(parcial)))
    assert.deepEqual(projetado, { payload: { status: 'Aprovado', aprovado: true } })
    assert.deepEqual(extrairPatchAprovacaoPublica(projetado.payload), { status: 'Aprovado', aprovado: true })
  })

  it('valores são repassados sem conversão de tipo (a allowlist de tipos continua no extrator)', () => {
    const tipos = FIXTURES.find((f) => f.nome === 'tipos incorretos')!.payload as Record<string, unknown>
    const projetado = viaHttp(montarRespostaViewAprovacao(projetarComoPostgrest(tipos)))
    assert.deepEqual(projetado.payload, tipos)
    const numString = viaHttp(
      montarRespostaViewAprovacao(projetarComoPostgrest({ atualizadoEm: '1790000003000' })),
    )
    assert.equal(numString.payload.atualizadoEm, '1790000003000')
  })
})

describe('ADMIN.4.3.13 — redução lógica de bytes (JSON UTF-8, não é Disk I/O físico)', () => {
  it('fixture pesada: FULL_ROW_BYTES vs PROJECTED_RESPONSE_BYTES com o mesmo patch', () => {
    const linha = linhaCompleta(PAYLOAD_PESADO)
    const resposta = montarRespostaViewAprovacao(projetarComoPostgrest(PAYLOAD_PESADO))
    const FULL_ROW_BYTES = bytesUtf8(linha)
    const PROJECTED_RESPONSE_BYTES = bytesUtf8(resposta)
    const REDUCTION_PERCENT = Number(((1 - PROJECTED_RESPONSE_BYTES / FULL_ROW_BYTES) * 100).toFixed(2))
    console.log(
      `[ADMIN.4.3.13][LOGICAL_JSON_BYTES — não é Disk I/O físico] FULL_ROW_BYTES=${FULL_ROW_BYTES} PROJECTED_RESPONSE_BYTES=${PROJECTED_RESPONSE_BYTES} REDUCTION_PERCENT=${REDUCTION_PERCENT}`,
    )
    assert.ok(PROJECTED_RESPONSE_BYTES < FULL_ROW_BYTES)
    assert.ok(REDUCTION_PERCENT >= 95, String(REDUCTION_PERCENT))
    assert.deepEqual(
      extrairPatchAprovacaoPublica(viaHttp(resposta).payload),
      extrairPatchAprovacaoPublica(viaHttp(linha).payload),
    )
  })
})

describe('ADMIN.4.3.13 — cliente', () => {
  it('somente o fetch de sincronizarAprovacoesPublicas usa view=aprovacao', () => {
    assert.equal(ocorrencias(pageSrc, 'view=aprovacao'), 1)
    const fnSync = trecho(
      pageSrc,
      "async function sincronizarAprovacoesPublicas(motivo: AprovacoesSyncMotivo = 'interval') {",
      'sincronizarAprovacoesPublicasRef.current = sincronizarAprovacoesPublicas',
    )
    assert.ok(
      fnSync.includes(
        '`/api/public-docs?document_type=orcamento&document_id=${encodeURIComponent(String(orcamento.id))}&view=aprovacao&t=${Date.now()}`',
      ),
    )
    assert.ok(fnSync.includes('extrairPatchAprovacaoPublica(json?.payload)'))
    assert.ok(fnSync.includes('await supabase.auth.getSession()'))
    assert.ok(fnSync.includes('APROVACOES_SYNC_FANOUT_MAX'))
  })

  it('OrcamentoDocumentoPage e demais consumidores não usam view=aprovacao', () => {
    assert.ok(!docPageSrc.includes('view=aprovacao'))
    assert.ok(docPageSrc.includes('/api/public-docs?document_type=orcamento&document_id='))
    assert.ok(!osPageSrc.includes('view=aprovacao'))
  })
})
