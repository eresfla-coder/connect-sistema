/**
 * ADMIN.4.3.2 / 4.3.2a — Gateway server-side read-only (piloto: orçamentos).
 * Service role only. ZERO write. NÃO importar em Client Components.
 * Imports relativos em `./admin-support` para testes Node sem alias `@/`.
 * I/O (supabase-admin / admin-support-server) via import dinâmico.
 *
 * PAYLOAD_SELECT = REMOVED (4.3.2a):
 * BIRA audit: status/total/cliente vazios na coluna; payload ~91KB médio.
 * Piloto prova acesso com colunas reais apenas — sem carregar JSON bruto.
 */

import {
  ADMIN_SUPPORT_MODO_FASE,
  CODIGO_SUPPORT_CONTEXTO_INVALIDO,
  CODIGO_SUPPORT_TERCEIRO,
  sessaoSuporteEstaAtiva,
} from './admin-support.ts'

/** Shape mínima da support session usada pelo gateway (espelha SupportSessionRow). */
export type SupportSessionGatewayRow = {
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
}

/**
 * Select explícito — PROIBIDO select('*') e PROIBIDO payload nesta fase.
 * Colunas reais auditadas: local_id, aprovado, updated_at, created_at, status, total, cliente.
 * (cliente_nome / numero / data NÃO existem como colunas.)
 */
export const ADMIN_SUPPORT_ORCAMENTOS_SELECT =
  'local_id,aprovado,updated_at,created_at,status,total,cliente' as const

export const ADMIN_SUPPORT_ORCAMENTO_STATUS = [
  'Pendente',
  'Aprovado',
  'Convertido',
  'Cancelado',
] as const
export type AdminSupportOrcamentoStatus = (typeof ADMIN_SUPPORT_ORCAMENTO_STATUS)[number]

export const ADMIN_SUPPORT_ORCAMENTOS_LIMIT_DEFAULT = 20
export const ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MIN = 1
export const ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MAX = 50
export const ADMIN_SUPPORT_ORCAMENTOS_OFFSET_MAX = 10_000

/** Allowlist ABSOLUTA de query params (qualquer outro → 400). */
export const ADMIN_SUPPORT_ORCAMENTOS_QUERY_KEYS = new Set(['limit', 'offset', 'status'])

/** Denylist explícita (cobertura extra / aliases) — allowlist já bloqueia o resto. */
export const TENANT_OVERRIDE_QUERY_KEYS = [
  'user_id',
  'perfil_id',
  'empresa_id',
  'auth_user_id',
  'target_user_id',
  'target_auth_user_id',
  'target_perfil_id',
  'admin_cliente_id',
  'cliente_id',
  'admin_cliente_sistema_id',
  'vinculo_id',
] as const

export const TENANT_OVERRIDE_HEADER_KEYS = [
  'x-user-id',
  'x-perfil-id',
  'x-empresa-id',
  'x-auth-user-id',
  'x-target-user-id',
  'x-target-auth-user-id',
  'x-target-perfil-id',
  'x-admin-cliente-id',
  'x-cliente-id',
  'x-admin-cliente-sistema-id',
  'x-vinculo-id',
] as const

export const CODIGO_SUPPORT_SESSAO_AUSENTE = 'ADMIN_SUPPORT_SESSAO_AUSENTE'
export const CODIGO_SUPPORT_SESSAO_INVALIDA = 'ADMIN_SUPPORT_SESSAO_INVALIDA'
export const CODIGO_SUPPORT_SESSAO_ENCERRADA = 'ADMIN_SUPPORT_SESSAO_ENCERRADA'
export const CODIGO_SUPPORT_SESSAO_REVOGADA = 'ADMIN_SUPPORT_SESSAO_REVOGADA'
export const CODIGO_SUPPORT_SESSAO_EXPIRADA = 'ADMIN_SUPPORT_SESSAO_EXPIRADA'
export const CODIGO_SUPPORT_MODO_INVALIDO = 'ADMIN_SUPPORT_MODO_INVALIDO'
export const CODIGO_SUPPORT_TARGET_AUSENTE = 'ADMIN_SUPPORT_TARGET_AUSENTE'
export const CODIGO_SUPPORT_VINCULO_INVALIDO = 'ADMIN_SUPPORT_VINCULO_INVALIDO'
export const CODIGO_SUPPORT_TENANT_OVERRIDE = 'ADMIN_SUPPORT_TENANT_OVERRIDE'
export const CODIGO_SUPPORT_QUERY_INVALIDA = 'ADMIN_SUPPORT_QUERY_INVALIDA'
export const CODIGO_SUPPORT_ACESSO_CONNECT = 'ADMIN_SUPPORT_ACESSO_CONNECT'

/** DTO piloto — sem numero/data (só existiam no payload, removido do SELECT). */
export type AdminSupportOrcamentoResumo = {
  local_id: string
  status: AdminSupportOrcamentoStatus
  total: number | null
  aprovado: boolean
  updated_at: string | null
  created_at: string | null
  cliente_nome: string | null
}

export type AdminSupportOrcamentosPagination = {
  limit: number
  offset: number
  returned: number
}

export type GatewayErro = {
  ok: false
  code: string
  error: string
  httpStatus: number
  limparCookie?: boolean
}

export type GatewayContextoOk = {
  ok: true
  session: SupportSessionGatewayRow
  targetAuthUserId: string
  targetPerfilId: string
}

type OrcamentoRowGateway = {
  local_id?: string | null
  aprovado?: boolean | null
  updated_at?: string | null
  created_at?: string | null
  status?: string | null
  total?: number | string | null
  cliente?: string | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidShape(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

/** Fail-closed: target vazio/inválido NUNCA deve chegar à query. */
export function assertTargetAuthUserIdParaQuery(targetAuthUserId: unknown): string {
  if (targetAuthUserId == null) {
    throw new Error(CODIGO_SUPPORT_TARGET_AUSENTE)
  }
  const id = String(targetAuthUserId).trim()
  if (!id || !isUuidShape(id)) {
    throw new Error(CODIGO_SUPPORT_TARGET_AUSENTE)
  }
  return id
}

export function detectarTenantOverrideQuery(searchParams: URLSearchParams): string | null {
  for (const key of searchParams.keys()) {
    const normalized = String(key || '').trim().toLowerCase()
    if ((TENANT_OVERRIDE_QUERY_KEYS as readonly string[]).includes(normalized)) {
      return normalized
    }
  }
  return null
}

export function detectarTenantOverrideHeaders(headers: Headers): string | null {
  for (const key of TENANT_OVERRIDE_HEADER_KEYS) {
    if (headers.has(key)) return key
  }
  // casing variants
  for (const [name] of headers.entries()) {
    const n = name.toLowerCase()
    if ((TENANT_OVERRIDE_HEADER_KEYS as readonly string[]).includes(n)) return n
  }
  return null
}

export function parseOrcamentosGatewayQuery(searchParams: URLSearchParams):
  | { ok: true; limit: number; offset: number; status: AdminSupportOrcamentoStatus | null }
  | GatewayErro {
  const tenantKey = detectarTenantOverrideQuery(searchParams)
  if (tenantKey) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TENANT_OVERRIDE,
      error: 'Parâmetro de tenant não permitido. O tenant vem somente da sessão de suporte.',
      httpStatus: 400,
    }
  }

  // Allowlist ABSOLUTA — qualquer outro parâmetro (incl. sort/order) → 400
  for (const key of searchParams.keys()) {
    const normalized = String(key || '').trim().toLowerCase()
    if (!ADMIN_SUPPORT_ORCAMENTOS_QUERY_KEYS.has(normalized)) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_QUERY_INVALIDA,
        error: 'Parâmetro de consulta não permitido.',
        httpStatus: 400,
      }
    }
  }

  let limit = ADMIN_SUPPORT_ORCAMENTOS_LIMIT_DEFAULT
  if (searchParams.has('limit')) {
    const raw = Number(searchParams.get('limit'))
    if (!Number.isInteger(raw) || raw < ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MIN) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_QUERY_INVALIDA,
        error: 'limit inválido.',
        httpStatus: 400,
      }
    }
    if (raw > ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MAX) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_QUERY_INVALIDA,
        error: `limit máximo é ${ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MAX}.`,
        httpStatus: 400,
      }
    }
    limit = raw
  }

  let offset = 0
  if (searchParams.has('offset')) {
    const raw = Number(searchParams.get('offset'))
    if (!Number.isInteger(raw) || raw < 0) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_QUERY_INVALIDA,
        error: 'offset inválido.',
        httpStatus: 400,
      }
    }
    if (raw > ADMIN_SUPPORT_ORCAMENTOS_OFFSET_MAX) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_QUERY_INVALIDA,
        error: 'offset excede o limite.',
        httpStatus: 400,
      }
    }
    offset = raw
  }

  let status: AdminSupportOrcamentoStatus | null = null
  if (searchParams.has('status')) {
    const raw = String(searchParams.get('status') || '').trim()
    if (!(ADMIN_SUPPORT_ORCAMENTO_STATUS as readonly string[]).includes(raw)) {
      return {
        ok: false,
        code: CODIGO_SUPPORT_QUERY_INVALIDA,
        error: 'status inválido.',
        httpStatus: 400,
      }
    }
    status = raw as AdminSupportOrcamentoStatus
  }

  return { ok: true, limit, offset, status }
}

export function validarSessaoGatewayReadOnly(
  row: SupportSessionGatewayRow | null,
  masterUserId: string,
  agoraMs: number = Date.now(),
): GatewayContextoOk | GatewayErro {
  if (!row) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_SESSAO_INVALIDA,
      error: 'Sessão de suporte inválida.',
      httpStatus: 403,
      limparCookie: true,
    }
  }

  if (!masterUserId || row.admin_user_id !== masterUserId) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_CONTEXTO_INVALIDO,
      error: 'Contexto de suporte inválido para este administrador.',
      httpStatus: 403,
      limparCookie: true,
    }
  }

  if (row.revogado_em) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_SESSAO_REVOGADA,
      error: 'Sessão de suporte revogada.',
      httpStatus: 403,
      limparCookie: true,
    }
  }

  if (row.encerrado_em) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_SESSAO_ENCERRADA,
      error: 'Sessão de suporte encerrada.',
      httpStatus: 403,
      limparCookie: true,
    }
  }

  if (!sessaoSuporteEstaAtiva(row, agoraMs)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_SESSAO_EXPIRADA,
      error: 'Sessão de suporte expirada.',
      httpStatus: 403,
      limparCookie: true,
    }
  }

  if (row.modo !== ADMIN_SUPPORT_MODO_FASE) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_MODO_INVALIDO,
      error: 'Modo de suporte não autorizado para leitura.',
      httpStatus: 403,
      limparCookie: true,
    }
  }

  const targetAuthUserId = String(row.target_auth_user_id || '').trim()
  const targetPerfilId = String(row.target_perfil_id || '').trim()
  if (!targetAuthUserId || !isUuidShape(targetAuthUserId)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TARGET_AUSENTE,
      error: 'Sessão sem tenant operacional válido.',
      httpStatus: 403,
      limparCookie: true,
    }
  }
  if (!targetPerfilId || !isUuidShape(targetPerfilId)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TARGET_AUSENTE,
      error: 'Sessão sem perfil alvo válido.',
      httpStatus: 403,
      limparCookie: true,
    }
  }

  return { ok: true, session: row, targetAuthUserId, targetPerfilId }
}

export type VinculoRevalidacaoInput = {
  session: SupportSessionGatewayRow
  vinculo: {
    id: string
    cliente_id: string
    sistema_id: string
    acesso_connect: boolean | null
    auth_user_id: string | null
    perfil_id: string | null
  } | null
  sistema: { id: string; origem: string | null } | null
}

/** Revalidação pura do vínculo (sem I/O) — fail-closed. */
export function validarVinculoGatewayRevalidado(input: VinculoRevalidacaoInput):
  | { ok: true }
  | GatewayErro {
  const { session, vinculo, sistema } = input

  if (!vinculo) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'Vínculo de suporte não encontrado.',
      httpStatus: 403,
    }
  }

  if (String(vinculo.id) !== String(session.admin_cliente_sistema_id)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'Vínculo divergente da sessão.',
      httpStatus: 403,
    }
  }

  if (String(vinculo.cliente_id) !== String(session.admin_cliente_id)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'Vínculo não pertence ao cliente da sessão.',
      httpStatus: 403,
    }
  }

  if (!sistema || String(sistema.id) !== String(vinculo.sistema_id)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'Sistema do vínculo inválido.',
      httpStatus: 403,
    }
  }

  if (String(sistema.origem || '').toLowerCase() !== 'connect') {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TERCEIRO,
      error: 'Sistema de terceiro não autorizado no gateway.',
      httpStatus: 403,
    }
  }

  if (!vinculo.acesso_connect) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_ACESSO_CONNECT,
      error: 'Acesso Connect inativo no vínculo.',
      httpStatus: 403,
    }
  }

  const authId = vinculo.auth_user_id ? String(vinculo.auth_user_id).trim() : ''
  const perfilId = vinculo.perfil_id ? String(vinculo.perfil_id).trim() : ''

  if (!authId || authId !== String(session.target_auth_user_id)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'auth_user_id do vínculo divergente.',
      httpStatus: 403,
    }
  }

  if (!perfilId || perfilId !== String(session.target_perfil_id)) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'perfil_id do vínculo divergente.',
      httpStatus: 403,
    }
  }

  return { ok: true }
}

function normalizarStatusOrcamento(raw: unknown): AdminSupportOrcamentoStatus {
  const s = String(raw || '').trim()
  if (s === 'Aprovado' || s === 'Convertido' || s === 'Cancelado') return s
  return 'Pendente'
}

/**
 * Monta DTO campo a campo. Sem spread de row. Sem payload.
 */
export function mapearAdminSupportOrcamentoResumo(row: OrcamentoRowGateway): AdminSupportOrcamentoResumo {
  const localId = String(row.local_id || '').trim()

  let total: number | null = null
  if (row.total != null && row.total !== '') {
    const n = Number(row.total)
    total = Number.isFinite(n) ? n : null
  }

  const clienteNome = row.cliente && String(row.cliente).trim() ? String(row.cliente).trim() : null

  return {
    local_id: localId || '—',
    status: normalizarStatusOrcamento(row.status),
    total,
    aprovado: Boolean(row.aprovado),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    cliente_nome: clienteNome,
  }
}

export async function revalidarVinculoSessaoSuporte(
  session: SupportSessionGatewayRow,
): Promise<{ ok: true } | GatewayErro> {
  const { getSupabaseAdmin } = await import('./supabase-admin.ts')
  const supabase = getSupabaseAdmin()
  const vinculoId = String(session.admin_cliente_sistema_id || '').trim()
  if (!vinculoId) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'Sessão sem vínculo.',
      httpStatus: 403,
    }
  }

  const { data: vinculo, error: vErr } = await supabase
    .from('admin_cliente_sistemas')
    .select('id,cliente_id,sistema_id,acesso_connect,auth_user_id,perfil_id')
    .eq('id', vinculoId)
    .maybeSingle()

  if (vErr) {
    console.warn('[ADMIN.4.3.2] revalidar vínculo:', String(vErr.message || '').slice(0, 200))
    return {
      ok: false,
      code: CODIGO_SUPPORT_VINCULO_INVALIDO,
      error: 'Falha ao revalidar vínculo.',
      httpStatus: 403,
    }
  }

  let sistema: { id: string; origem: string | null } | null = null
  if (vinculo?.sistema_id) {
    const { data: sis } = await supabase
      .from('admin_sistemas')
      .select('id,origem')
      .eq('id', vinculo.sistema_id)
      .maybeSingle()
    sistema = sis
      ? { id: String(sis.id), origem: sis.origem != null ? String(sis.origem) : null }
      : null
  }

  return validarVinculoGatewayRevalidado({
    session,
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
  })
}

/**
 * Query dedicada orçamentos — filtro .eq('user_id', target) OBRIGATÓRIO.
 * Fail-closed se target inválido (não executa query).
 * Status filter: SOMENTE coluna `status` (sem OR em payload).
 */
export async function listarOrcamentosSuporteReadOnly(opts: {
  targetAuthUserId: unknown
  limit: number
  offset: number
  status: AdminSupportOrcamentoStatus | null
}): Promise<
  | { ok: true; data: AdminSupportOrcamentoResumo[]; pagination: AdminSupportOrcamentosPagination }
  | GatewayErro
> {
  let targetAuthUserId: string
  try {
    targetAuthUserId = assertTargetAuthUserIdParaQuery(opts.targetAuthUserId)
  } catch {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TARGET_AUSENTE,
      error: 'Tenant operacional ausente — consulta bloqueada.',
      httpStatus: 403,
    }
  }

  const limit = Math.min(
    ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MAX,
    Math.max(ADMIN_SUPPORT_ORCAMENTOS_LIMIT_MIN, Math.floor(Number(opts.limit) || 0)),
  )
  const offsetRaw = Math.floor(Number(opts.offset) || 0)
  const offset = Math.min(ADMIN_SUPPORT_ORCAMENTOS_OFFSET_MAX, Math.max(0, offsetRaw))

  const { getSupabaseAdmin } = await import('./supabase-admin.ts')
  const supabase = getSupabaseAdmin()

  // Ordem obrigatória: owner filter ANTES de status/order/range.
  let query = supabase
    .from('orcamentos')
    .select(ADMIN_SUPPORT_ORCAMENTOS_SELECT)
    .eq('user_id', targetAuthUserId)

  if (opts.status) {
    query = query.eq('status', opts.status)
  }

  query = query
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('local_id', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error } = await query

  if (error) {
    console.warn('[ADMIN.4.3.2] listar orçamentos:', String(error.message || '').slice(0, 200))
    return {
      ok: false,
      code: 'ADMIN_SUPPORT_QUERY_ERRO',
      error: 'Não foi possível listar orçamentos.',
      httpStatus: 500,
    }
  }

  const rows = Array.isArray(data) ? (data as OrcamentoRowGateway[]) : []
  const mapped = rows.map((row) => mapearAdminSupportOrcamentoResumo(row))

  return {
    ok: true,
    data: mapped,
    pagination: {
      limit,
      offset,
      returned: mapped.length,
    },
  }
}

/**
 * Resolve cookie → sessão → ownership → lifecycle → revalida vínculo.
 * ZERO write (não marca expirada, não registra evento).
 */
export async function resolverContextoGatewayOrcamentos(
  req: Request,
  masterUserId: string,
): Promise<GatewayContextoOk | GatewayErro> {
  const headerOverride = detectarTenantOverrideHeaders(req.headers)
  if (headerOverride) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_TENANT_OVERRIDE,
      error: 'Header de tenant não permitido.',
      httpStatus: 400,
    }
  }

  const { buscarSessaoPorTokenBruto, lerContextTokenDoRequest } = await import(
    './admin-support-server.ts'
  )

  const tokenBruto = lerContextTokenDoRequest(req)
  if (!tokenBruto) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_SESSAO_AUSENTE,
      error: 'Sessão de suporte ausente.',
      httpStatus: 403,
    }
  }

  const { row, tabelaOk } = await buscarSessaoPorTokenBruto(tokenBruto)
  if (!tabelaOk) {
    return {
      ok: false,
      code: CODIGO_SUPPORT_SESSAO_INVALIDA,
      error: 'Infraestrutura de suporte indisponível.',
      httpStatus: 503,
      limparCookie: true,
    }
  }

  const sessao = validarSessaoGatewayReadOnly(row, masterUserId)
  if (sessao.ok === false) return sessao

  const vinculo = await revalidarVinculoSessaoSuporte(sessao.session)
  if (vinculo.ok === false) return vinculo

  return sessao
}

export function headersGatewayNoStore(): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  }
}
