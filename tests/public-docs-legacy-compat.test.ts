import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
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
const ID_LINHA_LEGADA = '9f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607'
const ID_LINHA_MODERNA = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d'
const DOC_LEGADO = '1715000000000'
const DOC_MODERNO = '1716000000000'
const TK_LEGADO = 'aaaaaaaaaaaaaaaaaaaaaa11'
const TK_MODERNO = 'bbbbbbbbbbbbbbbbbbbbbb11'
const TK_ERRADO = 'cccccccccccccccccccccc11'

type Linha = Record<string, unknown>

/** Padrão comprovado na SECURITY.1b: document_id = id da própria linha, documento_id = id real. */
function legadoArtefato(extra: Linha = {}): Linha {
  return {
    id: ID_LINHA_LEGADA,
    token: TK_LEGADO,
    document_type: 'orcamento',
    document_id: ID_LINHA_LEGADA,
    tipo: 'orcamento',
    documento_id: DOC_LEGADO,
    user_id: null,
    payload: {},
    ...extra,
  }
}

function moderna(extra: Linha = {}): Linha {
  return {
    id: ID_LINHA_MODERNA,
    token: TK_MODERNO,
    document_type: 'orcamento',
    document_id: DOC_MODERNO,
    tipo: 'orcamento',
    documento_id: DOC_MODERNO,
    user_id: USER_A,
    payload: {},
    ...extra,
  }
}

/** Espelha linhaPublicDocument de route.ts. */
function linhaSalva(tipo: string, documentoId: string, token: string, userId?: string): Linha {
  return {
    token,
    document_type: tipo,
    document_id: documentoId,
    tipo,
    documento_id: documentoId,
    payload: { status: 'aprovado' },
    ...(userId ? { user_id: userId } : {}),
  }
}

function criarBanco(inicial: Linha[]) {
  const tabela = inicial.map((l) => ({ ...l }))
  const mutacoes: unknown[][] = []
  const casa = (row: Linha, f: FiltroPublicacao) => {
    const v = row[f.coluna]
    if (f.op === 'is_null') return v === null || v === undefined
    if (v === null || v === undefined) return false
    if (f.op === 'in') return f.valor.includes(String(v))
    return String(v) === f.valor
  }
  const executor: ExecutorPublicacao = {
    async inserir(l) {
      if (tabela.some((r) => r.token === l.token)) return { error: { code: '23505', message: 'duplicate key' } }
      tabela.push({ ...l })
      mutacoes.push([l.user_id ?? null])
      return { error: null }
    },
    async atualizar(l, filtros) {
      const alvo = tabela.filter((r) => filtros.every((f) => casa(r, f)))
      if (alvo.length) mutacoes.push(alvo.map((r) => r.user_id ?? null))
      for (const r of alvo) Object.assign(r, l)
      return { error: null, linhasAfetadas: alvo.length }
    },
  }
  return { tabela, executor, mutacoes }
}

/** Mesma sequência do POST de route.ts (resolver → linha canônica → gravação com ownership). */
async function postSimulado(
  banco: ReturnType<typeof criarBanco>,
  req: { existente: Linha | null; userIdBearer?: string; tokenRecebido?: string; tipo: string; documentoId: string },
) {
  const tokenRecebido = req.tokenRecebido || ''
  const tokenConfere = Boolean(tokenRecebido && req.existente && req.existente.token === tokenRecebido)
  const alvo = resolverAlvoPublicacaoPost({
    existente: req.existente as PublicacaoVinculo | null,
    tipoPedido: req.tipo,
    documentoIdPedido: req.documentoId,
    userIdBearer: req.userIdBearer || '',
    tokenConfere,
    buscaConclusiva: true,
  })
  if (alvo.ok === false) return { status: alvo.status as number }
  const token = String(req.existente?.token || tokenRecebido)
  const r = await salvarPublicacaoComOwnership({
    existente: req.existente as PublicacaoVinculo | null,
    linha: linhaSalva(alvo.tipo, alvo.documentoId, token, alvo.userId || undefined),
    ownerAutenticado: req.userIdBearer || '',
    tipo: alvo.tipo,
    documentoId: alvo.documentoId,
    executor: banco.executor,
  })
  if (r.error) return { status: r.error.code === ERRO_OWNERSHIP_PUBLICACAO ? 409 : 500 }
  return { status: 200, alvo }
}

describe('SECURITY.1c — document_id artefato legado (document_id === id)', () => {
  it('1) linha moderna (document_id != id): comportamento inalterado', () => {
    assert.deepEqual(documentoCanonicoDaPublicacao(moderna() as PublicacaoVinculo), {
      tipo: 'orcamento',
      documentoId: DOC_MODERNO,
    })
    assert.equal(
      documentoCanonicoDaPublicacao(moderna({ documento_id: DOC_LEGADO }) as PublicacaoVinculo),
      null,
      'divergência sem o padrão exato continua fail-closed (sem preferência genérica pelo legado)',
    )
    assert.equal(
      documentoCanonicoDaPublicacao(legadoArtefato({ id: undefined }) as PublicacaoVinculo),
      null,
      'sem o id da linha não há prova do artefato',
    )
  })

  it('2) linha legada com token correto: document_id novo reconhecido como artefato', () => {
    const pub = legadoArtefato() as PublicacaoVinculo
    assert.deepEqual(documentoCanonicoDaPublicacao(pub), { tipo: 'orcamento', documentoId: DOC_LEGADO })
    assert.equal(
      publicacaoCorrespondeAoPedido(pub, { token: TK_LEGADO, tipo: 'orcamento', documentoId: DOC_LEGADO }),
      true,
    )
  })

  it('3) token errado: recusado', async () => {
    const pub = legadoArtefato() as PublicacaoVinculo
    assert.equal(
      publicacaoCorrespondeAoPedido(pub, { token: TK_ERRADO, tipo: 'orcamento', documentoId: DOC_LEGADO }),
      false,
    )
    const banco = criarBanco([legadoArtefato()])
    const r = await postSimulado(banco, {
      existente: legadoArtefato(),
      tokenRecebido: TK_ERRADO,
      tipo: 'orcamento',
      documentoId: DOC_LEGADO,
    })
    assert.equal(r.status, 401)
    assert.equal(banco.mutacoes.length, 0)
  })

  it('4) body.document_id diferente não religa a publicação (nem usando o id artefato)', async () => {
    for (const documentoId of [ID_LINHA_LEGADA, DOC_MODERNO, '']) {
      const banco = criarBanco([legadoArtefato()])
      const r = await postSimulado(banco, {
        existente: legadoArtefato(),
        tokenRecebido: TK_LEGADO,
        tipo: 'orcamento',
        documentoId,
      })
      assert.equal(r.status, 403, `document_id ${documentoId || '(vazio)'} deveria ser recusado`)
      assert.equal(banco.mutacoes.length, 0)
      assert.equal(banco.tabela[0].documento_id, DOC_LEGADO)
    }
  })

  it('5) body.user_id não cria owner (owner vem só da publicação resolvida)', async () => {
    const banco = criarBanco([legadoArtefato()])
    const r = await postSimulado(banco, {
      existente: legadoArtefato(),
      tokenRecebido: TK_LEGADO,
      tipo: 'orcamento',
      documentoId: DOC_LEGADO,
    })
    assert.equal(r.status, 200)
    assert.equal(r.alvo?.userId, '')
    assert.equal(banco.tabela[0].user_id, null)
    const src = readFileSync(new URL('../app/api/public-docs/route.ts', import.meta.url), 'utf8')
    assert.equal(src.includes('body?.user_id'), false)
  })

  it('6) linha ownerless continua ownerless após aprovação pública legítima', async () => {
    const banco = criarBanco([legadoArtefato()])
    await postSimulado(banco, {
      existente: legadoArtefato(),
      tokenRecebido: TK_LEGADO,
      tipo: 'orcamento',
      documentoId: DOC_LEGADO,
    })
    assert.deepEqual(banco.mutacoes, [[null]])
    assert.equal(banco.tabela[0].user_id, null)
    assert.equal(banco.tabela[0].id, ID_LINHA_LEGADA)
    assert.equal(banco.tabela[0].token, TK_LEGADO)
  })

  it('7) Bearer tentando assumir linha legada ownerless: continua 403', async () => {
    for (const userIdBearer of [USER_A, USER_B]) {
      const banco = criarBanco([legadoArtefato()])
      const r = await postSimulado(banco, {
        existente: legadoArtefato(),
        userIdBearer,
        tokenRecebido: TK_LEGADO,
        tipo: 'orcamento',
        documentoId: DOC_LEGADO,
      })
      assert.equal(r.status, 403)
      assert.equal(banco.mutacoes.length, 0)
      assert.equal(banco.tabela[0].user_id, null)
    }
  })

  it('8) document_id === id mas documento_id ausente: fail-closed', async () => {
    for (const documento_id of [null, '', '   ']) {
      const pub = legadoArtefato({ documento_id }) as PublicacaoVinculo
      assert.equal(documentoCanonicoDaPublicacao(pub), null)
      const banco = criarBanco([legadoArtefato({ documento_id })])
      const r = await postSimulado(banco, {
        existente: legadoArtefato({ documento_id }),
        tokenRecebido: TK_LEGADO,
        tipo: 'orcamento',
        documentoId: ID_LINHA_LEGADA,
      })
      assert.equal(r.status, 403)
      assert.equal(banco.mutacoes.length, 0)
    }
  })

  it('9) document_id === id com tipos conflitantes (orcamento vs os): fail-closed', async () => {
    const conflito = legadoArtefato({ tipo: 'os' })
    assert.equal(documentoCanonicoDaPublicacao(conflito as PublicacaoVinculo), null)
    for (const tipo of ['orcamento', 'os', 'ordem_servico']) {
      assert.equal(
        publicacaoCorrespondeAoPedido(conflito as PublicacaoVinculo, { token: TK_LEGADO, tipo, documentoId: DOC_LEGADO }),
        false,
      )
      const banco = criarBanco([conflito])
      const r = await postSimulado(banco, { existente: conflito, tokenRecebido: TK_LEGADO, tipo, documentoId: DOC_LEGADO })
      assert.equal(r.status, 403)
      assert.equal(banco.mutacoes.length, 0)
    }
  })

  it('10) cross-tenant: Bearer de outro tenant não muta linha legada com owner', async () => {
    const banco = criarBanco([legadoArtefato({ user_id: USER_A })])
    const r = await postSimulado(banco, {
      existente: legadoArtefato({ user_id: USER_A }),
      userIdBearer: USER_B,
      tipo: 'orcamento',
      documentoId: DOC_LEGADO,
    })
    assert.equal(r.status, 403)
    assert.equal(banco.mutacoes.length, 0)

    const dono = await postSimulado(banco, {
      existente: legadoArtefato({ user_id: USER_A }),
      userIdBearer: USER_A,
      tipo: 'orcamento',
      documentoId: DOC_LEGADO,
    })
    assert.equal(dono.status, 200)
    assert.deepEqual(banco.mutacoes, [[USER_A]])
  })

  it('11) SECURITY.1a: 23505 não vira bypass para linha legada de outro tenant', async () => {
    const banco = criarBanco([legadoArtefato({ user_id: USER_B })])
    const r = await salvarPublicacaoComOwnership({
      existente: null,
      linha: linhaSalva('orcamento', DOC_LEGADO, TK_LEGADO, USER_A),
      ownerAutenticado: USER_A,
      tipo: 'orcamento',
      documentoId: DOC_LEGADO,
      executor: banco.executor,
    })
    assert.equal(r.error?.code, ERRO_OWNERSHIP_PUBLICACAO)
    assert.equal(banco.mutacoes.length, 0)
    assert.equal(banco.tabela[0].user_id, USER_B)
  })

  it('12) aprovação pública moderna continua funcionando', async () => {
    const banco = criarBanco([moderna()])
    const r = await postSimulado(banco, {
      existente: moderna(),
      tokenRecebido: TK_MODERNO,
      tipo: 'orcamento',
      documentoId: DOC_MODERNO,
    })
    assert.equal(r.status, 200)
    assert.deepEqual(banco.mutacoes, [[USER_A]])
    assert.equal(banco.tabela[0].user_id, USER_A)
  })

  it('13) aprovação pública legada só funciona com vínculo canônico comprovado', async () => {
    const casos: [Linha, number][] = [
      [legadoArtefato(), 200],
      [legadoArtefato({ tipo: 'os' }), 403],
      [legadoArtefato({ documento_id: null }), 403],
      [legadoArtefato({ id: 'outro-id' }), 403],
    ]
    for (const [linha, esperado] of casos) {
      const banco = criarBanco([linha])
      const r = await postSimulado(banco, {
        existente: linha,
        tokenRecebido: TK_LEGADO,
        tipo: 'orcamento',
        documentoId: DOC_LEGADO,
      })
      assert.equal(r.status, esperado)
      if (esperado !== 200) assert.equal(banco.mutacoes.length, 0)
    }
  })

  it('route.ts: publicação resolvida carrega o id da linha (necessário para detectar o artefato)', () => {
    const src = readFileSync(new URL('../app/api/public-docs/route.ts', import.meta.url), 'utf8')
    const cols = /const PUBLIC_DOCS_ROW_COLS =\s*'([^']+)'/.exec(src)?.[1] || ''
    assert.ok(cols.split(',').includes('id'))
    assert.ok(cols.split(',').includes('document_id'))
    assert.ok(cols.split(',').includes('documento_id'))
  })
})
