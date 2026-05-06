'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

type LeadStatus = 'quente' | 'acompanhar' | 'aguardando' | 'cobrar' | 'concluido'

type ClienteCRM = {
  id?: string | number
  nome?: string
  telefone?: string
  email?: string
  endereco?: string
}

type AcaoCRM = {
  id: string
  tipo: 'orcamento' | 'os' | 'financeiro' | 'cliente'
  status: LeadStatus
  titulo: string
  cliente: string
  telefone: string
  valor: number
  data?: string
  descricao: string
  prioridade: number
  mensagem: string
  origemId?: string | number
}

const CLIENTES_KEY = 'connect_clientes'
const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const OS_KEY = 'connect_ordens_servico_salvas'
const FINANCEIRO_KEY = 'connect_financeiro_titulos'

function moeda(valor?: number | null) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBR(data?: string | null) {
  if (!data) return '-'
  const limpa = String(data).slice(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpa)) return limpa
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpa)) {
    const [ano, mes, dia] = limpa.split('-')
    return `${dia}/${mes}/${ano}`
  }
  return String(data)
}

function diasDesde(data?: string | null) {
  if (!data) return 0
  let d: Date
  const texto = String(data).slice(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const [dia, mes, ano] = texto.split('/')
    d = new Date(Number(ano), Number(mes) - 1, Number(dia))
  } else {
    d = new Date(texto)
  }
  if (Number.isNaN(d.getTime())) return 0
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - d.getTime()) / 86400000)
}

function normalizarTelefone(numero?: string | null) {
  const digitos = String(numero || '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.startsWith('55')) return digitos
  if (digitos.length >= 10) return `55${digitos}`
  return digitos
}

function abrirWhatsApp(telefone: string, mensagem: string) {
  const tel = normalizarTelefone(telefone)
  if (!tel) {
    alert('Este cliente não tem telefone cadastrado.')
    return
  }
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener,noreferrer')
}

function lerLista(chave: string) {
  try {
    const raw = localStorage.getItem(chave)
    const lista = raw ? JSON.parse(raw) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function statusColor(status: LeadStatus) {
  if (status === 'quente') return '#22c55e'
  if (status === 'cobrar') return '#ef4444'
  if (status === 'aguardando') return '#f59e0b'
  if (status === 'concluido') return '#2563eb'
  return '#64748b'
}

function statusLabel(status: LeadStatus) {
  const mapa: Record<LeadStatus, string> = {
    quente: 'Quente',
    acompanhar: 'Acompanhar',
    aguardando: 'Aguardando',
    cobrar: 'Cobrar',
    concluido: 'Concluído',
  }
  return mapa[status]
}

export default function CRMWhatsappPage() {
  const [clientes, setClientes] = useState<ClienteCRM[]>([])
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [ordens, setOrdens] = useState<any[]>([])
  const [financeiro, setFinanceiro] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'todos' | LeadStatus>('todos')
  const [busca, setBusca] = useState('')

  function carregar() {
    setClientes(lerLista(CLIENTES_KEY))
    setOrcamentos(lerLista(ORCAMENTOS_KEY))
    setOrdens(lerLista(OS_KEY))
    setFinanceiro(lerLista(FINANCEIRO_KEY))
  }

  useEffect(() => {
    carregar()
    window.addEventListener('focus', carregar)
    window.addEventListener('storage', carregar)
    return () => {
      window.removeEventListener('focus', carregar)
      window.removeEventListener('storage', carregar)
    }
  }, [])

  const acoes = useMemo<AcaoCRM[]>(() => {
    const lista: AcaoCRM[] = []

    orcamentos.forEach((orc) => {
      const status = String(orc.status || '').toLowerCase()
      const idade = diasDesde(orc.data)
      const cliente = orc.cliente?.nome || orc.clienteNome || 'Cliente não informado'
      const telefone = orc.cliente?.telefone || orc.telefone || ''
      const numero = orc.numero || orc.id || '-'
      const total = Number(orc.total || 0)

      if (!status.includes('aprov') && !status.includes('convert') && !status.includes('cancel')) {
        const leadStatus: LeadStatus = idade >= 3 ? 'quente' : 'aguardando'
        lista.push({
          id: `orc-${orc.id || numero}`,
          tipo: 'orcamento',
          status: leadStatus,
          titulo: `Orçamento ${numero}`,
          cliente,
          telefone,
          valor: total,
          data: orc.data,
          descricao: idade >= 3 ? `Orçamento parado há ${idade} dias` : 'Aguardando retorno do cliente',
          prioridade: idade >= 3 ? 95 : 60,
          origemId: orc.id,
          mensagem: `Olá ${cliente}! Tudo bem? Passando para acompanhar seu orçamento *${numero}* no valor de *${moeda(total)}*. Posso te ajudar com alguma dúvida ou já posso seguir com a aprovação?`,
        })
      }
    })

    ordens.forEach((os) => {
      const status = String(os.status || '').toLowerCase()
      const cliente = os.cliente || os.cliente_nome || 'Cliente'
      const telefone = os.telefone || os.cliente_telefone || ''
      const numero = os.numero || os.id || '-'
      const valor = Number(os.valor || os.total || os.saldo || 0)
      const pronta = status.includes('final') || status.includes('pronta') || status.includes('entregue')

      if (pronta) {
        lista.push({
          id: `os-${os.id || numero}`,
          tipo: 'os',
          status: 'concluido',
          titulo: `OS ${numero}`,
          cliente,
          telefone,
          valor,
          data: os.data || os.updated_at,
          descricao: 'Avisar cliente que a OS está pronta/finalizada',
          prioridade: 85,
          origemId: os.id,
          mensagem: `Olá ${cliente}! Sua ordem de serviço *${numero}* está pronta/finalizada. Valor: *${moeda(valor)}*. Pode passar aqui na loja quando for melhor para você.`,
        })
      } else if (status.includes('aguardando') || status.includes('aberta')) {
        lista.push({
          id: `os-acomp-${os.id || numero}`,
          tipo: 'os',
          status: 'acompanhar',
          titulo: `OS ${numero}`,
          cliente,
          telefone,
          valor,
          data: os.data || os.created_at,
          descricao: 'OS em acompanhamento',
          prioridade: 45,
          origemId: os.id,
          mensagem: `Olá ${cliente}! Passando para atualizar sua ordem de serviço *${numero}*. Assim que tivermos novidade, aviso por aqui.`,
        })
      }
    })

    financeiro.forEach((titulo) => {
      const status = String(titulo.status || '').toLowerCase()
      const valor = Number(titulo.valor || 0) - Number(titulo.valor_pago || titulo.valor_recebido || 0)
      if (valor <= 0 || status.includes('pago')) return

      const atraso = diasDesde(titulo.data_vencimento)
      const cliente = titulo.cliente_nome || titulo.cliente || 'Cliente'
      const telefone = titulo.cliente_telefone || titulo.telefone || ''
      const vencimento = dataBR(titulo.data_vencimento)
      const cobrar = status.includes('atras') || atraso > 0

      lista.push({
        id: `fin-${titulo.id}`,
        tipo: 'financeiro',
        status: cobrar ? 'cobrar' : 'aguardando',
        titulo: cobrar ? 'Cobrança em atraso' : 'Cobrança a vencer',
        cliente,
        telefone,
        valor,
        data: titulo.data_vencimento,
        descricao: cobrar ? `Vencido há ${Math.max(1, atraso)} dia(s)` : `Vence em ${vencimento}`,
        prioridade: cobrar ? 100 : 70,
        origemId: titulo.id,
        mensagem: `Olá ${cliente}! Consta um valor em aberto de *${moeda(valor)}* com vencimento em *${vencimento}*. Pode me confirmar a previsão de pagamento?`,
      })
    })

    const clientesComMovimento = new Set<string>()
    ;[...orcamentos, ...ordens, ...financeiro].forEach((item) => {
      const nome = item.cliente?.nome || item.cliente || item.cliente_nome || item.nome
      if (nome) clientesComMovimento.add(String(nome).toLowerCase().trim())
    })

    clientes.forEach((cliente) => {
      const nome = String(cliente.nome || '').trim()
      if (!nome) return
      if (!clientesComMovimento.has(nome.toLowerCase())) {
        lista.push({
          id: `cli-${cliente.id || nome}`,
          tipo: 'cliente',
          status: 'acompanhar',
          titulo: 'Cliente sem movimento',
          cliente: nome,
          telefone: cliente.telefone || '',
          valor: 0,
          descricao: 'Boa oportunidade para reativação',
          prioridade: 30,
          origemId: cliente.id,
          mensagem: `Olá ${nome}! Tudo bem? Passando para lembrar que a Connect está à disposição para orçamentos, assistência e novos pedidos.`,
        })
      }
    })

    return lista.sort((a, b) => b.prioridade - a.prioridade)
  }, [clientes, orcamentos, ordens, financeiro])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return acoes.filter((acao) => {
      const passaStatus = filtro === 'todos' || acao.status === filtro
      const passaBusca = !termo || `${acao.cliente} ${acao.titulo} ${acao.descricao}`.toLowerCase().includes(termo)
      return passaStatus && passaBusca
    })
  }, [acoes, filtro, busca])

  const resumo = useMemo(() => ({
    total: acoes.length,
    cobrar: acoes.filter((a) => a.status === 'cobrar').length,
    quentes: acoes.filter((a) => a.status === 'quente').length,
    valor: acoes.reduce((s, a) => s + Number(a.valor || 0), 0),
  }), [acoes])

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.kicker}>CRM + Automação WhatsApp</div>
          <h1 style={styles.title}>Central Inteligente de Relacionamento</h1>
          <p style={styles.subtitle}>Orçamentos parados, OS prontas, cobranças e reativação em uma tela só.</p>
        </div>
        <button onClick={carregar} style={styles.refresh}>Atualizar</button>
      </section>

      <section style={styles.metrics}>
        <Metric label="Ações sugeridas" value={String(resumo.total)} />
        <Metric label="Cobranças" value={String(resumo.cobrar)} tone="#ef4444" />
        <Metric label="Leads quentes" value={String(resumo.quentes)} tone="#22c55e" />
        <Metric label="Valor em jogo" value={moeda(resumo.valor)} tone="#2563eb" />
      </section>

      <section style={styles.filters}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, orçamento, OS..." style={styles.search} />
        <div style={styles.chips}>
          {(['todos', 'quente', 'cobrar', 'aguardando', 'acompanhar', 'concluido'] as const).map((item) => (
            <button key={item} onClick={() => setFiltro(item as any)} style={{ ...styles.chip, ...(filtro === item ? styles.chipActive : {}) }}>
              {item === 'todos' ? 'Todos' : statusLabel(item as LeadStatus)}
            </button>
          ))}
        </div>
      </section>

      <section style={styles.grid}>
        {filtradas.length === 0 ? (
          <div style={styles.empty}>Nenhuma automação encontrada para este filtro.</div>
        ) : filtradas.map((acao) => (
          <article key={acao.id} style={styles.card}>
            <div style={styles.cardTop}>
              <div>
                <span style={{ ...styles.badge, background: statusColor(acao.status) }}>{statusLabel(acao.status)}</span>
                <h3 style={styles.cardTitle}>{acao.titulo}</h3>
                <div style={styles.client}>{acao.cliente}</div>
              </div>
              <div style={styles.value}>{acao.valor > 0 ? moeda(acao.valor) : 'Contato'}</div>
            </div>

            <p style={styles.desc}>{acao.descricao}</p>
            <div style={styles.meta}>Data: {dataBR(acao.data)} • Origem: {acao.tipo.toUpperCase()}</div>

            <div style={styles.preview}>{acao.mensagem}</div>

            <div style={styles.actions}>
              <button onClick={() => abrirWhatsApp(acao.telefone, acao.mensagem)} style={styles.primary}>Enviar WhatsApp</button>
              <button onClick={() => navigator.clipboard?.writeText(acao.mensagem)} style={styles.secondary}>Copiar texto</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

function Metric({ label, value, tone = '#0f172a' }: { label: string; value: string; tone?: string }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: tone }}>{value}</div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', padding: '28px', background: 'linear-gradient(180deg,#f4f7fb,#eef4ff)', color: '#0f172a' },
  hero: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', padding: 24, borderRadius: 28, background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', color: '#fff', boxShadow: '0 24px 60px rgba(15,23,42,.20)', flexWrap: 'wrap' },
  kicker: { fontSize: 12, fontWeight: 950, letterSpacing: 1.8, textTransform: 'uppercase', color: '#bfdbfe' },
  title: { margin: '6px 0', fontSize: 'clamp(30px,5vw,52px)', lineHeight: .95, fontWeight: 950 },
  subtitle: { margin: 0, color: '#dbeafe', fontWeight: 700 },
  refresh: { border: 0, borderRadius: 18, padding: '13px 18px', fontWeight: 950, background: '#fff', color: '#1d4ed8', cursor: 'pointer' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginTop: 18 },
  metric: { borderRadius: 22, background: '#fff', padding: 18, boxShadow: '0 12px 30px rgba(15,23,42,.08)', border: '1px solid rgba(148,163,184,.25)' },
  metricLabel: { color: '#64748b', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  metricValue: { marginTop: 6, fontWeight: 950, fontSize: 24 },
  filters: { marginTop: 18, display: 'grid', gap: 12, padding: 14, borderRadius: 22, background: 'rgba(255,255,255,.82)', border: '1px solid rgba(148,163,184,.25)' },
  search: { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 16, padding: '14px 16px', fontWeight: 800, outline: 'none', fontSize: 15 },
  chips: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 },
  chip: { border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 999, padding: '10px 14px', fontWeight: 900, whiteSpace: 'nowrap', cursor: 'pointer' },
  chipActive: { background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' },
  grid: { marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))', gap: 16 },
  empty: { borderRadius: 22, background: '#fff', padding: 28, fontWeight: 900, color: '#64748b' },
  card: { borderRadius: 26, background: '#fff', padding: 18, boxShadow: '0 16px 34px rgba(15,23,42,.10)', border: '1px solid rgba(148,163,184,.22)', minWidth: 0 },
  cardTop: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  badge: { display: 'inline-flex', color: '#fff', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: .8 },
  cardTitle: { margin: '10px 0 4px', fontSize: 20, lineHeight: 1.1, fontWeight: 950 },
  client: { color: '#475569', fontWeight: 900 },
  value: { fontWeight: 950, color: '#0f172a', whiteSpace: 'nowrap', fontSize: 15 },
  desc: { color: '#334155', fontWeight: 800, margin: '14px 0 6px' },
  meta: { color: '#64748b', fontWeight: 800, fontSize: 12 },
  preview: { marginTop: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 18, padding: 12, color: '#334155', fontWeight: 700, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.45 },
  actions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 },
  primary: { border: 0, borderRadius: 16, padding: '12px 14px', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 950, cursor: 'pointer' },
  secondary: { border: '1px solid #cbd5e1', borderRadius: 16, padding: '12px 14px', background: '#fff', color: '#334155', fontWeight: 950, cursor: 'pointer' },
}
