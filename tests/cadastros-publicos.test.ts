import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  acumularPagantes,
  classificarCadastro,
  deduplicarCadastros,
  filtrarCadastros,
  leituraTemContinuacao,
  ordenarCadastrosPublicos,
  paginarCadastros,
  resumirCadastros,
  TAMANHO_PAGINA_PAGAMENTOS,
  type CadastroBruto,
} from '../lib/cadastros-publicos.ts'

const HOJE = '2026-10-16'

function bruto(parcial: Partial<CadastroBruto> & Pick<CadastroBruto, 'userId'>): CadastroBruto {
  return {
    criadoEm: '2026-10-16T15:00:00.000Z',
    email: `${parcial.userId.slice(0, 8)}@exemplo.test`,
    status: 'teste',
    ativo: true,
    vencimento: '2026-10-23',
    naCarteira: false,
    paganteConfirmado: false,
    ...parcial,
  }
}

function ler(caminho: string) {
  return readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8')
}

describe('cadastros públicos — classificação', () => {
  it('teste vigente hoje entra só em testes ativos', () => {
    const item = classificarCadastro(bruto({ userId: 'ativo', vencimento: HOJE }), HOJE)
    assert.equal(item.testeAtivo, true)
    assert.equal(item.testeVencido, false)
    assert.equal(item.convertido, false)
    assert.equal(item.pagante, false)
    assert.equal(item.rotulo, 'Teste ativo')
  })

  it('vencimento anterior e vencimento ausente entram em testes vencidos', () => {
    const ontem = classificarCadastro(bruto({ userId: 'ontem', vencimento: '2026-10-15' }), HOJE)
    const semData = classificarCadastro(bruto({ userId: 'sem-data', vencimento: null }), HOJE)
    assert.equal(ontem.testeVencido, true)
    assert.equal(ontem.testeAtivo, false)
    assert.equal(semData.testeVencido, true)
    assert.equal(semData.rotulo, 'Teste vencido')
  })

  it('conta inativa ou status diferente de teste fica fora dos dois baldes de teste', () => {
    const inativo = classificarCadastro(bruto({ userId: 'inativo', ativo: false }), HOJE)
    const trialAdmin = classificarCadastro(bruto({ userId: 'trial', status: 'trial' }), HOJE)
    const saiu = classificarCadastro(bruto({ userId: 'saiu', status: 'ativo' }), HOJE)
    for (const item of [inativo, trialAdmin, saiu]) {
      assert.equal(item.testeAtivo, false)
      assert.equal(item.testeVencido, false)
      assert.equal(item.rotulo, 'Fora do teste')
    }
  })

  it('carteira e pagamento confirmado saem do teste e podem coexistir', () => {
    const ambos = classificarCadastro(
      bruto({ userId: 'ambos', naCarteira: true, paganteConfirmado: true, status: 'teste' }),
      HOJE,
    )
    assert.equal(ambos.testeAtivo, false)
    assert.equal(ambos.testeVencido, false)
    assert.equal(ambos.convertido, true)
    assert.equal(ambos.pagante, true)
    assert.equal(ambos.rotulo, 'Na carteira · Pagante')
  })

  it('pagamento manual não é pagante confirmado', () => {
    const manual = classificarCadastro(bruto({ userId: 'manual', paganteConfirmado: false }), HOJE)
    assert.equal(manual.pagante, false)
    assert.equal(manual.testeAtivo, true)
  })

  it('ids repetidos contam uma vez e o total pode superar a soma dos subconjuntos', () => {
    const lista = deduplicarCadastros([
      bruto({ userId: 'dup' }),
      bruto({ userId: 'dup', email: 'outro@exemplo.test' }),
      bruto({ userId: 'fora', status: 'ativo', vencimento: null }),
    ]).map((item) => classificarCadastro(item, HOJE))
    const resumo = resumirCadastros(lista)
    assert.equal(lista.length, 2)
    assert.equal(resumo.total, 2)
    assert.equal(resumo.testesAtivos, 1)
    assert.equal(resumo.testesAtivos + resumo.testesVencidos + resumo.convertidos + resumo.pagantes, 1)
  })

  it('filtra e pagina sem repetir item entre páginas', () => {
    const lista = ['a', 'b', 'c'].map((userId, indice) =>
      classificarCadastro(
        bruto({
          userId,
          email: indice === 1 ? 'beta@exemplo.test' : 'alfa@exemplo.test',
          naCarteira: userId === 'c',
          status: userId === 'c' ? 'ativo' : 'teste',
        }),
        HOJE,
      ),
    )
    assert.deepEqual(filtrarCadastros(lista, 'convertido').map((item) => item.userId), ['c'])
    assert.deepEqual(filtrarCadastros(lista, 'teste_ativo', 'beta').map((item) => item.userId), ['b'])
    const pagina1 = paginarCadastros(lista, 1, 2)
    const pagina2 = paginarCadastros(lista, 2, 2)
    assert.deepEqual(pagina1.itens.map((item) => item.userId), ['a', 'b'])
    assert.deepEqual(pagina2.itens.map((item) => item.userId), ['c'])
    assert.equal(paginarCadastros(lista, 9, 100).pageSize, 50)
  })
})

describe('cadastros públicos — paginação determinística e pagantes', () => {
  it('o mesmo horário de cadastro ordena por user_id e as páginas não se repetem', () => {
    const instante = '2026-10-16T15:00:00.000Z'
    const lista = ordenarCadastrosPublicos([
      bruto({ userId: 'c', criadoEm: instante }),
      bruto({ userId: 'a', criadoEm: instante }),
      bruto({ userId: 'b', criadoEm: '2026-10-17T15:00:00.000Z' }),
      bruto({ userId: 'a', criadoEm: instante }),
    ])
    const unicos = deduplicarCadastros(lista)
    const ordenados = ordenarCadastrosPublicos(unicos)
    assert.deepEqual(ordenados.map((item) => item.userId), ['b', 'a', 'c'])
    const pagina1 = paginarCadastros(ordenados, 1, 2)
    const pagina2 = paginarCadastros(ordenados, 2, 2)
    const ids = [...pagina1.itens, ...pagina2.itens].map((item) => item.userId)
    assert.deepEqual(ids, ['b', 'a', 'c'])
    assert.equal(new Set(ids).size, ids.length)
  })

  it('pagamentos além do primeiro bloco entram uma vez por usuário', () => {
    const pagantes = new Set<string>()
    const esquecidosPeloCorte = new Set<string>()
    const linhas = [
      ...Array.from({ length: 1000 }, (_, indice) => ({ id: `p${indice}`, user_id: 'usuario-antigo' })),
      { id: 'p1000', user_id: 'usuario-alem-do-corte' },
      { id: 'p1001', user_id: 'usuario-alem-do-corte' },
    ]
    acumularPagantes(esquecidosPeloCorte, linhas.slice(0, 1000))
    assert.equal(esquecidosPeloCorte.has('usuario-alem-do-corte'), false)

    let inicio = 0
    while (true) {
      const pagina = linhas.slice(inicio, inicio + TAMANHO_PAGINA_PAGAMENTOS)
      acumularPagantes(pagantes, pagina)
      if (!leituraTemContinuacao(pagina.length, TAMANHO_PAGINA_PAGAMENTOS)) break
      inicio += TAMANHO_PAGINA_PAGAMENTOS
    }
    assert.deepEqual([...pagantes].sort(), ['usuario-alem-do-corte', 'usuario-antigo'])
    assert.equal(TAMANHO_PAGINA_PAGAMENTOS < 1000, true)
  })
})

describe('cadastros públicos — origem no código', () => {
  it('os dois createUser administrativos enviam origem_conta admin', () => {
    for (const caminho of ['app/api/admin/carteira/route.ts', 'app/api/admin/clientes/route.ts']) {
      const fonte = ler(caminho)
      assert.equal(fonte.split('auth.admin.createUser').length - 1, 1)
      assert.match(fonte, /app_metadata:\s*\{\s*origem_conta:\s*'admin'\s*\}/)
    }
  })

  it('o cadastro público permanece sem app_metadata', () => {
    const login = ler('app/(auth)/login/page.tsx')
    const trecho = login.slice(login.indexOf('supabase.auth.signUp'), login.indexOf('supabase.auth.signUp') + 400)
    assert.match(trecho, /signUp\(\{\s*email:/)
    assert.equal(trecho.includes('app_metadata'), false)
    assert.equal(trecho.includes('origem_conta'), false)
  })

  it('a migração não substitui criar_perfil, on_user_create nem a carteira', () => {
    const migracao = ler('docs/cadastros-publicos.sql')
    const rollback = ler('docs/cadastros-publicos-rollback.sql')
    for (const fonte of [migracao, rollback]) {
      const sql = fonte.replace(/--[^\n]*/g, '')
      assert.equal(sql.includes('criar_perfil'), false)
      assert.equal(sql.includes('on_user_create'), false)
      assert.equal(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.criar_perfil/i.test(sql), false)
      assert.equal(/DROP\s+TRIGGER[\s\S]*on_user_create/i.test(sql), false)
      assert.equal(/ALTER\s+TABLE\s+public\.perfis/i.test(sql), false)
      assert.equal(/pagamentos|assinaturas|admin_clientes/i.test(sql), false)
    }
    assert.match(migracao, /txid_origem = pg_catalog\.txid_current\(\)/)
    assert.match(migracao, /AFTER INSERT ON auth\.users/)
    assert.match(migracao, /AFTER UPDATE OF raw_app_meta_data ON auth\.users/)
    assert.match(migracao, /SET search_path = ''/)
    const corpo = migracao.split('AS $fn$').slice(1).map((parte) => parte.split('$fn$')[0]).join('\n')
    assert.equal(/SELECT|PERFORM|dblink|pg_net|http_|\bLOCK\b/i.test(corpo), false)
    assert.equal(ler('docs/security-profiles-p0.sql').includes('cadastros_publicos'), false)
    assert.match(ler('lib/admin-carteira.ts'), /item\.fonte === 'admin' && item\.legado !== true/)
    const rota = ler('app/api/admin/cadastros-publicos/route.ts')
    assert.match(rota, /\.order\('criado_em', \{ ascending: false \}\)\s*\.order\('user_id', \{ ascending: true \}\)/)
    assert.match(rota, /TAMANHO_PAGINA_PAGAMENTOS/)
    assert.match(rota, /\.order\('id', \{ ascending: true \}\)/)
  })
})
