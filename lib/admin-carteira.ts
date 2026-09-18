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
  /** Campos comerciais agregados do 1º vínculo (métricas da carteira). */
  status?: string | null
  valor_plano?: number | null
  vencimento?: string | null
  status_pagamento?: string | null
  ultimo_pagamento?: string | null
  data_criacao?: string | null
  sistemas: SistemaListaItem[]
  auth_user_id: string | null
  perfil_id: string | null
  pode_reset_senha: boolean
}

/**
 * @deprecated ADMIN.2.5 — dual-read removido da listagem oficial.
 * Mantido só para testes/ferramentas; NÃO usar em GET /api/admin/carteira.
 */
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

/** ADMIN.2.5 — carteira oficial = somente fonte admin (nunca perfis soltos). */
export function filtrarItensCarteiraOficial(itens: AdminListaItem[]): AdminListaItem[] {
  return (itens || []).filter((item) => item.fonte === 'admin' && item.legado !== true)
}

export type MetricasCarteiraAdmin = {
  total: number
  trials: number
  bloqueados: number
  mrr: number
  recebidoMes: number
  novos30: number
  vencidos: number
  vencendo7: number
}

export type ItemMetricasCarteira = {
  status?: string | null
  ativo?: boolean | null
  valor_plano?: number | null
  vencimento?: string | null
  status_pagamento?: string | null
  data_criacao?: string | null
}

function diasAteVencimento(vencimento?: string | null): number | null {
  if (!vencimento) return null
  const d = new Date(`${String(vencimento).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((d.getTime() - Date.now()) / 86400000)
}

function vencimentoPermanente(item: ItemMetricasCarteira): boolean {
  const v = String(item.vencimento || '')
  return v.startsWith('2099') || Number(item.valor_plano || 0) === 0
}

/** KPIs da carteira admin_* — NÃO conta os 29 perfis legados. */
export function calcularMetricasCarteiraAdmin(itens: ItemMetricasCarteira[]): MetricasCarteiraAdmin {
  const total = itens.length
  const trials = itens.filter((c) => /trial|teste/i.test(String(c.status || ''))).length
  const bloqueados = itens.filter(
    (c) => String(c.status || '').toLowerCase() === 'bloqueado' || c.ativo === false,
  ).length
  const vencidos = itens.filter((c) => {
    if (vencimentoPermanente(c)) return false
    const dias = diasAteVencimento(c.vencimento)
    return dias !== null && dias < 0
  }).length
  const vencendo7 = itens.filter((c) => {
    if (vencimentoPermanente(c)) return false
    const dias = diasAteVencimento(c.vencimento)
    return dias !== null && dias >= 0 && dias <= 7
  }).length
  const mrr = itens
    .filter((c) => String(c.status || '').toLowerCase() !== 'bloqueado' && c.ativo !== false)
    .reduce((acc, c) => acc + Number(c.valor_plano || 0), 0)
  const recebidoMes = itens
    .filter((c) => ['em_dia', 'pago'].includes(String(c.status_pagamento || '').toLowerCase()))
    .reduce((acc, c) => acc + Number(c.valor_plano || 0), 0)
  const novos30 = itens.filter((c) => {
    const criado = c.data_criacao ? new Date(c.data_criacao) : null
    return !!criado && !Number.isNaN(criado.getTime()) && Date.now() - criado.getTime() <= 30 * 86400000
  }).length
  return { total, trials, bloqueados, mrr, recebidoMes, novos30, vencidos, vencendo7 }
}

/**
 * UUIDs aprovados para backfill controlado (ADMIN.2.5).
 * Qualquer SQL/script de backfill deve restringir-se a este conjunto.
 */
export const BACKFILL_PERFIS_CONNECT_APROVADOS = [
  {
    key: 'BIRA_MOVEIS',
    perfilId: 'dd1f6a30-73a4-459f-9335-96dc56523089',
    email: 'biramoveisrusticosrn2025@gmail.com',
  },
  {
    key: 'GUEDES_MOVEIS',
    perfilId: 'eda88f6d-1417-4ade-9d79-4ea50ea4c6b6',
    email: 'gmmoveisplanejadoss@gmail.com',
  },
  {
    key: 'SAMYR_GOIANINHA',
    perfilId: '3ec1947d-2ec0-4d96-8d15-2a11da10ea70',
    email: 'samygoaninha@gmail.com',
  },
] as const

export function backfillRestritoAosUuidsAprovados(ids: string[]): boolean {
  const allowed = new Set<string>(BACKFILL_PERFIS_CONNECT_APROVADOS.map((x) => x.perfilId))
  return ids.length > 0 && ids.every((id) => allowed.has(id)) && ids.length <= allowed.size
}

export function umClientePodeTerVariosSistemas(): boolean {
  return true
}

/** Labels comerciais (UI). Valores persistidos: connect | terceiro. */
export function labelOrigemSistemaBadge(origem: string): string {
  const o = String(origem || '').toLowerCase()
  if (o === 'connect') return 'PRÓPRIO'
  if (o === 'terceiro') return 'TERCEIRO'
  return o ? o.toUpperCase() : '—'
}

export function labelOrigemSistemaLista(origem: string): string {
  const o = String(origem || '').toLowerCase()
  if (o === 'connect') return 'PRÓPRIO (CONNECT)'
  if (o === 'terceiro') return 'TERCEIRO / REVENDIDO'
  return o ? o.toUpperCase() : '—'
}

export function labelOrigemSistemaFormOption(origem: 'connect' | 'terceiro'): string {
  return origem === 'connect' ? 'Próprio (Connect)' : 'Terceiro / Revendido'
}
