/**
 * ADMIN.4.2.2 — operações server-side do Modo Suporte (service role only).
 * NÃO importar em Client Components.
 * Criação SOMENTE via RPC atômica (sem SELECT→INSERT separado).
 */

import type { NextRequest, NextResponse } from 'next/server'
import { isAdminMasterServer } from '@/lib/access-server'
import {
  ADMIN_SUPPORT_COOKIE_NAME,
  ADMIN_SUPPORT_MODO_FASE,
  CODIGO_SUPPORT_SESSAO_ATIVA,
  CODIGO_SUPPORT_TABELA_AUSENTE,
  CODIGO_SUPPORT_TOKEN,
  gerarContextTokenBruto,
  hashContextToken,
  isContextTokenHashShape,
  MSG_SUPPORT_SESSAO_ATIVA,
  sessaoSuporteEstaAtiva,
  validarDuracaoSuporte,
  validarElegibilidadeModoSuporte,
  validarMotivoSuporte,
  type AdminSupportEvento,
  type ElegibilidadeSuporteOk,
} from '@/lib/admin-support'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type SupportSessionRow = {
  id: string
  context_token_hash: string
  admin_user_id: string
  admin_email: string
  admin_cliente_id: string
  admin_cliente_sistema_id: string
  target_auth_user_id: string
  target_perfil_id: string
  target_empresa_id: string | null
  modo: string
  motivo: string
  iniciado_em: string
  expira_em: string
  encerrado_em: string | null
  revogado_em: string | null
  user_agent?: string | null
  ip_address?: string | null
}

const SESSION_COLS =
  'id,context_token_hash,admin_user_id,admin_email,admin_cliente_id,admin_cliente_sistema_id,target_auth_user_id,target_perfil_id,target_empresa_id,modo,motivo,iniciado_em,expira_em,encerrado_em,revogado_em,user_agent,ip_address'

export function erroTabelaSupportAusente(error: { message?: string; code?: string } | null | undefined) {
  const m = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST202' ||
    (m.includes('admin_support') && (m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find'))) ||
    m.includes('could not find the function') ||
    m.includes('could not find the table')
  )
}

export function resolverIpSuporteConfiavel(req: NextRequest | Request): string | null {
  const headers = 'headers' in req ? req.headers : null
  if (!headers) return null
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first && first.length <= 80) return first
  }
  const real = headers.get('x-real-ip')?.trim()
  if (real && real.length <= 80) return real
  return null
}

export function lerContextTokenDoRequest(req: NextRequest | Request): string {
  const cookieHeader = req.headers.get('cookie') || ''
  if (!cookieHeader) return ''
  const partes = cookieHeader.split(';')
  for (const parte of partes) {
    const [rawName, ...rest] = parte.trim().split('=')
    if (rawName === ADMIN_SUPPORT_COOKIE_NAME) {
      return decodeURIComponent(rest.join('=') || '').trim()
    }
  }
  return ''
}

export function aplicarCookieSuporte(
  res: NextResponse,
  tokenBruto: string,
  expiraEmIso: string,
) {
  const maxAgeSec = Math.max(
    0,
    Math.floor((Date.parse(expiraEmIso) - Date.now()) / 1000),
  )
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
  res.cookies.set({
    name: ADMIN_SUPPORT_COOKIE_NAME,
    value: tokenBruto,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec,
  })
}

export function limparCookieSuporte(res: NextResponse) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
  res.cookies.set({
    name: ADMIN_SUPPORT_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function registrarEventoSuporte(opts: {
  supportSessionId?: string | null
  evento: AdminSupportEvento
  adminUserId?: string | null
  adminEmail?: string | null
  detalhes?: Record<string, unknown> | null
}) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('admin_support_events').insert({
    support_session_id: opts.supportSessionId || null,
    evento: opts.evento,
    admin_user_id: opts.adminUserId || null,
    admin_email: opts.adminEmail ? String(opts.adminEmail).toLowerCase() : null,
    detalhes: opts.detalhes || null,
  })
  if (error && !erroTabelaSupportAusente(error)) {
    console.warn('[ADMIN.4.2] evento suporte:', error.message?.slice(0, 200))
  }
}

export async function buscarSessaoPorTokenBruto(tokenBruto: string): Promise<{
  row: SupportSessionRow | null
  tabelaOk: boolean
}> {
  if (!tokenBruto) return { row: null, tabelaOk: true }
  let hash: string
  try {
    hash = hashContextToken(tokenBruto)
  } catch {
    return { row: null, tabelaOk: true }
  }
  if (!isContextTokenHashShape(hash)) return { row: null, tabelaOk: true }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('admin_support_sessions')
    .select(SESSION_COLS)
    .eq('context_token_hash', hash)
    .maybeSingle()

  if (error) {
    if (erroTabelaSupportAusente(error)) return { row: null, tabelaOk: false }
    return { row: null, tabelaOk: true }
  }
  return { row: (data as SupportSessionRow | null) || null, tabelaOk: true }
}

export async function marcarSessaoExpiradaIdempotente(opts: {
  sessionId: string
  adminUserId: string
  adminEmail?: string | null
  fonte?: string
}) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('admin_support_marcar_sessao_expirada', {
    p_session_id: opts.sessionId,
    p_admin_user_id: opts.adminUserId,
    p_admin_email: opts.adminEmail || null,
    p_fonte: opts.fonte || 'status',
  })
  if (error) {
    if (erroTabelaSupportAusente(error)) return { ok: false as const, tabelaOk: false }
    console.warn('[ADMIN.4.2] marcar expirada:', error.message?.slice(0, 200))
    return { ok: false as const, tabelaOk: true }
  }
  return { ok: true as const, tabelaOk: true, result: data }
}

export async function resolverElegibilidadeSuporteDoBanco(params: {
  adminClienteId: string
  vinculoId: string
}): Promise<
  | { ok: true; elegivel: ElegibilidadeSuporteOk; clienteNome: string | null }
  | { ok: false; code: string; error: string }
> {
  const supabase = getSupabaseAdmin()

  const { data: cliente } = await supabase
    .from('admin_clientes')
    .select('id,nome,nome_empresa')
    .eq('id', params.adminClienteId)
    .maybeSingle()

  const { data: vinculo, error: vErr } = await supabase
    .from('admin_cliente_sistemas')
    .select('id,cliente_id,sistema_id,acesso_connect,auth_user_id,perfil_id')
    .eq('id', params.vinculoId)
    .maybeSingle()

  if (vErr && !cliente) {
    return { ok: false, code: 'ADMIN_SUPPORT_NAO_ELEGIVEL', error: 'Cliente ou vínculo não encontrado.' }
  }

  let sistema: { id: string; origem: string | null; nome?: string | null; slug?: string | null } | null = null
  if (vinculo?.sistema_id) {
    const { data: sis } = await supabase
      .from('admin_sistemas')
      .select('id,origem,nome,slug')
      .eq('id', vinculo.sistema_id)
      .maybeSingle()
    sistema = sis || null
  }

  let targetEmpresaId: string | null = null
  if (vinculo?.perfil_id) {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('id,empresa_id')
      .eq('id', vinculo.perfil_id)
      .maybeSingle()
    targetEmpresaId = perfil?.empresa_id ? String(perfil.empresa_id) : null
  }

  const eleg = validarElegibilidadeModoSuporte({
    adminClienteIdInformado: params.adminClienteId,
    vinculoIdInformado: params.vinculoId,
    cliente: cliente ? { id: String(cliente.id) } : null,
    vinculo: vinculo
      ? {
          id: String(vinculo.id),
          cliente_id: String(vinculo.cliente_id),
          sistema_id: String(vinculo.sistema_id),
          acesso_connect: Boolean(vinculo.acesso_connect),
          auth_user_id: vinculo.auth_user_id ? String(vinculo.auth_user_id) : null,
          perfil_id: vinculo.perfil_id ? String(vinculo.perfil_id) : null,
        }
      : null,
    sistema,
    targetEmpresaId,
  })

  if (eleg.ok === false) {
    return { ok: false, code: eleg.code, error: eleg.error }
  }

  const clienteNome =
    (cliente?.nome_empresa && String(cliente.nome_empresa)) ||
    (cliente?.nome && String(cliente.nome)) ||
    null

  return { ok: true, elegivel: eleg, clienteNome }
}

type RpcIniciarResult =
  | {
      ok: true
      session: {
        id: string
        admin_user_id: string
        admin_email: string
        admin_cliente_id: string
        admin_cliente_sistema_id: string
        modo: string
        motivo: string
        iniciado_em: string
        expira_em: string
      }
    }
  | { ok: false; code: string; error: string; support_session_id?: string }

/**
 * Inicia sessão EXCLUSIVAMENTE via RPC atômica.
 * Sem fallback SELECT→INSERT.
 */
export async function criarSessaoSuporte(opts: {
  adminUserId: string
  adminEmail: string
  adminClienteId: string
  vinculoId: string
  motivo: unknown
  duracaoMinutos: unknown
  userAgent?: string | null
  ipAddress?: string | null
}): Promise<
  | {
      ok: true
      session: {
        id: string
        admin_user_id: string
        admin_email: string
        admin_cliente_id: string
        admin_cliente_sistema_id: string
        modo: string
        motivo: string
        iniciado_em: string
        expira_em: string
      }
      tokenBruto: string
      clienteNome: string | null
      sistemaNome: string | null
    }
  | { ok: false; code: string; error: string; status: number }
> {
  const motivoV = validarMotivoSuporte(opts.motivo)
  if (motivoV.ok === false) {
    return { ok: false, code: motivoV.code, error: motivoV.error, status: 400 }
  }

  const durV = validarDuracaoSuporte(opts.duracaoMinutos)
  if (durV.ok === false) {
    return { ok: false, code: durV.code, error: durV.error, status: 400 }
  }

  const eleg = await resolverElegibilidadeSuporteDoBanco({
    adminClienteId: opts.adminClienteId,
    vinculoId: opts.vinculoId,
  })
  if (eleg.ok === false) {
    await registrarEventoSuporte({
      evento: 'tentativa_bloqueada',
      adminUserId: opts.adminUserId,
      adminEmail: opts.adminEmail,
      detalhes: { code: eleg.code, error: eleg.error, vinculo_id: opts.vinculoId },
    })
    return { ok: false, code: eleg.code, error: eleg.error, status: 422 }
  }

  let tokenBruto: string
  let tokenHash: string
  try {
    tokenBruto = gerarContextTokenBruto()
    tokenHash = hashContextToken(tokenBruto)
  } catch {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TOKEN,
      error: 'Não foi possível gerar token seguro de suporte.',
      status: 500,
    }
  }

  if (tokenBruto === tokenHash || !isContextTokenHashShape(tokenHash)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TOKEN,
      error: 'Falha na geração do hash de contexto.',
      status: 500,
    }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('admin_support_iniciar_sessao', {
    p_admin_user_id: opts.adminUserId,
    p_admin_email: String(opts.adminEmail).trim().toLowerCase(),
    p_admin_cliente_id: eleg.elegivel.adminClienteId,
    p_admin_cliente_sistema_id: eleg.elegivel.vinculoId,
    p_target_auth_user_id: eleg.elegivel.targetAuthUserId,
    p_target_perfil_id: eleg.elegivel.targetPerfilId,
    p_target_empresa_id: eleg.elegivel.targetEmpresaId,
    p_modo: ADMIN_SUPPORT_MODO_FASE,
    p_motivo: motivoV.motivo,
    p_duracao_minutos: durV.minutos,
    p_context_token_hash: tokenHash,
    p_user_agent: opts.userAgent ? String(opts.userAgent).slice(0, 500) : null,
    p_ip_address: opts.ipAddress ? String(opts.ipAddress).slice(0, 80) : null,
  })

  if (error) {
    if (erroTabelaSupportAusente(error)) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_TABELA_AUSENTE,
        error:
          'Tabelas/RPC de Modo Suporte ainda não foram aplicadas. Execute docs/admin-support-sessions.sql manualmente.',
        status: 503,
      }
    }
    // Unique violation = conflito de concorrência
    const msg = String(error.message || '').toLowerCase()
    if (error.code === '23505' || msg.includes('uma_aberta_por_admin') || msg.includes('duplicate')) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_SESSAO_ATIVA,
        error: MSG_SUPPORT_SESSAO_ATIVA,
        status: 409,
      }
    }
    console.warn('[ADMIN.4.2] RPC iniciar:', error.message?.slice(0, 200))
    return {
      ok: false,
      code: 'ADMIN_SUPPORT_ERRO',
      error: 'Não foi possível iniciar a sessão de suporte.',
      status: 500,
    }
  }

  const payload = data as RpcIniciarResult
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      code: 'ADMIN_SUPPORT_ERRO',
      error: 'Resposta inválida da RPC de suporte.',
      status: 500,
    }
  }

  if (payload.ok === false) {
    const status = payload.code === CODIGO_SUPPORT_SESSAO_ATIVA ? 409 : 422
    return {
      ok: false,
      code: payload.code || 'ADMIN_SUPPORT_ERRO',
      error: payload.error || 'Falha ao iniciar suporte.',
      status,
    }
  }

  return {
    ok: true,
    session: payload.session,
    tokenBruto,
    clienteNome: eleg.clienteNome,
    sistemaNome: eleg.elegivel.sistemaNome,
  }
}

export async function encerrarSessaoSuporte(opts: {
  adminUserId: string
  tokenBruto: string
}): Promise<
  | { ok: true; jaEncerrada: boolean; sessionId: string | null }
  | { ok: false; code: string; error: string; status: number }
> {
  if (!opts.tokenBruto) {
    return { ok: true, jaEncerrada: true, sessionId: null }
  }

  const { row, tabelaOk } = await buscarSessaoPorTokenBruto(opts.tokenBruto)
  if (!tabelaOk) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TABELA_AUSENTE,
      error: 'Tabelas de Modo Suporte ainda não foram aplicadas no banco.',
      status: 503,
    }
  }

  if (!row) {
    return { ok: true, jaEncerrada: true, sessionId: null }
  }

  if (row.admin_user_id !== opts.adminUserId) {
    return {
      ok: false,
      code: 'ADMIN_SUPPORT_CONTEXTO_INVALIDO',
      error: 'Contexto de suporte não pertence a este administrador.',
      status: 403,
    }
  }

  if (row.encerrado_em || row.revogado_em) {
    return { ok: true, jaEncerrada: true, sessionId: row.id }
  }

  const agora = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('admin_support_sessions')
    .update({ encerrado_em: agora })
    .eq('id', row.id)
    .is('encerrado_em', null)

  if (error) {
    console.warn('[ADMIN.4.2] encerrar:', error.message?.slice(0, 200))
    return {
      ok: false,
      code: 'ADMIN_SUPPORT_ERRO',
      error: 'Não foi possível encerrar a sessão de suporte.',
      status: 500,
    }
  }

  await registrarEventoSuporte({
    supportSessionId: row.id,
    evento: 'encerrado',
    adminUserId: opts.adminUserId,
    adminEmail: row.admin_email,
  })

  return { ok: true, jaEncerrada: false, sessionId: row.id }
}

export function montarStatusUx(opts: {
  row: SupportSessionRow
  clienteNome?: string | null
  sistemaNome?: string | null
}) {
  return {
    active: true as const,
    support_session_id: opts.row.id,
    cliente: {
      id: opts.row.admin_cliente_id,
      nome: opts.clienteNome || null,
    },
    sistema: {
      vinculo_id: opts.row.admin_cliente_sistema_id,
      nome: opts.sistemaNome || null,
    },
    modo: opts.row.modo,
    motivo: opts.row.motivo,
    iniciado_em: opts.row.iniciado_em,
    expira_em: opts.row.expira_em,
  }
}

export function statusAuthMasterSuporte(error: unknown): number {
  const msg = error instanceof Error ? error.message : String(error || '')
  if (msg === 'Sessão ausente.' || msg === 'Sessão inválida.') return 401
  if (msg === 'Acesso negado.' || msg.includes('Master')) return 403
  return 500
}

export function assertMasterEmail(email: string | null | undefined) {
  if (!isAdminMasterServer(email)) {
    throw new Error('Acesso negado.')
  }
}

export { sessaoSuporteEstaAtiva, buscarSessaoPorTokenBruto as buscarSessaoPorContextToken }
