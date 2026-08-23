import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  parsearUserAgent,
  SESSAO_MIN_WRITE_MS,
  type MotivoEncerramentoSessao,
} from '@/lib/sessao-uso'

export const SESSAO_COLS_BASE =
  'user_id,email,session_token,device_label,user_agent,ip_address,last_seen_at,updated_at'

export const SESSAO_COLS_FULL =
  `${SESSAO_COLS_BASE},created_at,ativo,encerrada_em,motivo_encerramento,navegador,sistema_operacional,dispositivo`

export type SessaoAtivaRow = {
  user_id: string
  email?: string | null
  session_token?: string | null
  device_label?: string | null
  user_agent?: string | null
  ip_address?: string | null
  last_seen_at?: string | null
  updated_at?: string | null
  created_at?: string | null
  ativo?: boolean | null
  encerrada_em?: string | null
  motivo_encerramento?: string | null
  navegador?: string | null
  sistema_operacional?: string | null
  dispositivo?: string | null
}

export function erroTabelaSessaoAusente(error: { message?: string; code?: string } | null | undefined) {
  const m = String(error?.message || '').toLowerCase()
  return error?.code === '42P01' || (m.includes('sessoes_ativas') && m.includes('does not exist')) || m.includes('schema cache')
}

export function erroColunaSessaoAusente(error: { message?: string; code?: string } | null | undefined) {
  const m = String(error?.message || '').toLowerCase()
  return error?.code === '42703' || (m.includes('column') && m.includes('does not exist'))
}

function agoraIso() {
  return new Date().toISOString()
}

export async function buscarSessaoUsuario(userId: string): Promise<{ row: SessaoAtivaRow | null; tabelaOk: boolean }> {
  const full = await supabaseAdmin.from('sessoes_ativas').select(SESSAO_COLS_FULL).eq('user_id', userId).maybeSingle()
  if (!full.error) return { row: (full.data as SessaoAtivaRow | null) || null, tabelaOk: true }
  if (erroTabelaSessaoAusente(full.error)) return { row: null, tabelaOk: false }

  const base = await supabaseAdmin.from('sessoes_ativas').select(SESSAO_COLS_BASE).eq('user_id', userId).maybeSingle()
  if (base.error) {
    if (erroTabelaSessaoAusente(base.error)) return { row: null, tabelaOk: false }
    return { row: null, tabelaOk: true }
  }
  return { row: (base.data as SessaoAtivaRow | null) || null, tabelaOk: true }
}

export async function registrarSessaoUsuario(opts: {
  userId: string
  email: string
  deviceId: string
  deviceLabel: string
  userAgent: string
  ip: string
}) {
  const now = agoraIso()
  const parsed = parsearUserAgent(opts.userAgent)
  const { row } = await buscarSessaoUsuario(opts.userId)
  const mesmaSessao = row?.session_token === opts.deviceId && row?.ativo !== false
  const createdAt = mesmaSessao && row?.created_at ? row.created_at : now

  const payloadFull = {
    user_id: opts.userId,
    email: opts.email,
    session_token: opts.deviceId,
    device_label: opts.deviceLabel.slice(0, 120),
    user_agent: opts.userAgent.slice(0, 500),
    ip_address: opts.ip.slice(0, 80),
    last_seen_at: now,
    updated_at: now,
    created_at: createdAt,
    ativo: true,
    encerrada_em: null,
    motivo_encerramento: null,
    navegador: parsed.navegador,
    sistema_operacional: parsed.sistemaOperacional,
    dispositivo: parsed.dispositivo,
  }

  const payloadBase = {
    user_id: opts.userId,
    email: opts.email,
    session_token: opts.deviceId,
    device_label: opts.deviceLabel.slice(0, 120),
    user_agent: opts.userAgent.slice(0, 500),
    ip_address: opts.ip.slice(0, 80),
    last_seen_at: now,
    updated_at: now,
  }

  const full = await supabaseAdmin.from('sessoes_ativas').upsert(payloadFull, { onConflict: 'user_id' })
  if (!full.error) {
    return { ok: true as const, substituida: Boolean(row?.session_token && row.session_token !== opts.deviceId) }
  }
  if (erroTabelaSessaoAusente(full.error)) {
    return { ok: false as const, message: 'Tabela de sessões não configurada.' }
  }

  const base = await supabaseAdmin.from('sessoes_ativas').upsert(payloadBase, { onConflict: 'user_id' })
  if (base.error) {
    console.error('ERRO_REGISTRAR_SESSAO:', base.error)
    return { ok: false as const, message: 'Tabela de sessões não configurada.' }
  }
  return { ok: true as const, substituida: Boolean(row?.session_token && row.session_token !== opts.deviceId) }
}

export async function verificarSessaoUsuario(opts: { userId: string; deviceId: string }) {
  const { row, tabelaOk } = await buscarSessaoUsuario(opts.userId)
  if (!tabelaOk) return { ok: true, active: true, reason: 'tabela_nao_configurada' as const }

  if (!row?.session_token) {
    return { ok: true, active: true, reason: 'sem_registro' as const }
  }

  if (row.ativo === false) {
    return {
      ok: true,
      active: false,
      reason: 'encerrada' as const,
      motivo: (row.motivo_encerramento || 'inativa') as MotivoEncerramentoSessao,
    }
  }

  const active = String(row.session_token) === opts.deviceId
  if (!active) {
    return {
      ok: true,
      active: false,
      reason: 'substituido' as const,
      motivo: 'substituida' as MotivoEncerramentoSessao,
      deviceLabel: row.device_label || null,
    }
  }

  const last = row.last_seen_at ? Date.parse(row.last_seen_at) : 0
  const deveGravar = !Number.isFinite(last) || Date.now() - last >= SESSAO_MIN_WRITE_MS
  if (deveGravar) {
    const now = agoraIso()
    const upd = await supabaseAdmin
      .from('sessoes_ativas')
      .update({ last_seen_at: now, updated_at: now })
      .eq('user_id', opts.userId)
    if (upd.error && !erroColunaSessaoAusente(upd.error)) {
      console.error('ERRO_HEARTBEAT_SESSAO:', upd.error)
    }
  }

  return { ok: true, active: true, reason: 'ativo' as const, deviceLabel: row.device_label || null }
}

export async function encerrarSessaoUsuario(opts: {
  userId: string
  motivo: MotivoEncerramentoSessao
  somenteSeToken?: string
}) {
  const now = agoraIso()
  const { row, tabelaOk } = await buscarSessaoUsuario(opts.userId)
  if (!tabelaOk) return { ok: true, encerrada: false, reason: 'tabela_nao_configurada' }
  if (!row) return { ok: true, encerrada: false, reason: 'sem_registro' }
  if (opts.somenteSeToken && row.session_token && row.session_token !== opts.somenteSeToken) {
    return { ok: true, encerrada: false, reason: 'outra_sessao' }
  }

  const tokenEncerrado = `encerrada_${Date.now()}`
  const payloadFull = {
    ativo: false,
    encerrada_em: now,
    motivo_encerramento: opts.motivo,
    session_token: tokenEncerrado,
    updated_at: now,
  }
  const full = await supabaseAdmin.from('sessoes_ativas').update(payloadFull).eq('user_id', opts.userId)
  if (!full.error) return { ok: true, encerrada: true }

  const base = await supabaseAdmin
    .from('sessoes_ativas')
    .update({ session_token: tokenEncerrado, updated_at: now, last_seen_at: now })
    .eq('user_id', opts.userId)
  if (base.error) {
    console.error('ERRO_ENCERRAR_SESSAO:', base.error)
    return { ok: false, encerrada: false, reason: 'erro' }
  }
  return { ok: true, encerrada: true }
}

export async function listarSessoesAdmin(limit = 200): Promise<SessaoAtivaRow[]> {
  const full = await supabaseAdmin
    .from('sessoes_ativas')
    .select(SESSAO_COLS_FULL)
    .order('last_seen_at', { ascending: false })
    .limit(limit)

  if (!full.error) return (full.data as SessaoAtivaRow[]) || []
  if (erroTabelaSessaoAusente(full.error)) return []

  const base = await supabaseAdmin
    .from('sessoes_ativas')
    .select(SESSAO_COLS_BASE)
    .order('last_seen_at', { ascending: false })
    .limit(limit)

  if (base.error) {
    console.error('ERRO_LISTAR_SESSOES:', base.error)
    return []
  }
  return (base.data as SessaoAtivaRow[]) || []
}
