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

/** ADMIN.4.3.3 — gateway piloto read-only (URL fixa; tenant só da support session). */
export const ADMIN_SUPPORT_ORCAMENTOS_GATEWAY_PATH = '/api/admin/suporte/dados/orcamentos'

export const ADMIN_SUPPORT_ORCAMENTOS_TENANT_KEYS_PROIBIDOS = [
  'user_id',
  'perfil_id',
  'empresa_id',
  'cliente_id',
  'vinculo_id',
  'auth_user_id',
  'target_auth_user_id',
  'target_perfil_id',
  'admin_cliente_id',
  'admin_cliente_sistema_id',
] as const

export type AdminSupportOrcamentoResumoUi = {
  local_id: string
  cliente_nome: string | null
  status: string
  total: number | null
  aprovado: boolean
  updated_at: string | null
  created_at: string | null
}

export function deveMostrarCtaVerOrcamentosSuporte(active: boolean): boolean {
  return active === true
}

/** Primeiro smoke: somente limit/offset — sem tenant params. */
export function montarUrlGatewayOrcamentosSuporte(opts?: {
  limit?: number
  offset?: number
}): string {
  const limit = Number.isInteger(opts?.limit) && (opts?.limit as number) > 0 ? (opts!.limit as number) : 20
  const offset = Number.isInteger(opts?.offset) && (opts?.offset as number) >= 0 ? (opts!.offset as number) : 0
  return `${ADMIN_SUPPORT_ORCAMENTOS_GATEWAY_PATH}?limit=${limit}&offset=${offset}`
}

export function urlGatewayOrcamentosTemTenantProibido(url: string): boolean {
  try {
    const u = new URL(url, 'https://local.invalid')
    for (const key of ADMIN_SUPPORT_ORCAMENTOS_TENANT_KEYS_PROIBIDOS) {
      if (u.searchParams.has(key)) return true
    }
    return false
  } catch {
    return true
  }
}

export function formatarCampoOrcamentoSuporteUi(valor: unknown): string {
  if (valor == null) return '—'
  if (typeof valor === 'string' && !valor.trim()) return '—'
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '—'
  const s = String(valor).trim()
  return s || '—'
}

/**
 * ADMIN.4.3.3a — guarda pós-await: resposta stale NÃO pode repopular state
 * após encerrar / inactive / unmount / nova sessão.
 */
export function deveAplicarResultadoGatewayOrcamentos(opts: {
  requestGen: number
  latestGen: number
  stillMounted: boolean
  faseAtiva: boolean
  sessionIdEsperado: string | null
  sessionIdAtual: string | null
}): boolean {
  if (!opts.stillMounted) return false
  if (opts.requestGen !== opts.latestGen) return false
  if (!opts.faseAtiva) return false
  const esperado = opts.sessionIdEsperado ? String(opts.sessionIdEsperado) : ''
  const atual = opts.sessionIdAtual ? String(opts.sessionIdAtual) : ''
  if (!esperado || !atual || esperado !== atual) return false
  return true
}

export function mensagemErroGatewayOrcamentosUi(statusHttp: number | null): string {
  if (statusHttp === 401 || statusHttp === 403) {
    return 'Sessão de suporte indisponível ou expirada.'
  }
  if (statusHttp != null && statusHttp >= 500) {
    return 'Não foi possível listar orçamentos.'
  }
  return 'Não foi possível listar orçamentos.'
}

/** Mapeia data[] do gateway campo a campo — sem spread de row/payload. */
export function mapearListaOrcamentosGatewayUi(body: unknown): AdminSupportOrcamentoResumoUi[] {
  if (!body || typeof body !== 'object') return []
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const out: AdminSupportOrcamentoResumoUi[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    let total: number | null = null
    if (row.total != null && row.total !== '') {
      const n = Number(row.total)
      total = Number.isFinite(n) ? n : null
    }
    out.push({
      local_id: row.local_id != null ? String(row.local_id) : '—',
      cliente_nome:
        row.cliente_nome != null && String(row.cliente_nome).trim()
          ? String(row.cliente_nome).trim()
          : null,
      status: row.status != null ? String(row.status) : 'Pendente',
      total,
      aprovado: Boolean(row.aprovado),
      updated_at: row.updated_at != null ? String(row.updated_at) : null,
      created_at: row.created_at != null ? String(row.created_at) : null,
    })
  }
  return out
}
