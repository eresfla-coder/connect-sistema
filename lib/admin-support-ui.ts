/**
 * ADMIN.4.2.7 / 4.2.8a — helpers puros da UI mínima de Modo Suporte (sem I/O, sem node:crypto).
 * Feature gate fail-closed + elegibilidade de lista + payload seguro.
 * Constantes espelham admin-support (client-safe).
 */

/** Espelho client-safe de ADMIN_SUPPORT_DURACOES_MINUTOS */
export const ADMIN_SUPPORT_UI_DURACOES = [15, 30, 60] as const
export type AdminSupportUiDuracao = (typeof ADMIN_SUPPORT_UI_DURACOES)[number]
export const ADMIN_SUPPORT_UI_MOTIVO_MIN = 10
export const ADMIN_SUPPORT_UI_MOTIVO_MAX = 500

export type AdminSupportUiEnv = {
  NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED?: string
  NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV?: string
}

/**
 * Avalia o gate fail-closed a partir de valores já obtidos.
 * UI ON somente quando AMBAS forem exatamente true + preview
 * (após trim + lowercase).
 *
 * LIMITAÇÃO: se Production receber deliberadamente AMBAS as vars
 * (enabled=true + env=preview), o client não detecta Production.
 * Autorização real permanece server-side (Master + elegibilidade).
 */
export function isAdminSupportUiEnabledFromValues(
  enabled?: string | null,
  uiEnv?: string | null,
): boolean {
  return (
    String(enabled || '')
      .trim()
      .toLowerCase() === 'true' &&
    String(uiEnv || '')
      .trim()
      .toLowerCase() === 'preview'
  )
}

/**
 * Runtime do client — leituras ESTÁTICAS de process.env.NEXT_PUBLIC_*
 * para o Next.js embutir os valores no bundle do browser.
 * Não passar process.env como objeto / acesso indireto.
 */
export function isAdminSupportUiEnabled(): boolean {
  return isAdminSupportUiEnabledFromValues(
    process.env.NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENABLED,
    process.env.NEXT_PUBLIC_ADMIN_SUPPORT_UI_ENV,
  )
}

export type VinculoSuporteUiLite = {
  vinculo_id?: string | null
  nome?: string | null
  origem?: string | null
  status?: string | null
  acesso_connect?: boolean | null
  auth_user_id?: string | null
  perfil_id?: string | null
}

export type ClienteSuporteUiLite = {
  admin_cliente_id?: string | null
  nome_empresa?: string | null
  nome?: string | null
  sistemasResumo?: VinculoSuporteUiLite[] | null
}

/** Critérios de elegibilidade espelhados na UI (server revalida no POST). */
export function isVinculoElegivelSuporteUi(v: VinculoSuporteUiLite | null | undefined): boolean {
  if (!v) return false
  const origem = String(v.origem || '')
    .trim()
    .toLowerCase()
  if (origem !== 'connect') return false
  if (v.acesso_connect !== true) return false
  if (!String(v.vinculo_id || '').trim()) return false
  if (!String(v.auth_user_id || '').trim()) return false
  if (!String(v.perfil_id || '').trim()) return false
  return true
}

export function isVinculoTerceiroSuporteUi(v: VinculoSuporteUiLite | null | undefined): boolean {
  const origem = String(v?.origem || '')
    .trim()
    .toLowerCase()
  return origem === 'terceiro'
}

export type CandidatoSuporteUi = {
  admin_cliente_id: string
  clienteNome: string
  vinculo_id: string
  sistemaNome: string
  status: string | null
  origem: string
  acesso_connect: boolean
  elegivel: boolean
  terceiro: boolean
}

export function listarCandidatosSuporteUi(clientes: ClienteSuporteUiLite[]): CandidatoSuporteUi[] {
  const out: CandidatoSuporteUi[] = []
  for (const c of clientes || []) {
    const adminId = String(c.admin_cliente_id || '').trim()
    if (!adminId) continue
    const clienteNome =
      String(c.nome_empresa || '').trim() || String(c.nome || '').trim() || 'Cliente'
    for (const s of c.sistemasResumo || []) {
      const vinculoId = String(s.vinculo_id || '').trim()
      if (!vinculoId) continue
      const terceiro = isVinculoTerceiroSuporteUi(s)
      const elegivel = isVinculoElegivelSuporteUi(s)
      out.push({
        admin_cliente_id: adminId,
        clienteNome,
        vinculo_id: vinculoId,
        sistemaNome: String(s.nome || 'Sistema').trim() || 'Sistema',
        status: s.status ? String(s.status) : null,
        origem: String(s.origem || ''),
        acesso_connect: Boolean(s.acesso_connect),
        elegivel,
        terceiro,
      })
    }
  }
  return out
}

export type IniciarSuportePayload = {
  admin_cliente_id: string
  vinculo_id: string
  motivo: string
  duracao_minutos: AdminSupportUiDuracao
}

/** Monta payload permitido — sem modo, targets, e-mails ou IDs sensíveis. */
export function montarPayloadIniciarSuporte(input: {
  admin_cliente_id: string
  vinculo_id: string
  motivo: string
  duracao_minutos: number
}): IniciarSuportePayload {
  const dur = Number(input.duracao_minutos)
  if (!ADMIN_SUPPORT_UI_DURACOES.includes(dur as AdminSupportUiDuracao)) {
    throw new Error('Duração inválida.')
  }
  const motivo = String(input.motivo || '').trim()
  if (motivo.length < ADMIN_SUPPORT_UI_MOTIVO_MIN || motivo.length > ADMIN_SUPPORT_UI_MOTIVO_MAX) {
    throw new Error('Motivo inválido.')
  }
  return {
    admin_cliente_id: String(input.admin_cliente_id).trim(),
    vinculo_id: String(input.vinculo_id).trim(),
    motivo,
    duracao_minutos: dur as AdminSupportUiDuracao,
  }
}

export function payloadIniciarTemCamposProibidos(payload: Record<string, unknown>): boolean {
  const proibidos = [
    'modo',
    'auth_user_id',
    'perfil_id',
    'empresa_id',
    'target_auth_user_id',
    'target_perfil_id',
    'target_empresa_id',
    'admin_user_id',
    'admin_email',
    'access_token',
    'token',
  ]
  return proibidos.some((k) => Object.prototype.hasOwnProperty.call(payload, k))
}

export function sanitizarStatusSuporteParaUi(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== 'object') return null
  return {
    ok: Boolean(raw.ok),
    active: Boolean(raw.active),
    support_session_id: raw.support_session_id ? String(raw.support_session_id) : null,
    modo: raw.modo ? String(raw.modo) : null,
    motivo: raw.motivo ? String(raw.motivo) : null,
    iniciado_em: raw.iniciado_em ? String(raw.iniciado_em) : null,
    expira_em: raw.expira_em ? String(raw.expira_em) : null,
    cliente:
      raw.cliente && typeof raw.cliente === 'object'
        ? {
            id: String((raw.cliente as { id?: unknown }).id || ''),
            nome: (raw.cliente as { nome?: unknown }).nome
              ? String((raw.cliente as { nome?: unknown }).nome)
              : null,
          }
        : null,
    sistema:
      raw.sistema && typeof raw.sistema === 'object'
        ? {
            vinculo_id: String((raw.sistema as { vinculo_id?: unknown }).vinculo_id || ''),
            nome: (raw.sistema as { nome?: unknown }).nome
              ? String((raw.sistema as { nome?: unknown }).nome)
              : null,
          }
        : null,
    reason: raw.reason ? String(raw.reason) : null,
    error: raw.error ? String(raw.error) : null,
  }
}
