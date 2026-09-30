import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

type Linha = Record<string, any>
type Banco = Record<string, Linha[]>

const ROOT = new URL('../', import.meta.url)
const ESTADO = '__PUBLIC_DOCS_LOGO_DEDUP_TEST__'
const SUPABASE_ADMIN_MOCK =
  'data:text/javascript,' +
  encodeURIComponent(`export function getSupabaseAdmin() { return globalThis.${ESTADO}.client }`)

// Carrega as rotas reais: resolve o alias '@/' e troca apenas o client Supabase por um banco em memória.
;(nodeModule as any).registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) {
    if (specifier === '@/lib/supabase-admin') return { url: SUPABASE_ADMIN_MOCK, shortCircuit: true }
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (specifier.startsWith('@/')) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const url = new URL(specifier.slice(2) + ext, ROOT)
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const LOGO = 'data:image/png;base64,LOGO_TESTE'
const OUTRA_IMAGEM = 'data:image/png;base64,OUTRA_IMAGEM_TESTE'
const ASSINATURA = 'data:image/png;base64,ASSINATURA_TESTE'
const LOGO_URL = 'https://cdn.exemplo.test/logo.png'
const OWNER = '11111111-1111-4111-8111-111111111111'
const OUTRO = '22222222-2222-4222-8222-222222222222'
const BEARER_OWNER = 'jwt-do-owner'
const BEARER_OUTRO = 'jwt-de-outro'
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaa11'
const TOKEN_NOVO = 'cccccccccccccccccccccc33'
const OG_ROTA = '/api/og/empresa-logo?'

const contar = (valor: unknown, agulha: string) => JSON.stringify(valor).split(agulha).length - 1

/** Objeto (config ou cfg) que mantém logoUrl ao lado de empresa_logo, por tipo. */
const LOGO_MANTIDO_EM: Record<string, 'config' | 'cfg'> = {
  orcamento: 'config',
  ordem_servico: 'cfg',
  recibo: 'config',
}
const outroObjeto = (o: 'config' | 'cfg') => (o === 'config' ? 'cfg' : 'config')

function sem(obj: Record<string, unknown>, chaves: string[]) {
  const copia = { ...obj }
  for (const c of chaves) delete copia[c]
  return copia
}

function criarClient(db: Banco) {
  return {
    auth: {
      getUser: async (jwt: string) => {
        if (jwt === BEARER_OWNER) return { data: { user: { id: OWNER } }, error: null }
        if (jwt === BEARER_OUTRO) return { data: { user: { id: OUTRO } }, error: null }
        return { data: { user: null }, error: { message: 'sem sessão' } }
      },
    },
    from(nome: string) {
      const tabela = (db[nome] ??= [])
      const filtros: ((r: Linha) => boolean)[] = []
      const presente = (v: unknown) => v !== null && v !== undefined
      let patch: Linha | null = null
      const linhas = () => tabela.filter((r) => filtros.every((f) => f(r)))
      const q: any = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq(coluna: string, valor: unknown) {
          filtros.push((r) => presente(r[coluna]) && String(r[coluna]) === String(valor))
          return q
        },
        in(coluna: string, valores: unknown[]) {
          filtros.push((r) => presente(r[coluna]) && valores.map(String).includes(String(r[coluna])))
          return q
        },
        is(coluna: string) {
          filtros.push((r) => !presente(r[coluna]))
          return q
        },
        async maybeSingle() {
          const rows = linhas()
          if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } }
          return { data: rows[0] ? structuredClone(rows[0]) : null, error: null }
        },
        async insert(linha: Linha) {
          tabela.push(structuredClone(linha))
          return { error: null }
        },
        update(linha: Linha) {
          patch = linha
          return q
        },
        then(resolve: (v: unknown) => void) {
          const rows = linhas()
          if (patch) for (const r of rows) Object.assign(r, structuredClone(patch))
          resolve({ data: rows.map((r) => ({ token: r.token })), error: null })
        },
      }
      return q
    },
  }
}

function linhaConfigEmpresa(logo = LOGO): Linha {
  return {
    id: 'cfg-1',
    user_id: OWNER,
    nome_empresa: 'Empresa Teste',
    tipo_pessoa: 'PJ',
    cnpj: '00000000000100',
    email: 'contato@exemplo.test',
    endereco: 'Rua Teste, 1',
    cidade_uf: 'Cidade/UF',
    responsavel: 'Responsável Teste',
    telefone: '1100000000',
    celular_empresa: '11900000000',
    logo_url: logo,
    cor_primaria: '#123456',
  }
}

function cfgCliente(logo = LOGO) {
  return {
    nomeEmpresa: 'Empresa Teste',
    logoUrl: logo,
    email: 'contato@exemplo.test',
    tituloPdf: 'Título Teste',
    rodapePdf: 'Rodapé Teste',
    corPrimaria: '#123456',
  }
}

function linhaPublicada(tipo: string, documentoId: string, payload: Linha, token = TOKEN): Linha {
  return {
    id: `row-${tipo}-${documentoId}`,
    token,
    document_type: tipo,
    document_id: documentoId,
    tipo,
    documento_id: documentoId,
    user_id: OWNER,
    payload,
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

/** Payload legado com as 5 cópias do logo gravadas pelo enriquecimento antigo. */
function payloadLegadoCincoCopias(extra: Linha = {}): Linha {
  const cfgLegado = { nomeEmpresa: 'Empresa Teste', logoUrl: LOGO, empresa_logo: LOGO, tituloPdf: 'Título Teste' }
  return {
    ...extra,
    empresa_logo: LOGO,
    empresa_logo_og: `https://appconnectpro.com.br${OG_ROTA}token=${TOKEN}&v=1`,
    empresa_nome: 'Empresa Teste',
    config: { ...cfgLegado },
    cfg: { ...cfgLegado },
    token: TOKEN,
    user_id: OWNER,
    owner_user_id: OWNER,
  }
}

let empresaPublica: typeof import('../lib/empresaPublica.ts')
let contratoEmpresa: typeof import('../lib/contratoEmpresa.ts')
let documentosPublicos: typeof import('../lib/documentosPublicos.ts')
let POST: (req: any) => Promise<Response>
let GET_OG: (req: any) => Promise<Response>
let GET_CONFIG: (req: any) => Promise<Response>

before(async () => {
  ;(globalThis as any)[ESTADO] = { client: criarClient({}) }
  empresaPublica = await import('../lib/empresaPublica.ts')
  contratoEmpresa = await import('../lib/contratoEmpresa.ts')
  documentosPublicos = await import('../lib/documentosPublicos.ts')
  POST = (await import('../app/api/public-docs/route.ts')).POST as any
  GET_OG = (await import('../app/api/og/empresa-logo/route.ts')).GET as any
  GET_CONFIG = (await import('../app/api/public-docs/config/route.ts')).GET as any
})

function usarBanco(db: Banco) {
  ;(globalThis as any)[ESTADO] = { client: criarClient(db) }
  return db
}

async function publicar(db: Banco, body: Linha, bearer = '') {
  usarBanco(db)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (bearer) headers.authorization = `Bearer ${bearer}`
  const res = await POST(
    new Request('http://localhost/api/public-docs', { method: 'POST', headers, body: JSON.stringify(body) }),
  )
  return { status: res.status, body: await res.json() }
}

function payloadGravado(db: Banco, tipo: string, documentoId: string) {
  const rows = db.public_documents.filter((r) => r.document_type === tipo && r.document_id === documentoId)
  assert.equal(rows.length, 1, 'uma única linha por documento')
  return rows[0].payload as Linha
}

function enriquecer(payload: Linha, documentType?: string, cfg: Linha = cfgCliente()) {
  const cfgPublica = documentosPublicos.mergeConfigPublicacao(cfg, documentosPublicos.configRowSupabaseToPublica(linhaConfigEmpresa()))
  return empresaPublica.enriquecerPayloadDocumentoPublico(payload, cfgPublica, {
    token: TOKEN,
    userId: OWNER,
    v: 1,
    documentType,
  }) as Linha
}

function payloadContrato(assinatura?: Linha) {
  return contratoEmpresa.payloadContratoPublico(
    { id: 'ct-1', cliente: 'Cliente Teste', valor: 100 },
    cfgCliente(),
    { token: TOKEN, v: 1, assinatura: assinatura as any },
  ) as Linha
}

const ASSINATURA_CONTRATO = {
  status: 'assinado',
  dataUrl: ASSINATURA,
  assinadoEm: '2026-09-30T12:00:00.000Z',
  nome: 'Cliente Teste',
}

describe('IO.2A — enriquecimento por tipo (documentos novos)', () => {
  for (const tipo of ['orcamento', 'ordem_servico', 'recibo']) {
    describe(tipo, () => {
      const base = { id: 1, cliente: { nome: 'Cliente Teste' }, itens: [{ descricao: 'Item', valor: 10 }] }

      it('sem documentType o comportamento anterior (5 cópias) permanece', () => {
        assert.equal(contar(enriquecer(base), LOGO), 5)
      })

      const mantido = LOGO_MANTIDO_EM[tipo]
      const outro = outroObjeto(mantido)

      it(`novo: exatamente 2 ocorrências do logo (empresa_logo + ${mantido}.logoUrl)`, () => {
        const p = enriquecer(base, tipo)
        assert.equal(contar(p, LOGO), 2)
        assert.equal(p.empresa_logo, LOGO)
        assert.equal(p[mantido].logoUrl, LOGO)
        assert.equal('empresa_logo' in p[mantido], false)
        assert.equal('logoUrl' in p[outro], false)
        assert.equal('empresa_logo' in p[outro], false)
      })

      it('empresa_logo_og continua URL HTTPS da rota OG', () => {
        const antes = enriquecer(base)
        const p = enriquecer(base, tipo)
        assert.equal(p.empresa_logo_og, antes.empresa_logo_og)
        assert.ok(String(p.empresa_logo_og).startsWith('https://'))
        assert.ok(String(p.empresa_logo_og).includes(OG_ROTA))
        assert.equal(p.config.empresa_logo_og, antes.config.empresa_logo_og)
        assert.equal(p.cfg.empresa_logo_og, antes.cfg.empresa_logo_og)
      })

      it('campos não-logo de config e cfg e do documento permanecem idênticos', () => {
        const antes = enriquecer(base)
        const p = enriquecer(base, tipo)
        assert.deepEqual(p[mantido], sem(antes[mantido], ['empresa_logo']))
        assert.deepEqual(p[outro], sem(antes[outro], ['logoUrl', 'empresa_logo']))
        assert.deepEqual(sem(p, ['config', 'cfg']), sem(antes, ['config', 'cfg']))
        assert.equal(p.config.email, 'contato@exemplo.test')
        assert.equal(p.cfg.responsavel, 'Responsável Teste')
        assert.equal(p.cfg.nomeEmpresa, 'Empresa Teste')
      })
    })
  }

  it('assinatura do orçamento (aprovacaoDigital.assinatura) permanece', () => {
    const p = enriquecer({ id: 1, aprovacaoDigital: { status: 'aprovado', nome: 'Cliente', assinatura: ASSINATURA } }, 'orcamento')
    assert.equal(p.aprovacaoDigital.assinatura, ASSINATURA)
    assert.equal(contar(p, ASSINATURA), 1)
  })

  it('contrato novo: exatamente 2 logos (empresa_logo + empresaPublica.logoUrl)', () => {
    assert.equal(contar(enriquecer(payloadContrato()), LOGO), 6)
    const p = enriquecer(payloadContrato(), 'contrato')
    assert.equal(contar(p, LOGO), 2)
    assert.equal(p.empresa_logo, LOGO)
    assert.equal(p.empresaPublica.logoUrl, LOGO)
    for (const chave of ['logoUrl', 'empresa_logo']) {
      assert.equal(chave in p.config, false)
      assert.equal(chave in p.cfg, false)
    }
  })

  it('contrato: campos não-logo de config/cfg e empresaPublica permanecem', () => {
    const antes = enriquecer(payloadContrato())
    const p = enriquecer(payloadContrato(), 'contrato')
    assert.deepEqual(p.config, sem(antes.config, ['logoUrl', 'empresa_logo']))
    assert.deepEqual(p.cfg, sem(antes.cfg, ['logoUrl', 'empresa_logo']))
    assert.deepEqual(p.empresaPublica, antes.empresaPublica)
    assert.equal(p.empresa_logo_og, antes.empresa_logo_og)
  })

  it('contrato assinado: 1 assinatura, assinaturaDigital mantém metadados', () => {
    const antes = enriquecer(payloadContrato(ASSINATURA_CONTRATO))
    assert.equal(contar(antes, ASSINATURA), 2)
    const p = enriquecer(payloadContrato(ASSINATURA_CONTRATO), 'contrato')
    assert.equal(contar(p, ASSINATURA), 1)
    assert.equal(contar(p, LOGO), 2)
    assert.deepEqual(p.assinatura, ASSINATURA_CONTRATO)
    assert.deepEqual(p.assinaturaDigital, sem(ASSINATURA_CONTRATO, ['dataUrl']))
    assert.equal(p.assinado, true)
  })
})

describe('IO.2A — limpeza específica (não genérica)', () => {
  it('logo em URL: payload idêntico ao comportamento anterior', () => {
    const base = { id: 1 }
    const cfg = cfgCliente(LOGO_URL)
    const cfgPublica = documentosPublicos.mergeConfigPublicacao(cfg, documentosPublicos.configRowSupabaseToPublica(linhaConfigEmpresa(LOGO_URL)))
    const opts = { token: TOKEN, userId: OWNER, v: 1 }
    for (const tipo of ['orcamento', 'ordem_servico', 'recibo']) {
      assert.deepEqual(
        empresaPublica.enriquecerPayloadDocumentoPublico(base, cfgPublica, { ...opts, documentType: tipo }),
        empresaPublica.enriquecerPayloadDocumentoPublico(base, cfgPublica, opts),
      )
    }
  })

  it('imagem diferente em caminho redundante não é removida; imagens de negócio intocadas', () => {
    const payload = {
      empresa_logo: LOGO,
      config: { logoUrl: LOGO, empresa_logo: OUTRA_IMAGEM, nomeEmpresa: 'X' },
      cfg: { logoUrl: OUTRA_IMAGEM, empresa_logo: LOGO },
      itens: [{ imagem: LOGO }],
      anexo: LOGO,
      aprovacaoDigital: { assinatura: ASSINATURA },
    }
    const p = empresaPublica.deduplicarImagensPayloadPublico(payload, 'orcamento') as Linha
    assert.deepEqual(p.config, { logoUrl: LOGO, empresa_logo: OUTRA_IMAGEM, nomeEmpresa: 'X' })
    assert.deepEqual(p.cfg, { logoUrl: OUTRA_IMAGEM })
    assert.equal(p.itens[0].imagem, LOGO)
    assert.equal(p.anexo, LOGO)
    assert.equal(p.aprovacaoDigital.assinatura, ASSINATURA)
    assert.deepEqual(payload.cfg, { logoUrl: OUTRA_IMAGEM, empresa_logo: LOGO }, 'entrada não é mutada')
  })

  it('contrato: assinaturaDigital com imagem diferente é preservada', () => {
    const payload = {
      empresa_logo: LOGO,
      empresaPublica: { logoUrl: LOGO },
      assinatura: { status: 'assinado', dataUrl: ASSINATURA },
      assinaturaDigital: { status: 'assinado', dataUrl: OUTRA_IMAGEM },
    }
    const p = empresaPublica.deduplicarImagensPayloadPublico(payload, 'contrato') as Linha
    assert.equal(p.assinaturaDigital.dataUrl, OUTRA_IMAGEM)
  })

  it('tipo ausente ou desconhecido: payload inalterado', () => {
    const payload = payloadLegadoCincoCopias()
    assert.equal(empresaPublica.deduplicarImagensPayloadPublico(payload), payload)
    assert.equal(empresaPublica.deduplicarImagensPayloadPublico(payload, 'outro'), payload)
  })

  it("alias 'os' segue a regra de ordem de serviço", () => {
    assert.equal(contar(empresaPublica.deduplicarImagensPayloadPublico(payloadLegadoCincoCopias(), 'os'), LOGO), 2)
  })
})

const CASOS_POST: { tipo: string; id: string; payloadNovo: Linha; legado: Linha }[] = [
  {
    tipo: 'orcamento',
    id: '1716000000001',
    payloadNovo: { id: 1716000000001, cliente: { nome: 'Cliente Teste' }, config: cfgCliente(), cfg: cfgCliente() },
    legado: payloadLegadoCincoCopias({
      id: 1716000000001,
      cliente: { nome: 'Cliente Teste' },
      observacoes: 'Campo de negócio legado',
      aprovacaoDigital: { status: 'aprovado', nome: 'Cliente Teste', assinatura: ASSINATURA },
    }),
  },
  {
    tipo: 'ordem_servico',
    id: '1716000000002',
    payloadNovo: { id: 1716000000002, cliente: 'Cliente Teste', status: 'Aberta', config: cfgCliente(), cfg: cfgCliente() },
    legado: payloadLegadoCincoCopias({ id: 1716000000002, cliente: 'Cliente Teste', observacoes: 'Campo de negócio legado' }),
  },
  {
    tipo: 'recibo',
    id: '1716000000003',
    payloadNovo: { numero: 'R-1', cliente: 'Cliente Teste', valor: 10, config: cfgCliente() },
    legado: payloadLegadoCincoCopias({ numero: 'R-1', cliente: 'Cliente Teste', observacoes: 'Campo de negócio legado' }),
  },
]

function bodyPublicacao(tipo: string, id: string, payload: Linha, token = '') {
  return { document_type: tipo, tipo, document_id: id, documentoId: id, ...(token ? { token } : {}), payload }
}

describe('IO.2A — POST /api/public-docs real (banco em memória)', () => {
  for (const caso of CASOS_POST) {
    it(`${caso.tipo} novo: payload gravado com exatamente 2 logos`, async () => {
      const db = usarBanco({ public_documents: [], configuracoes_empresa: [linhaConfigEmpresa()] })
      const token = caso.tipo === 'recibo' ? TOKEN_NOVO : ''
      const r = await publicar(db, bodyPublicacao(caso.tipo, caso.id, caso.payloadNovo, token), BEARER_OWNER)
      assert.equal(r.status, 200)
      const p = payloadGravado(db, caso.tipo, caso.id)
      assert.equal(contar(p, LOGO), 2)
      assert.equal(p.empresa_logo, LOGO)
      assert.equal(p[LOGO_MANTIDO_EM[caso.tipo]].logoUrl, LOGO)
      assert.ok(String(p.empresa_logo_og).includes(OG_ROTA))
      assert.equal(r.body.empresa_logo_og, p.empresa_logo_og)
      assert.equal(db.public_documents[0].user_id, OWNER)
      assert.equal(p.owner_user_id, OWNER)
      assert.equal(p.token, r.body.token)
    })

    it(`${caso.tipo} legado com 5 cópias: republicação grava exatamente 2 (merge com existente não ressuscita)`, async () => {
      assert.equal(contar(caso.legado, LOGO), 5)
      const db = usarBanco({
        public_documents: [linhaPublicada(caso.tipo, caso.id, structuredClone(caso.legado))],
        configuracoes_empresa: [linhaConfigEmpresa()],
      })
      const r = await publicar(db, bodyPublicacao(caso.tipo, caso.id, caso.payloadNovo, TOKEN), BEARER_OWNER)
      assert.equal(r.status, 200)
      assert.equal(r.body.token, TOKEN)
      const p = payloadGravado(db, caso.tipo, caso.id)
      assert.equal(contar(p, LOGO), 2)
      assert.equal(p.empresa_logo, LOGO)
      assert.equal(p[LOGO_MANTIDO_EM[caso.tipo]].logoUrl, LOGO)
      assert.equal(p.observacoes, 'Campo de negócio legado')
      assert.equal(p.cfg.nomeEmpresa, 'Empresa Teste')
      assert.equal(p.cfg.responsavel, 'Responsável Teste')
      if (caso.tipo === 'orcamento') assert.equal(p.aprovacaoDigital.assinatura, ASSINATURA)
    })
  }

  it('OS legada republicada: empresa_logo + cfg.logoUrl; sem a mesma imagem em config.logoUrl, config.empresa_logo, cfg.empresa_logo', async () => {
    const caso = CASOS_POST.find((c) => c.tipo === 'ordem_servico')!
    const db = usarBanco({
      public_documents: [linhaPublicada(caso.tipo, caso.id, structuredClone(caso.legado))],
      configuracoes_empresa: [linhaConfigEmpresa()],
    })
    const r = await publicar(db, bodyPublicacao(caso.tipo, caso.id, caso.payloadNovo, TOKEN), BEARER_OWNER)
    assert.equal(r.status, 200)
    const p = payloadGravado(db, caso.tipo, caso.id)
    assert.equal(contar(p, LOGO), 2)
    assert.equal(p.empresa_logo, LOGO)
    assert.equal(p.cfg.logoUrl, LOGO)
    assert.equal('logoUrl' in p.config, false)
    assert.equal('empresa_logo' in p.config, false)
    assert.equal('empresa_logo' in p.cfg, false)
    assert.deepEqual(sem(p.config, ['logoUrl', 'empresa_logo']), sem(p.cfg, ['logoUrl', 'empresa_logo']))
    for (const obj of [p.config, p.cfg]) {
      assert.equal(obj.nomeEmpresa, 'Empresa Teste')
      assert.equal(obj.email, 'contato@exemplo.test')
      assert.equal(obj.responsavel, 'Responsável Teste')
      assert.equal(obj.cidadeUf, 'Cidade/UF')
      assert.equal(obj.empresa_nome, 'Empresa Teste')
      assert.equal(obj.empresa_logo_og, p.empresa_logo_og)
    }
  })

  it('contrato novo: exatamente 2 logos no payload gravado', async () => {
    const db = usarBanco({ public_documents: [], configuracoes_empresa: [linhaConfigEmpresa()] })
    const r = await publicar(db, bodyPublicacao('contrato', 'ct-1', payloadContrato(), TOKEN_NOVO), BEARER_OWNER)
    assert.equal(r.status, 200)
    const p = payloadGravado(db, 'contrato', 'ct-1')
    assert.equal(contar(p, LOGO), 2)
    assert.equal(p.empresa_logo, LOGO)
    assert.equal(p.empresaPublica.logoUrl, LOGO)
  })

  it('contrato legado com 6 logos + 2 assinaturas: republicação grava 2 logos e 1 assinatura', async () => {
    const legado = payloadContrato(ASSINATURA_CONTRATO)
    legado.config = { ...legado.config, logoUrl: LOGO }
    legado.cfg = { ...legado.cfg, logoUrl: LOGO }
    assert.equal(contar(legado, LOGO), 6)
    assert.equal(contar(legado, ASSINATURA), 2)
    const db = usarBanco({
      public_documents: [linhaPublicada('contrato', 'ct-1', legado)],
      configuracoes_empresa: [linhaConfigEmpresa()],
    })
    const r = await publicar(db, bodyPublicacao('contrato', 'ct-1', payloadContrato(), TOKEN), BEARER_OWNER)
    assert.equal(r.status, 200)
    const p = payloadGravado(db, 'contrato', 'ct-1')
    assert.equal(contar(p, LOGO), 2)
    assert.equal(contar(p, ASSINATURA), 1)
    assert.equal(p.assinatura.dataUrl, ASSINATURA)
    assert.deepEqual(p.assinaturaDigital, sem(ASSINATURA_CONTRATO, ['dataUrl']))
  })

  it('contrato assinado pelo link público (sem Bearer): 1 assinatura e status do contrato atualizado', async () => {
    const db = usarBanco({
      public_documents: [linhaPublicada('contrato', 'ct-1', enriquecer(payloadContrato(), 'contrato'))],
      configuracoes_empresa: [linhaConfigEmpresa()],
      contratos: [{ id: 'ct-1', status: 'Pendente' }],
    })
    const r = await publicar(db, bodyPublicacao('contrato', 'ct-1', payloadContrato(ASSINATURA_CONTRATO), TOKEN))
    assert.equal(r.status, 200)
    const p = payloadGravado(db, 'contrato', 'ct-1')
    assert.equal(contar(p, ASSINATURA), 1)
    assert.equal(contar(p, LOGO), 2)
    assert.equal(p.assinatura.dataUrl, ASSINATURA)
    assert.equal(db.contratos[0].status, 'Assinado')
  })

  it('token/ownership inalterados: outro owner → 403, sem Bearer fora de aprovação → 403, payload intacto', async () => {
    const caso = CASOS_POST[0]
    const legado = structuredClone(caso.legado)
    const db = usarBanco({
      public_documents: [linhaPublicada(caso.tipo, caso.id, legado)],
      configuracoes_empresa: [linhaConfigEmpresa()],
    })
    const outro = await publicar(db, bodyPublicacao(caso.tipo, caso.id, caso.payloadNovo, TOKEN), BEARER_OUTRO)
    assert.equal(outro.status, 403)
    const anonimo = await publicar(db, bodyPublicacao(caso.tipo, caso.id, caso.payloadNovo, TOKEN))
    assert.equal(anonimo.status, 403)
    const semNada = await publicar(usarBanco({ public_documents: [] }), bodyPublicacao(caso.tipo, caso.id, caso.payloadNovo))
    assert.equal(semNada.status, 401)
    assert.deepEqual(db.public_documents[0].payload, caso.legado)
    assert.equal(db.public_documents[0].token, TOKEN)
    assert.equal(db.public_documents[0].user_id, OWNER)
  })
})

describe('IO.2A — readers atuais aceitam o payload produzido', () => {
  async function payloadPublicado(tipo: string) {
    const db = usarBanco({ public_documents: [], configuracoes_empresa: [linhaConfigEmpresa()] })
    const caso = CASOS_POST.find((c) => c.tipo === tipo)
    const body =
      tipo === 'contrato'
        ? bodyPublicacao('contrato', 'ct-1', payloadContrato(ASSINATURA_CONTRATO), TOKEN)
        : bodyPublicacao(tipo, caso!.id, caso!.payloadNovo, TOKEN)
    const r = await publicar(db, body, BEARER_OWNER)
    assert.equal(r.status, 200)
    return db
  }

  for (const tipo of ['orcamento', 'ordem_servico', 'recibo', 'contrato']) {
    it(`rota OG resolve empresa_logo do payload de ${tipo} (imagem, sem redirect para si mesma)`, async () => {
      const db = await payloadPublicado(tipo)
      db.configuracoes_empresa = []
      usarBanco(db)
      const res = await GET_OG(new Request(`http://localhost${OG_ROTA}token=${TOKEN}&v=1`))
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('content-type'), 'image/png')
      const bytes = Buffer.from(await res.arrayBuffer())
      assert.deepEqual(bytes, Buffer.from('LOGO_TESTE', 'base64'))
    })
  }

  it('rota OG com logo em URL continua redirecionando para a URL do logo', async () => {
    const db = usarBanco({ public_documents: [], configuracoes_empresa: [linhaConfigEmpresa(LOGO_URL)] })
    const caso = CASOS_POST[0]
    await publicar(db, bodyPublicacao(caso.tipo, caso.id, { ...caso.payloadNovo, config: cfgCliente(LOGO_URL), cfg: cfgCliente(LOGO_URL) }, TOKEN), BEARER_OWNER)
    const res = await GET_OG(new Request(`http://localhost${OG_ROTA}token=${TOKEN}&v=1`))
    assert.equal(res.status, 302)
    assert.ok(String(res.headers.get('location')).startsWith(LOGO_URL))
  })

  for (const tipo of ['orcamento', 'ordem_servico']) {
    it(`/api/public-docs/config devolve o logo do payload de ${tipo} mesmo sem configuracoes_empresa`, async () => {
      const db = await payloadPublicado(tipo)
      db.configuracoes_empresa = []
      usarBanco(db)
      const res = await GET_CONFIG(new Request(`http://localhost/api/public-docs/config?token=${TOKEN}`))
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.config.logoUrl, LOGO)
      assert.ok(String(body.config.empresa_logo_og).includes(OG_ROTA))
    })
  }

  it('OS: com /api/public-docs/config indisponível, o fallback existente (payload.cfg) ainda resolve o logo', async () => {
    const pagina = readFileSync(new URL('components/documentos/OrdemServicoDocumentoPage.tsx', ROOT), 'utf8').replace(/\r\n/g, '\n')
    assert.ok(pagina.includes('const cfg = payload?.cfg || payload?.config || payload?.empresa || {}'))
    assert.ok(pagina.includes("normalizarLogoUrl(String(cfg?.logoUrl || cfg?.logo || cfg?.logo_url || '/logo-connect.png'))"))
    assert.ok(pagina.includes('const cfgPayload = extrairConfigDoPayload(osPublica)'))
    assert.ok(pagina.includes('const cfgFinal = configDoc || cfgPayload'))

    const db = await payloadPublicado('ordem_servico')
    const p = payloadGravado(db, 'ordem_servico', CASOS_POST[1].id)

    ;(globalThis as any)[ESTADO] = { client: { from() { throw new Error('indisponível') } } }
    const res = await GET_CONFIG(new Request(`http://localhost/api/public-docs/config?token=${TOKEN}`))
    assert.notEqual(res.status, 200, 'configDoc fica null e a página usa cfgPayload')

    const cfg = p?.cfg || p?.config || p?.empresa || {}
    assert.equal(String(cfg?.logoUrl || cfg?.logo || cfg?.logo_url || '/logo-connect.png'), LOGO)
  })

  it('orçamento: merge da página (config pública + payload.cfg + payload.config) mantém o logo', async () => {
    const db = await payloadPublicado('orcamento')
    const p = payloadGravado(db, 'orcamento', CASOS_POST[0].id)
    const { mergeConfigPublicacao } = documentosPublicos
    assert.equal(mergeConfigPublicacao(null, p.cfg, p.config).logoUrl, LOGO)
    assert.equal(mergeConfigPublicacao({ logoUrl: LOGO }, p.cfg, p.config).logoUrl, LOGO)
  })

  it('recibo: config.logoUrl (lido por ReciboEmitidoView) mantém o logo', async () => {
    const db = await payloadPublicado('recibo')
    assert.equal(payloadGravado(db, 'recibo', CASOS_POST[2].id).config.logoUrl, LOGO)
  })

  it('contrato: empresaContratoFromPayload e parseAssinaturaPayload leem logo e assinatura', async () => {
    const db = await payloadPublicado('contrato')
    const p = payloadGravado(db, 'contrato', 'ct-1')
    assert.equal(contratoEmpresa.empresaContratoFromPayload(p).logoUrl, LOGO)
    const assinatura = contratoEmpresa.parseAssinaturaPayload(p)
    assert.equal(assinatura?.dataUrl, ASSINATURA)
    assert.equal(assinatura?.status, 'assinado')
    assert.equal(contratoEmpresa.parseAssinaturaPayload({ assinaturaDigital: p.assinaturaDigital })?.status, 'assinado')
  })

  it('metadata: mergeConfigDocumentoPublico resolve o logo do payload', async () => {
    for (const tipo of ['orcamento', 'ordem_servico', 'recibo', 'contrato']) {
      const db = await payloadPublicado(tipo)
      const p = db.public_documents[0].payload as Linha
      assert.equal(empresaPublica.mergeConfigDocumentoPublico(null, p).logoUrl, LOGO)
    }
  })
})
