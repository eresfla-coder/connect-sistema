'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import {
  aplicarBackupLocal,
  baixarBackupJson,
  montarBackupLocal,
  validarBackupJson,
  type ConnectBackupPayload,
} from '@/lib/backup-connect'
import { registrarLogSistema } from '@/lib/logs-sistema'

const AUTO_BACKUP_KEY = 'connect_auto_backup_enabled'
const LAST_AUTO_BACKUP_KEY = 'connect_last_auto_backup_date'

type BackupResumo = { id: string; created_at: string; versao: string; origem: string }

type Props = {
  cardStyle: React.CSSProperties
  buttonPrimary: React.CSSProperties
  labelStyle: React.CSSProperties
  isMobile: boolean
}

export default function BackupSegurancaPanel({ cardStyle, buttonPrimary, labelStyle, isMobile }: Props) {
  const [processando, setProcessando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [backupsNuvem, setBackupsNuvem] = useState<BackupResumo[]>([])
  const [autoBackup, setAutoBackup] = useState(true)
  const [ultimoPayload, setUltimoPayload] = useState<ConnectBackupPayload | null>(null)

  const obterToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }, [])

  const carregarLista = useCallback(async () => {
    const token = await obterToken()
    if (!token) return
    const res = await fetch('/api/backup', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json().catch(() => ({}))
    if (json.ok && Array.isArray(json.backups)) setBackupsNuvem(json.backups)
  }, [obterToken])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setAutoBackup(localStorage.getItem(AUTO_BACKUP_KEY) !== 'false')
    void carregarLista()
  }, [carregarLista])

  const executarBackupAutomatico = useCallback(async () => {
    if (!autoBackup || typeof window === 'undefined') return
    const hoje = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(LAST_AUTO_BACKUP_KEY) === hoje) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return

    const token = await obterToken()
    if (!token) return

    const payload = montarBackupLocal(user.id)
    await fetch('/api/backup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ origem: 'automatico', payload }),
    }).catch(() => null)

    localStorage.setItem(LAST_AUTO_BACKUP_KEY, hoje)
    void carregarLista()
  }, [autoBackup, carregarLista, obterToken])

  useEffect(() => {
    void executarBackupAutomatico()
  }, [executarBackupAutomatico])

  async function fazerBackupAgora() {
    setProcessando(true)
    setMensagem('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) throw new Error('Faça login novamente.')

      const token = await obterToken()
      const payload = montarBackupLocal(user.id)

      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem: 'manual', payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || 'Falha ao salvar backup na nuvem.')

      setUltimoPayload(payload)
      baixarBackupJson(payload)
      await registrarLogSistema(token, 'criou_backup', { modulo: 'backup' })
      setMensagem('Backup gerado e salvo na nuvem. Download iniciado.')
      void carregarLista()
    } catch (e: unknown) {
      setMensagem(e instanceof Error ? e.message : 'Erro ao criar backup.')
    } finally {
      setProcessando(false)
    }
  }

  function baixarUltimo() {
    if (ultimoPayload) {
      baixarBackupJson(ultimoPayload)
      return
    }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) return
      const payload = montarBackupLocal(user.id)
      baixarBackupJson(payload)
    })()
  }

  async function restaurarArquivo(file: File) {
    setProcessando(true)
    setMensagem('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) throw new Error('Faça login novamente.')

      const texto = await file.text()
      const raw = JSON.parse(texto)
      const validacao = validarBackupJson(raw, user.id)
      if (!validacao.ok) throw new Error('message' in validacao ? validacao.message : 'Backup inválido.')

      const confirmar = window.confirm(
        'Deseja substituir os dados atuais?\n\nTodos os dados locais serão substituídos pelo conteúdo deste backup.'
      )
      if (!confirmar) return

      const token = await obterToken()
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: validacao.payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || 'Falha ao restaurar na nuvem.')

      aplicarBackupLocal(validacao.payload)
      await registrarLogSistema(token, 'restaurou_backup', { modulo: 'backup' })
      setMensagem('Backup restaurado. Recarregue as páginas abertas para ver os dados atualizados.')
    } catch (e: unknown) {
      setMensagem(e instanceof Error ? e.message : 'Erro ao restaurar backup.')
    } finally {
      setProcessando(false)
    }
  }

  function toggleAutoBackup() {
    const next = !autoBackup
    setAutoBackup(next)
    localStorage.setItem(AUTO_BACKUP_KEY, next ? 'true' : 'false')
  }

  const btnSec = {
    minHeight: 44,
    borderRadius: 15,
    border: '1px solid #dbe3ef',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 900,
    padding: '0 18px',
    cursor: 'pointer',
  } as const

  return (
    <section style={cardStyle}>
      <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Backup e Segurança</h2>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
        Backup completo: clientes, produtos, categorias, formas de pagamento, orçamentos, OS, recibos, contratos e configurações.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={buttonPrimary} disabled={processando} onClick={() => void fazerBackupAgora()}>
          {processando ? 'Processando...' : 'Fazer Backup Agora'}
        </button>
        <button style={btnSec} disabled={processando} onClick={baixarUltimo}>
          Baixar Backup
        </button>
        <label style={{ ...btnSec, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          Restaurar Backup
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            disabled={processando}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void restaurarArquivo(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={autoBackup} onChange={toggleAutoBackup} />
        <span style={labelStyle}>Backup automático diário (nuvem, últimos 15)</span>
      </label>

      {mensagem ? (
        <p style={{ margin: '0 0 14px', color: '#15803d', fontWeight: 800 }}>{mensagem}</p>
      ) : null}

      {backupsNuvem.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Backups na nuvem</div>
          <div style={{ display: 'grid', gap: 8, maxHeight: isMobile ? 200 : 280, overflowY: 'auto' }}>
            {backupsNuvem.map((b) => (
              <div
                key={b.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#334155',
                }}
              >
                {new Date(b.created_at).toLocaleString('pt-BR')} — {b.origem} — v{b.versao}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
