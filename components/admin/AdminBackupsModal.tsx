'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { baixarBackupJson, type ConnectBackupPayload } from '@/lib/backup-connect'

type BackupResumo = { id: string; created_at: string; versao: string; origem: string }

type Props = {
  clienteId: string
  clienteNome: string
  onClose: () => void
}

export default function AdminBackupsModal({ clienteId, clienteNome, onClose }: Props) {
  const [backups, setBackups] = useState<BackupResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [mensagem, setMensagem] = useState('')

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    const t = await token()
    const res = await fetch(`/api/admin/backups?userId=${encodeURIComponent(clienteId)}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    const json = await res.json().catch(() => ({}))
    if (json.ok) setBackups(json.backups || [])
  }, [clienteId, token])

  useEffect(() => {
    void carregar().finally(() => setLoading(false))
  }, [carregar])

  async function baixar(backupId: string) {
    const t = await token()
    const res = await fetch(
      `/api/admin/backups?userId=${encodeURIComponent(clienteId)}&backupId=${encodeURIComponent(backupId)}`,
      { headers: { Authorization: `Bearer ${t}` } }
    )
    const json = await res.json().catch(() => ({}))
    if (!json.ok || !json.backup?.payload) {
      setMensagem(json.message || 'Não foi possível baixar.')
      return
    }
    baixarBackupJson(json.backup.payload as ConnectBackupPayload)
  }

  async function restaurar(backupId: string) {
    if (!confirm(`Restaurar backup de ${clienteNome}? Os dados atuais do cliente serão substituídos.`)) return
    const t = await token()
    const res = await fetch('/api/admin/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: clienteId, backupId }),
    })
    const json = await res.json().catch(() => ({}))
    setMensagem(json.ok ? 'Backup restaurado na nuvem.' : json.message || 'Falha ao restaurar.')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(15,23,42,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          overflow: 'auto',
          borderRadius: 20,
          padding: 20,
          background: 'linear-gradient(135deg,#334155,#1e293b)',
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#fff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>Backups — {clienteNome}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {mensagem ? <p style={{ color: '#86efac', fontWeight: 800 }}>{mensagem}</p> : null}
        {loading ? <p>Carregando...</p> : null}
        {!loading && backups.length === 0 ? <p style={{ color: '#cbd5e1' }}>Nenhum backup na nuvem.</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {backups.map((b) => (
            <div
              key={b.id}
              style={{
                padding: 12,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                {new Date(b.created_at).toLocaleString('pt-BR')} — {b.origem}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => void baixar(b.id)}
                  style={{ height: 34, borderRadius: 999, border: 'none', padding: '0 12px', background: '#3b82f6', color: '#fff', fontWeight: 900, cursor: 'pointer' }}
                >
                  Baixar
                </button>
                <button
                  onClick={() => void restaurar(b.id)}
                  style={{ height: 34, borderRadius: 999, border: 'none', padding: '0 12px', background: '#16a34a', color: '#fff', fontWeight: 900, cursor: 'pointer' }}
                >
                  Restaurar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
