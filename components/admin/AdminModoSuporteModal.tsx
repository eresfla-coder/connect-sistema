'use client'

/**
 * ADMIN.4.4.2 — confirmação para iniciar Modo Suporte (somente leitura) a partir da carteira.
 * O Master continua autenticado como ele mesmo; a autoridade da sessão é o cookie httpOnly do servidor.
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '@/lib/supabase-browser'
import {
  ADMIN_SUPPORT_INICIAR_PATH,
  ADMIN_SUPPORT_UI_DURACAO_DEFAULT,
  ADMIN_SUPPORT_UI_DURACOES,
  ADMIN_SUPPORT_UI_MOTIVO_MAX,
  ADMIN_SUPPORT_UI_MOTIVO_MIN,
  contextoSuporteDeResposta,
  montarPayloadIniciarSuporte,
  motivoSuporteUiValido,
  type ContextoSuporteUi,
  type SituacaoComercialSuporte,
} from '@/lib/admin-support-ui'

type Props = {
  adminClienteId: string
  vinculoId: string
  clienteNome: string
  sistemaNome: string
  situacao: SituacaoComercialSuporte
  isMobile?: boolean
  onCancelar: () => void
  onIniciado: (contexto: ContextoSuporteUi) => void
}

async function bearerMaster(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Sessão Master ausente. Faça login novamente.')
  return token
}

export default function AdminModoSuporteModal({
  adminClienteId,
  vinculoId,
  clienteNome,
  sistemaNome,
  situacao,
  isMobile,
  onCancelar,
  onIniciado,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [duracao, setDuracao] = useState<number>(ADMIN_SUPPORT_UI_DURACAO_DEFAULT)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const enviandoRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const motivoOk = motivoSuporteUiValido(motivo)

  async function confirmarIniciar() {
    if (enviandoRef.current || !motivoOk) return
    enviandoRef.current = true
    setEnviando(true)
    setErro('')
    try {
      const payload = montarPayloadIniciarSuporte({
        admin_cliente_id: adminClienteId,
        vinculo_id: vinculoId,
        motivo,
        duracao_minutos: duracao,
      })
      const token = await bearerMaster()
      const res = await fetch(ADMIN_SUPPORT_INICIAR_PATH, {
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
        throw new Error(String(body.error || `Falha ao iniciar suporte (${res.status}).`))
      }
      const contexto = contextoSuporteDeResposta(body)
      if (!contexto) throw new Error('Resposta de suporte inválida (esperado somente leitura).')
      if (!mountedRef.current) return
      onIniciado({
        ...contexto,
        admin_cliente_id: contexto.admin_cliente_id || adminClienteId,
        vinculo_id: contexto.vinculo_id || vinculoId,
      })
    } catch (e: unknown) {
      if (!mountedRef.current) return
      setErro(e instanceof Error ? e.message : 'Erro ao iniciar suporte.')
    } finally {
      enviandoRef.current = false
      if (mountedRef.current) setEnviando(false)
    }
  }

  const tamanho = motivo.trim().length

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Modo suporte"
      data-testid="admin-modo-suporte-modal"
      onClick={() => {
        if (!enviando) onCancelar()
      }}
    >
      <div
        style={{ ...card, width: isMobile ? 'calc(100vw - 24px)' : 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={titulo}>MODO SUPORTE</div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={dlRow}>
            <span>Cliente</span>
            <b>{clienteNome}</b>
          </div>
          <div style={dlRow}>
            <span>Sistema</span>
            <b>{sistemaNome}</b>
          </div>
          <div style={dlRow}>
            <span>Modo</span>
            <b>Somente leitura</b>
          </div>
          <div style={dlRow}>
            <span>Status</span>
            <b>{situacao.rotulo}</b>
          </div>
        </div>

        {situacao.avisos.map((aviso) => (
          <div key={aviso} style={avisoStyle} data-testid="admin-modo-suporte-aviso-comercial">
            {aviso}
          </div>
        ))}

        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ color: 'rgba(226,232,240,0.75)' }}>Motivo do suporte</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descreva o motivo do atendimento"
            rows={3}
            maxLength={ADMIN_SUPPORT_UI_MOTIVO_MAX}
            disabled={enviando}
            style={inputStyle}
          />
          <span style={{ fontSize: 11, color: motivoOk || tamanho === 0 ? 'rgba(226,232,240,0.55)' : '#fca5a5' }}>
            {tamanho}/{ADMIN_SUPPORT_UI_MOTIVO_MAX} — mínimo {ADMIN_SUPPORT_UI_MOTIVO_MIN} caracteres
          </span>
        </label>

        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ color: 'rgba(226,232,240,0.75)' }}>Duração</span>
          <select
            value={duracao}
            disabled={enviando}
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

        <p style={{ margin: 0, fontSize: 12, color: 'rgba(226,232,240,0.65)', lineHeight: 1.45 }}>
          A sessão é registrada na auditoria. Você continua logado como Master; nenhum login como o cliente é feito.
        </p>

        {erro ? <div style={erroStyle}>{erro}</div> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" style={btnGhost} disabled={enviando} onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...btnPrimary, opacity: enviando || !motivoOk ? 0.6 : 1 }}
            disabled={enviando || !motivoOk}
            onClick={() => void confirmarIniciar()}
            data-testid="admin-modo-suporte-confirmar"
          >
            {enviando ? 'Iniciando...' : 'Confirmar e iniciar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'rgba(2,6,23,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 12,
}

const card: CSSProperties = {
  display: 'grid',
  gap: 14,
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  padding: 20,
  borderRadius: 16,
  border: '1px solid rgba(134,239,172,0.3)',
  background: '#0b1220',
  color: '#e2e8f0',
  boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
}

const titulo: CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: '.16em',
  color: '#86efac',
}

const dlRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  fontSize: 13,
  color: 'rgba(226,232,240,0.8)',
}

const avisoStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(250,204,21,0.45)',
  background: 'rgba(250,204,21,0.12)',
  color: '#fef08a',
  fontSize: 13,
  lineHeight: 1.45,
}

const erroStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(248,113,113,0.45)',
  background: 'rgba(220,38,38,0.2)',
  color: '#f8fafc',
  fontSize: 13,
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

const btnGhost: CSSProperties = {
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
  background: 'transparent',
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.4)',
}
