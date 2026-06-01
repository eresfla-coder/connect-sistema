import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { CONNECT_CLOUD_KEYS } from '@/lib/connect-cloud-storage'
import { CONNECT_BACKUP_VERSION, MAX_BACKUPS_PER_USER, type ConnectBackupPayload } from '@/lib/backup-connect'

const CONTRATOS_KEY = 'connect_contratos'

export async function coletarBackupUsuario(userId: string): Promise<ConnectBackupPayload> {
  const supabase = getSupabaseAdmin()
  const cloud: Record<string, unknown> = {}

  const { data: storageRows } = await supabase
    .from('connect_storage')
    .select('storage_key,payload')
    .eq('user_id', userId)
    .in('storage_key', [...CONNECT_CLOUD_KEYS, CONTRATOS_KEY])

  for (const row of storageRows || []) {
    cloud[row.storage_key] = row.payload
  }

  const [orcRes, osRes, cfgRes] = await Promise.all([
    supabase.from('orcamentos').select('*').eq('user_id', userId),
    supabase.from('ordens_servico').select('*').eq('user_id', userId),
    supabase.from('configuracoes_empresa').select('*').eq('user_id', userId).maybeSingle(),
  ])

  let cliRes = await supabase.from('clientes').select('*').eq('user_id', userId)
  if (cliRes.error) {
    cliRes = await supabase.from('clientes').select('*')
  }

  const orcamentos = orcRes.data || cloud.connect_orcamentos_salvos || []
  const ordens = osRes.data || cloud.connect_ordens_servico_salvas || []
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
      orcamentos,
      ordens_servico: ordens,
      recibos: cloud.connect_recibos_salvos ?? [],
      contratos: cloud[CONTRATOS_KEY] ?? [],
      configuracoes,
      connect_cloud: cloud,
    },
  }
}

export async function salvarBackupNuvem(userId: string, payload: ConnectBackupPayload, origem: 'manual' | 'automatico' = 'manual') {
  const supabase = getSupabaseAdmin()
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

  const { data: todos } = await supabase
    .from('backups_usuario')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const ids = (todos || []).map((r) => r.id)
  if (ids.length > MAX_BACKUPS_PER_USER) {
    const excluir = ids.slice(MAX_BACKUPS_PER_USER)
    await supabase.from('backups_usuario').delete().in('id', excluir)
  }

  return data
}

export async function restaurarBackupNuvem(userId: string, payload: ConnectBackupPayload) {
  const supabase = getSupabaseAdmin()
  const d = payload.dados
  const cloud = d.connect_cloud || {}

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
    const { error } = await supabase.from('connect_storage').upsert(rows, { onConflict: 'user_id,storage_key' })
    if (error) throw error
  }

  if (d.configuracoes && typeof d.configuracoes === 'object' && !Array.isArray(d.configuracoes)) {
    const cfg = d.configuracoes as Record<string, unknown>
    await supabase.from('configuracoes_empresa').upsert(
      { user_id: userId, ...cfg, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  }

  if (Array.isArray(d.orcamentos) && d.orcamentos.length) {
    for (const item of d.orcamentos as Record<string, unknown>[]) {
      const local_id = String(item.local_id || item.id || '')
      if (!local_id) continue
      await supabase.from('orcamentos').upsert(
        {
          user_id: userId,
          local_id,
          payload: item.payload ?? item,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,local_id' }
      )
    }
  }

  if (Array.isArray(d.ordens_servico) && d.ordens_servico.length) {
    for (const item of d.ordens_servico as Record<string, unknown>[]) {
      const local_id = String(item.local_id || item.id || '')
      if (!local_id) continue
      await supabase.from('ordens_servico').upsert(
        {
          user_id: userId,
          local_id,
          payload: item.payload ?? item,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,local_id' }
      )
    }
  }
}
