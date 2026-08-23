/**
 * Classificação de uso de sessão (online / inativo / offline).
 * Tempos centralizados para Admin e APIs — sem polling agressivo.
 */

export const DEVICE_STORAGE_KEY = 'connect_device_id_v1'
export const DEVICE_LABEL_KEY = 'connect_device_label_v1'

/** Heartbeat / verificação: 5 minutos. */
export const SESSAO_HEARTBEAT_MS = 5 * 60 * 1000
/** Evita gravar last_seen se a atividade for mais recente que isto. */
export const SESSAO_MIN_WRITE_MS = 2 * 60 * 1000
/** 🟢 Online */
export const SESSAO_ONLINE_MS = 5 * 60 * 1000
/** 🟡 Inativo (depois de online, até este limite) */
export const SESSAO_INATIVO_MS = 30 * 60 * 1000

export const SEM_USO_7_DIAS_MS = 7 * 24 * 60 * 60 * 1000
export const SEM_USO_15_DIAS_MS = 15 * 24 * 60 * 60 * 1000
export const SEM_USO_30_DIAS_MS = 30 * 24 * 60 * 60 * 1000

export type StatusUsoSessao = 'online' | 'inativo' | 'offline'
export type FaixaSemUso = 'recente' | '7d' | '15d' | '30d' | 'nunca'

export type MotivoEncerramentoSessao = 'admin' | 'logout' | 'substituida' | 'inativa'

export function parsearUserAgent(ua?: string | null): {
  navegador: string
  sistemaOperacional: string
  dispositivo: string
} {
  const u = String(ua || '')

  let navegador = 'Navegador'
  if (/Edg\//i.test(u)) navegador = 'Edge'
  else if (/OPR\/|Opera/i.test(u)) navegador = 'Opera'
  else if (/Chrome\//i.test(u) && !/Chromium/i.test(u)) navegador = 'Chrome'
  else if (/Safari/i.test(u) && !/Chrome/i.test(u)) navegador = 'Safari'
  else if (/Firefox/i.test(u)) navegador = 'Firefox'
  else if (/SamsungBrowser/i.test(u)) navegador = 'Samsung Internet'

  let sistemaOperacional = 'Desconhecido'
  if (/Windows NT/i.test(u)) sistemaOperacional = 'Windows'
  else if (/Android/i.test(u)) sistemaOperacional = 'Android'
  else if (/iPhone|iPad|iPod/i.test(u)) sistemaOperacional = 'iOS'
  else if (/Mac OS X/i.test(u)) sistemaOperacional = 'Mac'
  else if (/Linux/i.test(u)) sistemaOperacional = 'Linux'

  let dispositivo = 'Computador'
  if (/iPad|Tablet/i.test(u)) dispositivo = 'Tablet'
  else if (/Mobile|iPhone|Android/i.test(u)) dispositivo = 'Celular'

  return { navegador, sistemaOperacional, dispositivo }
}

export function classificarStatusSessao(opts: {
  lastSeenAt?: string | null
  ativo?: boolean | null
  now?: number
}): StatusUsoSessao {
  if (opts.ativo === false) return 'offline'
  const t = opts.lastSeenAt ? Date.parse(opts.lastSeenAt) : NaN
  if (!Number.isFinite(t)) return 'offline'
  const delta = (opts.now ?? Date.now()) - t
  if (delta <= SESSAO_ONLINE_MS) return 'online'
  if (delta <= SESSAO_INATIVO_MS) return 'inativo'
  return 'offline'
}

export function classificarFaixaSemUso(lastSeenAt?: string | null, now = Date.now()): FaixaSemUso {
  if (!lastSeenAt) return 'nunca'
  const t = Date.parse(lastSeenAt)
  if (!Number.isFinite(t)) return 'nunca'
  const delta = now - t
  if (delta >= SEM_USO_30_DIAS_MS) return '30d'
  if (delta >= SEM_USO_15_DIAS_MS) return '15d'
  if (delta >= SEM_USO_7_DIAS_MS) return '7d'
  return 'recente'
}

export function rotuloStatusSessao(status: StatusUsoSessao) {
  if (status === 'online') return '🟢 Online'
  if (status === 'inativo') return '🟡 Inativo'
  return '⚫ Offline'
}

export function formatarQuando(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function mensagemEncerramentoSessao(motivo?: string | null) {
  if (motivo === 'admin') return 'Sua sessão foi encerrada pelo administrador.'
  if (motivo === 'logout') return 'Sua sessão foi encerrada.'
  return 'Sua conta foi acessada em outro dispositivo. Por segurança, esta sessão foi encerrada.'
}
