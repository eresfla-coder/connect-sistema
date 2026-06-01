import { CONNECT_CLOUD_KEYS, readLocalCloudPayload, applyCloudPayloadToLocal, type ConnectCloudPayload } from '@/lib/connect-cloud-storage'
import { CONTRATOS_STORAGE_KEY } from '@/lib/contratosPersistencia'

export const CONNECT_BACKUP_VERSION = '1.0'
export const BACKUP_EXTRA_KEYS = [CONTRATOS_STORAGE_KEY] as const
export const MAX_BACKUPS_PER_USER = 15

export type ConnectBackupDados = {
  clientes: unknown
  produtos: unknown
  categorias: unknown
  formas_pagamento: unknown
  orcamentos: unknown
  ordens_servico: unknown
  recibos: unknown
  contratos: unknown
  configuracoes: unknown
  connect_cloud: ConnectCloudPayload
}

export type ConnectBackupPayload = {
  versao: string
  user_id: string
  created_at: string
  dados: ConnectBackupDados
}

function parseJsonLocal(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Monta payload de backup a partir do localStorage (cliente). */
export function montarBackupLocal(userId: string): ConnectBackupPayload {
  const cloud = readLocalCloudPayload()
  const categorias = parseJsonLocal('connect_categorias')
  const formas = parseJsonLocal('connect_formas_pagamento')

  return {
    versao: CONNECT_BACKUP_VERSION,
    user_id: userId,
    created_at: new Date().toISOString(),
    dados: {
      clientes: cloud.connect_clientes ?? [],
      produtos: cloud.connect_produtos ?? [],
      categorias: categorias ?? cloud.connect_categorias ?? [],
      formas_pagamento: formas ?? cloud.connect_formas_pagamento ?? [],
      orcamentos: cloud.connect_orcamentos_salvos ?? [],
      ordens_servico: cloud.connect_ordens_servico_salvas ?? [],
      recibos: cloud.connect_recibos_salvos ?? [],
      contratos: parseJsonLocal(CONTRATOS_STORAGE_KEY) ?? [],
      configuracoes: cloud.connect_configuracoes ?? {},
      connect_cloud: cloud,
    },
  }
}

export function nomeArquivoBackup(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `connect-backup-${y}-${m}-${d}-${h}-${min}.json`
}

export function baixarBackupJson(payload: ConnectBackupPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivoBackup(new Date(payload.created_at || Date.now()))
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export type ValidacaoBackup = { ok: true; payload: ConnectBackupPayload } | { ok: false; message: string }

export function validarBackupJson(raw: unknown, userIdEsperado: string): ValidacaoBackup {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Arquivo inválido.' }
  const obj = raw as Record<string, unknown>
  const versao = String(obj.versao || '')
  if (!versao) return { ok: false, message: 'Backup sem versão.' }
  const user_id = String(obj.user_id || '')
  if (user_id && user_id !== userIdEsperado) {
    return { ok: false, message: 'Este backup pertence a outro usuário.' }
  }
  const dados = obj.dados
  if (!dados || typeof dados !== 'object') return { ok: false, message: 'Estrutura de dados inválida.' }
  const payload: ConnectBackupPayload = {
    versao,
    user_id: user_id || userIdEsperado,
    created_at: String(obj.created_at || new Date().toISOString()),
    dados: dados as ConnectBackupDados,
  }
  return { ok: true, payload }
}

/** Aplica backup no localStorage do navegador. */
export function aplicarBackupLocal(payload: ConnectBackupPayload) {
  if (typeof window === 'undefined') return
  const d = payload.dados
  const cloud: ConnectCloudPayload = {
    ...(d.connect_cloud || {}),
    connect_clientes: d.clientes ?? d.connect_cloud?.connect_clientes,
    connect_produtos: d.produtos ?? d.connect_cloud?.connect_produtos,
    connect_categorias: d.categorias ?? d.connect_cloud?.connect_categorias,
    connect_formas_pagamento: d.formas_pagamento ?? d.connect_cloud?.connect_formas_pagamento,
    connect_orcamentos_salvos: d.orcamentos ?? d.connect_cloud?.connect_orcamentos_salvos,
    connect_ordens_servico_salvas: d.ordens_servico ?? d.connect_cloud?.connect_ordens_servico_salvas,
    connect_recibos_salvos: d.recibos ?? d.connect_cloud?.connect_recibos_salvos,
    connect_configuracoes: d.configuracoes ?? d.connect_cloud?.connect_configuracoes,
  }
  for (const key of CONNECT_CLOUD_KEYS) {
    if (cloud[key] !== undefined && cloud[key] !== null) {
      window.localStorage.setItem(key, JSON.stringify(cloud[key]))
    }
  }
  if (d.categorias) window.localStorage.setItem('connect_categorias', JSON.stringify(d.categorias))
  if (d.formas_pagamento) window.localStorage.setItem('connect_formas_pagamento', JSON.stringify(d.formas_pagamento))
  if (d.contratos) window.localStorage.setItem(CONTRATOS_STORAGE_KEY, JSON.stringify(d.contratos))
  applyCloudPayloadToLocal(cloud)
}
