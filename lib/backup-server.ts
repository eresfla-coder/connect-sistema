import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { CONNECT_CLOUD_KEYS } from '@/lib/connect-cloud-storage'
import { CONNECT_BACKUP_VERSION, MAX_BACKUPS_PER_USER, type ConnectBackupPayload } from '@/lib/backup-connect'
import { withTimeout } from '@/lib/fetch-with-timeout'

const CONTRATOS_KEY = 'connect_contratos'

/** Orçamentos/OS mais recentes por usuário — evita backup infinito. */
export const MAX_BACKUP_ORCAMENTOS = 500
export const MAX_BACKUP_ORDENS = 500
export const BACKUP_PAGE_SIZE = 100
export const RESTORE_BATCH_SIZE = 25
export const BACKUP_OPERATION_TIMEOUT_MS = 8000

const ORC_COLS = 'local_id,payload,updated_at,created_at,user_id'
const OS_COLS = 'local_id,payload,updated_at,created_at,user_id'
const CLI_COLS = 'id,user_id,nome,telefone,email,documento,ativo,payload,updated_at,created_at'
const CFG_COLS =
  'user_id,nome_empresa,telefone,celular_empresa,whatsapp_empresa,email,endereco,cidade_uf,responsavel,logo_url,cor_primaria,cor_secundaria,updated_at'

export class BackupTimeoutError extends Error {
  constructor(message = 'Operação de backup demorou demais. Tente novamente em instantes.') {
    super(message)
    this.name = 'BackupTimeoutError'
  }
}

function criarDeadline(ms = BACKUP_OPERATION_TIMEOUT_MS) {
  const limite = Date.now() + ms
  return () => {
    if (Date.now() > limite) throw new BackupTimeoutError()
  }
}

async function fetchPaginado<T extends Record<string, unknown>>(
  tabela: 'orcamentos' | 'ordens_servico',
  userId: string,
  cols: string,
  maxRegistros: number,
  verificarTempo: () => void,
): Promise<T[]> {
  const supabase = getSupabaseAdmin()
  const resultados: T[] = []
  let offset = 0

  while (resultados.length < maxRegistros) {
    verificarTempo()

    const fim = Math.min(offset + BACKUP_PAGE_SIZE - 1, maxRegistros - 1)
    const { data, error } = await supabase
      .from(tabela)
      .select(cols)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, fim)

    if (error) throw error
    if (!data?.length) break

    resultados.push(...(data as unknown as T[]))
    if (data.length < BACKUP_PAGE_SIZE || resultados.length >= maxRegistros) break
    offset += BACKUP_PAGE_SIZE
  }

  return resultados.slice(0, maxRegistros)
}

async function upsertEmLotes(
  tabela: 'orcamentos' | 'ordens_servico',
  userId: string,
  itens: Record<string, unknown>[],
  verificarTempo: () => void,
) {
  if (!itens.length) return

  const supabase = getSupabaseAdmin()
  const rows = itens
    .map((item) => {
      const local_id = String(item.local_id || item.id || '')
      if (!local_id) return null
      return {
        user_id: userId,
        local_id,
        payload: item.payload ?? item,
        updated_at: new Date().toISOString(),
      }
    })
    .filter(Boolean) as Array<{
    user_id: string
    local_id: string
    payload: unknown
    updated_at: string
  }>

  for (let i = 0; i < rows.length; i += RESTORE_BATCH_SIZE) {
    verificarTempo()
    const lote = rows.slice(i, i + RESTORE_BATCH_SIZE)
    const { error } = await supabase.from(tabela).upsert(lote, { onConflict: 'user_id,local_id' })
    if (error) throw error
  }
}

export async function coletarBackupUsuario(userId: string): Promise<ConnectBackupPayload> {
  const verificarTempo = criarDeadline()
  const supabase = getSupabaseAdmin()
  const cloud: Record<string, unknown> = {}

  verificarTempo()
  const { data: storageRows } = await supabase
    .from('connect_storage')
    .select('storage_key,payload')
    .eq('user_id', userId)
    .in('storage_key', [...CONNECT_CLOUD_KEYS, CONTRATOS_KEY])

  for (const row of storageRows || []) {
    cloud[row.storage_key] = row.payload
  }

  verificarTempo()
  const [orcamentos, ordens, cfgRes] = await Promise.all([
    fetchPaginado<Record<string, unknown>>('orcamentos', userId, ORC_COLS, MAX_BACKUP_ORCAMENTOS, verificarTempo),
    fetchPaginado<Record<string, unknown>>('ordens_servico', userId, OS_COLS, MAX_BACKUP_ORDENS, verificarTempo),
    withTimeout(
      supabase.from('configuracoes_empresa').select(CFG_COLS).eq('user_id', userId).maybeSingle(),
      3000,
      () => ({ data: null, error: null }),
    ),
  ])

  verificarTempo()
  let cliRes = await withTimeout(
    supabase.from('clientes').select(CLI_COLS).eq('user_id', userId).limit(1000),
    3000,
    () => ({ data: null, error: { message: 'timeout_clientes' } } as { data: null; error: { message: string } }),
  )

  if (cliRes.error) {
    console.warn('[backup] clientes:', cliRes.error.message)
    cliRes = { data: cloud.connect_clientes || [], error: null } as typeof cliRes
  }

  const configuracoes = cfgRes.data || cloud.connect_configuracoes || {}
  const clientes = cliRes.data || cloud.connect_clientes || []

  return {
    versao: CONNECT_BACKUP_VERSION,
    user_id: userId,
    created_at: new Date().toISOString(),
    dados: {
      clientes,
      produtos: cloud.connect_produtos ?? [],
      categorias: cloud.connect_categorias ?? [],
      formas_pagamento: cloud.connect_formas_pagamento ?? [],
      orcamentos: orcamentos.length ? orcamentos : cloud.connect_orcamentos_salvos || [],
      ordens_servico: ordens.length ? ordens : cloud.connect_ordens_servico_salvas || [],
      recibos: cloud.connect_recibos_salvos ?? [],
      contratos: cloud[CONTRATOS_KEY] ?? [],
      configuracoes,
      connect_cloud: cloud,
    },
  }
}

export async function salvarBackupNuvem(userId: string, payload: ConnectBackupPayload, origem: 'manual' | 'automatico' = 'manual') {
  const verificarTempo = criarDeadline()
  const supabase = getSupabaseAdmin()

  verificarTempo()
  const { data, error } = await supabase
    .from('backups_usuario')
    .insert({
      user_id: userId,
      versao: payload.versao,
      origem,
      payload,
    })
    .select('id,created_at')
    .single()

  if (error) throw error

  verificarTempo()
  const { data: todos } = await supabase
    .from('backups_usuario')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_BACKUPS_PER_USER + 5)

  const ids = (todos || []).map((r) => r.id)
  if (ids.length > MAX_BACKUPS_PER_USER) {
    const excluir = ids.slice(MAX_BACKUPS_PER_USER)
    await supabase.from('backups_usuario').delete().in('id', excluir)
  }

  return data
}

export async function restaurarBackupNuvem(userId: string, payload: ConnectBackupPayload) {
  const verificarTempo = criarDeadline()
  const supabase = getSupabaseAdmin()
  const d = payload.dados
  const cloud = d.connect_cloud || {}

  const totalItens =
    (Array.isArray(d.orcamentos) ? d.orcamentos.length : 0) +
    (Array.isArray(d.ordens_servico) ? d.ordens_servico.length : 0)

  if (totalItens > MAX_BACKUP_ORCAMENTOS + MAX_BACKUP_ORDENS) {
    throw new BackupTimeoutError(
      'Backup muito grande para restaurar de uma vez. Divida o arquivo ou tente novamente com menos registros.',
    )
  }

  const keys = [...CONNECT_CLOUD_KEYS, CONTRATOS_KEY]
  const rows: { user_id: string; storage_key: string; payload: unknown; updated_at: string }[] = []

  const mapa: Record<string, unknown> = {
    connect_clientes: d.clientes,
    connect_produtos: d.produtos,
    connect_categorias: d.categorias,
    connect_formas_pagamento: d.formas_pagamento,
    connect_orcamentos_salvos: d.orcamentos,
    connect_ordens_servico_salvas: d.ordens_servico,
    connect_recibos_salvos: d.recibos,
    connect_configuracoes: d.configuracoes,
    [CONTRATOS_KEY]: d.contratos,
    ...cloud,
  }

  for (const key of keys) {
    if (mapa[key] !== undefined && mapa[key] !== null) {
      rows.push({
        user_id: userId,
        storage_key: key,
        payload: mapa[key],
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (rows.length) {
    verificarTempo()
    const { error } = await supabase.from('connect_storage').upsert(rows, { onConflict: 'user_id,storage_key' })
    if (error) throw error
  }

  if (d.configuracoes && typeof d.configuracoes === 'object' && !Array.isArray(d.configuracoes)) {
    verificarTempo()
    const cfg = d.configuracoes as Record<string, unknown>
    await supabase.from('configuracoes_empresa').upsert(
      { user_id: userId, ...cfg, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  }

  if (Array.isArray(d.orcamentos) && d.orcamentos.length) {
    await upsertEmLotes('orcamentos', userId, d.orcamentos as Record<string, unknown>[], verificarTempo)
  }

  if (Array.isArray(d.ordens_servico) && d.ordens_servico.length) {
    await upsertEmLotes('ordens_servico', userId, d.ordens_servico as Record<string, unknown>[], verificarTempo)
  }
}
