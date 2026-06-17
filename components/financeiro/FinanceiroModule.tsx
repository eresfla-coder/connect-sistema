'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  buildWhatsappChargeMessageV2,
  FinanceiroStatus,
  FinanceiroTitulo,
  formatDateBR,
  gerarParcelasFinanceiras,
  lerTitulosFinanceiros,
  makeWhatsappUrl,
  money,
  normalizeStatus,
  parseCurrencyInput,
  salvarParcelasDoDocumento,
  salvarTitulosFinanceiros,
  sincronizarFinanceiroLocalCompleto,
  nivelCobranca,
  statusLabel,
  valorAberto,
} from '@/lib/financeiro'
import {
  carregarFinanceiroEClientesDireto,
  nomeCliente,
  salvarFinanceiroDireto,
  telefoneCliente,
  type ClienteConnect,
} from '@/lib/connect-supabase-direct'
import { lerOrdensPainelSync, lerOrcamentosPainelSync } from '@/lib/orcamentos-local'
import { obterUserIdPainel } from '@/lib/connect-user-storage'

type Props = {
  clientId?: string
  embedded?: boolean
}

type FormState = {
  cliente_nome: string
  cliente_id: string
  cliente_telefone: string
  descricao: string
  valor: string
  forma_pagamento: string
  parcelas: string
  primeiro_vencimento: string
  observacao: string
}

const formInicial: FormState = {
  cliente_nome: '',
  cliente_id: '',
  cliente_telefone: '',
  descricao: '',
  valor: '',
  forma_pagamento: 'Boleto',
  parcelas: '1',
  primeiro_vencimento: '30',
  observacao: '',
}

function corStatus(status: FinanceiroStatus) {
  switch (status) {
    case 'pago':
      return { bg: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.35)', color: '#15803d', label: 'Pago', glow: '0 0 0 rgba(0,0,0,0)' }
    case 'atrasado':
      return { bg: 'rgba(239,68,68,0.13)', border: '1px solid rgba(239,68,68,0.36)', color: '#b91c1c', label: 'Atrasado', glow: '0 12px 30px rgba(239,68,68,.12)' }
    case 'parcial':
      return { bg: 'rgba(245,158,11,0.13)', border: '1px solid rgba(245,158,11,0.32)', color: '#b45309', label: 'Parcial', glow: '0 10px 24px rgba(245,158,11,.10)' }
    case 'hoje':
      return { bg: 'rgba(37,99,235,0.13)', border: '1px solid rgba(37,99,235,0.35)', color: '#1d4ed8', label: 'Hoje', glow: '0 12px 28px rgba(37,99,235,.12)' }
    case 'a_vencer':
      return { bg: 'rgba(234,179,8,0.13)', border: '1px solid rgba(234,179,8,0.30)', color: '#a16207', label: 'A vencer', glow: '0 10px 24px rgba(234,179,8,.10)' }
    default:
      return { bg: 'rgba(100,116,139,0.10)', border: '1px solid rgba(100,116,139,0.25)', color: '#475569', label: 'Pendente', glow: '0 0 0 rgba(0,0,0,0)' }
  }
}

function gerarDias(qtd: number, primeiro: number) {
  const parcelas = Math.max(1, Number(qtd || 1))
  const inicio = Math.max(0, Number(primeiro || 0))
  return Array.from({ length: parcelas }, (_, index) => inicio + index * 30)
}

export default function FinanceiroModule({ embedded = false }: Props) {
  const [titulos, setTitulos] = useState<FinanceiroTitulo[]>([])
  const [clientes, setClientes] = useState<ClienteConnect[]>([])
  const [mostrarSugestoesCliente, setMostrarSugestoesCliente] = useState(false)
  const salvandoBancoRef = useRef(false)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<'todos' | FinanceiroStatus>('todos')
  const [form, setForm] = useState<FormState>(formInicial)
  const [mensagem, setMensagem] = useState('')
  const [recebendoId, setRecebendoId] = useState<string | null>(null)
  const [filaCobranca, setFilaCobranca] = useState<FinanceiroTitulo[]>([])
  const [indiceCobranca, setIndiceCobranca] = useState(0)
  const [valorRecebido, setValorRecebido] = useState('')
  const [formaRecebimento, setFormaRecebimento] = useState('Pix')

  function carregar() {
    setTitulos(lerTitulosFinanceiros())
  }

  function carregarClientesLocais() {
    try {
      const raw = localStorage.getItem('connect_clientes')
      const lista = raw ? JSON.parse(raw) : []
      if (Array.isArray(lista)) setClientes(lista)
    } catch {}
  }

  async function carregarBancoDireto() {
    try {
      const dados = await carregarFinanceiroEClientesDireto()

      if (dados.titulos.length) {
        salvarTitulosFinanceiros(dados.titulos)
        setTitulos(dados.titulos)
      } else {
        carregar()
      }

      if (dados.clientes.length) {
        localStorage.setItem('connect_clientes', JSON.stringify(dados.clientes))
        setClientes(dados.clientes)
      } else {
        carregarClientesLocais()
      }

      setMensagem('Banco conectado: clientes e financeiro carregados do Supabase.')
    } catch (error: any) {
      carregar()
      carregarClientesLocais()
      setMensagem(error?.message || 'Banco indisponível agora. Usando dados locais.')
    }
  }

  async function salvarFinanceiroNoBanco(lista: FinanceiroTitulo[]) {
    if (salvandoBancoRef.current) return
    salvandoBancoRef.current = true
    try {
      await salvarFinanceiroDireto(lista)
      setMensagem('Financeiro salvo direto no Supabase.')
    } catch (error: any) {
      setMensagem(error?.message || 'Não foi possível salvar no Supabase. Ficou salvo localmente.')
    } finally {
      salvandoBancoRef.current = false
    }
  }

  async function sincronizarAutomatico() {
    try {
      const userId = await obterUserIdPainel()
      const orcamentos = lerOrcamentosPainelSync(userId)
      const ordensServico = lerOrdensPainelSync(userId)
      const lista = sincronizarFinanceiroLocalCompleto({
        orcamentos,
        ordensServico,
      })
      setTitulos(lista)
      await salvarFinanceiroNoBanco(lista)
      setMensagem('Automação v2 sincronizada com orçamentos, OS e Supabase.')
    } catch {
      setMensagem('Não foi possível sincronizar a automação agora.')
    }
  }

  useEffect(() => {
    carregarBancoDireto()

    function onChange() {
      carregar()
    }

    window.addEventListener('storage', onChange)
    window.addEventListener('connect-financeiro-change', onChange as EventListener)
    window.addEventListener('connect-data-change', onChange as EventListener)

    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener('connect-financeiro-change', onChange as EventListener)
      window.removeEventListener('connect-data-change', onChange as EventListener)
    }
  }, [])

  useEffect(() => {
    try {
      const buscaOs = new URLSearchParams(window.location.search).get('busca')
      if (buscaOs) setBusca(buscaOs)
    } catch {}
  }, [])

  async function atualizarLista(lista: FinanceiroTitulo[]) {
    salvarTitulosFinanceiros(lista)
    const atualizados = lerTitulosFinanceiros()
    setTitulos(atualizados)
    await salvarFinanceiroNoBanco(atualizados)
  }

  const clientesFiltrados = useMemo(() => {
    const termo = form.cliente_nome.trim().toLowerCase()
    if (!termo) return clientes.slice(0, 8)

    return clientes
      .filter((cliente) => {
        const alvo = `${nomeCliente(cliente)} ${telefoneCliente(cliente)} ${cliente.email || ''}`.toLowerCase()
        return alvo.includes(termo)
      })
      .slice(0, 8)
  }, [clientes, form.cliente_nome])

  function selecionarCliente(cliente: ClienteConnect) {
    setForm({
      ...form,
      cliente_id: String(cliente.id || ''),
      cliente_nome: nomeCliente(cliente),
      cliente_telefone: telefoneCliente(cliente),
    })
    setMostrarSugestoesCliente(false)
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return titulos.filter((item) => {
      const alvo = `${item.cliente_nome || ''} ${item.descricao || ''} ${item.numero_documento || ''} ${item.forma_pagamento || ''}`.toLowerCase()
      const okBusca = !termo || alvo.includes(termo)
      const okStatus = statusFiltro === 'todos' || normalizeStatus(item) === statusFiltro
      return okBusca && okStatus
    })
  }, [titulos, busca, statusFiltro])

  const resumo = useMemo(() => {
    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    return titulos.reduce(
      (acc, item) => {
        const status = normalizeStatus(item)
        const aberto = valorAberto(item)
        const pago = Number(item.valor_pago || 0)

        acc.total += Number(item.valor || 0)
        acc.recebido += pago
        acc.aberto += aberto
        if (status === 'atrasado') acc.atrasado += aberto
        if (status === 'hoje') acc.hoje += aberto
        if (status === 'a_vencer' || status === 'pendente') acc.aVencer += aberto
        if (status === 'parcial') acc.parcial += aberto

        if (pago > 0 && item.data_pagamento) {
          const dataPagamento = new Date(`${String(item.data_pagamento).slice(0, 10)}T00:00:00`)
          if (!Number.isNaN(dataPagamento.getTime()) && dataPagamento >= inicioMes) {
            acc.recebidoMes += pago
          }
        }

        return acc
      },
      { total: 0, recebido: 0, recebidoMes: 0, aberto: 0, atrasado: 0, hoje: 0, aVencer: 0, parcial: 0 }
    )
  }, [titulos])


  const performance = useMemo(() => {
    const taxa = resumo.total > 0 ? (resumo.recebido / resumo.total) * 100 : 0
    const inadimplencia = resumo.aberto > 0 ? (resumo.atrasado / resumo.aberto) * 100 : 0
    return {
      taxa,
      inadimplencia,
      clientes: new Set(titulos.map((item) => item.cliente_nome).filter(Boolean)).size,
    }
  }, [resumo, titulos])

  const proximos = useMemo(() => {
    return [...titulos]
      .filter((item) => normalizeStatus(item) !== 'pago')
      .sort((a, b) => {
        const na = nivelCobranca(a).prioridade
        const nb = nivelCobranca(b).prioridade
        if (nb !== na) return nb - na
        return String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''))
      })
      .slice(0, 8)
  }, [titulos])


  const atrasadosParaCobrar = useMemo(() => {
    return titulos
      .filter((item) => normalizeStatus(item) === 'atrasado' && valorAberto(item) > 0)
      .sort((a, b) => String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || '')))
  }, [titulos])

  function iniciarCobrancaEmFila() {
    if (!atrasadosParaCobrar.length) {
      setMensagem('Nenhuma cobrança atrasada para enviar agora.')
      return
    }
    setFilaCobranca(atrasadosParaCobrar)
    setIndiceCobranca(0)
    setMensagem(`Cobrança em massa preparada: ${atrasadosParaCobrar.length} cliente(s) atrasado(s).`)
  }

  function cobrarAtualDaFila() {
    const item = filaCobranca[indiceCobranca]
    if (!item) return
    cobrar(item)
  }

  function avancarFilaCobranca() {
    if (indiceCobranca + 1 >= filaCobranca.length) {
      setFilaCobranca([])
      setIndiceCobranca(0)
      setMensagem('Sequência de cobranças finalizada.')
      return
    }
    setIndiceCobranca((atual) => atual + 1)
  }

  async function criarParcelas() {
    const total = parseCurrencyInput(form.valor)

    if (!form.cliente_nome.trim()) {
      setMensagem('Informe o cliente.')
      return
    }

    if (total <= 0) {
      setMensagem('Informe um valor válido.')
      return
    }

    const id = Date.now()
    const parcelas = gerarParcelasFinanceiras({
      total,
      formaPagamento: form.parcelas === '1' ? form.forma_pagamento : `${form.forma_pagamento} ${form.parcelas}x`,
      cliente: {
        id: form.cliente_id || undefined,
        nome: form.cliente_nome,
        telefone: form.cliente_telefone,
      },
      origem: 'manual',
      origemId: id,
      numeroDocumento: String(id).slice(-6),
      descricao: form.descricao || 'Cobrança manual',
      observacao: form.observacao,
      dias: gerarDias(Number(form.parcelas || 1), Number(form.primeiro_vencimento || 0)),
    })

    const listaFinal = salvarParcelasDoDocumento(parcelas, 'manual', id)
    setForm(formInicial)
    setMostrarSugestoesCliente(false)
    setTitulos(listaFinal)
    await salvarFinanceiroNoBanco(listaFinal)
    setMensagem('Parcelas geradas, vinculadas ao cliente e salvas no Supabase.')
  }

  function receber(item: FinanceiroTitulo) {
    const aberto = valorAberto(item)
    setRecebendoId(item.id)
    setValorRecebido(String(aberto.toFixed(2)).replace('.', ','))
    setFormaRecebimento('Pix')
  }

  async function confirmarRecebimento() {
    if (!recebendoId) return

    const valor = parseCurrencyInput(valorRecebido)
    const lista = titulos.map((item) => {
      if (item.id !== recebendoId) return item

      const pagoAtual = Number(item.valor_pago || 0)
      const novoPago = Math.min(Number(item.valor || 0), pagoAtual + valor)
      const atualizado: FinanceiroTitulo = {
        ...item,
        valor_pago: novoPago,
        data_pagamento: novoPago >= Number(item.valor || 0) ? new Date().toISOString().slice(0, 10) : item.data_pagamento || null,
        observacao: [item.observacao, valor > 0 ? `Recebido ${money(valor)} em ${formaRecebimento}` : ''].filter(Boolean).join(' | '),
      }

      return {
        ...atualizado,
        status: normalizeStatus(atualizado),
      }
    })

    await atualizarLista(lista)
    setRecebendoId(null)
    setValorRecebido('')
    setMensagem('Pagamento registrado com sucesso.')
  }

  async function marcarPendente(item: FinanceiroTitulo) {
    await atualizarLista(
      titulos.map((titulo) =>
        titulo.id === item.id
          ? { ...titulo, valor_pago: 0, data_pagamento: null, status: 'pendente' }
          : titulo
      )
    )
  }

  async function excluir(item: FinanceiroTitulo) {
    if (!confirm('Deseja excluir esta cobrança?')) return
    await atualizarLista(titulos.filter((titulo) => titulo.id !== item.id))
  }

  function cobrar(item: FinanceiroTitulo) {
    const mensagem = buildWhatsappChargeMessageV2({
      ...item,
      valorAberto: valorAberto(item),
    })
    window.open(makeWhatsappUrl(item.cliente_telefone || '', mensagem), '_blank', 'noopener,noreferrer')
  }

  const pageStyle: CSSProperties = {
    minHeight: embedded ? 'auto' : '100vh',
    padding: embedded ? 0 : 18,
    background: embedded ? 'transparent' : 'radial-gradient(circle at top left, rgba(22,163,74,.10), transparent 32%), linear-gradient(180deg,#eef4ff,#f8fbff)',
    color: '#0f172a',
  }


  const cardStyle: CSSProperties = {
    background: 'rgba(255,255,255,.94)',
    border: '1px solid rgba(148,163,184,.28)',
    borderRadius: 24,
    padding: 18,
    boxShadow: '0 20px 50px rgba(15,23,42,.08)',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    minHeight: 42,
    borderRadius: 13,
    border: '1px solid #dbe3ef',
    background: '#fff',
    color: '#0f172a',
    padding: '10px 12px',
    outline: 'none',
    boxSizing: 'border-box',
    fontWeight: 700,
  }

  const buttonPrimary: CSSProperties = {
    minHeight: 44,
    borderRadius: 15,
    border: 'none',
    background: 'linear-gradient(135deg,#16a34a,#047857)',
    color: '#fff',
    fontWeight: 950,
    padding: '0 18px',
    cursor: 'pointer',
    boxShadow: '0 14px 28px rgba(22,163,74,.22)',
  }

  return (
    <>
      <style>{`
        .connect-financeiro-page,
        .connect-financeiro-page * {
          box-sizing: border-box;
        }
        .connect-financeiro-page {
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden;
        }
        .connect-financeiro-wrap {
          width: 100%;
          max-width: 1260px;
          min-width: 0;
          margin: 0 auto;
          display: grid;
          gap: 16px;
        }
        .connect-financeiro-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(300px, .9fr);
          gap: 16px;
          align-items: start;
          min-width: 0;
        }
        .connect-financeiro-filtros {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 180px;
          gap: 10px;
          margin-bottom: 12px;
        }
        .connect-financeiro-aside {
          display: grid;
          gap: 16px;
          min-width: 0;
          width: 100%;
          max-width: 100%;
        }
        .connect-financeiro-card-safe {
          min-width: 0;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }
        .connect-financeiro-card-safe input,
        .connect-financeiro-card-safe select,
        .connect-financeiro-card-safe textarea,
        .connect-financeiro-card-safe button {
          max-width: 100%;
        }
        .connect-financeiro-card-safe p,
        .connect-financeiro-card-safe h1,
        .connect-financeiro-card-safe h2,
        .connect-financeiro-card-safe h3,
        .connect-financeiro-card-safe div {
          overflow-wrap: anywhere;
        }
        .connect-financeiro-form-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 10px;
        }
        .connect-financeiro-tabela-scroll {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
        }
        @media (max-width: 920px) {
          .connect-financeiro-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .connect-financeiro-page {
            padding: 10px !important;
            width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }
          .connect-financeiro-wrap {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }
          .connect-financeiro-grid {
            display: flex;
            flex-direction: column;
            gap: 14px;
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }
          .connect-financeiro-filtros {
            grid-template-columns: 1fr;
          }
          .connect-financeiro-card-safe {
            padding: 14px !important;
            border-radius: 22px !important;
            max-width: 100% !important;
            overflow: hidden !important;
          }
          .connect-financeiro-card-safe h2 {
            font-size: 20px !important;
            line-height: 1.1 !important;
          }
          .connect-financeiro-card-safe p {
            font-size: 13px !important;
            line-height: 1.35 !important;
          }
          .connect-financeiro-form-row {
            grid-template-columns: 1fr;
          }
          .connect-financeiro-tabela-scroll table {
            min-width: 760px !important;
          }
        }
      `}</style>
      <div className="connect-financeiro-page" style={pageStyle}>
      <div className="connect-financeiro-wrap">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#16a34a', fontWeight: 950, letterSpacing: 1.5, textTransform: 'uppercase', fontSize: 12 }}>
              Financeiro Premium
            </div>
            <h1 style={{ margin: '5px 0 6px', fontSize: 40, lineHeight: 1 }}>Contas a receber</h1>
            <p style={{ margin: 0, color: '#64748b', fontWeight: 700 }}>
              Clientes vinculados ao Supabase, parcelas automáticas, cobrança por WhatsApp e visão de caixa.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              style={{ ...buttonPrimary, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', boxShadow: '0 14px 28px rgba(37,99,235,.18)' }}
              onClick={sincronizarAutomatico}
            >
              ⚡ Sincronizar v2
            </button>
            <button
              style={{ ...buttonPrimary, background: 'linear-gradient(135deg,#ef4444,#991b1b)', boxShadow: '0 14px 28px rgba(239,68,68,.18)' }}
              onClick={iniciarCobrancaEmFila}
            >
              📲 Cobrar atrasados
            </button>
            <button
              style={buttonPrimary}
              onClick={() => {
                document.getElementById('financeiro-criar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              + Nova cobrança
            </button>
          </div>
        </header>

        {mensagem ? (
          <div style={{ ...cardStyle, padding: '12px 16px', color: mensagem.includes('sucesso') ? '#047857' : '#b91c1c', fontWeight: 900 }}>
            {mensagem}
          </div>
        ) : null}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
          <Resumo titulo="Recebido no mês" valor={money(resumo.recebidoMes)} tom="green" />
          <Resumo titulo="Vencendo hoje" valor={money(resumo.hoje)} tom="blue" />
          <Resumo titulo="Total atrasado" valor={money(resumo.atrasado)} tom="red" />
          <Resumo titulo="Inadimplência" valor={`${performance.inadimplencia.toFixed(0)}%`} tom="red" />
          <Resumo titulo="Em aberto" valor={money(resumo.aberto)} tom="blue" />
          <Resumo titulo="Clientes ativos" valor={String(performance.clientes)} />
        </section>

        <section style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:12, fontWeight:900, color:'#16a34a', textTransform:'uppercase', letterSpacing:1 }}>Painel executivo</div>
              <h3 style={{ margin:'6px 0', fontSize:28 }}>Saúde financeira do caixa</h3>
              <p style={{ margin:0, color:'#64748b', fontWeight:700 }}>Monitoramento rápido do fluxo financeiro do sistema.</p>
            </div>
            <div style={{ minWidth:220 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:800, marginBottom:6 }}>
                <span>Recebimento</span>
                <span>{performance.taxa.toFixed(0)}%</span>
              </div>
              <div style={{ height:14, borderRadius:999, background:'#dbeafe', overflow:'hidden' }}>
                <div style={{ width:`${Math.min(100, performance.taxa)}%`, height:'100%', background:'linear-gradient(90deg,#16a34a,#22c55e)' }} />
              </div>
            </div>
          </div>
        </section>

        {atrasadosParaCobrar.length > 0 ? (
          <section style={{ ...cardStyle, border: '1px solid rgba(239,68,68,.28)', background: 'linear-gradient(135deg,rgba(254,242,242,.96),rgba(255,255,255,.96))', padding: 14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <strong style={{ color:'#991b1b' }}>⚠️ Você tem {atrasadosParaCobrar.length} cobrança(s) atrasada(s) em aberto.</strong>
              <button style={miniBtn('red')} onClick={iniciarCobrancaEmFila}>Cobrar uma por vez</button>
            </div>
          </section>
        ) : null}

        <section className="connect-financeiro-grid">
          <div className="connect-financeiro-card-safe" style={cardStyle}>
            <h2 style={{ margin: '0 0 14px' }}>Lista financeira</h2>

            <div className="connect-financeiro-filtros">
              <input style={inputStyle} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, documento ou descrição..." />
              <select style={inputStyle} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as 'todos' | FinanceiroStatus)}>
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="hoje">Hoje</option>
                <option value="a_vencer">A vencer</option>
                <option value="parcial">Parcial</option>
                <option value="atrasado">Atrasado</option>
                <option value="pago">Pago</option>
              </select>
            </div>

            <div className="connect-financeiro-tabela-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                    <th style={th}>Vencimento</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Descrição</th>
                    <th style={th}>Parcela</th>
                    <th style={th}>Valor</th>
                    <th style={th}>Aberto</th>
                    <th style={th}>Status</th>
                    <th style={{ ...th, textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 18, color: '#64748b', fontWeight: 700 }}>
                        Nenhuma cobrança encontrada.
                      </td>
                    </tr>
                  ) : (
                    filtrados.map((item) => {
                      const status = normalizeStatus(item)
                      const cor = corStatus(status)
                      const aberto = valorAberto(item)

                      return (
                        <tr key={item.id} style={{ borderTop: '1px solid #e2e8f0', background: status === 'atrasado' ? 'rgba(254,242,242,.55)' : status === 'hoje' ? 'rgba(239,246,255,.55)' : 'transparent', boxShadow: cor.glow }}>
                          <td style={td}>{formatDateBR(item.data_vencimento)}</td>
                          <td style={td}>
                            <strong>{item.cliente_nome || 'Cliente não informado'}</strong>
                            {item.cliente_telefone ? <div style={{ color: '#64748b', fontSize: 12 }}>{item.cliente_telefone}</div> : null}
                          </td>
                          <td style={td}>
                            <div style={{ fontWeight: 800 }}>{item.descricao || '-'}</div>
                            <div style={{ color: '#64748b', fontSize: 12 }}>{item.forma_pagamento || '-'}</div>
                            <div style={{ color: '#94a3b8', fontSize: 11 }}>Link: /pagar/{item.id}</div>
                          </td>
                          <td style={td}>{item.parcela && item.parcelas ? `${item.parcela}/${item.parcelas}` : '-'}</td>
                          <td style={td}><strong>{money(item.valor)}</strong></td>
                          <td style={td}><strong>{money(aberto)}</strong></td>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', padding: '6px 9px', borderRadius: 999, background: cor.bg, border: cor.border, color: cor.color, fontWeight: 900, fontSize: 12 }}>
                              {statusLabel(status)}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {status !== 'pago' ? <button style={miniBtn('green')} onClick={() => receber(item)}>Receber</button> : null}
                            {status !== 'pago' ? <button style={miniBtn('blue')} onClick={() => cobrar(item)}>WhatsApp</button> : null}
                            {status === 'pago' ? <button style={miniBtn('dark')} onClick={() => marcarPendente(item)}>Reabrir</button> : null}
                            <button style={miniBtn('red')} onClick={() => excluir(item)}>Excluir</button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="connect-financeiro-aside">
            <div id="financeiro-criar" className="connect-financeiro-card-safe" style={cardStyle}>
              <h2 style={{ margin: '0 0 8px' }}>Simulador de parcelas</h2>
              <p style={{ margin: '0 0 14px', color: '#64748b', fontWeight: 700 }}>
                Ex.: R$ 2.850 em 3x boleto com primeiro vencimento em 30 dias.
              </p>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    style={inputStyle}
                    value={form.cliente_nome}
                    onFocus={() => setMostrarSugestoesCliente(true)}
                    onChange={(e) => {
                      setForm({ ...form, cliente_id: '', cliente_nome: e.target.value })
                      setMostrarSugestoesCliente(true)
                    }}
                    placeholder="Cliente cadastrado"
                  />
                  {mostrarSugestoesCliente && clientesFiltrados.length > 0 ? (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 48, zIndex: 20, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 16, boxShadow: '0 18px 38px rgba(15,23,42,.16)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                      {clientesFiltrados.map((cliente, index) => (
                        <button
                          key={String(cliente.id || index)}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selecionarCliente(cliente)}
                          style={{ width: '100%', border: 0, background: '#fff', padding: '11px 12px', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #eef2f7' }}
                        >
                          <strong style={{ display: 'block', color: '#0f172a' }}>{nomeCliente(cliente)}</strong>
                          <span style={{ color: '#64748b', fontWeight: 700, fontSize: 12 }}>{telefoneCliente(cliente) || 'Sem WhatsApp cadastrado'}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input style={inputStyle} value={form.cliente_telefone} onChange={(e) => setForm({ ...form, cliente_telefone: e.target.value })} placeholder="WhatsApp automático" />
                <input style={inputStyle} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição" />
                <input style={inputStyle} value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="Valor total. Ex: 2850,00" />

                <div className="connect-financeiro-form-row">
                  <select style={inputStyle} value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}>
                    <option>Boleto</option>
                    <option>Pix</option>
                    <option>Cartão</option>
                    <option>Dinheiro</option>
                    <option>Transferência</option>
                  </select>

                  <select style={inputStyle} value={form.parcelas} onChange={(e) => setForm({ ...form, parcelas: e.target.value })}>
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="3">3x</option>
                    <option value="4">4x</option>
                    <option value="5">5x</option>
                    <option value="6">6x</option>
                    <option value="10">10x</option>
                    <option value="12">12x</option>
                  </select>
                </div>

                <select style={inputStyle} value={form.primeiro_vencimento} onChange={(e) => setForm({ ...form, primeiro_vencimento: e.target.value })}>
                  <option value="0">Hoje</option>
                  <option value="7">7 dias</option>
                  <option value="15">15 dias</option>
                  <option value="30">30 dias</option>
                  <option value="45">45 dias</option>
                  <option value="60">60 dias</option>
                </select>

                <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Observação" />

                <button style={buttonPrimary} onClick={criarParcelas}>Gerar parcelas e salvar no Supabase</button>
              </div>
            </div>

            <div className="connect-financeiro-card-safe" style={cardStyle}>
              <h2 style={{ margin: '0 0 12px' }}>Automação inteligente v2</h2>
              <p style={{ margin: '0 0 12px', color: '#64748b', fontWeight: 700, fontSize: 13 }}>Prioriza atrasados, vencendo hoje e próximos vencimentos para cobrança rápida.</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {proximos.length === 0 ? (
                  <div style={{ color: '#64748b', fontWeight: 700 }}>Nenhum vencimento em aberto.</div>
                ) : (
                  proximos.map((item) => {
                    const alerta = nivelCobranca(item)
                    const status = normalizeStatus(item)
                    const cor = corStatus(status)
                    return (
                      <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 12, background: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <strong>{item.cliente_nome}</strong>
                          <strong>{money(valorAberto(item))}</strong>
                        </div>
                        <div style={{ marginTop: 5, color: '#64748b', fontWeight: 700, fontSize: 13 }}>
                          {formatDateBR(item.data_vencimento)} • {item.descricao}
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <span style={{ display: 'inline-flex', padding: '5px 8px', borderRadius: 999, background: cor.bg, border: cor.border, color: cor.color, fontWeight: 950, fontSize: 11 }}>
                            {alerta.titulo} · {alerta.descricao}
                          </span>
                          {status !== 'pago' ? <button style={miniBtn('blue')} onClick={() => cobrar(item)}>Cobrar</button> : null}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </aside>
        </section>

        {filaCobranca.length > 0 ? (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.48)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 55 }}>
            <div style={{ ...cardStyle, maxWidth: 520, width: '100%', border: '1px solid rgba(239,68,68,.30)' }}>
              <div style={{ color:'#dc2626', fontWeight:950, fontSize:12, textTransform:'uppercase', letterSpacing:1 }}>Cobrança em massa segura</div>
              <h2 style={{ margin: '6px 0 8px' }}>Cobrar {indiceCobranca + 1} de {filaCobranca.length}</h2>
              <p style={{ margin:'0 0 14px', color:'#64748b', fontWeight:700 }}>
                Para evitar bloqueio do navegador, o sistema abre uma conversa por vez. Clique em abrir WhatsApp, envie a mensagem e depois avance.
              </p>
              {filaCobranca[indiceCobranca] ? (
                <div style={{ border:'1px solid #e2e8f0', borderRadius:16, padding:12, background:'#f8fafc', marginBottom:12 }}>
                  <strong>{filaCobranca[indiceCobranca].cliente_nome}</strong>
                  <div style={{ color:'#64748b', fontWeight:700, fontSize:13, marginTop:4 }}>
                    {formatDateBR(filaCobranca[indiceCobranca].data_vencimento)} • {money(valorAberto(filaCobranca[indiceCobranca]))} em aberto
                  </div>
                  <div style={{ color:'#94a3b8', fontWeight:700, fontSize:12, marginTop:4 }}>
                    {filaCobranca[indiceCobranca].descricao}
                  </div>
                </div>
              ) : null}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, flexWrap:'wrap' }}>
                <button style={miniBtn('dark')} onClick={() => { setFilaCobranca([]); setIndiceCobranca(0) }}>Fechar</button>
                <button style={miniBtn('blue')} onClick={cobrarAtualDaFila}>Abrir WhatsApp</button>
                <button style={miniBtn('green')} onClick={avancarFilaCobranca}>{indiceCobranca + 1 >= filaCobranca.length ? 'Finalizar' : 'Próximo'}</button>
              </div>
            </div>
          </div>
        ) : null}

        {recebendoId ? (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.44)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 50 }}>
            <div style={{ ...cardStyle, maxWidth: 430, width: '100%' }}>
              <h2 style={{ margin: '0 0 12px' }}>Registrar pagamento</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                <input style={inputStyle} value={valorRecebido} onChange={(e) => setValorRecebido(e.target.value)} placeholder="Valor recebido" />
                <select style={inputStyle} value={formaRecebimento} onChange={(e) => setFormaRecebimento(e.target.value)}>
                  <option>Pix</option>
                  <option>Dinheiro</option>
                  <option>Cartão</option>
                  <option>Boleto</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button style={miniBtn('dark')} onClick={() => setRecebendoId(null)}>Cancelar</button>
                  <button style={miniBtn('green')} onClick={confirmarRecebimento}>Confirmar</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </div>
    </>
  )
}

const th: CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 950,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

const td: CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  verticalAlign: 'middle',
}

function miniBtn(tom: 'green' | 'blue' | 'red' | 'dark'): CSSProperties {
  const mapa = {
    green: { bg: 'linear-gradient(135deg,#16a34a,#047857)', color: '#fff' },
    blue: { bg: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff' },
    red: { bg: 'linear-gradient(135deg,#ef4444,#991b1b)', color: '#fff' },
    dark: { bg: '#f1f5f9', color: '#0f172a' },
  }[tom]

  return {
    minHeight: 32,
    borderRadius: 10,
    border: 'none',
    background: mapa.bg,
    color: mapa.color,
    fontWeight: 900,
    padding: '0 10px',
    cursor: 'pointer',
    marginLeft: 5,
    fontSize: 12,
  }
}

function Resumo({ titulo, valor, tom = 'dark' }: { titulo: string; valor: string; tom?: 'dark' | 'green' | 'blue' | 'red' }) {
  const cor =
    tom === 'green' ? '#16a34a' :
    tom === 'blue' ? '#2563eb' :
    tom === 'red' ? '#dc2626' :
    '#0f172a'

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(148,163,184,.24)', borderRadius: 22, padding: 16, boxShadow: '0 14px 34px rgba(15,23,42,.06)' }}>
      <div style={{ color: '#64748b', fontWeight: 950, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>{titulo}</div>
      <div style={{ marginTop: 8, color: cor, fontSize: 24, fontWeight: 950 }}>{valor}</div>
    </div>
  )
}
