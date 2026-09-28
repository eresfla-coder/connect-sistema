'use client'

/**
 * ADMIN.4.4.2 — banner de sessão de suporte ativa + área de suporte (somente leitura).
 * A área expõe apenas Orçamentos — Resumo via gateway /api/admin/suporte/dados/orcamentos.
 * Não abre o painel operacional do cliente e não troca a Auth do Master.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '@/lib/supabase-browser'
import {
  ADMIN_SUPPORT_ENCERRAR_PATH,
  ADMIN_SUPPORT_MODULOS_DISPONIVEIS,
  TEXTO_MODULOS_GRADUAIS_SUPORTE,
  deveAplicarResultadoGatewayOrcamentos,
  deveLimparContextoSuportePorHttp,
  formatarCampoOrcamentoSuporteUi,
  formatarExpiracaoSuporteUi,
  mapearListaOrcamentosGatewayUi,
  mensagemErroGatewayOrcamentosUi,
  montarUrlGatewayOrcamentosSuporte,
  type AdminSupportOrcamentoResumoUi,
  type ContextoSuporteUi,
  type SituacaoComercialSuporte,
} from '@/lib/admin-support-ui'

type Props = {
  contexto: ContextoSuporteUi
  situacao: SituacaoComercialSuporte | null
  isMobile?: boolean
  /** Encerramento confirmado pelo servidor. */
  onEncerrado: () => void
  /** Servidor recusou o contexto (401/403): limpar estado local sem recriar sessão. */
  onSessaoInvalida: () => void
  /** Horário de expiração atingido: revalidar no servidor (o relógio local não é autoridade). */
  onExpiracaoLocal: () => void
}

async function bearerMaster(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Sessão Master ausente. Faça login novamente.')
  return token
}

export default function AdminModoSuporteBanner({
  contexto,
  situacao,
  isMobile,
  onEncerrado,
  onSessaoInvalida,
  onExpiracaoLocal,
}: Props) {
  const [areaAberta, setAreaAberta] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erro, setErro] = useState('')

  const [orcamentos, setOrcamentos] = useState<AdminSupportOrcamentoResumoUi[]>([])
  const [orcamentosCarregados, setOrcamentosCarregados] = useState(false)
  const [orcamentosLoading, setOrcamentosLoading] = useState(false)
  const [orcamentosErro, setOrcamentosErro] = useState('')

  const mountedRef = useRef(true)
  const encerrandoRef = useRef(false)
  const orcamentosGenRef = useRef(0)
  const orcamentosAbortRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef(contexto.support_session_id)
  sessionIdRef.current = contexto.support_session_id

  const limparOrcamentosMemoria = useCallback(() => {
    orcamentosGenRef.current += 1
    try {
      orcamentosAbortRef.current?.abort()
    } catch {
      /* ignore */
    }
    orcamentosAbortRef.current = null
    setOrcamentos([])
    setOrcamentosCarregados(false)
    setOrcamentosLoading(false)
    setOrcamentosErro('')
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      orcamentosGenRef.current += 1
      try {
        orcamentosAbortRef.current?.abort()
      } catch {
        /* ignore */
      }
      orcamentosAbortRef.current = null
    }
  }, [])

  useEffect(() => {
    limparOrcamentosMemoria()
    setAreaAberta(false)
    setErro('')
  }, [contexto.support_session_id, limparOrcamentosMemoria])

  useEffect(() => {
    const ms = contexto.expira_em ? Date.parse(contexto.expira_em) : NaN
    if (!Number.isFinite(ms)) return
    const espera = Math.max(0, ms - Date.now()) + 1000
    const timer = window.setTimeout(() => onExpiracaoLocal(), espera)
    return () => window.clearTimeout(timer)
  }, [contexto.expira_em, contexto.support_session_id, onExpiracaoLocal])

  const carregarOrcamentos = useCallback(async () => {
    const sessionIdEsperado = sessionIdRef.current
    if (!sessionIdEsperado) return
    try {
      orcamentosAbortRef.current?.abort()
    } catch {
      /* ignore */
    }
    const ac = new AbortController()
    orcamentosAbortRef.current = ac
    const requestGen = ++orcamentosGenRef.current
    const aplicavel = () =>
      deveAplicarResultadoGatewayOrcamentos({
        requestGen,
        latestGen: orcamentosGenRef.current,
        stillMounted: mountedRef.current,
        faseAtiva: !encerrandoRef.current,
        sessionIdEsperado,
        sessionIdAtual: sessionIdRef.current,
      })

    setOrcamentosLoading(true)
    setOrcamentosErro('')
    try {
      const token = await bearerMaster()
      if (!aplicavel()) return
      const res = await fetch(montarUrlGatewayOrcamentosSuporte({ limit: 20, offset: 0 }), {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!aplicavel()) return

      if (deveLimparContextoSuportePorHttp(res.status)) {
        limparOrcamentosMemoria()
        setAreaAberta(false)
        onSessaoInvalida()
        return
      }
      if (!res.ok || body.ok === false) {
        limparOrcamentosMemoria()
        setOrcamentosErro(mensagemErroGatewayOrcamentosUi(res.status))
        return
      }
      setOrcamentos(mapearListaOrcamentosGatewayUi(body))
      setOrcamentosCarregados(true)
    } catch {
      if (ac.signal.aborted || !mountedRef.current) return
      if (requestGen !== orcamentosGenRef.current) return
      limparOrcamentosMemoria()
      setOrcamentosErro(mensagemErroGatewayOrcamentosUi(null))
    } finally {
      if (orcamentosAbortRef.current === ac) orcamentosAbortRef.current = null
      if (mountedRef.current && requestGen === orcamentosGenRef.current) setOrcamentosLoading(false)
    }
  }, [limparOrcamentosMemoria, onSessaoInvalida])

  function abrirArea() {
    setAreaAberta(true)
    void carregarOrcamentos()
  }

  function fecharArea() {
    setAreaAberta(false)
    limparOrcamentosMemoria()
  }

  async function encerrarSuporte() {
    if (encerrandoRef.current) return
    encerrandoRef.current = true
    setEncerrando(true)
    setErro('')
    limparOrcamentosMemoria()
    try {
      const token = await bearerMaster()
      const res = await fetch(ADMIN_SUPPORT_ENCERRAR_PATH, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (deveLimparContextoSuportePorHttp(res.status)) {
        setAreaAberta(false)
        onSessaoInvalida()
        return
      }
      if (!res.ok || body.ok === false) {
        throw new Error(String(body.error || `Falha ao encerrar suporte (${res.status}).`))
      }
      setAreaAberta(false)
      onEncerrado()
    } catch (e: unknown) {
      if (!mountedRef.current) return
      setErro(e instanceof Error ? e.message : 'Erro ao encerrar suporte.')
    } finally {
      encerrandoRef.current = false
      if (mountedRef.current) setEncerrando(false)
    }
  }

  const expira = formatarExpiracaoSuporteUi(contexto.expira_em)
  const avisos = situacao?.avisos || []

  return (
    <>
      <section
        style={{ ...bannerStyle, padding: isMobile ? 12 : 14 }}
        data-testid="admin-modo-suporte-banner"
        role="status"
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <strong style={{ color: '#86efac', letterSpacing: '.12em', fontSize: 12 }}>MODO SUPORTE ATIVO</strong>
          <span style={chip}>{contexto.clienteNome}</span>
          <span style={chip}>{contexto.sistemaNome}</span>
          <span style={badgeLeitura}>SOMENTE LEITURA</span>
          <span style={{ fontSize: 12, color: 'rgba(226,232,240,0.8)' }}>Expira: {expira}</span>
        </div>

        {avisos.map((aviso) => (
          <div key={aviso} style={avisoStyle} data-testid="admin-modo-suporte-aviso-comercial">
            {aviso}
          </div>
        ))}

        {erro ? <div style={erroStyle}>{erro}</div> : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btnPrimary} disabled={encerrando} onClick={abrirArea}>
            Abrir área de suporte
          </button>
          <button
            type="button"
            style={btnDanger}
            disabled={encerrando}
            onClick={() => void encerrarSuporte()}
            data-testid="admin-modo-suporte-encerrar"
          >
            {encerrando ? 'Encerrando...' : 'Encerrar suporte'}
          </button>
        </div>
      </section>

      {areaAberta ? (
        <div style={overlay} onClick={fecharArea} data-testid="admin-modo-suporte-area">
          <aside
            style={{ ...drawer, width: isMobile ? '100vw' : 'min(760px, 92vw)' }}
            role="dialog"
            aria-modal="true"
            aria-label={`Suporte — ${contexto.clienteNome}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <strong style={{ fontSize: 15, letterSpacing: '.06em' }}>SUPORTE — {contexto.clienteNome}</strong>
                <span style={badgeLeitura}>SOMENTE LEITURA</span>
              </div>
              <button type="button" style={btnGhost} onClick={fecharArea}>
                Fechar
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'rgba(226,232,240,0.7)' }}>
              Sistema: <b>{contexto.sistemaNome}</b> · Expira: {expira}
            </div>

            {avisos.map((aviso) => (
              <div key={aviso} style={avisoStyle}>
                {aviso}
              </div>
            ))}

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={secaoTitulo}>Disponível atualmente</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} data-testid="admin-modo-suporte-modulos">
                {ADMIN_SUPPORT_MODULOS_DISPONIVEIS.map((m) => (
                  <li key={m.id}>{m.label}</li>
                ))}
              </ul>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(226,232,240,0.6)' }}>{TEXTO_MODULOS_GRADUAIS_SUPORTE}</p>
            </div>

            <div style={{ display: 'grid', gap: 8 }} data-testid="admin-modo-suporte-orcamentos-lista">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={secaoTitulo}>Orçamentos — Resumo</div>
                <button
                  type="button"
                  style={btnGhost}
                  disabled={orcamentosLoading || encerrando}
                  onClick={() => void carregarOrcamentos()}
                >
                  {orcamentosLoading ? 'Carregando...' : 'Atualizar lista'}
                </button>
              </div>

              {orcamentosErro ? <div style={erroStyle}>{orcamentosErro}</div> : null}

              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>ID</th>
                      <th style={th}>Cliente</th>
                      <th style={th}>Status</th>
                      <th style={th}>Total</th>
                      <th style={th}>Aprovado</th>
                      <th style={th}>Atualizado em</th>
                      <th style={th}>Criado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!orcamentosCarregados ? (
                      <tr>
                        <td colSpan={7} style={{ ...td, color: 'rgba(226,232,240,0.6)' }}>
                          {orcamentosLoading ? 'Carregando...' : '—'}
                        </td>
                      </tr>
                    ) : orcamentos.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ ...td, color: 'rgba(226,232,240,0.6)' }}>
                          Nenhum orçamento retornado.
                        </td>
                      </tr>
                    ) : (
                      orcamentos.map((row, idx) => (
                        <tr key={`${row.local_id}-${idx}`}>
                          <td style={td}>{formatarCampoOrcamentoSuporteUi(row.local_id)}</td>
                          <td style={td}>{formatarCampoOrcamentoSuporteUi(row.cliente_nome)}</td>
                          <td style={td}>{formatarCampoOrcamentoSuporteUi(row.status)}</td>
                          <td style={td}>{formatarCampoOrcamentoSuporteUi(row.total)}</td>
                          <td style={td}>{formatarCampoOrcamentoSuporteUi(row.aprovado)}</td>
                          <td style={td}>{formatarCampoOrcamentoSuporteUi(row.updated_at)}</td>
                          <td style={td}>{formatarCampoOrcamentoSuporteUi(row.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}

const bannerStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  marginTop: 18,
  borderRadius: 14,
  border: '1px solid rgba(134,239,172,0.45)',
  background: 'rgba(20,83,45,0.35)',
  color: '#e2e8f0',
}

const chip: CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(148,163,184,0.3)',
  fontSize: 12,
  fontWeight: 700,
}

const badgeLeitura: CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(134,239,172,0.15)',
  border: '1px solid rgba(134,239,172,0.5)',
  color: '#86efac',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '.08em',
}

const avisoStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid rgba(250,204,21,0.45)',
  background: 'rgba(250,204,21,0.12)',
  color: '#fef08a',
  fontSize: 13,
  lineHeight: 1.45,
}

const erroStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid rgba(248,113,113,0.45)',
  background: 'rgba(220,38,38,0.2)',
  color: '#f8fafc',
  fontSize: 13,
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'rgba(2,6,23,0.6)',
  display: 'flex',
  justifyContent: 'flex-end',
}

const drawer: CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  display: 'grid',
  alignContent: 'start',
  gap: 14,
  padding: 20,
  background: '#0b1220',
  color: '#e2e8f0',
  borderLeft: '1px solid rgba(134,239,172,0.3)',
  boxShadow: '-24px 0 60px rgba(0,0,0,0.45)',
}

const secaoTitulo: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: '#86efac',
  letterSpacing: '.06em',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 6px',
  borderBottom: '1px solid rgba(148,163,184,0.25)',
  color: 'rgba(226,232,240,0.65)',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const td: CSSProperties = {
  padding: '8px 6px',
  borderBottom: '1px solid rgba(148,163,184,0.12)',
  color: '#e2e8f0',
  verticalAlign: 'middle',
}

const btnPrimary: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '9px 14px',
  fontWeight: 800,
  cursor: 'pointer',
  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
  color: '#052e16',
}

const btnDanger: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '9px 14px',
  fontWeight: 800,
  cursor: 'pointer',
  background: 'linear-gradient(135deg,#f87171,#dc2626)',
  color: '#fff',
}

const btnGhost: CSSProperties = {
  borderRadius: 10,
  padding: '8px 12px',
  fontWeight: 700,
  cursor: 'pointer',
  background: 'transparent',
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.4)',
}
