'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { labelOrigemSistemaFormOption, labelOrigemSistemaLista } from '@/lib/admin-carteira'

type SistemaAdmin = {
  id: string
  slug: string
  nome: string
  origem: 'connect' | 'terceiro'
  descricao?: string | null
  url?: string | null
  ativo: boolean
}

type Props = {
  isMobile?: boolean
}

export default function AdminSistemasPanel({ isMobile }: Props) {
  const [sistemas, setSistemas] = useState<SistemaAdmin[]>([])
  const [tablesReady, setTablesReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({
    nome: '',
    origem: 'connect' as 'connect' | 'terceiro',
    url: '',
    descricao: '',
  })

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão inválida.')

      const res = await fetch('/api/admin/sistemas', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await res.json()
      if (payload?.code === 'ADMIN_TABLES_NOT_READY' || res.status === 503) {
        setTablesReady(false)
        setSistemas([])
        return
      }
      if (!res.ok) throw new Error(payload?.error || 'Falha ao listar sistemas.')
      setTablesReady(true)
      setSistemas(Array.isArray(payload.sistemas) ? payload.sistemas : [])
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar sistemas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvarSistema() {
    if (!form.nome.trim()) {
      alert('Informe o nome do sistema.')
      return
    }
    try {
      setSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão inválida.')

      const res = await fetch('/api/admin/sistemas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: form.nome.trim(),
          origem: form.origem,
          url: form.url.trim() || null,
          descricao: form.descricao.trim() || null,
          ativo: true,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error || 'Não foi possível salvar.')
      setForm({ nome: '', origem: 'connect', url: '', descricao: '' })
      await carregar()
      alert('Sistema cadastrado.')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar sistema.')
    } finally {
      setSaving(false)
    }
  }

  async function alternarAtivo(sistema: SistemaAdmin) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão inválida.')

      const res = await fetch('/api/admin/sistemas', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: sistema.id, ativo: !sistema.ativo }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error || 'Falha ao atualizar.')
      await carregar()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar sistema.')
    }
  }

  if (!tablesReady) {
    return (
      <section style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
        <h2 style={styles.title}>Sistemas</h2>
        <p style={styles.sub}>O catálogo de sistemas ainda não está disponível neste ambiente.</p>
      </section>
    )
  }

  return (
    <section style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
      <div style={styles.top}>
        <div>
          <h2 style={styles.title}>Sistemas</h2>
          <p style={styles.sub}>Cadastre os produtos que você administra ou revende.</p>
        </div>
        <button style={styles.refresh} onClick={() => void carregar()} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {erro ? <div style={styles.erro}>{erro}</div> : null}

      <div style={styles.formGrid}>
        <label style={styles.label}>
          Nome
          <input
            style={styles.input}
            value={form.nome}
            onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
            placeholder="Ex.: Connect Sistema, Infostart"
          />
        </label>
        <label style={styles.label}>
          Origem
          <select
            style={styles.input}
            value={form.origem}
            onChange={(e) => setForm((p) => ({ ...p, origem: e.target.value as 'connect' | 'terceiro' }))}
          >
            <option value="connect">{labelOrigemSistemaFormOption('connect')}</option>
            <option value="terceiro">{labelOrigemSistemaFormOption('terceiro')}</option>
          </select>
        </label>
        <label style={styles.label}>
          URL do sistema (opcional)
          <input
            style={styles.input}
            value={form.url}
            onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
            placeholder="https://…"
          />
        </label>
        <label style={{ ...styles.label, gridColumn: '1 / -1' }}>
          Descrição (opcional)
          <input
            style={styles.input}
            value={form.descricao}
            onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
          />
        </label>
      </div>

      <button style={styles.save} onClick={() => void salvarSistema()} disabled={saving}>
        {saving ? 'Salvando…' : 'Cadastrar sistema'}
      </button>

      <div style={styles.list}>
        {sistemas.length === 0 && !loading ? (
          <div style={styles.empty}>Nenhum sistema cadastrado ainda.</div>
        ) : null}
        {sistemas.map((s) => (
          <div key={s.id} style={styles.row}>
            <div style={{ flex: 1 }}>
              <div style={styles.nome}>{s.nome}</div>
              <div style={styles.meta}>
                <span style={s.origem === 'connect' ? styles.badgeConnect : styles.badgeTerceiro}>
                  {labelOrigemSistemaLista(s.origem)}
                </span>
                <span style={s.ativo ? styles.badgeAtivo : styles.badgeInativo}>
                  {s.ativo ? 'Ativo' : 'Inativo'}
                </span>
                {s.url ? <small style={styles.url}>{s.url}</small> : null}
              </div>
            </div>
            <button style={styles.toggle} onClick={() => void alternarAtivo(s)}>
              {s.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    marginTop: 16,
    padding: 18,
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(15,23,42,0.72)',
  },
  panelMobile: { padding: 14 },
  top: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  title: { margin: 0, color: '#f8fafc', fontSize: 20, fontWeight: 900 },
  sub: { margin: '6px 0 0', color: '#94a3b8', fontSize: 13 },
  hint: { color: '#fbbf24', fontSize: 12 },
  refresh: {
    height: 36,
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0',
    padding: '0 14px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  erro: { color: '#fecaca', marginBottom: 10, fontSize: 13 },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
    marginBottom: 12,
  },
  label: { display: 'flex', flexDirection: 'column', gap: 6, color: '#cbd5e1', fontSize: 12, fontWeight: 700 },
  input: {
    height: 40,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(2,6,23,0.55)',
    color: '#f8fafc',
    padding: '0 12px',
  },
  save: {
    height: 42,
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg,#22c55e,#16a34a)',
    color: '#fff',
    fontWeight: 900,
    padding: '0 16px',
    cursor: 'pointer',
    marginBottom: 16,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  empty: { color: '#94a3b8', fontSize: 13 },
  row: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(2,6,23,0.35)',
  },
  nome: { color: '#f8fafc', fontWeight: 800, marginBottom: 6 },
  meta: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  badgeConnect: {
    fontSize: 11,
    fontWeight: 900,
    color: '#052e16',
    background: '#86efac',
    borderRadius: 999,
    padding: '2px 8px',
  },
  badgeTerceiro: {
    fontSize: 11,
    fontWeight: 900,
    color: '#1e1b4b',
    background: '#c4b5fd',
    borderRadius: 999,
    padding: '2px 8px',
  },
  badgeAtivo: { fontSize: 11, color: '#86efac', fontWeight: 700 },
  badgeInativo: { fontSize: 11, color: '#fca5a5', fontWeight: 700 },
  url: { color: '#64748b' },
  toggle: {
    height: 34,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0',
    padding: '0 12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
}
