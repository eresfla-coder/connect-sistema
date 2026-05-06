'use client'

import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type ClienteResumo = { nome?: string; telefone?: string }

type OrcamentoSalvo = {
  id: number
  numero?: string
  titulo?: string
  cliente?: ClienteResumo | null
  total?: number
  status?: string
  data?: string
  itens?: Array<{ descricao?: string; nome?: string; quantidade?: number; qtde?: number; subtotal?: number; total?: number }>
}

type OrdemServicoResumo = {
  id: number
  numero?: string
  cliente?: string
  equipamento?: string
  valor?: number
  saldo?: number
  status?: string
  prioridade?: string
  data?: string
}

type ProdutoResumo = {
  id: number
  nome?: string
  descricao?: string
  categoria?: string
  preco?: number
  custo?: number
  estoque?: number
  tipoCadastro?: string
  margemRealPct?: number
  lucroEstimado?: number
  precoSugerido?: number
  statusMargem?: string
  codigoBarras?: string
}

type ServicoResumo = {
  id: number
  nome?: string
  descricao?: string
  preco?: number
  valor?: number
  custo?: number
  categoria?: string
  statusMargem?: string
  margemRealPct?: number
  lucroEstimado?: number
  precoSugerido?: number
}

type ConfiguracaoSistema = {
  nomeEmpresa: string
  telefone: string
  email: string
  endereco: string
  cidadeUf: string
  responsavel: string
  logoUrl: string
}

type ResumoFinanceiro = { total: number; recebido: number; aberto: number; atrasado: number }
type TipoPainel = 'geral' | 'orcamentos' | 'os' | 'servicos'

type ItemPainel = {
  id: number
  numero: string
  cliente: string
  linha2: string
  status: string
  valor: number
  data: string
  mes: number
  tipo: 'orcamentos' | 'os' | 'servicos'
  href: string
}

const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const OS_KEY = 'connect_ordens_servico_salvas'
const CONFIG_KEY = 'connect_configuracoes'
const PRODUTOS_KEY = 'connect_produtos'
const SERVICOS_KEY = 'connect_servicos'

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numero(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR')
}

function normalizarTextoData(data: Date) {
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${dias[data.getDay()]}, ${String(data.getDate()).padStart(2, '0')} de ${meses[data.getMonth()]}`
}

function mesIndex(data?: string) {
  if (!data) return new Date().getMonth()
  const partes = String(data).split('/')
  if (partes.length === 3) {
    const idx = Number(partes[1]) - 1
    return Number.isFinite(idx) && idx >= 0 && idx <= 11 ? idx : new Date().getMonth()
  }
  const iso = new Date(String(data))
  return Number.isNaN(iso.getTime()) ? new Date().getMonth() : iso.getMonth()
}

function statusChip(status?: string) {
  const valor = String(status || '').toLowerCase()
  if (valor.includes('aprov')) return { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.30)', color: '#86efac' }
  if (valor.includes('convert')) return { bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.30)', color: '#93c5fd' }
  if (valor.includes('final') || valor.includes('entreg')) return { bg: 'rgba(14,165,233,0.14)', border: 'rgba(14,165,233,0.30)', color: '#7dd3fc' }
  if (valor.includes('andamento')) return { bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.30)', color: '#d8b4fe' }
  if (valor.includes('aberta') || valor.includes('pend')) return { bg: 'rgba(249,115,22,0.14)', border: 'rgba(249,115,22,0.30)', color: '#fdba74' }
  if (valor.includes('cancel') || valor.includes('recus')) return { bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.30)', color: '#fca5a5' }
  return { bg: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.24)', color: '#cbd5e1' }
}

function isFechado(item: ItemPainel) {
  const s = item.status.toLowerCase()
  if (item.tipo === 'orcamentos') return s.includes('aprov') || s.includes('convert')
  if (item.tipo === 'os') return s.includes('final') || s.includes('entreg')
  return !s.includes('ajustar')
}

function isAberto(item: ItemPainel) {
  const s = item.status.toLowerCase()
  if (item.tipo === 'orcamentos') return s.includes('pend') || s.includes('abert') || s.includes('enviado')
  if (item.tipo === 'os') return s.includes('aberta') || s.includes('andamento') || s.includes('aguard')
  return s.includes('ativo') || s.includes('ajustar')
}

function useLocalData<T>(key: string, fallback: T) {
  const [valor, setValor] = useState<T>(fallback)

  useEffect(() => {
    const carregar = () => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return setValor(fallback)
        const parsed = JSON.parse(raw)
        setValor(parsed)
      } catch {
        setValor(fallback)
      }
    }

    carregar()
    window.addEventListener('storage', carregar)
    window.addEventListener('connect-data-change', carregar)
    window.addEventListener('connect-cloud-updated', carregar as EventListener)
    return () => {
      window.removeEventListener('storage', carregar)
      window.removeEventListener('connect-data-change', carregar)
      window.removeEventListener('connect-cloud-updated', carregar as EventListener)
    }
  }, [key])

  return valor
}

export default function DashboardPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [horaAtual, setHoraAtual] = useState('')
  const [dataAtual, setDataAtual] = useState('')
  const [painel, setPainel] = useState<TipoPainel>('geral')
  const [busca, setBusca] = useState('')
  const [financeiro, setFinanceiro] = useState<ResumoFinanceiro>({ total: 0, recebido: 0, aberto: 0, atrasado: 0 })

  const orcamentosRaw = useLocalData<OrcamentoSalvo[]>(ORCAMENTOS_KEY, [])
  const osRaw = useLocalData<OrdemServicoResumo[]>(OS_KEY, [])
  const produtosRaw = useLocalData<ProdutoResumo[]>(PRODUTOS_KEY, [])
  const servicosRaw = useLocalData<ServicoResumo[]>(SERVICOS_KEY, [])
  const configRaw = useLocalData<Partial<ConfiguracaoSistema>>(CONFIG_KEY, {})

  const config: ConfiguracaoSistema = useMemo(() => ({
    nomeEmpresa: configRaw?.nomeEmpresa || 'CONNECT SISTEMAS',
    telefone: configRaw?.telefone || '',
    email: configRaw?.email || '',
    endereco: configRaw?.endereco || '',
    cidadeUf: configRaw?.cidadeUf || '',
    responsavel: configRaw?.responsavel || '',
    logoUrl: configRaw?.logoUrl || '',
  }), [configRaw])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 940)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const atualizar = () => {
      const agora = new Date()
      setHoraAtual(agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      setDataAtual(normalizarTextoData(agora))
    }
    atualizar()
    const timer = setInterval(atualizar, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let ativo = true
    async function carregarFinanceiro() {
      const { data, error } = await supabase.from('financeiro').select('*')
      if (error) return
      const resumo = ((data || []) as any[]).reduce(
        (acc, item) => {
          const valor = Number(item?.valor || 0)
          const pago = Number(item?.valor_pago ?? item?.valor_recebido ?? item?.pago ?? 0)
          const aberto = Math.max(valor - pago, 0)
          acc.total += valor
          acc.recebido += pago
          acc.aberto += aberto
          if (String(item?.status || '').toLowerCase() === 'atrasado') acc.atrasado += aberto
          return acc
        },
        { total: 0, recebido: 0, aberto: 0, atrasado: 0 }
      )
      if (ativo) setFinanceiro(resumo)
    }
    carregarFinanceiro()
    window.addEventListener('connect-financeiro-change', carregarFinanceiro as EventListener)
    return () => {
      ativo = false
      window.removeEventListener('connect-financeiro-change', carregarFinanceiro as EventListener)
    }
  }, [])

  const orcamentos = useMemo<ItemPainel[]>(() => {
    return (Array.isArray(orcamentosRaw) ? orcamentosRaw : [])
      .map((item) => ({
        id: Number(item.id || 0),
        numero: item.numero || String(item.id || ''),
        cliente: item.cliente?.nome || 'Orçamento flash',
        linha2: item.titulo || `${item.itens?.length || 0} item(ns) no orçamento`,
        status: item.status || 'Pendente',
        valor: Number(item.total || 0),
        data: item.data || '',
        mes: mesIndex(item.data),
        tipo: 'orcamentos' as const,
        href: '/orcamentos',
      }))
      .sort((a, b) => b.id - a.id)
  }, [orcamentosRaw])

  const ordens = useMemo<ItemPainel[]>(() => {
    return (Array.isArray(osRaw) ? osRaw : [])
      .map((item) => ({
        id: Number(item.id || 0),
        numero: item.numero || String(item.id || ''),
        cliente: item.cliente || 'Cliente não informado',
        linha2: item.equipamento || 'Ordem de serviço',
        status: item.status || 'Aberta',
        valor: Number(item.valor || item.saldo || 0),
        data: item.data || '',
        mes: mesIndex(item.data),
        tipo: 'os' as const,
        href: '/ordens-servico',
      }))
      .sort((a, b) => b.id - a.id)
  }, [osRaw])

  const servicos = useMemo<ItemPainel[]>(() => {
    const produtosServico = (Array.isArray(produtosRaw) ? produtosRaw : []).filter((p) => String(p.tipoCadastro || '').toLowerCase() === 'servico')
    const baseServicos = Array.isArray(servicosRaw) ? servicosRaw : []
    return [
      ...baseServicos.map((item) => ({
        id: Number(item.id || 0),
        numero: String(item.id || ''),
        cliente: item.nome || 'Serviço sem nome',
        linha2: item.categoria || item.descricao || 'Serviço cadastrado',
        status: item.statusMargem === 'risco' ? 'Ajustar margem' : 'Ativo',
        valor: Number(item.preco || item.valor || 0),
        data: '',
        mes: new Date().getMonth(),
        tipo: 'servicos' as const,
        href: '/produtos',
      })),
      ...produtosServico.map((item) => ({
        id: Number(item.id || 0),
        numero: String(item.id || ''),
        cliente: item.nome || 'Serviço sem nome',
        linha2: item.categoria || item.descricao || 'Serviço cadastrado em produtos',
        status: item.statusMargem === 'risco' ? 'Ajustar margem' : 'Ativo',
        valor: Number(item.preco || 0),
        data: '',
        mes: new Date().getMonth(),
        tipo: 'servicos' as const,
        href: '/produtos',
      })),
    ].sort((a, b) => b.id - a.id)
  }, [produtosRaw, servicosRaw])

  const todosItens = useMemo(() => [...orcamentos, ...ordens, ...servicos].sort((a, b) => b.id - a.id), [orcamentos, ordens, servicos])
  const itensAtivos = painel === 'orcamentos' ? orcamentos : painel === 'os' ? ordens : painel === 'servicos' ? servicos : todosItens

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = termo
      ? itensAtivos.filter((item) => [item.numero, item.cliente, item.linha2, item.status, String(item.valor)].join(' ').toLowerCase().includes(termo))
      : itensAtivos
    return lista.slice(0, 9)
  }, [busca, itensAtivos])

  const resumo = useMemo(() => {
    const valorOrcado = orcamentos.reduce((acc, item) => acc + item.valor, 0)
    const valorOS = ordens.reduce((acc, item) => acc + item.valor, 0)
    const valorServicos = servicos.reduce((acc, item) => acc + item.valor, 0)
    const aprovados = orcamentos.filter(isFechado)
    const abertas = ordens.filter(isAberto)
    const finalizadas = ordens.filter(isFechado)
    const conversao = orcamentos.length ? (aprovados.length / orcamentos.length) * 100 : 0
    const ticket = orcamentos.length ? valorOrcado / orcamentos.length : 0
    const valorAprovado = aprovados.reduce((acc, item) => acc + item.valor, 0)
    return { valorOrcado, valorOS, valorServicos, aprovados: aprovados.length, abertas: abertas.length, finalizadas: finalizadas.length, conversao, ticket, valorAprovado }
  }, [orcamentos, ordens, servicos])

  const precificacao = useMemo(() => {
    const produtos = Array.isArray(produtosRaw) ? produtosRaw : []
    const produtosFisicos = produtos.filter((p) => String(p.tipoCadastro || '').toLowerCase() !== 'servico')
    const comPreco = produtos.filter((p) => Number(p.preco || 0) > 0)
    const margemMedia = comPreco.length ? comPreco.reduce((acc, p) => acc + Number(p.margemRealPct || 0), 0) / comPreco.length : 0
    const lucroPotencial = produtosFisicos.reduce((acc, p) => acc + Number(p.lucroEstimado || 0) * Math.max(Number(p.estoque || 0), 0), 0)
    const valorEstoque = produtosFisicos.reduce((acc, p) => acc + Number(p.preco || 0) * Math.max(Number(p.estoque || 0), 0), 0)
    const risco = produtos.filter((p) => p.statusMargem === 'risco' || Number(p.margemRealPct || 0) < 15).length
    const codigoBarras = produtos.filter((p) => String(p.codigoBarras || '').trim()).length
    const estoqueBaixo = produtosFisicos.filter((p) => Number(p.estoque || 0) <= 2).length
    const topRisco = [...produtos]
      .filter((p) => p.statusMargem === 'risco' || Number(p.margemRealPct || 0) < 15)
      .sort((a, b) => Number(a.margemRealPct || 0) - Number(b.margemRealPct || 0))
      .slice(0, 4)
    return { total: produtosFisicos.length, servicos: servicos.length, margemMedia, lucroPotencial, valorEstoque, risco, codigoBarras, estoqueBaixo, topRisco }
  }, [produtosRaw, servicos.length])

  const chartMensal = useMemo(() => {
    const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    return nomes.map((nome, idx) => {
      const orcMes = orcamentos.filter((item) => item.mes === idx)
      const osMes = ordens.filter((item) => item.mes === idx)
      return {
        nome,
        orcamentos: Number(orcMes.reduce((acc, item) => acc + item.valor, 0).toFixed(2)),
        os: Number(osMes.reduce((acc, item) => acc + item.valor, 0).toFixed(2)),
        fechados: orcMes.filter(isFechado).length + osMes.filter(isFechado).length,
      }
    })
  }, [orcamentos, ordens])

  const chartStatus = useMemo(() => {
    const mapa = new Map<string, number>()
    itensAtivos.forEach((item) => mapa.set(item.status || 'Sem status', (mapa.get(item.status || 'Sem status') || 0) + 1))
    const cores = ['#60a5fa', '#34d399', '#f59e0b', '#a78bfa', '#f87171', '#22d3ee']
    return Array.from(mapa.entries()).map(([name, value], index) => ({ name, value, color: cores[index % cores.length] }))
  }, [itensAtivos])

  const produtosMaisVendidos = useMemo(() => {
    const mapa = new Map<string, { nome: string; qtd: number; valor: number }>()
    ;(Array.isArray(orcamentosRaw) ? orcamentosRaw : []).forEach((orc) => {
      ;(orc.itens || []).forEach((item) => {
        const nome = item.descricao || item.nome || 'Item sem nome'
        const atual = mapa.get(nome) || { nome, qtd: 0, valor: 0 }
        atual.qtd += Number(item.quantidade || item.qtde || 1)
        atual.valor += Number(item.subtotal || item.total || 0)
        mapa.set(nome, atual)
      })
    })
    return Array.from(mapa.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 5)
  }, [orcamentosRaw])

  const alertas = useMemo(() => {
    const lista: Array<{ titulo: string; texto: string; tom: 'red' | 'yellow' | 'green' | 'blue' }> = []
    if (financeiro.atrasado > 0) lista.push({ titulo: 'Cobrança', texto: `${moeda(financeiro.atrasado)} em atraso no financeiro.`, tom: 'red' })
    if (precificacao.risco > 0) lista.push({ titulo: 'Margem', texto: `${precificacao.risco} produto(s) com margem baixa.`, tom: 'yellow' })
    if (precificacao.estoqueBaixo > 0) lista.push({ titulo: 'Estoque', texto: `${precificacao.estoqueBaixo} produto(s) com estoque baixo.`, tom: 'blue' })
    if (resumo.conversao >= 60 && orcamentos.length > 0) lista.push({ titulo: 'Conversão', texto: `Conversão em ${resumo.conversao.toFixed(0)}%. Bom desempenho comercial.`, tom: 'green' })
    if (!lista.length) lista.push({ titulo: 'Tudo certo', texto: 'Nenhum alerta crítico detectado agora.', tom: 'green' })
    return lista.slice(0, 4)
  }, [financeiro.atrasado, precificacao.risco, precificacao.estoqueBaixo, resumo.conversao, orcamentos.length])

  const shellStyle: CSSProperties = {
    minHeight: '100vh',
    padding: isMobile ? '14px 12px 104px' : '24px 24px 118px',
    background: 'radial-gradient(circle at top left, rgba(59,130,246,0.13), transparent 28%), radial-gradient(circle at top right, rgba(45,212,191,0.10), transparent 24%), linear-gradient(180deg, #07111f 0%, #0b1728 43%, #0f1d31 100%)',
    color: '#e5eefc',
    overflowX: 'clip',
    maxWidth: '100vw',
    boxSizing: 'border-box',
  }

  const glass: CSSProperties = {
    background: 'linear-gradient(180deg, rgba(9,22,42,0.94), rgba(4,14,28,0.96))',
    border: '1px solid rgba(96,165,250,0.22)',
    boxShadow: '0 24px 70px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.04)',
    borderRadius: 28,
    minWidth: 0,
  }

  return (
    <div style={shellStyle}>
      <div style={{ width: '100%', maxWidth: 1440, margin: '0 auto', display: 'grid', gap: isMobile ? 14 : 18, minWidth: 0, boxSizing: 'border-box' }}>
        <section style={{ ...glass, padding: isMobile ? 14 : 24, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr .9fr', gap: 18, alignItems: 'stretch' }}>
            <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: isMobile ? 70 : 92, height: isMobile ? 70 : 92, borderRadius: isMobile ? 22 : 26, background: 'linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035))', border: '1px solid rgba(255,255,255,0.13)', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: '0 0 auto', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10), 0 16px 36px rgba(0,0,0,.22)' }}>
                  {config.logoUrl ? (
                    <img src={config.logoUrl} alt="Logo da empresa" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scale(1.08)' }} />
                  ) : (
                    <span style={{ fontSize: isMobile ? 26 : 34, fontWeight: 950, color: '#bfdbfe' }}>{(config.nomeEmpresa || 'C').slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#93c5fd' }}>Dashboard Executivo • Connect Sistema</div>
                  <div style={{ fontSize: isMobile ? 27 : 42, fontWeight: 950, lineHeight: 1.02, color: '#ffffff', marginTop: 4, wordBreak: 'break-word' }}>{config.nomeEmpresa || 'CONNECT SISTEMAS'}</div>
                  <div style={{ fontSize: isMobile ? 13 : 15, color: '#94a3b8', marginTop: 8 }}>Visão rápida de vendas, OS, financeiro, margem e operação para tomada de decisão.</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4,minmax(0,1fr))', gap: isMobile ? 10 : 12 }}>
                <HeroCard titulo="Faturamento estimado" valor={moeda(resumo.valorOrcado + resumo.valorOS)} detalhe="Orçamentos + OS" icon="📈" tone="blue" />
                <HeroCard titulo="A receber" valor={moeda(financeiro.aberto)} detalhe="Financeiro em aberto" icon="💼" tone="yellow" />
                <HeroCard titulo="Recebido" valor={moeda(financeiro.recebido)} detalhe="Pagamentos confirmados" icon="✅" tone="green" />
                <HeroCard titulo="Conversão" valor={`${resumo.conversao.toFixed(0)}%`} detalhe={`${resumo.aprovados} aprovado(s)`} icon="🎯" tone="cyan" />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                <InfoBox title="Agora" value={horaAtual} text={dataAtual} />
                <InfoBox title="Ticket médio" value={moeda(resumo.ticket)} text="Média dos orçamentos" />
              </div>

              <div style={{ borderRadius: 22, padding: 16, background: 'linear-gradient(135deg, rgba(96,165,250,0.10), rgba(52,211,153,0.06))', border: '1px solid rgba(96,165,250,0.16)' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.3, color: '#93c5fd', fontWeight: 900 }}>Modo do painel</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Tab active={painel === 'geral'} onClick={() => setPainel('geral')}>Geral</Tab>
                  <Tab active={painel === 'orcamentos'} onClick={() => setPainel('orcamentos')}>Orçamentos</Tab>
                  <Tab active={painel === 'os'} onClick={() => setPainel('os')}>OS</Tab>
                  <Tab active={painel === 'servicos'} onClick={() => setPainel('servicos')}>Serviços</Tab>
                </div>
                <div style={{ marginTop: 12, color: '#dbeafe', fontSize: 13, lineHeight: 1.55 }}>
                  {painel === 'geral' ? 'Visão executiva com todos os módulos conectados.' : `Filtrando indicadores por ${painel === 'os' ? 'ordens de serviço' : painel}.`}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                <InfoBox title="OS abertas" value={numero(resumo.abertas)} text={`${resumo.finalizadas} finalizadas`} tone="green" />
                <InfoBox title="Atrasado" value={moeda(financeiro.atrasado)} text="Prioridade cobrança" tone={financeiro.atrasado > 0 ? 'red' : 'green'} />
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(8,minmax(0,1fr))', gap: 12 }}>
          <MiniKpi title="Orçamentos" value={numero(orcamentos.length)} icon="📋" tone="blue" />
          <MiniKpi title="OS" value={numero(ordens.length)} icon="🛠️" tone="green" />
          <MiniKpi title="Produtos" value={numero(precificacao.total)} icon="📦" tone="purple" />
          <MiniKpi title="Serviços" value={numero(precificacao.servicos)} icon="🔧" tone="cyan" />
          <MiniKpi title="Cód. barras" value={numero(precificacao.codigoBarras)} icon="▥" tone="blue" />
          <MiniKpi title="Valor estoque" value={moeda(precificacao.valorEstoque)} icon="◇" tone="cyan" />
          <MiniKpi title="Margem média" value={`${precificacao.margemMedia.toFixed(1)}%`} icon="◔" tone={precificacao.margemMedia < 20 ? 'yellow' : 'green'} />
          <MiniKpi title="Risco" value={numero(precificacao.risco)} icon="⚠" tone={precificacao.risco > 0 ? 'red' : 'green'} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr .9fr', gap: 18, minWidth: 0 }}>
          <div style={{ ...glass, padding: isMobile ? 16 : 20 }}>
            <Header title="Resultado mensal" subtitle="Volume financeiro de orçamentos e OS por mês" />
            <div style={{ height: isMobile ? 260 : 330, minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartMensal} margin={{ top: 12, right: 4, left: isMobile ? -18 : 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="orcGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.42} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="osGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.36} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v) / 1000}k`} />
                  <Tooltip formatter={(value) => moeda(Number(value))} contentStyle={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 14, color: '#fff' }} />
                  <Area type="monotone" dataKey="orcamentos" name="Orçamentos" stroke="#60a5fa" fill="url(#orcGradient)" strokeWidth={3} />
                  <Area type="monotone" dataKey="os" name="OS" stroke="#34d399" fill="url(#osGradient)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <div style={{ ...glass, padding: isMobile ? 16 : 20 }}>
              <Header title="Alertas inteligentes" subtitle="Pontos que merecem atenção agora" />
              <div style={{ display: 'grid', gap: 10 }}>
                {alertas.map((a) => <AlertCard key={a.titulo} {...a} />)}
              </div>
            </div>

            <div style={{ ...glass, padding: isMobile ? 16 : 20 }}>
              <Header title="Distribuição de status" subtitle="Leitura rápida do funil atual" />
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '170px 1fr', gap: 12, alignItems: 'center' }}>
                <div style={{ height: 170, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 14, color: '#fff' }} />
                      <Pie data={chartStatus} dataKey="value" nameKey="name" innerRadius={43} outerRadius={66} paddingAngle={3}>
                        {chartStatus.map((item) => <Cell key={item.name} fill={item.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {chartStatus.length ? chartStatus.map((item) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, display: 'inline-block', flex: '0 0 auto' }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span></div>
                      <strong>{item.value}</strong>
                    </div>
                  )) : <div style={{ color: '#94a3b8', fontSize: 13 }}>Sem status ainda.</div>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, minWidth: 0 }}>
          <div style={{ ...glass, padding: isMobile ? 16 : 20 }}>
            <Header title="Busca executiva" subtitle="Pesquise orçamento, OS, serviço, cliente ou valor" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar no painel..."
              style={{ width: '100%', height: 54, borderRadius: 16, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '0 16px', outline: 'none', marginBottom: 12 }}
            />
            <div style={{ display: 'grid', gap: 10, maxHeight: 520, overflowY: 'auto', paddingRight: 2 }}>
              {itensFiltrados.length ? itensFiltrados.map((item) => <ItemCard key={`${item.tipo}-${item.id}`} item={item} />) : <Empty text="Nenhum registro encontrado." />}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <div style={{ ...glass, padding: isMobile ? 16 : 20 }}>
              <Header title="Produtos mais vendidos" subtitle="Baseado nos itens dos orçamentos" />
              <div style={{ display: 'grid', gap: 10 }}>
                {produtosMaisVendidos.length ? produtosMaisVendidos.map((p, idx) => (
                  <div key={p.nome} style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 10, alignItems: 'center', borderRadius: 16, padding: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 12, background: 'rgba(96,165,250,.14)', display: 'grid', placeItems: 'center', fontWeight: 950, color: '#bfdbfe' }}>{idx + 1}</div>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div><div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{numero(p.qtd)} unidade(s)</div></div>
                    <div style={{ fontWeight: 950, color: '#86efac' }}>{moeda(p.valor)}</div>
                  </div>
                )) : <Empty text="Ainda não há itens suficientes nos orçamentos." />}
              </div>
            </div>

            <div style={{ ...glass, padding: isMobile ? 16 : 20 }}>
              <Header title="Margem e precificação" subtitle="Produtos que podem precisar de revisão" />
              <div style={{ display: 'grid', gap: 10 }}>
                {precificacao.topRisco.length ? precificacao.topRisco.map((p) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', border: '1px solid rgba(248,113,113,.22)', background: 'rgba(248,113,113,.07)', borderRadius: 16, padding: 12 }}>
                    <div style={{ minWidth: 0 }}><b style={{ color: '#fff' }}>{p.nome || 'Produto sem nome'}</b><div style={{ fontSize: 12, color: '#fca5a5', marginTop: 3 }}>Preço {moeda(p.preco)} • Sugestão {moeda(p.precoSugerido)}</div></div>
                    <div style={{ textAlign: 'right', fontWeight: 950, color: '#fca5a5' }}>{Number(p.margemRealPct || 0).toFixed(1)}%</div>
                  </div>
                )) : <div style={{ border: '1px solid rgba(34,197,94,.22)', background: 'rgba(34,197,94,.08)', color: '#bbf7d0', borderRadius: 16, padding: 14, fontWeight: 800 }}>Nenhum produto em risco de margem no momento.</div>}
              </div>
            </div>
          </div>
        </section>

        <section style={{ ...glass, padding: isMobile ? 16 : 20 }}>
          <Header title="Ações rápidas" subtitle="Atalhos para operar mais rápido no dia a dia" />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(5,minmax(0,1fr))', gap: 12 }}>
            <Action href="/orcamentos" title="Novo orçamento" text="Balcão PRO" />
            <Action href="/ordens-servico" title="Nova OS" text="Assistência" />
            <Action href="/produtos" title="Produtos" text="Código de barras" />
            <Action href="/financeiro" title="Financeiro" text="Cobranças" />
            <Action href="/clientes" title="Clientes" text="Cadastro" />
          </div>
        </section>
      </div>
    </div>
  )
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div style={{ marginBottom: 14 }}><div style={{ fontSize: 19, fontWeight: 950, color: '#fff' }}>{title}</div>{subtitle ? <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{subtitle}</div> : null}</div>
}

function HeroCard({ titulo, valor, detalhe, icon, tone }: { titulo: string; valor: string; detalhe: string; icon: string; tone: 'blue' | 'green' | 'yellow' | 'cyan' }) {
  const map = {
    blue: ['linear-gradient(135deg,#0f3bff,#001b6b)', 'rgba(59,130,246,.62)', 'rgba(37,99,235,.34)'],
    green: ['linear-gradient(135deg,#16a34a,#052e16)', 'rgba(34,197,94,.55)', 'rgba(34,197,94,.28)'],
    yellow: ['linear-gradient(135deg,#d97706,#4a2300)', 'rgba(245,158,11,.55)', 'rgba(245,158,11,.28)'],
    cyan: ['linear-gradient(135deg,#0891b2,#032b38)', 'rgba(34,211,238,.55)', 'rgba(6,182,212,.26)'],
  }[tone]
  return <div style={{ borderRadius: 22, padding: 16, minHeight: 132, background: map[0], border: `1px solid ${map[1]}`, boxShadow: `0 0 30px ${map[2]}, inset 0 1px 0 rgba(255,255,255,.10)`, position: 'relative', overflow: 'hidden', minWidth: 0, boxSizing: 'border-box' }}><div style={{ position: 'absolute', right: 10, bottom: 4, fontSize: 54, opacity: .10 }}>{icon}</div><div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}><div style={{ width: 42, height: 42, borderRadius: 15, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.14)', fontSize: 22, marginBottom: 12 }}>{icon}</div><div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.1, color: '#dbeafe', fontWeight: 950 }}>{titulo}</div><div style={{ marginTop: 8, fontSize: 22, fontWeight: 950, color: '#fff', overflowWrap: 'anywhere', lineHeight: 1.05 }}>{valor}</div><div style={{ marginTop: 7, fontSize: 12, color: '#dbeafe', lineHeight: 1.35 }}>{detalhe}</div></div></div>
}

function InfoBox({ title, value, text, tone = 'blue' }: { title: string; value: string; text?: string; tone?: 'blue' | 'green' | 'red' }) {
  const color = tone === 'red' ? '#fca5a5' : tone === 'green' ? '#86efac' : '#93c5fd'
  return <div style={{ borderRadius: 22, padding: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', minWidth: 0 }}><div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.3, color, fontWeight: 900 }}>{title}</div><div style={{ fontSize: 23, fontWeight: 950, marginTop: 10, color: '#fff', wordBreak: 'break-word' }}>{value}</div>{text ? <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>{text}</div> : null}</div>
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ border: active ? '1px solid rgba(96,165,250,.62)' : '1px solid rgba(148,163,184,.16)', cursor: 'pointer', borderRadius: 999, padding: '10px 14px', fontWeight: 950, fontSize: 12, background: active ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'rgba(255,255,255,0.06)', color: '#fff', boxShadow: active ? '0 0 22px rgba(59,130,246,.30)' : 'none' }}>{children}</button>
}

function MiniKpi({ title, value, icon, tone = 'default' }: { title: string; value: string; icon?: string; tone?: 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'cyan' | 'purple' }) {
  const styles = {
    default: ['linear-gradient(135deg, rgba(15,23,42,.92), rgba(15,23,42,.62))', 'rgba(148,163,184,.20)', '#fff'],
    blue: ['linear-gradient(135deg, rgba(37,99,235,.90), rgba(15,23,42,.72))', 'rgba(59,130,246,.55)', '#dbeafe'],
    cyan: ['linear-gradient(135deg, rgba(8,145,178,.84), rgba(15,23,42,.70))', 'rgba(34,211,238,.48)', '#cffafe'],
    purple: ['linear-gradient(135deg, rgba(126,34,206,.88), rgba(47,16,82,.80))', 'rgba(168,85,247,.50)', '#f3e8ff'],
    green: ['linear-gradient(135deg, rgba(22,163,74,.88), rgba(5,46,22,.78))', 'rgba(34,197,94,.50)', '#bbf7d0'],
    yellow: ['linear-gradient(135deg, rgba(217,119,6,.88), rgba(69,26,3,.78))', 'rgba(245,158,11,.50)', '#fde68a'],
    red: ['linear-gradient(135deg, rgba(185,28,28,.88), rgba(69,10,10,.78))', 'rgba(248,113,113,.46)', '#fecaca'],
  }[tone]
  return <div style={{ borderRadius: 20, padding: 14, minHeight: 104, background: styles[0], border: `1px solid ${styles[1]}`, position: 'relative', overflow: 'hidden', minWidth: 0 }}><div style={{ position: 'absolute', right: 10, bottom: 5, fontSize: 40, opacity: .08 }}>{icon}</div><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 22 }}>{icon}</div><div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.1, color: '#dbeafe', fontWeight: 950, marginTop: 8 }}>{title}</div><div style={{ marginTop: 7, fontSize: 18, fontWeight: 950, color: styles[2], overflowWrap: 'anywhere' }}>{value}</div></div></div>
}

function AlertCard({ titulo, texto, tom }: { titulo: string; texto: string; tom: 'red' | 'yellow' | 'green' | 'blue' }) {
  const map = { red: ['rgba(248,113,113,.10)', 'rgba(248,113,113,.25)', '#fca5a5'], yellow: ['rgba(245,158,11,.10)', 'rgba(245,158,11,.25)', '#fde68a'], green: ['rgba(34,197,94,.10)', 'rgba(34,197,94,.25)', '#86efac'], blue: ['rgba(96,165,250,.10)', 'rgba(96,165,250,.25)', '#bfdbfe'] }[tom]
  return <div style={{ borderRadius: 16, padding: 13, background: map[0], border: `1px solid ${map[1]}` }}><div style={{ fontWeight: 950, color: map[2], fontSize: 13 }}>{titulo}</div><div style={{ color: '#dbeafe', fontSize: 13, marginTop: 5, lineHeight: 1.45 }}>{texto}</div></div>
}

function ItemCard({ item }: { item: ItemPainel }) {
  const chip = statusChip(item.status)
  const label = item.tipo === 'orcamentos' ? `Orçamento #${item.numero}` : item.tipo === 'os' ? `OS #${item.numero}` : 'Serviço'
  return <div style={{ borderRadius: 20, padding: 15, background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div style={{ minWidth: 0 }}><div style={{ fontWeight: 950, color: '#fff' }}>{label}</div><div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>{item.cliente}</div><div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>{item.linha2}</div></div><div style={{ textAlign: 'right' }}><div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, background: chip.bg, border: `1px solid ${chip.border}`, color: chip.color, fontSize: 12, fontWeight: 900 }}>{item.status}</div><div style={{ marginTop: 10, fontSize: 18, fontWeight: 950, color: '#fff' }}>{moeda(item.valor)}</div></div></div><a href={item.href} style={{ justifySelf: 'start', textDecoration: 'none', borderRadius: 12, padding: '10px 14px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontWeight: 850, fontSize: 13 }}>Abrir módulo</a></div>
}

function Empty({ text }: { text: string }) {
  return <div style={{ borderRadius: 18, padding: 18, background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(148,163,184,.22)', color: '#94a3b8', fontSize: 13 }}>{text}</div>
}

function Action({ href, title, text }: { href: string; title: string; text: string }) {
  return <a href={href} style={{ textDecoration: 'none', borderRadius: 18, padding: 16, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', color: '#fff', minHeight: 86 }}><div style={{ fontWeight: 950 }}>{title}</div><div style={{ color: '#93c5fd', fontSize: 12, marginTop: 6, fontWeight: 800 }}>{text}</div></a>
}
