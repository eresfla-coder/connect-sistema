'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import type { FiltroCadastro, ResumoCadastros } from '@/lib/cadastros-publicos'

type Item = {
  userId: string
  criadoEm: string
  email: string | null
  status: string | null
  vencimento: string | null
  rotulo: string
}

type Resposta = {
  ok?: boolean
  code?: string
  error?: string
  resumo?: ResumoCadastros
  page?: number
  pages?: number
  totalFiltrado?: number
  itens?: Item[]
}

const FILTROS: Array<{ id: FiltroCadastro; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'teste_ativo', label: 'Teste ativo' },
  { id: 'teste_vencido', label: 'Teste vencido' },
  { id: 'convertido', label: 'Na carteira' },
  { id: 'pagante', label: 'Pagantes' },
  { id: 'fora_de_teste', label: 'Fora do teste' },
]

function dataCurta(valor: string) {
  const dia = String(valor || '').slice(0, 10)
  const [ano, mes, diaMes] = dia.split('-')
  if (!ano || !mes || !diaMes) return dia || '—'
  return `${diaMes}/${mes}/${ano}`
}

export default function CadastrosPublicosPanel() {
  const [resumo, setResumo] = useState<ResumoCadastros | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [filtro, setFiltro] = useState<FiltroCadastro>('todos')
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [totalFiltrado, setTotalFiltrado] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async (pagina: number, filtroAtual: FiltroCadastro, termo: string) => {
    setLoading(true)
    setErro('')
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''
    if (!token) {
      setErro('Sessão administrativa ausente.')
      setLoading(false)
      return
    }
    const params = new URLSearchParams({
      page: String(pagina),
      pageSize: '20',
      filtro: filtroAtual,
    })
    if (termo.trim()) params.set('q', termo.trim())
    const res = await fetch(`/api/admin/cadastros-publicos?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = (await res.json().catch(() => ({}))) as Resposta
    if (!res.ok || !json.ok) {
      setResumo(null)
      setItens([])
      setErro(
        json.code === 'TABELA_AUSENTE'
          ? 'A migração de cadastros públicos ainda não foi aplicada.'
          : json.error || 'Não foi possível carregar os cadastros.',
      )
      setLoading(false)
      return
    }
    setResumo(json.resumo || null)
    setItens(json.itens || [])
    setPage(json.page || 1)
    setPages(json.pages || 1)
    setTotalFiltrado(json.totalFiltrado || 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    void carregar(page, filtro, busca)
  }, [carregar, page, filtro, busca])

  const cartoes = [
    ['Cadastros', resumo?.total ?? 0, '#93c5fd'],
    ['Testes ativos', resumo?.testesAtivos ?? 0, '#facc15'],
    ['Testes vencidos', resumo?.testesVencidos ?? 0, '#fb7185'],
    ['Na carteira', resumo?.convertidos ?? 0, '#86efac'],
    ['Pagantes', resumo?.pagantes ?? 0, '#67e8f9'],
  ] as const

  return (
    <section style={{ borderRadius: 28, padding: 22, background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.14)' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 27, fontWeight: 950, color: '#fff' }}>Cadastros e Testes</h2>
        <p style={{ margin: '7px 0 0', color: '#cbd5e1', fontSize: 13 }}>
          Contas criadas pelo cadastro público. Esta lista não altera a carteira comercial.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {cartoes.map(([titulo, valor, cor]) => (
          <div key={titulo} style={{ borderRadius: 18, padding: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: '#bfdbfe', fontSize: 11, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase' }}>{titulo}</div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: cor }}>{loading ? '…' : valor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          value={busca}
          onChange={(event) => {
            setPage(1)
            setBusca(event.target.value)
          }}
          placeholder="Buscar por e-mail"
          style={{ height: 42, minWidth: 220, borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(248,250,252,0.08)', color: '#fff', padding: '0 12px' }}
        />
        <select
          value={filtro}
          onChange={(event) => {
            setPage(1)
            setFiltro(event.target.value as FiltroCadastro)
          }}
          style={{ height: 42, borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: '#263244', color: '#fff', padding: '0 12px' }}
        >
          {FILTROS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>

      {erro ? <div style={{ padding: 16, borderRadius: 16, color: '#fecaca' }}>{erro}</div> : null}

      {!erro && !loading && itens.length === 0 ? (
        <div style={{ padding: 20, borderRadius: 16, color: '#cbd5e1' }}>Nenhum cadastro público neste filtro.</div>
      ) : null}

      {itens.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {itens.map((item) => (
            <div key={item.userId} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, padding: 12, borderRadius: 16, background: 'rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>E-mail</div>
                <div style={{ fontWeight: 800 }}>{item.email || 'Sem e-mail no perfil'}</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>Cadastro</div>
                <div>{dataCurta(item.criadoEm)}</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>Status</div>
                <div>{item.status || '—'}</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>Vencimento</div>
                <div>{item.vencimento ? dataCurta(item.vencimento) : '—'}</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>Situação</div>
                <div>{item.rotulo}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, color: '#cbd5e1' }}>
        <span>{totalFiltrado} no filtro · página {page} de {pages}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((atual) => Math.max(1, atual - 1))} style={{ height: 36, borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#fff', padding: '0 12px' }}>Anterior</button>
          <button type="button" disabled={page >= pages || loading} onClick={() => setPage((atual) => atual + 1)} style={{ height: 36, borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#fff', padding: '0 12px' }}>Próxima</button>
        </div>
      </div>
    </section>
  )
}
