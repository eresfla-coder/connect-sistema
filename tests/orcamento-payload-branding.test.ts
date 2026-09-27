/**
 * ADMIN.4.3.10 / 4.3.10a — payload de public.orcamentos sem envelope de publicação
 * + sync de aprovação por allowlist, sem regravação quando nada mudou.
 * Fixtures sintéticas. Sem banco, sem logo real.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  CAMPOS_PUBLICACAO_NAO_PERSISTIDOS,
  orcamentoParaUpsertSupabase,
  serializarPayloadOrcamento,
  type OrcamentoSalvoUpsertInput,
} from '../lib/orcamento-supabase-upsert.ts'
import {
  CAMPOS_PATCH_APROVACAO_PUBLICA,
  aprovacaoDigitalEquivalente,
  extrairPatchAprovacaoPublica,
  selecionarOrcamentosParaPersistirAposSync,
  serializacaoCanonica,
  syncAprovacaoExigePersistencia,
  type CamposAprovacaoOrcamento,
} from '../lib/aprovacoes-publicas-sync.ts'
import { configEmpresaPadraoPublica, mergeConfigPublicacao } from '../lib/documentosPublicos.ts'

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const LOGO_SINTETICO = `data:image/png;base64,${'QUJD'.repeat(25_000)}`
const ASSINATURA_SINTETICA = `data:image/png;base64,${'U0lH'.repeat(2_000)}`

function orcamentoLimpo(over: Partial<OrcamentoSalvoUpsertInput> = {}): OrcamentoSalvoUpsertInput {
  return {
    id: 1790000000001,
    numero: '0042',
    titulo: 'Orçamento Sintético',
    data: '27/09/2026',
    status: 'Aprovado',
    total: 1085,
    subtotal: 1100,
    desconto: 50,
    entrega: 35,
    formaPagamento: 'PIX',
    formasPagamentoLista: ['PIX', 'Cartão'],
    observacaoPagamento: '50% entrada',
    condicoesPagamento: 'Entrada + 30 dias',
    observacao: 'Obs sintética',
    validade: '10 dias',
    prazoEntrega: '5 dias',
    enderecoEntrega: 'Rua Sintética, 1',
    cliente: { nome: 'Cliente Sintético', telefone: '0000000000' },
    itens: [
      { descricao: 'Item A', quantidade: 2, valor: 300, total: 600 },
      { descricao: 'M2', tipoCalculo: 'm2', largura: 2, altura: 2.5, metragem: 5, valorM2: 100, quantidade: 1, valor: 500, total: 500 },
    ],
    link: 'https://example.invalid/impressao-orcamento/1?p=x',
    tokenPublico: 'abcdef0123456789abcdef',
    aprovado: true,
    aprovadoEm: '27/09/2026 10:00:00',
    atualizadoEm: 1790000000123,
    aprovacaoDigital: {
      status: 'aprovado',
      nome: 'Cliente Sintético',
      data: '27/09/2026 10:00:00',
      assinatura: ASSINATURA_SINTETICA,
      origem: 'link-publico',
    },
    ...over,
  }
}

function envelopeSintetico() {
  const cfg = { nomeEmpresa: 'EMPRESA SINTÉTICA', logoUrl: LOGO_SINTETICO, telefone: '0000' }
  return {
    cfg,
    config: { ...cfg },
    empresa_logo: LOGO_SINTETICO,
    empresa_logo_og: 'https://example.invalid/api/og/empresa-logo?p=x',
    empresa_nome: 'EMPRESA SINTÉTICA',
    empresa_telefone: '0000',
    empresa_email: 'contato@example.invalid',
    empresa_endereco: 'Av. Sintética, 100 — Cidade/UF',
    token: 'abcdef0123456789abcdef',
    user_id: '00000000-0000-0000-0000-000000000000',
    owner_user_id: '00000000-0000-0000-0000-000000000000',
  }
}

function contaminado() {
  return { ...orcamentoLimpo(), ...envelopeSintetico() } as OrcamentoSalvoUpsertInput
}

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8')

describe('ADMIN.4.3.10 — serializarPayloadOrcamento sem branding', () => {
  it('denylist exata (envelope de publicação)', () => {
    assert.deepEqual([...CAMPOS_PUBLICACAO_NAO_PERSISTIDOS], [
      'cfg',
      'config',
      'empresa_logo',
      'empresa_logo_og',
      'empresa_nome',
      'empresa_telefone',
      'empresa_email',
      'empresa_endereco',
      'token',
      'user_id',
      'owner_user_id',
    ])
  })

  it('nenhum campo do envelope é campo de OrcamentoSalvo', () => {
    const page = read('app/(painel)/orcamentos/page.tsx')
    const tipo = page.slice(page.indexOf('type OrcamentoSalvo = {'), page.indexOf('type ModeloPropostaRapida'))
    assert.ok(tipo.length > 100)
    for (const campo of CAMPOS_PUBLICACAO_NAO_PERSISTIDOS) {
      assert.equal(new RegExp(`^\\s+${campo}\\??:`, 'm').test(tipo), false, campo)
    }
  })

  it('L–R) campos leves do envelope removidos', () => {
    const payload = serializarPayloadOrcamento(contaminado())
    for (const campo of ['empresa_nome', 'empresa_telefone', 'empresa_email', 'empresa_endereco', 'token', 'user_id', 'owner_user_id']) {
      assert.equal(campo in payload, false, campo)
    }
    assert.equal(payload.tokenPublico, 'abcdef0123456789abcdef')
  })

  it('1) payload normal sem branding permanece equivalente', () => {
    const orc = orcamentoLimpo()
    assert.deepEqual(serializarPayloadOrcamento(orc), JSON.parse(JSON.stringify(orc)))
  })

  it('2) cfg removido', () => {
    assert.equal('cfg' in serializarPayloadOrcamento(contaminado()), false)
  })

  it('3) config removido', () => {
    assert.equal('config' in serializarPayloadOrcamento(contaminado()), false)
  })

  it('4) empresa_logo removido', () => {
    assert.equal('empresa_logo' in serializarPayloadOrcamento(contaminado()), false)
  })

  it('5) empresa_logo_og removido', () => {
    assert.equal('empresa_logo_og' in serializarPayloadOrcamento(contaminado()), false)
  })

  it('6) objeto original não é mutado', () => {
    const orc = contaminado()
    const antes = JSON.stringify(orc)
    const payload = serializarPayloadOrcamento(orc)
    assert.equal(JSON.stringify(orc), antes)
    assert.ok('cfg' in orc && 'config' in orc && 'empresa_logo' in orc && 'empresa_logo_og' in orc)
    assert.notEqual(payload, orc)
    ;(payload.itens as Array<Record<string, unknown>>)[0].total = -1
    assert.equal((orc.itens as Array<Record<string, unknown>>)[0].total, 600)
  })

  it('6b) fallback de cópia rasa (JSON falha) também não muta', () => {
    const orc = contaminado() as Record<string, unknown>
    orc.circular = orc
    const payload = serializarPayloadOrcamento(orc as OrcamentoSalvoUpsertInput)
    assert.equal('cfg' in payload, false)
    assert.ok('cfg' in orc)
    assert.equal(orc.circular, orc)
  })

  it('7–16) dados do documento preservados', () => {
    const orc = contaminado()
    const payload = serializarPayloadOrcamento(orc)
    const esperado = JSON.parse(JSON.stringify(orcamentoLimpo()))
    assert.deepEqual(payload, esperado)
    assert.equal(payload.numero, '0042')
    assert.deepEqual(payload.itens, esperado.itens)
    assert.deepEqual(payload.cliente, esperado.cliente)
    assert.equal(payload.status, 'Aprovado')
    assert.equal(payload.total, 1085)
    assert.equal(payload.atualizadoEm, 1790000000123)
    assert.equal(payload.aprovado, true)
    assert.equal(payload.aprovadoEm, '27/09/2026 10:00:00')
    assert.deepEqual(payload.aprovacaoDigital, esperado.aprovacaoDigital)
    assert.equal((payload.aprovacaoDigital as Record<string, unknown>).assinatura, ASSINATURA_SINTETICA)
    assert.equal(payload.subtotal, 1100)
    assert.equal(payload.desconto, 50)
    assert.equal(payload.entrega, 35)
    assert.equal(payload.formaPagamento, 'PIX')
    assert.equal(payload.condicoesPagamento, 'Entrada + 30 dias')
    assert.equal(payload.observacao, 'Obs sintética')
    assert.equal(payload.data, '27/09/2026')
    assert.equal(payload.titulo, 'Orçamento Sintético')
    assert.equal(payload.link, orc.link)
    assert.equal(payload.tokenPublico, orc.tokenPublico)
  })

  it('campos de config aninhados em dados do documento não são tocados', () => {
    const orc = orcamentoLimpo({
      itens: [{ descricao: 'X', quantidade: 1, valor: 1, total: 1, config: { cor: 'azul' } }],
      cliente: { nome: 'C', cfg: 'mantido' },
    })
    const payload = serializarPayloadOrcamento(orc)
    assert.deepEqual((payload.itens as Array<Record<string, unknown>>)[0].config, { cor: 'azul' })
    assert.equal((payload.cliente as Record<string, unknown>).cfg, 'mantido')
  })

  it('mapper de upsert usa a barreira e mantém colunas resumo', () => {
    const row = orcamentoParaUpsertSupabase(contaminado(), 'u1')
    for (const campo of CAMPOS_PUBLICACAO_NAO_PERSISTIDOS) assert.equal(campo in row.payload, false)
    assert.equal(row.status, 'Aprovado')
    assert.equal(row.total, 1085)
    assert.equal(row.cliente, 'Cliente Sintético')
    assert.equal(row.aprovado, true)
    assert.equal(row.local_id, '1790000000001')
  })

  it('23) serialização repetida é idempotente', () => {
    const uma = serializarPayloadOrcamento(contaminado())
    const duas = serializarPayloadOrcamento(uma as OrcamentoSalvoUpsertInput)
    assert.deepEqual(duas, uma)
    assert.equal(JSON.stringify(duas), JSON.stringify(uma))
  })

  it('17*) medição sintética: blob de branding removido', () => {
    const orc = contaminado()
    const antes = bytes(orc)
    const depois = bytes(serializarPayloadOrcamento(orc))
    const reducao = ((antes - depois) / antes) * 100
    console.log(`[SYNTHETIC] BEFORE_BYTES=${antes} AFTER_BYTES=${depois} REDUCTION_PERCENT=${reducao.toFixed(2)}`)
    assert.equal(depois, bytes(orcamentoLimpo()))
    assert.ok(antes - depois >= 3 * LOGO_SINTETICO.length)
    assert.ok(reducao > 90)
  })
})

describe('ADMIN.4.3.10 — sync de aprovação por allowlist', () => {
  function publicoSintetico(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...orcamentoLimpo({ status: 'Aprovado', atualizadoEm: 1790000009999 }),
      ...envelopeSintetico(),
      ...extra,
    }
  }

  it('17) allowlist exata', () => {
    assert.deepEqual([...CAMPOS_PATCH_APROVACAO_PUBLICA], ['status', 'aprovado', 'aprovadoEm', 'aprovacaoDigital', 'atualizadoEm'])
    const patch = extrairPatchAprovacaoPublica(publicoSintetico())
    for (const k of Object.keys(patch)) {
      assert.ok((CAMPOS_PATCH_APROVACAO_PUBLICA as readonly string[]).includes(k), `campo fora da allowlist: ${k}`)
    }
    assert.deepEqual(Object.keys(patch).sort(), [...CAMPOS_PATCH_APROVACAO_PUBLICA].sort())
  })

  it('18–20) não importa cfg, config nem logos', () => {
    const patch = extrairPatchAprovacaoPublica(publicoSintetico()) as Record<string, unknown>
    for (const campo of ['cfg', 'config', 'empresa_logo', 'empresa_logo_og', 'empresa_nome', 'token', 'user_id', 'owner_user_id']) {
      assert.equal(campo in patch, false, campo)
    }
  })

  it('21) campo arbitrário do documento público não entra no orçamento', () => {
    const local = orcamentoLimpo({ status: 'Pendente', aprovado: false, aprovadoEm: undefined, aprovacaoDigital: undefined })
    const patch = extrairPatchAprovacaoPublica(publicoSintetico({ campoNovoQualquer: 'x'.repeat(1000), numero: '9999', total: 1 }))
    const mesclado = { ...local, ...patch, id: local.id } as Record<string, unknown>
    assert.equal('campoNovoQualquer' in mesclado, false)
    assert.equal(mesclado.numero, '0042')
    assert.equal(mesclado.total, 1085)
    assert.equal('cfg' in mesclado, false)
    const payload = serializarPayloadOrcamento(mesclado as OrcamentoSalvoUpsertInput)
    assert.equal('campoNovoQualquer' in payload, false)
  })

  it('aprovação digital (com assinatura) copiada integralmente e sem aliasing', () => {
    const publico = publicoSintetico()
    const patch = extrairPatchAprovacaoPublica(publico)
    assert.deepEqual(patch.aprovacaoDigital, publico.aprovacaoDigital)
    assert.notEqual(patch.aprovacaoDigital, publico.aprovacaoDigital)
    assert.equal(patch.status, 'Aprovado')
    assert.equal(patch.aprovado, true)
    assert.equal(patch.aprovadoEm, '27/09/2026 10:00:00')
    assert.equal(patch.atualizadoEm, 1790000009999)
  })

  it('recusa pública preservada', () => {
    const patch = extrairPatchAprovacaoPublica({
      status: 'Cancelado',
      aprovado: false,
      aprovacaoDigital: { status: 'recusado', nome: 'X', data: 'd' },
      cfg: { logoUrl: LOGO_SINTETICO },
    })
    assert.deepEqual(patch, { status: 'Cancelado', aprovado: false, aprovacaoDigital: { status: 'recusado', nome: 'X', data: 'd' } })
  })

  it('entradas inválidas → patch vazio; tipos inválidos ignorados', () => {
    assert.deepEqual(extrairPatchAprovacaoPublica(null), {})
    assert.deepEqual(extrairPatchAprovacaoPublica('x'), {})
    assert.deepEqual(extrairPatchAprovacaoPublica([1, 2]), {})
    assert.deepEqual(
      extrairPatchAprovacaoPublica({ status: 1, aprovado: 'sim', aprovadoEm: 2, aprovacaoDigital: [], atualizadoEm: 'abc' }),
      {},
    )
    assert.deepEqual(extrairPatchAprovacaoPublica({ atualizadoEm: '1790000000000' }), { atualizadoEm: 1790000000000 })
  })

  it('page.tsx: sync usa allowlist e não espalha o payload público', () => {
    const page = read('app/(painel)/orcamentos/page.tsx')
    assert.ok(page.includes('extrairPatchAprovacaoPublica(json?.payload)'))
    assert.ok(page.includes('...(patchAprovacao as Partial<OrcamentoSalvo>)'))
    assert.equal(page.includes('...(publico && typeof publico'), false)
    assert.equal(/\.\.\.\s*\(?\s*publico\b/.test(page), false)
  })

  it('page.tsx: toda escrita em public.orcamentos passa pelo mapper canônico', () => {
    const page = read('app/(painel)/orcamentos/page.tsx')
    const upserts = page.match(/\.from\('orcamentos'\)\s*\.upsert\(([^,]+),/g) || []
    assert.equal(upserts.length, 1)
    assert.ok(upserts[0].includes('.upsert(row,'))
    assert.ok(page.includes('const row = orcamentoParaUpsertSupabase(orcamento, userId)'))
    assert.ok(page.includes('return mapearOrcamentoParaUpsertSupabase(aplicarStatusResolvido(orc), userId)'))
    assert.equal(/\.from\('orcamentos'\)\s*\.(insert|update)\(/.test(page), false)
  })
})

describe('ADMIN.4.3.10 — branding sem cfg no orçamento', () => {
  it('22) sem cfg no orçamento, merge cai na configuração canônica', () => {
    const semCfg = mergeConfigPublicacao(null, undefined, undefined)
    assert.deepEqual(semCfg, configEmpresaPadraoPublica())
    const canonica = { nomeEmpresa: 'EMPRESA CANÔNICA', logoUrl: 'https://example.invalid/logo.png', telefone: '1111' }
    const viaApi = mergeConfigPublicacao(canonica, undefined, undefined)
    assert.equal(viaApi.nomeEmpresa, 'EMPRESA CANÔNICA')
    assert.equal(viaApi.logoUrl, 'https://example.invalid/logo.png')
  })

  it('22b) orçamento histórico com cfg continua sendo lido pelo fallback', () => {
    const historico = mergeConfigPublicacao(null, { nomeEmpresa: 'HIST', logoUrl: 'https://example.invalid/h.png' }, undefined)
    assert.equal(historico.nomeEmpresa, 'HIST')
    assert.equal(historico.logoUrl, 'https://example.invalid/h.png')
    const doc = read('components/documentos/OrcamentoDocumentoPage.tsx')
    assert.ok(doc.includes('(encontrado as any)?.cfg'))
    assert.ok(doc.includes('const cfgLocal = getConfig()'))
  })

  it('22c) publicação usa config canônica, não o cfg do orçamento', () => {
    const page = read('app/(painel)/orcamentos/page.tsx')
    assert.ok(page.includes('const cfgPublica = await configParaPublicar()'))
    const lib = read('lib/garantir-publicacao-orcamento.ts')
    assert.ok(lib.includes('payload: { ...payload, config: cfgPublica, cfg: cfgPublica }'))
  })
})

describe('ADMIN.4.3.10a — sync sem regravação quando nada mudou', () => {
  /**
   * Reproduz o cálculo do painel para o caso em que o resolvedor sticky mantém o estado
   * (orçamento local já aprovado): `{...local, ...patch, atualizadoEm: patch ?? local}`
   * e `aprovadoEm = resolvido || patch || aprovacaoDigital.data`.
   */
  function resolvidoComoPainel(local: Record<string, unknown>, publico: unknown): CamposAprovacaoOrcamento {
    const patch = extrairPatchAprovacaoPublica(publico)
    const candidato = {
      ...local,
      ...patch,
      id: local.id,
      atualizadoEm: patch.atualizadoEm ?? (local.atualizadoEm as number | undefined),
    } as Record<string, unknown>
    return {
      ...(candidato as CamposAprovacaoOrcamento),
      aprovadoEm: (candidato.aprovadoEm as string | undefined) || patch.aprovadoEm || patch.aprovacaoDigital?.data,
    }
  }

  const localAprovado = () => orcamentoLimpo() as unknown as Record<string, unknown>
  const publicoIgual = (extra: Record<string, unknown> = {}) => ({
    ...orcamentoLimpo(),
    ...envelopeSintetico(),
    ...extra,
  })
  const decidir = (local: Record<string, unknown>, publico: unknown) =>
    syncAprovacaoExigePersistencia(local as CamposAprovacaoOrcamento, resolvidoComoPainel(local, publico))

  it('A) NO_CHANGE_SYNC_TEST: aprovação idêntica → PERSIST_REQUIRED = false', () => {
    assert.equal(decidir(localAprovado(), publicoIgual()), false)
  })

  it('B) polling repetido com a mesma aprovação → zero persistência', () => {
    const local = localAprovado()
    const idsAlterados = new Set<string>()
    for (let ciclo = 0; ciclo < 5; ciclo += 1) {
      if (decidir(local, publicoIgual())) idsAlterados.add(String(local.id))
    }
    assert.equal(idsAlterados.size, 0)
    assert.deepEqual(selecionarOrcamentosParaPersistirAposSync([local as never], idsAlterados), [])
  })

  it('B2) aprovados não alterados pelo sync não são re-upsertados', () => {
    const lista = [
      { id: 1, status: 'Aprovado', aprovado: true },
      { id: 2, status: 'Convertido', aprovado: true },
      { id: 3, status: 'Aprovado', aprovado: true },
      { id: 4, status: 'Pendente', aprovado: false },
    ]
    assert.deepEqual(selecionarOrcamentosParaPersistirAposSync(lista, new Set()), [])
    assert.deepEqual(selecionarOrcamentosParaPersistirAposSync(lista, new Set(['3'])).map((i) => i.id), [3])
    assert.deepEqual(selecionarOrcamentosParaPersistirAposSync(lista, new Set(['4'])), [])
  })

  it('C) status diferente → persistência necessária', () => {
    const local = { ...localAprovado(), status: 'Pendente', aprovado: false }
    assert.equal(decidir(local, publicoIgual()), true)
  })

  it('D) aprovado diferente → persistência necessária', () => {
    const local = { ...localAprovado(), aprovado: false }
    assert.equal(decidir(local, publicoIgual()), true)
  })

  it('E) aprovadoEm diferente → persistência necessária', () => {
    assert.equal(decidir(localAprovado(), publicoIgual({ aprovadoEm: '28/09/2026 09:00:00' })), true)
  })

  it('F) atualizadoEm remoto mais novo → persistência necessária; mais antigo → não', () => {
    assert.equal(decidir(localAprovado(), publicoIgual({ atualizadoEm: 1790000000124 })), true)
    assert.equal(decidir(localAprovado(), publicoIgual({ atualizadoEm: 1790000000122 })), false)
  })

  it('G) aprovacaoDigital semanticamente diferente → persistência necessária', () => {
    const outra = { ...(orcamentoLimpo().aprovacaoDigital as Record<string, unknown>), nome: 'Outro Nome' }
    assert.equal(decidir(localAprovado(), publicoIgual({ aprovacaoDigital: outra })), true)
    const outraAssinatura = { ...(orcamentoLimpo().aprovacaoDigital as Record<string, unknown>), assinatura: 'data:image/png;base64,Zg==' }
    assert.equal(decidir(localAprovado(), publicoIgual({ aprovacaoDigital: outraAssinatura })), true)
  })

  it('H) aprovacaoDigital equivalente em outro objeto / outra ordem de chaves → não persiste', () => {
    const original = orcamentoLimpo().aprovacaoDigital as Record<string, unknown>
    const reordenado = Object.fromEntries(Object.entries(original).reverse())
    assert.notEqual(reordenado, original)
    assert.notEqual(JSON.stringify(reordenado), JSON.stringify(original))
    assert.equal(aprovacaoDigitalEquivalente(original, reordenado), true)
    assert.equal(decidir(localAprovado(), publicoIgual({ aprovacaoDigital: reordenado })), false)
    assert.equal(aprovacaoDigitalEquivalente(undefined, {}), true)
    assert.equal(aprovacaoDigitalEquivalente({ a: 1, b: undefined }, { a: 1 }), true)
  })

  it('comparação canônica não altera a aprovação digital', () => {
    const original = orcamentoLimpo().aprovacaoDigital as Record<string, unknown>
    const antes = JSON.stringify(original)
    serializacaoCanonica(original)
    assert.equal(JSON.stringify(original), antes)
    assert.equal(original.assinatura, ASSINATURA_SINTETICA)
  })

  it('I) cfg remoto diferente → não persiste', () => {
    assert.equal(decidir(localAprovado(), publicoIgual({ cfg: { nomeEmpresa: 'OUTRA', logoUrl: 'x' }, config: { a: 1 } })), false)
  })

  it('J) logo remoto diferente → não persiste', () => {
    assert.equal(decidir(localAprovado(), publicoIgual({ empresa_logo: 'data:image/png;base64,T1VUUk8=', empresa_logo_og: 'y' })), false)
  })

  it('K) campo arbitrário remoto (inclusive dados do documento) → não persiste', () => {
    assert.equal(
      decidir(localAprovado(), publicoIgual({ campoNovo: 'x', numero: '9999', total: 1, token: 'outro', empresa_nome: 'Outra', user_id: 'u' })),
      false,
    )
  })

  it('11) HISTORICAL_POLLING_TEST: histórico local com cfg/logo + mesma aprovação → SHOULD_PERSIST = false', () => {
    const historico = { ...localAprovado(), ...envelopeSintetico() }
    assert.equal(decidir(historico, publicoIgual()), false)
    const convertido = { ...historico, status: 'Convertido' }
    assert.equal(
      syncAprovacaoExigePersistencia(convertido as CamposAprovacaoOrcamento, {
        ...resolvidoComoPainel(convertido, publicoIgual()),
        status: 'Convertido',
      }),
      false,
    )
    assert.deepEqual(selecionarOrcamentosParaPersistirAposSync([historico as never], new Set()), [])
  })

  it('12) LEGITIMATE_WRITE_SANITIZATION_TEST: histórico com cfg/logo + mudança legítima → payload sem envelope', () => {
    const historico = { ...orcamentoLimpo(), ...envelopeSintetico() } as OrcamentoSalvoUpsertInput
    const editado = { ...historico, status: 'Convertido', observacao: 'Editado pelo usuário', atualizadoEm: 1790000099999 }
    const row = orcamentoParaUpsertSupabase(editado, 'u1')
    for (const campo of CAMPOS_PUBLICACAO_NAO_PERSISTIDOS) assert.equal(campo in row.payload, false, campo)
    assert.equal(row.status, 'Convertido')
    assert.equal(row.payload.observacao, 'Editado pelo usuário')
    assert.equal(row.payload.atualizadoEm, 1790000099999)
    assert.deepEqual(row.payload.aprovacaoDigital, JSON.parse(JSON.stringify(orcamentoLimpo().aprovacaoDigital)))
    assert.ok('cfg' in historico && 'token' in historico)
  })

  it('S/T) campos legítimos intactos e entrada não mutada', () => {
    const orc = contaminado()
    const antes = JSON.stringify(orc)
    const payload = serializarPayloadOrcamento(orc)
    assert.equal(JSON.stringify(orc), antes)
    assert.deepEqual(payload, JSON.parse(JSON.stringify(orcamentoLimpo())))
  })

  it('page.tsx: decisão semântica e persistência só dos alterados', () => {
    const page = read('app/(painel)/orcamentos/page.tsx')
    assert.ok(page.includes('syncAprovacaoExigePersistencia(orcamento, { ...atualizado, aprovadoEm: aprovadoEmResolvido })'))
    assert.ok(page.includes('idsAlterados.add(String(orcamento.id))'))
    assert.ok(page.includes('selecionarOrcamentosParaPersistirAposSync(listaFinal, idsAlterados)'))
    assert.equal(page.includes('JSON.stringify((orcamento as any).aprovacaoDigital'), false)
    assert.ok(page.includes('atualizadoEm: patchAprovacao.atualizadoEm ?? orcamento.atualizadoEm'))
  })
})
