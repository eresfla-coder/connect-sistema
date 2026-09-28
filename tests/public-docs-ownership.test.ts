import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  alvosUpdateAposConflito,
  documentoCanonicoDaPublicacao,
  ERRO_OWNERSHIP_PUBLICACAO,
  publicacaoCorrespondeAoPedido,
  resolverAlvoPublicacaoPost,
  salvarPublicacaoComOwnership,
  type ExecutorPublicacao,
  type FiltroPublicacao,
  type PublicacaoVinculo,
} from '../lib/public-docs-token-binding.ts'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

const TK_A = 'aaaaaaaaaaaaaaaaaaaaaa01'
const TK_B = 'bbbbbbbbbbbbbbbbbbbbbb01'
const TK_LEGADO = 'dddddddddddddddddddddd01'
const TK_NOVO = 'eeeeeeeeeeeeeeeeeeeeee01'

type Linha = Record<string, unknown>

/** Espelha linhaPublicDocument de route.ts. */
function linha(tipo: string, documentoId: string, token: string, userId?: string): Linha {
  return {
    token,
    document_type: tipo,
    document_id: documentoId,
    tipo,
    documento_id: documentoId,
    payload: {},
    ...(userId ? { user_id: userId } : {}),
  }
}

function pubA(): Linha {
  return { ...linha('orcamento', '100', TK_A, USER_A) }
}
function pubB(): Linha {
  return { ...linha('orcamento', '200', TK_B, USER_B) }
}
/** Publicação legada sem owner (só colunas antigas). */
function pubLegadoSemOwner(): Linha {
  return { token: TK_LEGADO, tipo: 'os', documento_id: '55', user_id: null, payload: {} }
}

function casa(row: Linha, f: FiltroPublicacao): boolean {
  const v = row[f.coluna]
  if (f.op === 'is_null') return v === null || v === undefined
  if (v === null || v === undefined) return false
  if (f.op === 'in') return f.valor.includes(String(v))
  return String(v) === f.valor
}

function chaveDocumento(row: Linha): string {
  const c = documentoCanonicoDaPublicacao(row as PublicacaoVinculo)
  return c ? `${c.tipo}:${c.documentoId}` : ''
}

/** Banco em memória com unicidade por token e por documento canônico. */
function criarBanco(inicial: Linha[]) {
  const tabela = inicial.map((l) => ({ ...l }))
  const mutacoes: { op: 'insert' | 'update'; ownersAfetados: unknown[] }[] = []

  function viola(candidata: Linha, ignorar: Set<Linha>) {
    const chave = chaveDocumento(candidata)
    return tabela.some(
      (r) => !ignorar.has(r) && (r.token === candidata.token || (chave && chaveDocumento(r) === chave)),
    )
  }

  const executor: ExecutorPublicacao = {
    async inserir(l) {
      if (viola(l, new Set())) return { error: { code: '23505', message: 'duplicate key' } }
      tabela.push({ ...l })
      mutacoes.push({ op: 'insert', ownersAfetados: [l.user_id ?? null] })
      return { error: null }
    },
    async atualizar(l, filtros) {
      const alvo = tabela.filter((r) => filtros.every((f) => casa(r, f)))
      if (!alvo.length) return { error: null, linhasAfetadas: 0 }
      const resultado = alvo.map((r) => ({ ...r, ...l }))
      if (resultado.some((r) => viola(r, new Set(alvo)))) {
        return { error: { code: '23505', message: 'duplicate key' }, linhasAfetadas: 0 }
      }
      mutacoes.push({ op: 'update', ownersAfetados: alvo.map((r) => r.user_id ?? null) })
      alvo.forEach((r, i) => Object.assign(r, resultado[i]))
      return { error: null, linhasAfetadas: alvo.length }
    },
  }

  return { tabela, executor, mutacoes }
}

/**
 * Mesma sequência do POST de route.ts: resolverAlvoPublicacaoPost → linha canônica →
 * salvarPublicacaoComOwnership. `existente` = o que a busca devolveu (null em timeout).
 */
async function postSimulado(
  banco: ReturnType<typeof criarBanco>,
  req: {
    existente: Linha | null
    buscaConclusiva?: boolean
    userIdBearer?: string
    tokenRecebido?: string
    tipo: string
    documentoId: string
  },
) {
  const tokenRecebido = req.tokenRecebido || ''
  const tokenConfere = Boolean(tokenRecebido && req.existente && req.existente.token === tokenRecebido)
  const alvo = resolverAlvoPublicacaoPost({
    existente: req.existente as PublicacaoVinculo | null,
    tipoPedido: req.tipo,
    documentoIdPedido: req.documentoId,
    userIdBearer: req.userIdBearer || '',
    tokenConfere,
    buscaConclusiva: req.buscaConclusiva ?? true,
  })
  if (alvo.ok === false) return { status: alvo.status as number }

  const token = String(req.existente?.token || tokenRecebido || TK_NOVO)
  const r = await salvarPublicacaoComOwnership({
    existente: req.existente as PublicacaoVinculo | null,
    linha: linha(alvo.tipo, alvo.documentoId, token, alvo.userId || undefined),
    ownerAutenticado: req.userIdBearer || '',
    tipo: alvo.tipo,
    documentoId: alvo.documentoId,
    executor: banco.executor,
  })
  if (r.error) return { status: r.error.code === ERRO_OWNERSHIP_PUBLICACAO ? 409 : 500 }
  return { status: 200 }
}

function linhaPorToken(banco: ReturnType<typeof criarBanco>, token: string) {
  return banco.tabela.find((r) => r.token === token)
}

function nenhumaMutacaoEm(banco: ReturnType<typeof criarBanco>, owner: unknown) {
  return banco.mutacoes.every((m) => !m.ownersAfetados.includes(owner))
}

const ROUTE_SRC = readFileSync(new URL('../app/api/public-docs/route.ts', import.meta.url), 'utf8')
const POST_SRC = ROUTE_SRC.slice(ROUTE_SRC.indexOf('export async function POST'))

describe('SECURITY.1a MEDIUM #1 — timeout + 23505 não cria bypass de ownership', () => {
  it('1) USER_A publica documento novo normalmente', async () => {
    const banco = criarBanco([pubB()])
    const r = await postSimulado(banco, {
      existente: null,
      userIdBearer: USER_A,
      tokenRecebido: TK_NOVO,
      tipo: 'orcamento',
      documentoId: '300',
    })
    assert.equal(r.status, 200)
    assert.equal(linhaPorToken(banco, TK_NOVO)?.user_id, USER_A)
    assert.ok(nenhumaMutacaoEm(banco, USER_B))
  })

  it('2) USER_A atualiza a própria publicação', async () => {
    const banco = criarBanco([pubA(), pubB()])
    const r = await postSimulado(banco, {
      existente: pubA(),
      userIdBearer: USER_A,
      tokenRecebido: TK_A,
      tipo: 'orcamento',
      documentoId: '100',
    })
    assert.equal(r.status, 200)
    assert.equal(banco.mutacoes.length, 1)
    assert.deepEqual(banco.mutacoes[0].ownersAfetados, [USER_A])
  })

  it('3) USER_A não atualiza publicação de USER_B pelo token', async () => {
    const banco = criarBanco([pubA(), pubB()])
    const r = await postSimulado(banco, {
      existente: pubB(),
      userIdBearer: USER_A,
      tokenRecebido: TK_B,
      tipo: 'orcamento',
      documentoId: '200',
    })
    assert.equal(r.status, 403)
    assert.equal(banco.mutacoes.length, 0)
    assert.deepEqual(linhaPorToken(banco, TK_B), pubB())
  })

  it('4) USER_A não atualiza publicação de USER_B por tipo+documento (inclusive via 23505)', async () => {
    const banco = criarBanco([pubB()])
    const encontrada = await postSimulado(banco, {
      existente: pubB(),
      userIdBearer: USER_A,
      tokenRecebido: TK_NOVO,
      tipo: 'orcamento',
      documentoId: '200',
    })
    assert.equal(encontrada.status, 403)

    const conflito = await postSimulado(banco, {
      existente: null,
      userIdBearer: USER_A,
      tokenRecebido: TK_NOVO,
      tipo: 'orcamento',
      documentoId: '200',
    })
    assert.equal(conflito.status, 409)
    assert.deepEqual(linhaPorToken(banco, TK_B), pubB())
    assert.ok(nenhumaMutacaoEm(banco, USER_B))
  })

  it('5) timeout/busca inconclusiva + 23505 não permite cross-tenant', async () => {
    const banco = criarBanco([pubB()])
    const inconclusiva = await postSimulado(banco, {
      existente: null,
      buscaConclusiva: false,
      userIdBearer: USER_A,
      tokenRecebido: TK_B,
      tipo: 'orcamento',
      documentoId: '200',
    })
    assert.equal(inconclusiva.status, 503)
    assert.equal(banco.mutacoes.length, 0)

    const conflitoToken = await salvarPublicacaoComOwnership({
      existente: null,
      linha: linha('orcamento', '300', TK_B, USER_A),
      ownerAutenticado: USER_A,
      tipo: 'orcamento',
      documentoId: '300',
      executor: banco.executor,
    })
    assert.equal(conflitoToken.error?.code, ERRO_OWNERSHIP_PUBLICACAO)
    assert.deepEqual(linhaPorToken(banco, TK_B), pubB())
    assert.ok(nenhumaMutacaoEm(banco, USER_B))
  })

  it('6) conflito legítimo da própria publicação continua funcionando', async () => {
    const banco = criarBanco([pubA(), pubB()])
    const r = await postSimulado(banco, {
      existente: null,
      userIdBearer: USER_A,
      tokenRecebido: TK_NOVO,
      tipo: 'orcamento',
      documentoId: '100',
    })
    assert.equal(r.status, 200)
    const atual = banco.tabela.find((row) => row.document_id === '100')
    assert.equal(atual?.token, TK_NOVO)
    assert.equal(atual?.user_id, USER_A)
    assert.ok(nenhumaMutacaoEm(banco, USER_B))
  })

  it('7) nenhuma mutation cross-tenant antes de ownership comprovado (defesa no helper de gravação)', async () => {
    const banco = criarBanco([pubB()])
    const r = await salvarPublicacaoComOwnership({
      existente: pubB() as PublicacaoVinculo,
      linha: linha('orcamento', '200', TK_B, USER_A),
      ownerAutenticado: USER_A,
      tipo: 'orcamento',
      documentoId: '200',
      executor: banco.executor,
    })
    assert.equal(r.error?.code, ERRO_OWNERSHIP_PUBLICACAO)
    assert.equal(banco.mutacoes.length, 0)
  })

  it('fallback 23505 nunca usa só token/tipo/documento: owner sempre participa', () => {
    const alvos = alvosUpdateAposConflito({ owner: USER_A, tipo: 'os', documentoId: '55' })
    assert.equal(alvos.length, 2)
    for (const filtros of alvos) {
      assert.ok(filtros.some((f) => f.coluna === 'user_id' && f.op === 'eq' && f.valor === USER_A))
      assert.equal(filtros.some((f) => f.coluna === 'token'), false)
    }
    assert.deepEqual(alvosUpdateAposConflito({ owner: '', tipo: 'orcamento', documentoId: '1' }), [])
  })

  it('route.ts: busca inconclusiva falha fechado e gravação passa pelo helper com owner', () => {
    assert.ok(POST_SRC.includes('buscaConclusiva: !erroBusca'))
    assert.ok(POST_SRC.includes('salvarPublicacaoComOwnership({'))
    assert.ok(POST_SRC.includes('ownerAutenticado: userIdBearer'))
    assert.ok(/erroSalvar\.code === ERRO_OWNERSHIP_PUBLICACAO[\s\S]{0,160}status: 409/.test(POST_SRC))
    assert.equal(POST_SRC.includes('update(dadosSalvar)'), false)
    assert.equal(POST_SRC.includes(".eq('token', existente.token)"), false)
    const idxAlvo = POST_SRC.indexOf('if (alvo.ok === false)')
    for (const escrita of ['.update(', '.insert(', '.upsert(']) {
      const idx = POST_SRC.indexOf(escrita)
      if (idx >= 0) assert.ok(idx > idxAlvo, `${escrita} antes da validação`)
    }
  })
})

describe('SECURITY.1a MEDIUM #2 — publicação legada sem owner não é apropriada', () => {
  it('1) nova publicação autenticada recebe owner correto', async () => {
    const banco = criarBanco([])
    const r = await postSimulado(banco, {
      existente: null,
      userIdBearer: USER_A,
      tokenRecebido: TK_NOVO,
      tipo: 'contrato',
      documentoId: 'ctr-1',
    })
    assert.equal(r.status, 200)
    assert.equal(linhaPorToken(banco, TK_NOVO)?.user_id, USER_A)
  })

  it('2) publicação existente com owner correto continua funcionando', async () => {
    const banco = criarBanco([pubA()])
    const r = await postSimulado(banco, {
      existente: pubA(),
      userIdBearer: USER_A,
      tipo: 'orcamento',
      documentoId: '100',
    })
    assert.equal(r.status, 200)
    assert.equal(linhaPorToken(banco, TK_A)?.user_id, USER_A)
  })

  it('3) publicação existente sem owner NÃO é assumida por USER_A', async () => {
    const banco = criarBanco([pubLegadoSemOwner()])
    const r = await postSimulado(banco, {
      existente: pubLegadoSemOwner(),
      userIdBearer: USER_A,
      tokenRecebido: TK_LEGADO,
      tipo: 'os',
      documentoId: '55',
    })
    assert.equal(r.status, 403)
    assert.equal(banco.mutacoes.length, 0)
    assert.equal(linhaPorToken(banco, TK_LEGADO)?.user_id, null)
  })

  it('4) USER_A não injeta seu user_id numa publicação legada ownerless (nem pelo helper, nem via 23505)', async () => {
    const banco = criarBanco([pubLegadoSemOwner()])
    const direto = await salvarPublicacaoComOwnership({
      existente: pubLegadoSemOwner() as PublicacaoVinculo,
      linha: linha('ordem_servico', '55', TK_LEGADO, USER_A),
      ownerAutenticado: USER_A,
      tipo: 'ordem_servico',
      documentoId: '55',
      executor: banco.executor,
    })
    assert.equal(direto.error?.code, ERRO_OWNERSHIP_PUBLICACAO)

    const viaConflito = await postSimulado(banco, {
      existente: null,
      userIdBearer: USER_A,
      tokenRecebido: TK_NOVO,
      tipo: 'os',
      documentoId: '55',
    })
    assert.equal(viaConflito.status, 409)
    assert.equal(banco.mutacoes.length, 0)
    assert.equal(linhaPorToken(banco, TK_LEGADO)?.user_id, null)
  })

  it('5) USER_B também não consegue assumir', async () => {
    const banco = criarBanco([pubLegadoSemOwner()])
    const r = await postSimulado(banco, {
      existente: pubLegadoSemOwner(),
      userIdBearer: USER_B,
      tipo: 'ordem_servico',
      documentoId: '55',
    })
    assert.equal(r.status, 403)
    assert.equal(linhaPorToken(banco, TK_LEGADO)?.user_id, null)
  })

  it('6) token público ownerless: leitura preservada; aprovação por token não atribui owner', async () => {
    const legado = pubLegadoSemOwner() as PublicacaoVinculo
    assert.equal(
      publicacaoCorrespondeAoPedido(legado, { token: TK_LEGADO, tipo: 'os', documentoId: '55' }),
      true,
    )

    const banco = criarBanco([pubLegadoSemOwner()])
    const r = await postSimulado(banco, {
      existente: pubLegadoSemOwner(),
      tokenRecebido: TK_LEGADO,
      tipo: 'os',
      documentoId: '55',
    })
    assert.equal(r.status, 200)
    assert.deepEqual(banco.mutacoes, [{ op: 'update', ownersAfetados: [null] }])
    assert.equal(linhaPorToken(banco, TK_LEGADO)?.user_id, null)
  })

  it('7) mutation que exige owner falha fechado', async () => {
    const banco = criarBanco([])
    const semOwner = await salvarPublicacaoComOwnership({
      existente: null,
      linha: linha('orcamento', '9', TK_NOVO),
      ownerAutenticado: '',
      tipo: 'orcamento',
      documentoId: '9',
      executor: banco.executor,
    })
    assert.equal(semOwner.error?.code, ERRO_OWNERSHIP_PUBLICACAO)

    const ownerDivergente = await salvarPublicacaoComOwnership({
      existente: null,
      linha: linha('orcamento', '9', TK_NOVO, USER_B),
      ownerAutenticado: USER_A,
      tipo: 'orcamento',
      documentoId: '9',
      executor: banco.executor,
    })
    assert.equal(ownerDivergente.error?.code, ERRO_OWNERSHIP_PUBLICACAO)

    const tokenAusente = await salvarPublicacaoComOwnership({
      existente: { user_id: USER_A, tipo: 'orcamento', documento_id: '9' },
      linha: linha('orcamento', '9', '', USER_A),
      ownerAutenticado: USER_A,
      tipo: 'orcamento',
      documentoId: '9',
      executor: banco.executor,
    })
    assert.equal(tokenAusente.error?.code, ERRO_OWNERSHIP_PUBLICACAO)
    assert.equal(banco.mutacoes.length, 0)
  })

  it('UPDATE que não afeta linha (owner mudou/linha sumiu) = ownership não comprovado', async () => {
    const banco = criarBanco([{ ...pubA(), user_id: USER_B }])
    const r = await salvarPublicacaoComOwnership({
      existente: pubA() as PublicacaoVinculo,
      linha: linha('orcamento', '100', TK_A, USER_A),
      ownerAutenticado: USER_A,
      tipo: 'orcamento',
      documentoId: '100',
      executor: banco.executor,
    })
    assert.equal(r.error?.code, ERRO_OWNERSHIP_PUBLICACAO)
    assert.equal(banco.mutacoes.length, 0)
  })
})

describe('SECURITY.1a — lógica anterior (prova de regressão)', () => {
  /** Gravação da SECURITY.1: UPDATE por token sem owner; 23505 → UPDATE por token, depois por tipo+documento. */
  async function salvarLogicaAnterior(
    banco: ReturnType<typeof criarBanco>,
    existente: Linha | null,
    l: Linha,
  ) {
    const tok = (t: unknown): FiltroPublicacao => ({ coluna: 'token', op: 'eq', valor: String(t) })
    if (existente?.token) return banco.executor.atualizar(l, [tok(existente.token)])
    const ins = await banco.executor.inserir(l)
    if (!ins.error || ins.error.code !== '23505') return ins
    const porToken = await banco.executor.atualizar(l, [tok(l.token)])
    if (porToken.linhasAfetadas) return porToken
    return banco.executor.atualizar(l, [
      { coluna: 'document_type', op: 'eq', valor: String(l.document_type) },
      { coluna: 'document_id', op: 'eq', valor: String(l.document_id) },
    ])
  }

  it('timeout + 23505: a lógica anterior sobrescrevia a publicação de USER_B; a nova recusa', async () => {
    const antigo = criarBanco([pubB()])
    await salvarLogicaAnterior(antigo, null, linha('orcamento', '200', TK_NOVO, USER_A))
    assert.equal(antigo.tabela.find((r) => r.document_id === '200')?.user_id, USER_A)

    const novo = criarBanco([pubB()])
    const r = await postSimulado(novo, {
      existente: null,
      userIdBearer: USER_A,
      tokenRecebido: TK_NOVO,
      tipo: 'orcamento',
      documentoId: '200',
    })
    assert.equal(r.status, 409)
    assert.equal(novo.tabela.find((r2) => r2.document_id === '200')?.user_id, USER_B)
  })

  it('ownerless: a lógica anterior gravava user_id do Bearer; a nova recusa', async () => {
    const antigo = criarBanco([pubLegadoSemOwner()])
    await salvarLogicaAnterior(antigo, pubLegadoSemOwner(), linha('ordem_servico', '55', TK_LEGADO, USER_A))
    assert.equal(linhaPorToken(antigo, TK_LEGADO)?.user_id, USER_A)

    const novo = criarBanco([pubLegadoSemOwner()])
    const r = await postSimulado(novo, {
      existente: pubLegadoSemOwner(),
      userIdBearer: USER_A,
      tipo: 'os',
      documentoId: '55',
    })
    assert.equal(r.status, 403)
    assert.equal(linhaPorToken(novo, TK_LEGADO)?.user_id, null)
  })
})

describe('SECURITY.1a — invariantes do fluxo public-docs', () => {
  const base = { tokenConfere: true, buscaConclusiva: true }

  it('A) token não define sozinho ownership', () => {
    const r = resolverAlvoPublicacaoPost({
      ...base,
      existente: pubB() as PublicacaoVinculo,
      tipoPedido: 'orcamento',
      documentoIdPedido: '200',
      userIdBearer: USER_A,
    })
    assert.equal(r.ok, false)
  })

  it('B/C) document_id e document_type do body não definem autoridade', () => {
    for (const [tipoPedido, documentoIdPedido] of [
      ['orcamento', '999'],
      ['contrato', '100'],
    ]) {
      const r = resolverAlvoPublicacaoPost({
        ...base,
        existente: pubA() as PublicacaoVinculo,
        tipoPedido,
        documentoIdPedido,
        userIdBearer: '',
      })
      assert.equal(r.ok, false)
    }
  })

  it('D) body.user_id não define autoridade (não é entrada do resolvedor; rota não o lê)', () => {
    assert.equal(POST_SRC.includes('body?.user_id'), false)
    assert.equal(POST_SRC.includes('payloadRecebido?.user_id'), false)
  })

  it('E) publicação com owner: só esse owner muta pelo fluxo autenticado', () => {
    const dono = resolverAlvoPublicacaoPost({
      ...base,
      existente: pubA() as PublicacaoVinculo,
      tipoPedido: 'orcamento',
      documentoIdPedido: '100',
      userIdBearer: USER_A,
    })
    const outro = resolverAlvoPublicacaoPost({
      ...base,
      existente: pubA() as PublicacaoVinculo,
      tipoPedido: 'orcamento',
      documentoIdPedido: '100',
      userIdBearer: USER_B,
    })
    assert.equal(dono.ok && dono.userId, USER_A)
    assert.equal(outro.ok, false)
  })

  it('F) publicação sem owner não é apropriada automaticamente', () => {
    const r = resolverAlvoPublicacaoPost({
      ...base,
      existente: pubLegadoSemOwner() as PublicacaoVinculo,
      tipoPedido: 'os',
      documentoIdPedido: '55',
      userIdBearer: USER_A,
    })
    assert.equal(r.ok, false)
  })

  it('G) publicação nova autenticada: owner vem do Bearer', () => {
    const r = resolverAlvoPublicacaoPost({
      ...base,
      tokenConfere: false,
      existente: null,
      tipoPedido: 'orcamento',
      documentoIdPedido: '300',
      userIdBearer: USER_A,
    })
    assert.equal(r.ok && r.userId, USER_A)
  })

  it('H) fluxo público: owner/documento/tipo vêm da publicação resolvida pelo token', () => {
    const r = resolverAlvoPublicacaoPost({
      ...base,
      existente: pubB() as PublicacaoVinculo,
      tipoPedido: 'orcamento',
      documentoIdPedido: '200',
      userIdBearer: '',
    })
    assert.deepEqual(r, {
      ok: true,
      tipo: 'orcamento',
      documentoId: '200',
      userId: USER_B,
      podeAtualizarStatusContrato: false,
    })
  })

  it('I) 23505 não cria bypass de ownership', async () => {
    const banco = criarBanco([pubB(), pubLegadoSemOwner()])
    for (const [tipo, documentoId] of [
      ['orcamento', '200'],
      ['os', '55'],
    ]) {
      const r = await postSimulado(banco, {
        existente: null,
        userIdBearer: USER_A,
        tokenRecebido: TK_NOVO,
        tipo,
        documentoId,
      })
      assert.equal(r.status, 409)
    }
    assert.equal(banco.mutacoes.length, 0)
  })
})
