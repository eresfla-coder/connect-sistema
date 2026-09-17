/**
 * ADMIN.2.1 — domínio da carteira administrativa (Opção B).
 */

export type OrigemSistemaAdmin = 'connect' | 'terceiro'

export type StatusVinculoAdmin =
  | 'trial'
  | 'ativo'
  | 'bloqueado'
  | 'cancelado'
  | 'inadimplente'

export type FonteListaAdmin = 'legado' | 'admin'

export const CODIGO_ADMIN_TABLES_NOT_READY = 'ADMIN_TABLES_NOT_READY'
export const MSG_ADMIN_TABLES_NOT_READY =
  'As tabelas administrativas (admin_*) ainda não foram aplicadas no banco. Execute docs/admin2-migration.sql quando aprovado.'

export const CODIGO_ORIGEM_ACESSO_INVALIDO = 'ADMIN_ORIGEM_ACESSO_INVALIDO'
export const MSG_TERCEIRO_SEM_ACESSO_CONNECT =
  'Sistema de terceiro não pode ter acesso Connect (login).'

export const CODIGO_ACESSO_IDS_INVALIDO = 'ADMIN_ACESSO_IDS_INVALIDO'
export const CODIGO_ORIGEM_FLIP_BLOQUEADO = 'ADMIN_ORIGEM_FLIP_BLOQUEADO'
export const MSG_ORIGEM_FLIP_BLOQUEADO =
  'Este sistema possui clientes com acesso Connect vinculado. Remova ou ajuste esses vínculos antes de alterar a origem.'

export const CODIGO_EMAIL_DUPLICADO = 'ADMIN_EMAIL_DUPLICADO'
export const MSG_EMAIL_DUPLICADO =
  'Já existe um cliente administrativo com este e-mail.'

export function normalizarEmailAdmin(valor: unknown): string {
  return String(valor || '').trim().toLowerCase()
}

export function normalizarOrigemSistema(valor: unknown): OrigemSistemaAdmin | null {
  const v = String(valor || '')
    .trim()
    .toLowerCase()
  if (v === 'connect') return 'connect'
  if (v === 'terceiro' || v === 'terceiros' || v === 'third') return 'terceiro'
  return null
}

export function slugifySistemaNome(nome: string): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function deveCriarAuthConnect(params: {
  origem: OrigemSistemaAdmin
  criarAcesso: boolean
}): boolean {
  return params.origem === 'connect' && params.criarAcesso === true
}

export function deveCriarPerfilConnect(params: {
  origem: OrigemSistemaAdmin
  criarAcesso: boolean
}): boolean {
  return deveCriarAuthConnect(params)
}

export function acessoConnectDoVinculo(params: {
  origem: OrigemSistemaAdmin
  criarAcesso: boolean
}): boolean {
  if (params.origem === 'terceiro') return false
  return params.criarAcesso === true
}

/**
 * Invariante DB espelhada:
 * false → ambos IDs null
 * true → ambos IDs not null e iguais
 */
export function validarIdsAcessoConnect(params: {
  acessoConnect: boolean
  authUserId?: string | null
  perfilId?: string | null
}): { ok: true } | { ok: false; code: string; error: string } {
  const auth = params.authUserId ? String(params.authUserId).trim() : ''
  const perfil = params.perfilId ? String(params.perfilId).trim() : ''

  if (!params.acessoConnect) {
    if (auth || perfil) {
      return {
        ok: false,
        code: CODIGO_ACESSO_IDS_INVALIDO,
        error: 'Sem acesso Connect, auth_user_id e perfil_id devem ficar vazios.',
      }
    }
    return { ok: true }
  }

  if (!auth || !perfil) {
    return {
      ok: false,
      code: CODIGO_ACESSO_IDS_INVALIDO,
      error: 'Com acesso Connect, auth_user_id e perfil_id são obrigatórios.',
    }
  }
  if (auth !== perfil) {
    return {
      ok: false,
      code: CODIGO_ACESSO_IDS_INVALIDO,
      error: 'auth_user_id e perfil_id devem ser o mesmo UUID no modelo Connect.',
    }
  }
  return { ok: true }
}

export function validarAcessoPorOrigem(params: {
  origem: OrigemSistemaAdmin
  acessoConnect: boolean
}): { ok: true } | { ok: false; code: string; error: string } {
  if (params.origem === 'terceiro' && params.acessoConnect) {
    return {
      ok: false,
      code: CODIGO_ORIGEM_ACESSO_INVALIDO,
      error: MSG_TERCEIRO_SEM_ACESSO_CONNECT,
    }
  }
  if (params.acessoConnect && params.origem !== 'connect') {
    return {
      ok: false,
      code: CODIGO_ORIGEM_ACESSO_INVALIDO,
      error: MSG_TERCEIRO_SEM_ACESSO_CONNECT,
    }
  }
  return { ok: true }
}

export function podeAlterarOrigemConnectParaTerceiro(params: {
  origemAtual: OrigemSistemaAdmin
  origemNova: OrigemSistemaAdmin
  vinculosComAcesso: boolean
}): { ok: true } | { ok: false; code: string; error: string } {
  if (params.origemAtual === 'connect' && params.origemNova === 'terceiro' && params.vinculosComAcesso) {
    return {
      ok: false,
      code: CODIGO_ORIGEM_FLIP_BLOQUEADO,
      error: MSG_ORIGEM_FLIP_BLOQUEADO,
    }
  }
  return { ok: true }
}

export function vinculoTemAcessoConnectIncompativelComTerceiro(v: {
  acesso_connect?: boolean | null
  auth_user_id?: string | null
  perfil_id?: string | null
}): boolean {
  return Boolean(v.acesso_connect) || Boolean(v.auth_user_id) || Boolean(v.perfil_id)
}

export function podeOperarAuthConnect(authUserId: string | null | undefined): boolean {
  return Boolean(String(authUserId || '').trim())
}

/** Compensação: só apaga admin_cliente se criado nesta request e sem vínculo. */
export function deveLimparAdminClienteRecemCriado(params: {
  adminClienteRecemCriadoNestaRequest: boolean
  falhaPosterior: boolean
  vinculoPersistido: boolean
}): boolean {
  return (
    params.adminClienteRecemCriadoNestaRequest === true &&
    params.falhaPosterior === true &&
    params.vinculoPersistido === false
  )
}

export type SistemaListaItem = {
  vinculo_id: string | null
  sistema_id: string | null
  nome: string
  origem: OrigemSistemaAdmin | 'legado'
  status: string | null
  valor: number | null
  data_vencimento: string | null
  dia_vencimento?: number | null
  acesso_connect: boolean
  auth_user_id: string | null
  perfil_id: string | null
  legado_texto: boolean
  sistema_cliente_legado: string | null
}

export type AdminListaItem = {
  fonte: FonteListaAdmin
  id: string
  admin_cliente_id: string | null
  nome: string | null
  nome_empresa: string | null
  email: string | null
  telefone: string | null
  observacoes: string | null
  ativo: boolean
  legado: boolean
  sistemas: SistemaListaItem[]
  auth_user_id: string | null
  perfil_id: string | null
  pode_reset_senha: boolean
}

export function montarItemLegadoLista(params: {
  perfilId: string
  email?: string | null
  nomeEmpresa?: string | null
  telefone?: string | null
  status?: string | null
  valorPlano?: number | null
  vencimento?: string | null
  sistemaCliente?: string | null
  observacoes?: string | null
  ativo?: boolean | null
}): AdminListaItem {
  const sistemaTexto = String(params.sistemaCliente || '').trim()
  return {
    fonte: 'legado',
    id: params.perfilId,
    admin_cliente_id: null,
    nome: params.nomeEmpresa || null,
    nome_empresa: params.nomeEmpresa || null,
    email: params.email || null,
    telefone: params.telefone || null,
    observacoes: params.observacoes || null,
    ativo: params.ativo !== false,
    legado: true,
    sistemas: [
      {
        vinculo_id: null,
        sistema_id: null,
        nome: sistemaTexto || 'Sistema (texto livre legado)',
        origem: 'legado',
        status: params.status || null,
        valor: params.valorPlano ?? null,
        data_vencimento: params.vencimento || null,
        acesso_connect: true,
        auth_user_id: params.perfilId,
        perfil_id: params.perfilId,
        legado_texto: true,
        sistema_cliente_legado: sistemaTexto || null,
      },
    ],
    auth_user_id: params.perfilId,
    perfil_id: params.perfilId,
    pode_reset_senha: true,
  }
}

export function umClientePodeTerVariosSistemas(): boolean {
  return true
}
