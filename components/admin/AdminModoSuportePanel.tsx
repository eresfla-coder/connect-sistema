'use client'

/**
 * ADMIN.4.2.7 / 4.3.3 — UI mínima Master: lifecycle + Ver Orçamentos (gateway read-only).
 * Sem impersonation. Sem painel do cliente. Lista só em memória.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '@/lib/supabase-browser'
import {
  ADMIN_SUPPORT_UI_DURACOES,
  ADMIN_SUPPORT_UI_MOTIVO_MIN,
  deveAplicarResultadoGatewayOrcamentos,
  deveMostrarCtaVerOrcamentosSuporte,
  formatarCampoOrcamentoSuporteUi,
  isAdminSupportUiEnabled,
  listarCandidatosSuporteUi,
  mapearListaOrcamentosGatewayUi,
  mensagemErroGatewayOrcamentosUi,
  montarPayloadIniciarSuporte,
  montarUrlGatewayOrcamentosSuporte,
  sanitizarStatusSuporteParaUi,
  type AdminSupportOrcamentoResumoUi,
  type CandidatoSuporteUi,
  type ClienteSuporteUiLite,
} from '@/lib/admin-support-ui'

type Props = {
  clientes: ClienteSuporteUiLite[]
  isMobile?: boolean
}

type FaseUi = 'disponivel' | 'iniciando' | 'ativo' | 'encerrando' | 'encerrado' | 'erro'

type StatusAtivo = {
  support_session_id: string | null
  clienteNome: string
  sistemaNome: string
  modo: string
  iniciado_em: string | null
  expira_em: string | null
}

async function bearerMaster(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Sessão Master ausente. Faça login novamente.')
  return token
}

export default function AdminModoSuportePanel({ clientes, isMobile }: Props) {
  const enabled = isAdminSupportUiEnabled()
  const candidatos = useMemo(() => listarCandidatosSuporteUi(clientes), [clientes])

  const [selecionadoKey, setSelecionadoKey] = useState('')
  const [motivo, setMotivo] = useState('')
  const [duracao, setDuracao] = useState<number>(15)
  const [fase, setFase] = useState<FaseUi>('disponivel')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [ativo, setAtivo] = useState<StatusAtivo | null>(null)
  const [confirmIniciar, setConfirmIniciar] = useState(false)
  const [confirmEncerrar, setConfirmEncerrar] = useState(false)
  const [locked, setLocked] = useState(false)

  const [orcamentos, setOrcamentos] = useState<AdminSupportOrcamentoResumoUi[]>([])
  const [orcamentosVisivel, setOrcamentosVisivel] = useState(false)
  const [orcamentosLoading, setOrcamentosLoading] = useState(false)
  const [orcamentosErro, setOrcamentosErro] = useState('')

  const mountedRef = useRef(true)
  const orcamentosGenRef = useRef(0)
  const orcamentosAbortRef = useRef<AbortController | null>(null)
  const faseRef = useRef<FaseUi>(fase)
  const ativoRef = useRef<StatusAtivo | null>(ativo)

  faseRef.current = fase
  ativoRef.current = ativo

  const selecionado: CandidatoSuporteUi | null = useMemo(() => {
    return candidatos.find((c) => `${c.admin_cliente_id}:${c.vinculo_id}` === selecionadoKey) || null
  }, [candidatos, selecionadoKey])

  const limparOrcamentosMemoria = useCallback(() => {
    orcamentosGenRef.current += 1
    try {
      orcamentosAbortRef.current?.abort()
    } catch {
      /* ignore */
    }
    orcamentosAbortRef.current = null
    setOrcamentos([])
    setOrcamentosVisivel(false)
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

  const aplicarStatus = useCallback(
    (raw: Record<string, unknown>) => {
      const s = sanitizarStatusSuporteParaUi(raw)
      if (!s) return
      if (s.active) {
        setAtivo({
          support_session_id: s.support_session_id,
          clienteNome: s.cliente?.nome || 'Cliente',
          sistemaNome: s.sistema?.nome || 'Sistema',
          modo: s.modo || 'read_only',
          iniciado_em: s.iniciado_em,
          expira_em: s.expira_em,
        })
        setFase('ativo')
        setInfo('')
      } else {
        limparOrcamentosMemoria()
        setAtivo(null)
        setFase((prev) => (prev === 'encerrado' ? prev : 'disponivel'))
      }
    },
    [limparOrcamentosMemoria],
  )

  const carregarStatus = useCallback(async () => {
    try {
      const token = await bearerMaster()
      const res = await fetch('/api/admin/suporte/status', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        if (!mountedRef.current) return
        setErro(String(payload.error || 'Falha ao consultar status de suporte.'))
        setFase('erro')
        return
      }
      if (!mountedRef.current) return
      aplicarStatus(payload)
    } catch (e: unknown) {
      if (!mountedRef.current) return
      setErro(e instanceof Error ? e.message : 'Erro ao consultar suporte.')
      setFase('erro')
    }
  }, [aplicarStatus])

  const carregarOrcamentosGateway = useCallback(async () => {
    if (locked || orcamentosLoading) return
    if (faseRef.current !== 'ativo' || !ativoRef.current) return

    const sessionIdEsperado = ativoRef.current.support_session_id
    if (!sessionIdEsperado) return

    // Aborta request anterior (double-click / reentrada)
    try {
      orcamentosAbortRef.current?.abort()
    } catch {
      /* ignore */
    }
    const ac = new AbortController()
    orcamentosAbortRef.current = ac
    const requestGen = ++orcamentosGenRef.current

    setOrcamentosLoading(true)
    setOrcamentosErro('')
    setErro('')

    try {
      const token = await bearerMaster()
      if (
        !deveAplicarResultadoGatewayOrcamentos({
          requestGen,
          latestGen: orcamentosGenRef.current,
          stillMounted: mountedRef.current,
          faseAtiva: faseRef.current === 'ativo',
          sessionIdEsperado,
          sessionIdAtual: ativoRef.current?.support_session_id || null,
        })
      ) {
        return
      }

      const url = montarUrlGatewayOrcamentosSuporte({ limit: 20, offset: 0 })
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>

      if (
        !deveAplicarResultadoGatewayOrcamentos({
          requestGen,
          latestGen: orcamentosGenRef.current,
          stillMounted: mountedRef.current,
          faseAtiva: faseRef.current === 'ativo',
          sessionIdEsperado,
          sessionIdAtual: ativoRef.current?.support_session_id || null,
        })
      ) {
        return
      }

      if (res.status === 401 || res.status === 403) {
        limparOrcamentosMemoria()
        const msg = mensagemErroGatewayOrcamentosUi(res.status)
        setOrcamentosErro(msg)
        setErro(msg)
        await carregarStatus()
        return
      }

      if (!res.ok || body.ok === false) {
        limparOrcamentosMemoria()
        setOrcamentosErro(mensagemErroGatewayOrcamentosUi(res.status))
        return
      }

      if (
        !deveAplicarResultadoGatewayOrcamentos({
          requestGen,
          latestGen: orcamentosGenRef.current,
          stillMounted: mountedRef.current,
          faseAtiva: faseRef.current === 'ativo',
          sessionIdEsperado,
          sessionIdAtual: ativoRef.current?.support_session_id || null,
        })
      ) {
        return
      }

      const lista = mapearListaOrcamentosGatewayUi(body)
      setOrcamentos(lista)
      setOrcamentosVisivel(true)
      setOrcamentosLoading(false)
    } catch (e: unknown) {
      if (ac.signal.aborted) return
      if (!mountedRef.current) return
      if (requestGen !== orcamentosGenRef.current) return
      limparOrcamentosMemoria()
      setOrcamentosErro(mensagemErroGatewayOrcamentosUi(null))
      void e
    } finally {
      if (orcamentosAbortRef.current === ac) orcamentosAbortRef.current = null
      if (mountedRef.current && requestGen === orcamentosGenRef.current) {
        setOrcamentosLoading(false)
      }
    }
  }, [locked, orcamentosLoading, limparOrcamentosMemoria, carregarStatus])

  useEffect(() => {
    if (!enabled) return
    void carregarStatus()
  }, [enabled, carregarStatus])

  if (!enabled) return null

  async function confirmarIniciar() {
    if (!selecionado?.elegivel || locked) return
    setConfirmIniciar(false)
    setLocked(true)
    setFase('iniciando')
    setErro('')
    setInfo('')
    limparOrcamentosMemoria()
    try {
      const payload = montarPayloadIniciarSuporte({
        admin_cliente_id: selecionado.admin_cliente_id,
        vinculo_id: selecionado.vinculo_id,
        motivo,
        duracao_minutos: duracao,
      })
      const token = await bearerMaster()
      const res = await fetch('/api/admin/suporte/iniciar', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || body.ok === false) {
        throw new Error(String(body.error || `Falha ao iniciar (${res.status})`))
      }
      if (!mountedRef.current) return
      setAtivo({
        support_session_id: body.support_session_id ? String(body.support_session_id) : null,
        clienteNome:
          body.cliente && typeof body.cliente === 'object'
            ? String((body.cliente as { nome?: unknown }).nome || selecionado.clienteNome)
            : selecionado.clienteNome,
        sistemaNome:
          body.sistema && typeof body.sistema === 'object'
            ? String((body.sistema as { nome?: unknown }).nome || selecionado.sistemaNome)
            : selecionado.sistemaNome,
        modo: String(body.modo || 'read_only'),
        iniciado_em: body.iniciado_em ? String(body.iniciado_em) : null,
        expira_em: body.expira_em ? String(body.expira_em) : null,
      })
      setFase('ativo')
      setInfo('Sessão de suporte iniciada (somente leitura). Lifecycle apenas — sem painel do cliente.')
      setMotivo('')
    } catch (e: unknown) {
      if (!mountedRef.current) return
      setFase('erro')
      setErro(e instanceof Error ? e.message : 'Erro ao iniciar suporte.')
    } finally {
      if (mountedRef.current) setLocked(false)
    }
  }

  async function confirmarEncerrar() {
    if (locked) return
    setConfirmEncerrar(false)
    setLocked(true)
    setFase('encerrando')
    setErro('')
    limparOrcamentosMemoria()
    try {
      const token = await bearerMaster()
      const res = await fetch('/api/admin/suporte/encerrar', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || body.ok === false) {
        throw new Error(String(body.error || `Falha ao encerrar (${res.status})`))
      }
      if (!mountedRef.current) return
      limparOrcamentosMemoria()
      setAtivo(null)
      setFase('encerrado')
      setInfo('Suporte encerrado com segurança.')
    } catch (e: unknown) {
      if (!mountedRef.current) return
      limparOrcamentosMemoria()
      setFase('erro')
      setErro(e instanceof Error ? e.message : 'Erro ao encerrar suporte.')
    } finally {
      if (mountedRef.current) setLocked(false)
    }
  }

  const mostrarCtaOrcamentos = deveMostrarCtaVerOrcamentosSuporte(fase === 'ativo' && !!ativo)

  const box: CSSProperties = {
    marginTop: 18,
    padding: isMobile ? 14 : 18,
    borderRadius: 16,
    border: '1px solid rgba(134,239,172,0.25)',
    background: 'rgba(6, 24, 16, 0.55)',
  }

  return (
    <section style={box} data-testid="admin-modo-suporte">
      <div
        style={{
          fontSize: 11,
          fontWeight: 950,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: '#86efac',
          marginBottom: 8,
        }}
      >
        Modo Suporte
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(226,232,240,0.85)', lineHeight: 1.45 }}>
        Lifecycle somente leitura (iniciar / status / encerrar). Não abre o painel do cliente e não troca Auth.
      </p>

      {info ? (
        <div style={{ ...msgStyle, background: 'rgba(22,163,74,0.2)', borderColor: 'rgba(74,222,128,0.45)' }}>
          {info}
        </div>
      ) : null}
      {erro ? (
        <div style={{ ...msgStyle, background: 'rgba(220,38,38,0.2)', borderColor: 'rgba(248,113,113,0.45)' }}>
          {erro}
        </div>
      ) : null}

      {fase === 'ativo' && ativo ? (
        <div style={cardAtivo} data-testid="admin-modo-suporte-ativo">
          <strong style={{ color: '#86efac', letterSpacing: '.08em', fontSize: 12 }}>MODO SUPORTE ATIVO</strong>
          <div style={dlRow}>
            <span>Cliente</span>
            <b>{ativo.clienteNome}</b>
          </div>
          <div style={dlRow}>
            <span>Sistema</span>
            <b>{ativo.sistemaNome}</b>
          </div>
          <div style={dlRow}>
            <span>Modo</span>
            <b>Somente leitura</b>
          </div>
          <div style={dlRow}>
            <span>Iniciado</span>
            <b>{ativo.iniciado_em || '—'}</b>
          </div>
          <div style={dlRow}>
            <span>Expira</span>
            <b>{ativo.expira_em || '—'}</b>
          </div>
          {ativo.support_session_id ? (
            <div style={{ ...dlRow, fontSize: 11, opacity: 0.85 }}>
              <span>Sessão</span>
              <b style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{ativo.support_session_id}</b>
            </div>
          ) : null}

          {mostrarCtaOrcamentos ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }} data-testid="admin-modo-suporte-orcamentos">
              <button
                type="button"
                style={btnGhost}
                disabled={locked || orcamentosLoading}
                onClick={() => void carregarOrcamentosGateway()}
                data-testid="admin-modo-suporte-ver-orcamentos"
              >
                {orcamentosLoading ? 'Carregando...' : 'Ver Orçamentos'}
              </button>

              {orcamentosErro ? (
                <div
                  style={{
                    ...msgStyle,
                    marginBottom: 0,
                    background: 'rgba(220,38,38,0.2)',
                    borderColor: 'rgba(248,113,113,0.45)',
                  }}
                >
                  {orcamentosErro}
                </div>
              ) : null}

              {orcamentosVisivel ? (
                <div data-testid="admin-modo-suporte-orcamentos-lista">
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: '#86efac',
                      letterSpacing: '.06em',
                      marginBottom: 8,
                    }}
                  >
                    Orçamentos — somente leitura
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(226,232,240,0.65)' }}>
                    Cliente da sessão: <strong>{ativo.clienteNome}</strong>. Campos vazios na coluna aparecem como —.
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={th}>local_id</th>
                          <th style={th}>cliente</th>
                          <th style={th}>status</th>
                          <th style={th}>total</th>
                          <th style={th}>aprovado</th>
                          <th style={th}>updated_at</th>
                          <th style={th}>created_at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orcamentos.length === 0 ? (
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
              ) : null}
            </div>
          ) : null}

          {!confirmEncerrar ? (
            <button
              type="button"
              style={btnDanger}
              disabled={locked}
              onClick={() => setConfirmEncerrar(true)}
            >
              {locked ? 'Encerrando...' : 'Encerrar suporte'}
            </button>
          ) : (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#fecaca' }}>Encerrar a sessão de suporte atual?</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={btnGhost} disabled={locked} onClick={() => setConfirmEncerrar(false)}>
                  Cancelar
                </button>
                <button type="button" style={btnDanger} disabled={locked} onClick={() => void confirmarEncerrar()}>
                  Confirmar encerrar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Cliente</th>
                  <th style={th}>Sistema</th>
                  <th style={th}>Status</th>
                  <th style={th}>Origem</th>
                  <th style={th}>Acesso</th>
                  <th style={th}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, color: 'rgba(226,232,240,0.6)' }}>
                      Nenhum vínculo na carteira carregada.
                    </td>
                  </tr>
                ) : (
                  candidatos.map((c) => {
                    const key = `${c.admin_cliente_id}:${c.vinculo_id}`
                    return (
                      <tr key={key}>
                        <td style={td}>{c.clienteNome}</td>
                        <td style={td}>{c.sistemaNome}</td>
                        <td style={td}>{c.status || '—'}</td>
                        <td style={td}>{c.origem || '—'}</td>
                        <td style={td}>{c.acesso_connect ? 'Connect' : '—'}</td>
                        <td style={td}>
                          {c.elegivel ? (
                            <button
                              type="button"
                              style={{
                                ...btnGhost,
                                ...(selecionadoKey === key ? { borderColor: '#86efac', color: '#86efac' } : {}),
                              }}
                              disabled={locked || fase === 'iniciando'}
                              onClick={() => {
                                limparOrcamentosMemoria()
                                setSelecionadoKey(key)
                                setConfirmIniciar(false)
                                setErro('')
                                setFase('disponivel')
                              }}
                            >
                              {selecionadoKey === key ? 'Selecionado' : 'Selecionar'}
                            </button>
                          ) : c.terceiro ? (
                            <span style={{ fontSize: 12, color: 'rgba(248,113,113,0.9)' }}>Terceiro — sem suporte</span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'rgba(226,232,240,0.55)' }}>Não elegível</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {selecionado?.elegivel ? (
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }} data-testid="admin-modo-suporte-form">
              <div style={dlRow}>
                <span>Cliente</span>
                <b>{selecionado.clienteNome}</b>
              </div>
              <div style={dlRow}>
                <span>Sistema</span>
                <b>{selecionado.sistemaNome}</b>
              </div>
              <div style={dlRow}>
                <span>Modo</span>
                <b>Somente leitura</b>
              </div>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                <span style={{ color: 'rgba(226,232,240,0.75)' }}>Motivo do suporte</span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: Validação controlada do Modo Suporte"
                  rows={3}
                  disabled={locked}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                <span style={{ color: 'rgba(226,232,240,0.75)' }}>Duração</span>
                <select
                  value={duracao}
                  disabled={locked}
                  onChange={(e) => setDuracao(Number(e.target.value))}
                  style={inputStyle}
                >
                  {ADMIN_SUPPORT_UI_DURACOES.map((m) => (
                    <option key={m} value={m}>
                      {m} minutos
                    </option>
                  ))}
                </select>
              </label>

              {!confirmIniciar ? (
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={locked || motivo.trim().length < ADMIN_SUPPORT_UI_MOTIVO_MIN}
                  onClick={() => setConfirmIniciar(true)}
                >
                  {fase === 'iniciando' ? 'Iniciando...' : 'Iniciar suporte em modo leitura'}
                </button>
              ) : (
                <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, border: '1px solid rgba(250,204,21,0.35)' }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#fef08a', lineHeight: 1.45 }}>
                    Você vai iniciar uma sessão de suporte em modo somente leitura para{' '}
                    <strong>{selecionado.clienteNome}</strong>. Esta ação será registrada na auditoria e não fará
                    login como o cliente.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={btnGhost} disabled={locked} onClick={() => setConfirmIniciar(false)}>
                      Cancelar
                    </button>
                    <button type="button" style={btnPrimary} disabled={locked} onClick={() => void confirmarIniciar()}>
                      Confirmar e iniciar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

const msgStyle: CSSProperties = {
  marginBottom: 12,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid',
  fontSize: 13,
  color: '#f8fafc',
}

const cardAtivo: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: 14,
  borderRadius: 14,
  border: '1px solid rgba(134,239,172,0.35)',
  background: 'rgba(20,83,45,0.25)',
}

const dlRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  fontSize: 13,
  color: 'rgba(226,232,240,0.8)',
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
}

const td: CSSProperties = {
  padding: '8px 6px',
  borderBottom: '1px solid rgba(148,163,184,0.12)',
  color: '#e2e8f0',
  verticalAlign: 'middle',
}

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.35)',
  background: 'rgba(15,23,42,0.65)',
  color: '#f8fafc',
  padding: '10px 12px',
  fontSize: 13,
}

const btnPrimary: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 800,
  cursor: 'pointer',
  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
  color: '#052e16',
}

const btnDanger: CSSProperties = {
  marginTop: 10,
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
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
