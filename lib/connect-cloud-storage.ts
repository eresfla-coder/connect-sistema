export const CONNECT_CLOUD_KEYS = [
  'connect_ordens_servico_salvas', 'connect_orcamentos_salvos', 'connect_orcamentos_excluidos', 'connect_clientes',
  'connect_produtos', 'connect_servicos', 'connect_categorias', 'connect_formas_pagamento',
  'connect_configuracoes', 'connect_vendas_salvas', 'connect_recibos_salvos',
  'connect_recibo_visualizacao', 'connect_financeiro_titulos', 'connect_financeiro_pagamentos',
] as const

export type ConnectCloudKey = (typeof CONNECT_CLOUD_KEYS)[number]
export type ConnectCloudPayload = Record<string, unknown>

export function isConnectCloudKey(key: string): key is ConnectCloudKey {
  return (CONNECT_CLOUD_KEYS as readonly string[]).includes(key)
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

function stableId(item: any): string | null {
  if (!item || typeof item !== 'object') return null
  const id = item.id ?? item.numero ?? item.codigo ?? item.email ?? item.telefone ?? item.nome
  return id === undefined || id === null ? null : String(id)
}

function itemTime(item: any): number {
  if (!item || typeof item !== 'object') return 0
  const value = item.atualizadoEm ?? item.updated_at ?? item.updatedAt ?? item.criadoEm ?? item.created_at ?? item.data ?? item.id
  const asNumber = Number(value)
  if (Number.isFinite(asNumber)) return asNumber
  const asDate = Date.parse(String(value || ''))
  return Number.isFinite(asDate) ? asDate : 0
}

export function mergeConnectValue(localValue: unknown, cloudValue: unknown): unknown {
  if (Array.isArray(localValue) || Array.isArray(cloudValue)) {
    const merged = new Map<string, any>()
    const add = (item: any, sourceOrder: number) => {
      const id = stableId(item) || `__sem_id_${sourceOrder}_${merged.size}`
      const current = merged.get(id)
      if (!current || itemTime(item) >= itemTime(current)) merged.set(id, item)
    }
    ;(Array.isArray(cloudValue) ? cloudValue : []).forEach((item, index) => add(item, index))
    ;(Array.isArray(localValue) ? localValue : []).forEach((item, index) => add(item, index + 100000))
    return Array.from(merged.values())
  }
  if (cloudValue && typeof cloudValue === 'object' && !Array.isArray(cloudValue)) {
    // Para configurações e objetos simples, a nuvem precisa ser a fonte oficial entre PCs.
    // Isso evita que um computador com localStorage vazio/antigo sobrescreva a empresa/logo do outro.
    return cloudValue
  }
  return cloudValue ?? localValue ?? null
}

export function readLocalCloudPayload(): ConnectCloudPayload {
  const payload: ConnectCloudPayload = {}
  if (typeof window === 'undefined') return payload
  for (const key of CONNECT_CLOUD_KEYS) {
    const parsed = parseJson(window.localStorage.getItem(key))
    if (parsed !== null && parsed !== undefined) payload[key] = parsed
  }
  return payload
}

export function applyCloudPayloadToLocal(payload: ConnectCloudPayload) {
  if (typeof window === 'undefined') return false
  let changed = false
  for (const key of CONNECT_CLOUD_KEYS) {
    const cloudValue = payload[key]
    if (cloudValue === undefined || cloudValue === null) continue
    const localRaw = window.localStorage.getItem(key)
    const localValue = parseJson(localRaw)
    const merged = mergeConnectValue(localValue, cloudValue)
    const nextRaw = JSON.stringify(merged)
    if (nextRaw !== localRaw) {
      window.localStorage.setItem(key, nextRaw)
      changed = true
    }
  }
  return changed
}
