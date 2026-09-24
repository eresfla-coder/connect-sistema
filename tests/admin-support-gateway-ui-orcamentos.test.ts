/**
 * ADMIN.4.3.3 — UI mínima Ver Orçamentos (gateway read-only).
 * Sem smoke live, sem support session real.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  ADMIN_SUPPORT_ORCAMENTOS_GATEWAY_PATH,
  ADMIN_SUPPORT_ORCAMENTOS_TENANT_KEYS_PROIBIDOS,
  deveAplicarResultadoGatewayOrcamentos,
  deveMostrarCtaVerOrcamentosSuporte,
  formatarCampoOrcamentoSuporteUi,
  isAdminSupportUiEnabledFromValues,
  mapearListaOrcamentosGatewayUi,
  mensagemErroGatewayOrcamentosUi,
  montarUrlGatewayOrcamentosSuporte,
  urlGatewayOrcamentosTemTenantProibido,
} from '../lib/admin-support-ui.ts'

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('ADMIN.4.3.3 CTA visibility (A–B)', () => {
  it('A) Ver Orçamentos ausente sem support session ativa', () => {
    assert.equal(deveMostrarCtaVerOrcamentosSuporte(false), false)
    const panel = read('components/admin/AdminModoSuportePanel.tsx')
    assert.ok(panel.includes('deveMostrarCtaVerOrcamentosSuporte(fase === \'ativo\' && !!ativo)'))
  })

  it('B) presente com active=true', () => {
    assert.equal(deveMostrarCtaVerOrcamentosSuporte(true), true)
    const panel = read('components/admin/AdminModoSuportePanel.tsx')
    assert.ok(panel.includes('Ver Orçamentos'))
    assert.ok(panel.includes('admin-modo-suporte-ver-orcamentos'))
    assert.ok(panel.includes('admin-modo-suporte-ativo'))
  })
})

describe('ADMIN.4.3.3 request contract (C–L)', () => {
  const url = montarUrlGatewayOrcamentosSuporte({ limit: 20, offset: 0 })
  const panel = read('components/admin/AdminModoSuportePanel.tsx')

  it('C) request usa GET', () => {
    assert.ok(panel.includes("method: 'GET'"))
    assert.ok(panel.includes('carregarOrcamentosGateway'))
  })

  it('D) request usa Bearer Master', () => {
    assert.ok(panel.includes('supabase.auth.getSession()'))
    assert.ok(panel.includes('Authorization: `Bearer ${token}`'))
  })

  it('E) request usa cache no-store', () => {
    assert.ok(panel.includes("cache: 'no-store'"))
  })

  it('F) URL contém somente limit/offset', () => {
    assert.equal(url, `${ADMIN_SUPPORT_ORCAMENTOS_GATEWAY_PATH}?limit=20&offset=0`)
    const u = new URL(url, 'https://local.invalid')
    assert.deepEqual([...u.searchParams.keys()].sort(), ['limit', 'offset'])
  })

  it('G–L) não envia tenant IDs', () => {
    assert.equal(urlGatewayOrcamentosTemTenantProibido(url), false)
    for (const key of ADMIN_SUPPORT_ORCAMENTOS_TENANT_KEYS_PROIBIDOS) {
      assert.equal(url.includes(`${key}=`), false, key)
      assert.equal(
        urlGatewayOrcamentosTemTenantProibido(
          `${ADMIN_SUPPORT_ORCAMENTOS_GATEWAY_PATH}?limit=20&${key}=x`,
        ),
        true,
        key,
      )
    }
    assert.ok(panel.includes('montarUrlGatewayOrcamentosSuporte({ limit: 20, offset: 0 })'))
    assert.equal(panel.includes('user_id='), false)
    assert.equal(panel.includes('perfil_id='), false)
    assert.equal(panel.includes('empresa_id='), false)
    assert.equal(panel.includes('cliente_id='), false)
    assert.equal(panel.includes('vinculo_id='), false)
  })
})

describe('ADMIN.4.3.3 storage / loaders (M–Q)', () => {
  const panel = read('components/admin/AdminModoSuportePanel.tsx')
  const ui = read('lib/admin-support-ui.ts')

  it('M) não usa payload de orçamento', () => {
    assert.equal(panel.includes('row.payload'), false)
    assert.equal(panel.includes('orcamento.payload'), false)
    assert.equal(panel.includes('payload->>'), false)
    assert.ok(ui.includes('sem spread de row/payload') || ui.includes('mapearListaOrcamentosGatewayUi'))
  })

  it('N) não usa localStorage', () => {
    assert.equal(panel.includes('localStorage'), false)
  })

  it('O) não usa sessionStorage', () => {
    assert.equal(panel.includes('sessionStorage'), false)
  })

  it('P) não usa loader normal de Orçamentos', () => {
    assert.equal(panel.includes("from('orcamentos')"), false)
    assert.equal(panel.includes('/api/orcamentos'), false)
    assert.equal(panel.includes('connect_orcamentos_salvos'), false)
    assert.ok(panel.includes('montarUrlGatewayOrcamentosSuporte'))
  })

  it('Q) não faz polling', () => {
    assert.equal(panel.includes('setInterval'), false)
    assert.equal(panel.includes('setTimeout('), false)
    assert.ok(panel.includes('Ver Orçamentos'))
  })
})

describe('ADMIN.4.3.3 cleanup (R–U)', () => {
  const panel = read('components/admin/AdminModoSuportePanel.tsx')

  it('R/S) 401/403 limpa state', () => {
    assert.ok(panel.includes('res.status === 401 || res.status === 403'))
    assert.ok(panel.includes('limparOrcamentosMemoria()'))
    assert.ok(panel.includes('mensagemErroGatewayOrcamentosUi'))
    assert.equal(mensagemErroGatewayOrcamentosUi(401), 'Sessão de suporte indisponível ou expirada.')
    assert.equal(mensagemErroGatewayOrcamentosUi(403), 'Sessão de suporte indisponível ou expirada.')
  })

  it('T) encerramento limpa state', () => {
    assert.ok(panel.includes('async function confirmarEncerrar'))
    const encerrarIdx = panel.indexOf('async function confirmarEncerrar')
    const body = panel.slice(encerrarIdx, encerrarIdx + 800)
    assert.ok(body.includes('limparOrcamentosMemoria()'))
  })

  it('U) active=false limpa state', () => {
    assert.ok(panel.includes('limparOrcamentosMemoria()'))
    assert.ok(panel.includes('aplicarStatus'))
    // branch inactive chama limpeza antes de setAtivo(null)
    const idx = panel.indexOf('limparOrcamentosMemoria()\n        setAtivo(null)')
    const idxAlt = panel.indexOf('limparOrcamentosMemoria()\r\n        setAtivo(null)')
    assert.ok(idx >= 0 || idxAlt >= 0 || /limparOrcamentosMemoria\(\)\s*\n\s*setAtivo\(null\)/.test(panel))
  })
})

describe('ADMIN.4.3.3a race / cleanup guards', () => {
  const panel = read('components/admin/AdminModoSuportePanel.tsx')

  it('stale GET não aplica após gen/session mudar', () => {
    assert.equal(
      deveAplicarResultadoGatewayOrcamentos({
        requestGen: 1,
        latestGen: 2,
        stillMounted: true,
        faseAtiva: true,
        sessionIdEsperado: 's1',
        sessionIdAtual: 's1',
      }),
      false,
    )
    assert.equal(
      deveAplicarResultadoGatewayOrcamentos({
        requestGen: 1,
        latestGen: 1,
        stillMounted: true,
        faseAtiva: false,
        sessionIdEsperado: 's1',
        sessionIdAtual: 's1',
      }),
      false,
    )
    assert.equal(
      deveAplicarResultadoGatewayOrcamentos({
        requestGen: 1,
        latestGen: 1,
        stillMounted: true,
        faseAtiva: true,
        sessionIdEsperado: 's-a',
        sessionIdAtual: 's-b',
      }),
      false,
    )
    assert.equal(
      deveAplicarResultadoGatewayOrcamentos({
        requestGen: 1,
        latestGen: 1,
        stillMounted: false,
        faseAtiva: true,
        sessionIdEsperado: 's1',
        sessionIdAtual: 's1',
      }),
      false,
    )
    assert.equal(
      deveAplicarResultadoGatewayOrcamentos({
        requestGen: 3,
        latestGen: 3,
        stillMounted: true,
        faseAtiva: true,
        sessionIdEsperado: 's1',
        sessionIdAtual: 's1',
      }),
      true,
    )
  })

  it('AbortController + generation no painel', () => {
    assert.ok(panel.includes('AbortController'))
    assert.ok(panel.includes('orcamentosGenRef'))
    assert.ok(panel.includes('deveAplicarResultadoGatewayOrcamentos'))
    assert.ok(panel.includes('signal: ac.signal'))
    assert.ok(panel.includes('mountedRef'))
  })

  it('double-click: abort anterior + disabled loading', () => {
    assert.ok(panel.includes('orcamentosAbortRef.current?.abort()'))
    assert.ok(panel.includes('disabled={locked || orcamentosLoading}'))
  })

  it('unmount aborta request', () => {
    assert.ok(panel.includes('mountedRef.current = false'))
    assert.ok(panel.includes('orcamentosAbortRef.current?.abort()'))
  })

  it('500/rede limpa dados com mensagem sanitizada', () => {
    assert.equal(mensagemErroGatewayOrcamentosUi(500), 'Não foi possível listar orçamentos.')
    assert.equal(mensagemErroGatewayOrcamentosUi(null), 'Não foi possível listar orçamentos.')
    assert.ok(panel.includes('mensagemErroGatewayOrcamentosUi'))
    assert.ok(panel.includes('limparOrcamentosMemoria()'))
    assert.equal(panel.includes('body.error || `Falha ao listar'), false)
  })

  it('troca de seleção limpa dados de suporte', () => {
    assert.ok(panel.includes('limparOrcamentosMemoria()\n                                setSelecionadoKey(key)') || /limparOrcamentosMemoria\(\)\s*\n\s*setSelecionadoKey\(key\)/.test(panel))
  })

  it('token não é logado; response não persistida', () => {
    assert.equal(panel.includes('console.log'), false)
    assert.equal(panel.includes('localStorage'), false)
    assert.equal(panel.includes('sessionStorage'), false)
    assert.equal(panel.includes('IndexedDB'), false)
  })
})

describe('ADMIN.4.3.3 DTO / security (V–Z)', () => {
  const panel = read('components/admin/AdminModoSuportePanel.tsx')
  const ui = read('lib/admin-support-ui.ts')
  const route = read('app/api/admin/suporte/dados/orcamentos/route.ts')
  const gw = read('lib/admin-support-gateway.ts')

  it('V) DTO renderizado explicitamente', () => {
    const lista = mapearListaOrcamentosGatewayUi({
      ok: true,
      data: [
        {
          local_id: '1',
          cliente_nome: null,
          status: 'Pendente',
          total: null,
          aprovado: false,
          updated_at: '2026-01-01',
          created_at: null,
          payload: { secreto: true },
          user_id: 'should-not-map',
        },
      ],
    })
    assert.equal(lista.length, 1)
    assert.deepEqual(Object.keys(lista[0]!).sort(), [
      'aprovado',
      'cliente_nome',
      'created_at',
      'local_id',
      'status',
      'total',
      'updated_at',
    ])
    assert.equal('payload' in lista[0]!, false)
    assert.equal('user_id' in lista[0]!, false)
    assert.equal(formatarCampoOrcamentoSuporteUi(null), '—')
    assert.equal(formatarCampoOrcamentoSuporteUi(lista[0]!.cliente_nome), '—')
    assert.ok(panel.includes('formatarCampoOrcamentoSuporteUi(row.local_id)'))
    assert.ok(panel.includes('Orçamentos — somente leitura'))
  })

  it('W) sem spread de objeto sensível', () => {
    assert.equal(/\.\.\.\s*row\b/.test(ui), false)
    assert.equal(/\.\.\.\s*item\b/.test(ui), false)
    assert.ok(ui.includes('out.push({'))
  })

  it('X) nenhum write na UI de leitura', () => {
    assert.equal(panel.includes("method: 'POST'") && panel.includes('dados/orcamentos'), false)
    assert.equal(panel.includes('admin_support_events'), false)
    assert.equal(panel.includes('sessoes_ativas'), false)
    // leitura do gateway é GET
    assert.ok(panel.includes("method: 'GET'"))
  })

  it('Y) gateway existente não alterado nesta rodada (contrato SELECT)', () => {
    assert.ok(gw.includes("'local_id,aprovado,updated_at,created_at,status,total,cliente'"))
    assert.equal(gw.includes("'local_id,aprovado,updated_at,created_at,status,total,cliente,payload'"), false)
    assert.ok(!/ADMIN_SUPPORT_ORCAMENTOS_SELECT\s*=\s*'[^']*payload/.test(gw))
    assert.ok(route.includes('export async function GET'))
    assert.equal(/export async function POST/.test(route), false)
  })

  it('Z) Production gate preservado', () => {
    assert.equal(isAdminSupportUiEnabledFromValues('true', 'production'), false)
    assert.equal(isAdminSupportUiEnabledFromValues(undefined, 'preview'), false)
    assert.equal(isAdminSupportUiEnabledFromValues('true', 'preview'), true)
    assert.ok(ui.includes('NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED'))
    assert.ok(ui.includes('NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV'))
  })
})
