/**
 * ADMIN.4.2.2 — domínio puro do Modo Suporte Connect (sem I/O).
 * Token bruto só no cookie; DB usa SHA-256. Sem PRNG fraco.
 */

import { createHash, randomBytes } from 'node:crypto'

/**
 * ADMIN.4.2.7 — UI mínima controlada por env (`isAdminSupportUiEnabled` em admin-support-ui).
 * Mantido `false` como default de compile-time; a UI usa o gate fail-closed
 * (ENABLED=true + UI_ENV=preview).
 */
export const ADMIN_SUPPORT_UI_ENABLED = false

/** Cookie httpOnly com token bruto (não é hash nem JWT). */
export const ADMIN_SUPPORT_COOKIE_NAME = 'connect_admin_support_ctx'

export const ADMIN_SUPPORT_MODO_FASE = 'read_only' as const
export type AdminSupportModo = typeof ADMIN_SUPPORT_MODO_FASE

export const ADMIN_SUPPORT_DURACOES_MINUTOS = [15, 30, 60] as const
export type AdminSupportDuracaoMinutos = (typeof ADMIN_SUPPORT_DURACOES_MINUTOS)[number]
export const ADMIN_SUPPORT_DURACAO_MAX_MINUTOS = 60

export const ADMIN_SUPPORT_MOTIVO_MIN = 10
export const ADMIN_SUPPORT_MOTIVO_MAX = 500

/** SHA-256 hex = 64 chars. */
export const ADMIN_SUPPORT_TOKEN_HASH_LEN = 64
/** 32 bytes CSPRNG → 64 hex chars no cookie. */
export const ADMIN_SUPPORT_TOKEN_BYTES = 32

export const CODIGO_SUPPORT_NAO_ELEGIVEL = 'ADMIN_SUPPORT_NAO_ELEGIVEL'
export const CODIGO_SUPPORT_TERCEIRO = 'ADMIN_SUPPORT_TERCEIRO'
export const CODIGO_SUPPORT_MOTIVO_INVALIDO = 'ADMIN_SUPPORT_MOTIVO_INVALIDO'
export const CODIGO_SUPPORT_DURACAO_INVALIDA = 'ADMIN_SUPPORT_DURACAO_INVALIDA'
export const CODIGO_SUPPORT_SESSAO_ATIVA = 'ADMIN_SUPPORT_SESSAO_ATIVA'
export const CODIGO_SUPPORT_TABELA_AUSENTE = 'ADMIN_SUPPORT_TABELA_AUSENTE'
export const CODIGO_SUPPORT_CONTEXTO_INVALIDO = 'ADMIN_SUPPORT_CONTEXTO_INVALIDO'
export const CODIGO_SUPPORT_MASTER_ONLY = 'ADMIN_SUPPORT_MASTER_ONLY'
export const CODIGO_SUPPORT_TOKEN = 'ADMIN_SUPPORT_TOKEN'

export const MSG_SUPPORT_TERCEIRO =
  'Modo Suporte Connect não está disponível para sistemas de terceiro.'
export const MSG_SUPPORT_NAO_ELEGIVEL =
  'Cliente não elegível para Modo Suporte (exige Connect com acesso e identidade).'
export const MSG_SUPPORT_SESSAO_ATIVA =
  'Já existe uma sessão de suporte ativa. Encerre-a antes de iniciar outra.'
export const MSG_SUPPORT_MASTER_ONLY =
  'Modo Suporte disponível apenas para o administrador Master.'

export type AdminSupportEvento =
  | 'iniciado'
  | 'encerrado'
  | 'expirada'
  | 'tentativa_bloqueada'
  | 'revogada'

export type ElegibilidadeSuporteInput = {
  adminClienteIdInformado: string
  vinculoIdInformado: string
  cliente: { id: string } | null
  vinculo: {
    id: string
    cliente_id: string
    sistema_id: string
    acesso_connect: boolean | null
    auth_user_id: string | null
    perfil_id: string | null
  } | null
  sistema: {
    id: string
    origem: string | null
    nome?: string | null
    slug?: string | null
  } | null
  targetEmpresaId?: string | null
}

export type ElegibilidadeSuporteOk = {
  ok: true
  adminClienteId: string
  vinculoId: string
  sistemaId: string
  sistemaNome: string | null
  origem: 'connect'
  targetAuthUserId: string
  targetPerfilId: string
  targetEmpresaId: string | null
}

export type ElegibilidadeSuporteErro = {
  ok: false
  code: string
  error: string
}

/**
 * Gera token bruto (256 bits) via CSPRNG.
 * Falha fechada se crypto indisponível — sem fallback fraco.
 */
export function gerarContextTokenBruto(): string {
  try {
    return randomBytes(ADMIN_SUPPORT_TOKEN_BYTES).toString('hex')
  } catch (err) {
    throw new Error(
      `CSPRNG indisponível para token de suporte: ${err instanceof Error ? err.message : 'erro'}`,
    )
  }
}

/** SHA-256 hex do token bruto. Determinístico. */
export function hashContextToken(tokenBruto: string): string {
  const t = String(tokenBruto || '')
  if (!t) throw new Error('Token de suporte vazio.')
  return createHash('sha256').update(t, 'utf8').digest('hex')
}

export function isContextTokenHashShape(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(String(hash || ''))
}

/** Simula regra de concorrência (unit): após expirar, no máx. 1 ativa. */
export function resolverConflitoSessoesAtivas(params: {
  adminUserId: string
  sessoes: Array<{
    id: string
    admin_user_id: string
    encerrado_em: string | null
    revogado_em: string | null
    expira_em: string
  }>
  agoraMs?: number
}): { ativas: string[]; expiradasParaMarcar: string[] } {
  const agora = params.agoraMs ?? Date.now()
  const doAdmin = params.sessoes.filter((s) => s.admin_user_id === params.adminUserId)
  const expiradasParaMarcar = doAdmin
    .filter(
      (s) =>
        !s.encerrado_em &&
        !s.revogado_em &&
        Date.parse(s.expira_em) <= agora,
    )
    .map((s) => s.id)
  const marcadas = new Set(expiradasParaMarcar)
  const ativas = doAdmin
    .filter(
      (s) =>
        !s.encerrado_em &&
        !s.revogado_em &&
        !marcadas.has(s.id) &&
        Date.parse(s.expira_em) > agora,
    )
    .map((s) => s.id)
  return { ativas, expiradasParaMarcar }
}

/** Duas tentativas: se já há 1 ativa pós-expiração, segunda conflita. */
export function simularDuasTentativasIniciar(params: {
  adminUserId: string
  sessoesAntes: Array<{
    id: string
    admin_user_id: string
    encerrado_em: string | null
    revogado_em: string | null
    expira_em: string
  }>
  agoraMs?: number
}): { primeira: 'ok' | 'conflito'; segunda: 'ok' | 'conflito' } {
  const r1 = resolverConflitoSessoesAtivas({
    adminUserId: params.adminUserId,
    sessoes: params.sessoesAntes,
    agoraMs: params.agoraMs,
  })
  if (r1.ativas.length > 0) {
    return { primeira: 'conflito', segunda: 'conflito' }
  }
  // primeira vence → passa a existir 1 ativa
  const aposPrimeira = [
    ...params.sessoesAntes.map((s) =>
      r1.expiradasParaMarcar.includes(s.id)
        ? { ...s, encerrado_em: new Date(params.agoraMs ?? Date.now()).toISOString() }
        : s,
    ),
    {
      id: 'nova-1',
      admin_user_id: params.adminUserId,
      encerrado_em: null,
      revogado_em: null,
      expira_em: new Date((params.agoraMs ?? Date.now()) + 30 * 60_000).toISOString(),
    },
  ]
  const r2 = resolverConflitoSessoesAtivas({
    adminUserId: params.adminUserId,
    sessoes: aposPrimeira,
    agoraMs: params.agoraMs,
  })
  return {
    primeira: 'ok',
    segunda: r2.ativas.length >= 1 ? 'conflito' : 'ok',
  }
}

export function normalizarUuidInformado(valor: unknown): string {
  return String(valor || '').trim().toLowerCase()
}

export function validarMotivoSuporte(motivo: unknown):
  | { ok: true; motivo: string }
  | { ok: false; code: string; error: string } {
  const texto = String(motivo ?? '').trim()
  if (!texto) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_MOTIVO_INVALIDO,
      error: 'Informe o motivo do suporte (obrigatório).',
    }
  }
  if (texto.length < ADMIN_SUPPORT_MOTIVO_MIN) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_MOTIVO_INVALIDO,
      error: `Motivo deve ter pelo menos ${ADMIN_SUPPORT_MOTIVO_MIN} caracteres.`,
    }
  }
  if (texto.length > ADMIN_SUPPORT_MOTIVO_MAX) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_MOTIVO_INVALIDO,
      error: `Motivo deve ter no máximo ${ADMIN_SUPPORT_MOTIVO_MAX} caracteres.`,
    }
  }
  return { ok: true, motivo: texto }
}

export function validarDuracaoSuporte(minutos: unknown):
  | { ok: true; minutos: AdminSupportDuracaoMinutos }
  | { ok: false; code: string; error: string } {
  const n = typeof minutos === 'number' ? minutos : Number(minutos)
  if (!Number.isInteger(n) || !ADMIN_SUPPORT_DURACOES_MINUTOS.includes(n as AdminSupportDuracaoMinutos)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_DURACAO_INVALIDA,
      error: `Duração inválida. Use ${ADMIN_SUPPORT_DURACOES_MINUTOS.join(', ')} minutos (máx. ${ADMIN_SUPPORT_DURACAO_MAX_MINUTOS}).`,
    }
  }
  if (n > ADMIN_SUPPORT_DURACAO_MAX_MINUTOS) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_DURACAO_INVALIDA,
      error: `Duração máxima nesta fase: ${ADMIN_SUPPORT_DURACAO_MAX_MINUTOS} minutos.`,
    }
  }
  return { ok: true, minutos: n as AdminSupportDuracaoMinutos }
}

export function validarElegibilidadeModoSuporte(
  input: ElegibilidadeSuporteInput,
): ElegibilidadeSuporteOk | ElegibilidadeSuporteErro {
  const adminClienteId = normalizarUuidInformado(input.adminClienteIdInformado)
  const vinculoId = normalizarUuidInformado(input.vinculoIdInformado)

  if (!adminClienteId || !vinculoId) {
    return { ok: false, code: CODIGO_SUPPORT_NAO_ELEGIVEL, error: MSG_SUPPORT_NAO_ELEGIVEL }
  }

  if (!input.cliente?.id) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_NAO_ELEGIVEL,
      error: 'Cliente administrativo não encontrado.',
    }
  }
  if (normalizarUuidInformado(input.cliente.id) !== adminClienteId) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_NAO_ELEGIVEL,
      error: 'Cliente informado não corresponde ao registro.',
    }
  }

  if (!input.vinculo?.id) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_NAO_ELEGIVEL,
      error: 'Vínculo cliente–sistema não encontrado.',
    }
  }
  if (normalizarUuidInformado(input.vinculo.id) !== vinculoId) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_NAO_ELEGIVEL,
      error: 'Vínculo informado não corresponde ao registro.',
    }
  }
  if (normalizarUuidInformado(input.vinculo.cliente_id) !== adminClienteId) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_NAO_ELEGIVEL,
      error: 'Vínculo não pertence ao cliente informado.',
    }
  }

  if (!input.sistema?.id) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_NAO_ELEGIVEL,
      error: 'Sistema do vínculo não encontrado.',
    }
  }
  if (normalizarUuidInformado(input.sistema.id) !== normalizarUuidInformado(input.vinculo.sistema_id)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_NAO_ELEGIVEL,
      error: 'Sistema não corresponde ao vínculo.',
    }
  }

  const origem = String(input.sistema.origem || '')
    .trim()
    .toLowerCase()
  if (origem === 'terceiro') {
    return { ok: false, code: CODIGO_SUPPORT_TERCEIRO, error: MSG_SUPPORT_TERCEIRO }
  }
  if (origem !== 'connect') {
    return { ok: false, code: CODIGO_SUPPORT_NAO_ELEGIVEL, error: MSG_SUPPORT_NAO_ELEGIVEL }
  }

  if (input.vinculo.acesso_connect !== true) {
    return { ok: false, code: CODIGO_SUPPORT_NAO_ELEGIVEL, error: MSG_SUPPORT_NAO_ELEGIVEL }
  }

  const authUserId = String(input.vinculo.auth_user_id || '').trim()
  const perfilId = String(input.vinculo.perfil_id || '').trim()
  if (!authUserId || !perfilId) {
    return { ok: false, code: CODIGO_SUPPORT_NAO_ELEGIVEL, error: MSG_SUPPORT_NAO_ELEGIVEL }
  }

  const empresa =
    input.targetEmpresaId != null && String(input.targetEmpresaId).trim()
      ? String(input.targetEmpresaId).trim()
      : null

  return {
    ok: true,
    adminClienteId,
    vinculoId,
    sistemaId: normalizarUuidInformado(input.sistema.id),
    sistemaNome: input.sistema.nome ? String(input.sistema.nome) : null,
    origem: 'connect',
    targetAuthUserId: authUserId,
    targetPerfilId: perfilId,
    targetEmpresaId: empresa,
  }
}

export function sessaoSuporteEstaAtiva(
  row: {
    encerrado_em?: string | null
    revogado_em?: string | null
    expira_em?: string | null
  },
  agoraMs: number = Date.now(),
): boolean {
  if (row.encerrado_em) return false
  if (row.revogado_em) return false
  const expira = row.expira_em ? Date.parse(row.expira_em) : NaN
  if (!Number.isFinite(expira) || expira <= agoraMs) return false
  return true
}

export function calcularExpiraEmIso(iniciadoEmIso: string, minutos: number): string {
  const base = Date.parse(iniciadoEmIso)
  if (!Number.isFinite(base)) throw new Error('iniciado_em inválido')
  return new Date(base + minutos * 60_000).toISOString()
}

export function cookieConteudoPareceCredencial(valor: string): boolean {
  const v = String(valor || '')
  if (!v) return false
  if (v.startsWith('eyJ')) return true
  if (/service_role|supabase/i.test(v)) return true
  if (v.includes('.')) {
    const parts = v.split('.')
    if (parts.length === 3 && parts.every((p) => p.length > 8)) return true
  }
  return false
}

/** @deprecated Use gerarContextTokenBruto — mantido só se algum import residual. */
export function gerarContextTokenOpaco(): string {
  return gerarContextTokenBruto()
}
