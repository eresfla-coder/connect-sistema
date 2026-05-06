'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  applyCloudPayloadToLocal,
  readLocalCloudPayload,
  type ConnectCloudPayload,
} from '@/lib/connect-cloud-storage'

type Status = 'idle' | 'pulling' | 'pushing' | 'ok' | 'error' | 'offline'

const PULLED_KEY = 'connect_cloud_pull_once_v89'

function isLocalHost() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

async function pullCloud() {
  const token = await getAccessToken()
  if (!token) return { ok: false, message: 'Faça login para puxar dados do banco.' }

  const resp = await fetch('/api/connect-storage', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  })

  const json = await resp.json().catch(() => null)
  if (!resp.ok || !json?.ok) {
    return { ok: false, message: json?.message || 'Não foi possível puxar dados do banco.' }
  }

  const changed = applyCloudPayloadToLocal((json.data || {}) as ConnectCloudPayload)
  try {
    window.dispatchEvent(new CustomEvent('connect-cloud-hydrated', { detail: { changed } }))
    window.dispatchEvent(new Event('connect-local-saved'))
  } catch {}

  return { ok: true, changed }
}

async function pushCloud() {
  const token = await getAccessToken()
  if (!token) return { ok: false, message: 'Faça login para salvar no banco.' }

  const data = readLocalCloudPayload()
  if (!Object.keys(data).length) return { ok: false, message: 'Nenhum dado local encontrado para salvar.' }

  const resp = await fetch('/api/connect-storage', {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  })

  const json = await resp.json().catch(() => null)
  if (!resp.ok || !json?.ok) {
    return { ok: false, message: json?.message || 'Não foi possível salvar no banco.' }
  }

  return { ok: true, saved: json.saved || 0 }
}

export default function CloudSyncClient() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('Banco leve ativado')
  const [visible, setVisible] = useState(false)
  const runningRef = useRef(false)

  const shouldShow = useMemo(() => {
    if (typeof window === 'undefined') return false
    const path = window.location.pathname
    return !path.startsWith('/view') && !path.startsWith('/impressao') && !path.startsWith('/api')
  }, [])

  async function runPull(auto = false) {
    if (runningRef.current) return
    runningRef.current = true
    setStatus('pulling')
    setMessage('Puxando dados do banco...')
    try {
      const result: any = await pullCloud()
      if (result.ok) {
        setStatus('ok')
        setMessage(result.changed ? 'Dados do banco carregados.' : 'Banco já estava igual ao local.')
        try { sessionStorage.setItem(PULLED_KEY, '1') } catch {}
        if (result.changed && !auto) window.location.reload()
      } else {
        setStatus('offline')
        setMessage(result.message || 'Banco indisponível agora.')
      }
    } catch (error: any) {
      setStatus('error')
      setMessage(error?.message || 'Falha ao puxar dados.')
    } finally {
      runningRef.current = false
      window.setTimeout(() => setStatus('idle'), 3500)
    }
  }

  async function runPush() {
    if (runningRef.current) return
    runningRef.current = true
    setStatus('pushing')
    setMessage('Salvando dados no banco...')
    try {
      const result: any = await pushCloud()
      if (result.ok) {
        setStatus('ok')
        setMessage(`Salvo no banco (${result.saved || 0} grupos).`)
      } else {
        setStatus('offline')
        setMessage(result.message || 'Banco indisponível agora.')
      }
    } catch (error: any) {
      setStatus('error')
      setMessage(error?.message || 'Falha ao salvar dados.')
    } finally {
      runningRef.current = false
      window.setTimeout(() => setStatus('idle'), 3500)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!shouldShow) return

    const alreadyPulled = (() => {
      try { return sessionStorage.getItem(PULLED_KEY) === '1' } catch { return false }
    })()

    // Leitura única e leve. Não intercepta localStorage e não roda em loop.
    const timer = window.setTimeout(() => {
      if (!alreadyPulled) runPull(true).catch(() => {})
    }, isLocalHost() ? 1200 : 700)

    const onSaveNow = () => runPush().catch(() => {})
    const onPullNow = () => runPull(false).catch(() => {})
    window.addEventListener('connect-cloud-save-now', onSaveNow)
    window.addEventListener('connect-cloud-pull-now', onPullNow)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('connect-cloud-save-now', onSaveNow)
      window.removeEventListener('connect-cloud-pull-now', onPullNow)
    }
  }, [shouldShow])

  if (!shouldShow) return null

  return (
    <div style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 2147483000, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      {visible ? (
        <div style={{ width: 245, borderRadius: 18, padding: 12, background: 'rgba(15,23,42,.94)', color: '#fff', boxShadow: '0 18px 45px rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Banco leve</strong>
            <button onClick={() => setVisible(false)} style={{ background: 'transparent', color: '#cbd5e1', border: 0, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 10 }}>{message}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={status === 'pulling' || status === 'pushing'} onClick={() => runPull(false)} style={{ flex: 1, border: 0, borderRadius: 12, padding: '8px 9px', fontWeight: 800, cursor: 'pointer', background: '#e2e8f0', color: '#0f172a', fontSize: 11 }}>Puxar</button>
            <button disabled={status === 'pulling' || status === 'pushing'} onClick={runPush} style={{ flex: 1, border: 0, borderRadius: 12, padding: '8px 9px', fontWeight: 800, cursor: 'pointer', background: '#22c55e', color: '#052e16', fontSize: 11 }}>Salvar</button>
          </div>
        </div>
      ) : (
        <button title="Banco leve" onClick={() => setVisible(true)} style={{ width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(15,23,42,.92)', color: '#fff', boxShadow: '0 12px 34px rgba(0,0,0,.28)', cursor: 'pointer', fontWeight: 900 }}>
          ☁
        </button>
      )}
    </div>
  )
}
