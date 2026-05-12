'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BotaoReciboAvulso from '@/components/recibos/botao-recibo-avulso'
import {
  buildAbsoluteUrl,
  buildPublicDocumentPath,
  savePublicDocument,
} from '@/lib/connect-public'

type Cliente = {
  id?: string | number
  codigo?: string
  nome?: string
  telefone?: string
  whatsapp?: string
  email?: string
  endereco?: string
  documento?: string
  cpf?: string
  cnpj?: string
  cpfCnpj?: string
  cep?: string
  ativo?: boolean
}

type OrcamentoSalvo = {
  id: number
  numero: string
  titulo: string
  cliente?: {
    nome?: string
    telefone?: string
    email?: string
    endereco?: string
  } | null
  total: number
  observacao?: string
  status?: string
  data?: string
}

type OrdemServico = {
  id: number
  numero: string
  cliente: string
  telefone: string
  email: string
  endereco: string
  equipamento: string
  marca: string
  modelo: string
  serial: string
  defeito: string
  checklist: string
  observacao: string
  valor: number
  entrada: number
  saldo: number
  status: string
  prioridade: string
  tecnico: string
  previsao: string
  data: string
  ultimaAtualizacao: string
  link: string
  orcamentoId?: number
}

const STORAGE_KEY = 'connect_ordens_servico_salvas'
const CLIENTES_KEY = 'connect_clientes'
const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const CONFIG_KEY = 'connect_configuracoes'

const STATUS_OPTIONS = [
  'Aberta',
  'Aguardando aprovação',
  'Em andamento',
  'Aguardando peça',
  'Finalizada',
  'Entregue',
  'Cancelada',
]

const PRIORIDADE_OPTIONS = ['Baixa', 'Média', 'Alta', 'Urgente']

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function hojeBR() {
  return new Date().toLocaleDateString('pt-BR')
}

function hojeInput() {
  return new Date().toISOString().slice(0, 10)
}

function gerarNumeroExistente(lista: OrdemServico[]) {
  const numeros = lista.map((item) => Number(item.numero)).filter((n) => !Number.isNaN(n))
  const maior = numeros.length ? Math.max(...numeros) : 0
  return String(maior + 1).padStart(4, '0')
}

function corStatus(status: string) {
  switch (status) {
    case 'Aberta':
      return { bg: '#dbeafe', color: '#1d4ed8' }
    case 'Aguardando aprovação':
      return { bg: '#fef3c7', color: '#b45309' }
    case 'Em andamento':
      return { bg: '#ede9fe', color: '#6d28d9' }
    case 'Aguardando peça':
      return { bg: '#ffe4e6', color: '#be123c' }
    case 'Finalizada':
      return { bg: '#dcfce7', color: '#15803d' }
    case 'Entregue':
      return { bg: '#cffafe', color: '#0f766e' }
    case 'Cancelada':
      return { bg: '#e5e7eb', color: '#374151' }
    default:
      return { bg: '#e5e7eb', color: '#111827' }
  }
}

function corPrioridade(prioridade: string) {
  switch (prioridade) {
    case 'Baixa':
      return { bg: '#ecfeff', color: '#0f766e' }
    case 'Média':
      return { bg: '#fef3c7', color: '#b45309' }
    case 'Alta':
      return { bg: '#fee2e2', color: '#b91c1c' }
    case 'Urgente':
      return { bg: '#fde2ff', color: '#9d174d' }
    default:
      return { bg: '#e5e7eb', color: '#111827' }
  }
}

function ordemVazia(lista: OrdemServico[]): OrdemServico {
  const novoNumero = gerarNumeroExistente(lista)
  const hoje = hojeBR()
  return {
    id: Date.now(),
    numero: novoNumero,
    cliente: '',
    telefone: '',
    email: '',
    endereco: '',
    equipamento: '',
    marca: '',
    modelo: '',
    serial: '',
    defeito: '',
    checklist: '',
    observacao: 'Equipamento recebido para análise/manutenção.',
    valor: 0,
    entrada: 0,
    saldo: 0,
    status: 'Aberta',
    prioridade: 'Média',
    tecnico: '',
    previsao: '',
    data: hoje,
    ultimaAtualizacao: hoje,
    link: '',
  }
}

function normalizarCliente(item: any, index: number): Cliente {
  return {
    id: item?.id ?? Date.now() + index,
    codigo: item?.codigo,
    nome: String(item?.nome || ''),
    telefone: String(item?.telefone || item?.whatsapp || ''),
    whatsapp: String(item?.whatsapp || item?.telefone || ''),
    email: String(item?.email || ''),
    endereco: String(item?.endereco || ''),
    documento: String(item?.documento || item?.cpfCnpj || item?.cpf || item?.cnpj || ''),
    cpf: String(item?.cpf || ''),
    cnpj: String(item?.cnpj || ''),
    cpfCnpj: String(item?.cpfCnpj || ''),
    cep: String(item?.cep || ''),
    ativo: item?.ativo !== false,
  }
}

export default function OrdemServicoPage() {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [lista, setLista] = useState<OrdemServico[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [orcamentos, setOrcamentos] = useState<OrcamentoSalvo[]>([])
  const [buscaCliente, setBuscaCliente] = useState('')
  const [mostrarBuscaCliente, setMostrarBuscaCliente] = useState(false)
  const [mostrarImportarOrcamento, setMostrarImportarOrcamento] = useState(false)
  const [buscaOrcamento, setBuscaOrcamento] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [filtroPrioridade, setFiltroPrioridade] = useState('Todas')
  const [ordem, setOrdem] = useState<'recentes' | 'antigas' | 'cliente'>('recentes')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [form, setForm] = useState<OrdemServico>(ordemVazia([]))

  function montarLinkOS(id: number) {
    const path = buildPublicDocumentPath('ordem_servico', id)
    if (typeof window === 'undefined') return path
    return buildAbsoluteUrl(path, window.location.origin)
  }

  function normalizarItem(item: OrdemServico): OrdemServico {
    return {
      ...item,
      id: Number(item.id),
      link: montarLinkOS(Number(item.id)),
      saldo: Math.max(Number(item.valor || 0) - Number(item.entrada || 0), 0),
    }
  }

  function salvarLista(novaLista: OrdemServico[]) {
    setLista(novaLista)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(novaLista))
  }

  function linkValido(item: OrdemServico) {
    return montarLinkOS(Number(item.id))
  }

  function carregarConfigPublica() {
    try {
      const salvo = localStorage.getItem(CONFIG_KEY)
      return salvo ? JSON.parse(salvo) : {}
    } catch {
      return {}
    }
  }

  async function publicarOS(item: OrdemServico) {
    try {
      const publicado = await savePublicDocument({
        document_type: 'ordem_servico',
        document_id: item.id,
        document: item,
        config: carregarConfigPublica(),
      })

      return buildAbsoluteUrl(
        buildPublicDocumentPath('ordem_servico', item.id, publicado.token),
        window.location.origin
      )
    } catch (error) {
      console.error('Erro ao publicar OS:', error)
      return linkValido(item)
    }
  }

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo) {
      try {
        const listaSalva = JSON.parse(salvo)
        if (Array.isArray(listaSalva)) {
          const listaCorrigida = listaSalva.map((item) => normalizarItem(item))
          setLista(listaCorrigida)
          setForm(ordemVazia(listaCorrigida))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(listaCorrigida))
        }
      } catch {}
    }

    const clientesSalvos = localStorage.getItem(CLIENTES_KEY)
    if (clientesSalvos) {
      try {
        const listaClientes = JSON.parse(clientesSalvos)
        if (Array.isArray(listaClientes)) {
          const normalizados = listaClientes
            .map((item, index) => normalizarCliente(item, index))
            .filter((item) => item.ativo !== false && (item.nome || item.telefone || item.email))
          setClientes(normalizados)
        }
      } catch {
        setClientes([])
      }
    } else {
      setClientes([])
    }

    const orcSalvos = localStorage.getItem(ORCAMENTOS_KEY)
    if (orcSalvos) {
      try {
        const listaOrc = JSON.parse(orcSalvos)
        if (Array.isArray(listaOrc)) setOrcamentos(listaOrc)
      } catch {
        setOrcamentos([])
      }
    }
  }, [])

  useEffect(() => {
    setForm((anterior) => ({
      ...anterior,
      saldo: Math.max(Number(anterior.valor || 0) - Number(anterior.entrada || 0), 0),
    }))
  }, [form.valor, form.entrada])

  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase()
    const base = clientes.filter((item) => item.ativo !== false)

    if (!termo) return base.slice(0, 8)

    return base
      .filter((item) =>
        [
          item.nome,
          item.telefone,
          item.whatsapp,
          item.email,
          item.documento,
          item.cpf,
          item.cnpj,
          item.cpfCnpj,
          item.cep,
        ]
          .filter(Boolean)
          .some((valor) => String(valor).toLowerCase().includes(termo))
      )
      .slice(0, 8)
  }, [buscaCliente, clientes])

  const orcamentosDisponiveis = useMemo(() => {
    const convertidosIds = new Set(
      lista
        .filter((item) => Number(item.orcamentoId || 0) > 0)
        .map((item) => Number(item.orcamentoId))
    )

    const base = orcamentos.filter((item) => !convertidosIds.has(Number(item.id)))
    const termo = buscaOrcamento.trim().toLowerCase()

    if (!termo) return base.slice(0, 10)

    return base.filter((item) =>
      `${item.numero} ${item.cliente?.nome || ''} ${item.status || ''}`.toLowerCase().includes(termo)
    ).slice(0, 10)
  }, [orcamentos, lista, buscaOrcamento])

  const listaFiltrada = useMemo(() => {
    let atual = [...lista]
    const termo = busca.trim().toLowerCase()

    if (termo) {
      atual = atual.filter((item) =>
        [
          item.numero,
          item.cliente,
          item.telefone,
          item.equipamento,
          item.marca,
          item.modelo,
          item.serial,
          item.status,
          item.prioridade,
          item.tecnico,
        ]
          .filter(Boolean)
          .some((valor) => String(valor).toLowerCase().includes(termo))
      )
    }

    if (filtroStatus !== 'Todos') atual = atual.filter((item) => item.status === filtroStatus)
    if (filtroPrioridade !== 'Todas') atual = atual.filter((item) => item.prioridade === filtroPrioridade)

    if (ordem === 'recentes') atual.sort((a, b) => b.id - a.id)
    else if (ordem === 'antigas') atual.sort((a, b) => a.id - b.id)
    else atual.sort((a, b) => String(a.cliente).localeCompare(String(b.cliente)))

    return atual
  }, [lista, busca, filtroStatus, filtroPrioridade, ordem])

  const resumo = useMemo(() => {
    const abertas = lista.filter((item) => item.status === 'Aberta').length
    const andamento = lista.filter((item) => item.status === 'Em andamento').length
    const finalizadas = lista.filter((item) => item.status === 'Finalizada').length
    const totalAberto = lista
      .filter((item) => item.status !== 'Entregue' && item.status !== 'Cancelada')
      .reduce((acc, item) => acc + Number(item.saldo || 0), 0)

    return { abertas, andamento, finalizadas, totalAberto }
  }, [lista])

  function atualizar<K extends keyof OrdemServico>(campo: K, valor: OrdemServico[K]) {
    setForm((anterior) => ({ ...anterior, [campo]: valor }))
  }

  function selecionarCliente(item: Cliente) {
    setForm((anterior) => ({
      ...anterior,
      cliente: item.nome || '',
      telefone: item.telefone || item.whatsapp || '',
      email: item.email || '',
      endereco: item.endereco || '',
    }))
    setBuscaCliente(item.nome || '')
    setMostrarBuscaCliente(false)
  }

  function importarOrcamento(orc: OrcamentoSalvo) {
    const existe = lista.find((item) => Number(item.orcamentoId || 0) === Number(orc.id))
    if (existe) {
      alert('Esse orçamento já foi importado para uma OS.')
      return
    }

    const novoId = Date.now()

    const nova: OrdemServico = normalizarItem({
      id: novoId,
      numero: gerarNumeroExistente(lista),
      cliente: orc.cliente?.nome || '',
      telefone: orc.cliente?.telefone || '',
      email: orc.cliente?.email || '',
      endereco: orc.cliente?.endereco || '',
      equipamento: 'Orçamento importado',
      marca: '',
      modelo: '',
      serial: '',
      defeito: orc.observacao || '',
      checklist: '',
      observacao: orc.observacao || '',
      valor: Number(orc.total || 0),
      entrada: 0,
      saldo: Number(orc.total || 0),
      status: 'Aberta',
      prioridade: 'Média',
      tecnico: '',
      previsao: '',
      data: hojeBR(),
      ultimaAtualizacao: hojeBR(),
      link: montarLinkOS(novoId),
      orcamentoId: Number(orc.id),
    })

    const novaLista = [nova, ...lista]
    salvarLista(novaLista)

    const orcAtualizados = orcamentos.map((item) =>
      item.id === orc.id ? { ...item, status: 'Convertido' } : item
    )
    setOrcamentos(orcAtualizados)
    localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(orcAtualizados))

    alert('Orçamento importado para OS com sucesso.')
    setMostrarImportarOrcamento(false)
    setBuscaOrcamento('')
  }

  function limpar() {
    setEditandoId(null)
    setBuscaCliente('')
    setMostrarBuscaCliente(false)
    setMostrarImportarOrcamento(false)
    setBuscaOrcamento('')
    setForm(ordemVazia(lista))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function salvar() {
    if (!form.cliente.trim()) {
      alert('Preencha o cliente.')
      return
    }

    if (!form.equipamento.trim()) {
      alert('Preencha o equipamento.')
      return
    }

    if (editandoId !== null) {
      const atualizada: OrdemServico = normalizarItem({
        ...form,
        id: editandoId,
        ultimaAtualizacao: hojeBR(),
      })

      const novaLista = lista.map((item) => (item.id === editandoId ? atualizada : item))
      salvarLista(novaLista)
      alert('OS atualizada com sucesso.')
      limpar()
      return
    }

    const novoId = Date.now()
    const nova: OrdemServico = normalizarItem({
      ...form,
      id: novoId,
      numero: gerarNumeroExistente(lista),
      data: hojeBR(),
      ultimaAtualizacao: hojeBR(),
    })

    const novaLista = [nova, ...lista]
    salvarLista(novaLista)
    alert('OS salva com sucesso.')
    limpar()
  }

  function editar(item: OrdemServico) {
    const itemCorrigido = normalizarItem(item)
    setEditandoId(itemCorrigido.id)
    setBuscaCliente(itemCorrigido.cliente || '')
    setForm({ ...itemCorrigido })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function excluir(id: number) {
    if (!confirm('Deseja excluir esta OS?')) return
    const atual = lista.find((item) => item.id === id)
    const novaLista = lista.filter((item) => item.id !== id)
    salvarLista(novaLista)

    if (atual?.orcamentoId) {
      const orcAtualizados = orcamentos.map((item) =>
        item.id === atual.orcamentoId ? { ...item, status: 'Pendente' } : item
      )
      setOrcamentos(orcAtualizados)
      localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(orcAtualizados))
    }

    if (editandoId === id) limpar()
  }

  function duplicar(item: OrdemServico) {
    const novoId = Date.now()
    const copia: OrdemServico = normalizarItem({
      ...item,
      id: novoId,
      numero: gerarNumeroExistente(lista),
      data: hojeBR(),
      ultimaAtualizacao: hojeBR(),
      status: 'Aberta',
      orcamentoId: undefined,
    })
    const novaLista = [copia, ...lista]
    salvarLista(novaLista)
    alert('OS duplicada com sucesso.')
  }

  async function abrir(item: OrdemServico) {
    const link = await publicarOS(item)
    window.open(link, '_blank')
  }

  async function copiarLink(item: OrdemServico) {
    const link = await publicarOS(item)
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        alert('Link copiado com sucesso.')
      }).catch(() => {
        alert(link)
      })
      return
    }
    alert(link)
  }

  async function compartilharWhatsApp(item: OrdemServico) {
    const link = await publicarOS(item)
    window.open(`https://wa.me/?text=${encodeURIComponent(link)}`, '_blank')
  }

  const pageStyle: React.CSSProperties = {
    maxWidth: 1180,
    margin: '0 auto',
    padding: isMobile ? 12 : 20,
    color: '#111827',
  }

  const titleTopStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  }

  const shellStyle: React.CSSProperties = {
    background: '#f5f1e8',
    borderRadius: isMobile ? 18 : 28,
    padding: isMobile ? 14 : 24,
    boxShadow: '0 14px 34px rgba(0,0,0,0.10)',
    border: '2px solid #e5e7eb',
  }

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: isMobile ? 14 : 20,
    padding: isMobile ? 10 : 14,
    boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
    border: '2px solid #e5e7eb',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 800,
    color: '#374151',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    color: '#111827',
    padding: '10px 12px',
    boxSizing: 'border-box',
    outline: 'none',
    fontSize: 13,
  }

  const buttonBase: React.CSSProperties = {
    height: isMobile ? 34 : 32,
    border: 'none',
    borderRadius: 10,
    padding: isMobile ? '0 12px' : '0 10px',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 12,
  }

  return (
    <div style={pageStyle}>
      <div style={titleTopStyle}>Painel Técnico Premium</div>

      <h1
        style={{
          margin: '0 0 16px 0',
          fontSize: isMobile ? 34 : 44,
          lineHeight: 1,
          fontWeight: 900,
          color: '#ffffff',
          textShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        Ordem de Serviço
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <ResumoCard titulo="OS abertas" valor={String(resumo.abertas)} />
        <ResumoCard titulo="Em andamento" valor={String(resumo.andamento)} />
        <ResumoCard titulo="Finalizadas" valor={String(resumo.finalizadas)} />
        <ResumoCard titulo="Saldo em aberto" valor={moeda(resumo.totalAberto)} />
      </div>

      <div style={shellStyle}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr',
            gap: 18,
          }}
        >
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', lineHeight: 1 }}>
                  {editandoId ? 'Editar OS' : 'Nova OS'}
                </div>
                <div style={{ color: '#6b7280', marginTop: 6 }}>
                  Cadastro completo com cliente, status, prioridade e controle financeiro.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => setMostrarImportarOrcamento((v) => !v)}
                  style={{ ...buttonBase, background: '#059669', color: '#fff', height: 40, padding: '0 16px' }}
                >
                  Importar orçamento
                </button>

                <BotaoReciboAvulso />

                <div
                  style={{
                    background: '#111827',
                    color: '#fff',
                    borderRadius: 999,
                    padding: '10px 16px',
                    fontWeight: 800,
                  }}
                >
                  Nº {form.numero}
                </div>
              </div>
            </div>

            {mostrarImportarOrcamento && (
              <div style={{ marginBottom: 14, position: 'relative' }}>
                <label style={labelStyle}>📄 Importar orçamento salvo</label>
                <input
                  style={inputStyle}
                  placeholder="Buscar por número, cliente ou status..."
                  value={buscaOrcamento}
                  onChange={(e) => setBuscaOrcamento(e.target.value)}
                />
                <div
                  style={{
                    marginTop: 10,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    boxShadow: '0 12px 24px rgba(0,0,0,0.10)',
                    zIndex: 50,
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}
                >
                  {orcamentosDisponiveis.length === 0 ? (
                    <div style={{ padding: '12px 14px', color: '#64748b' }}>
                      Nenhum orçamento disponível para importar.
                    </div>
                  ) : (
                    orcamentosDisponiveis.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => importarOrcamento(item)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: '#fff',
                          cursor: 'pointer',
                          padding: '12px 14px',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div style={{ fontWeight: 800, color: '#111827', fontSize: 13 }}>
                          {item.numero} • {item.cliente?.nome || 'Sem cliente'}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          {item.status || 'Pendente'} • {moeda(item.total)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14, position: 'relative' }}>
              <label style={labelStyle}>🔎 Puxar cliente cadastrado</label>
              <input
                style={inputStyle}
                placeholder="Digite nome, telefone, CPF/CNPJ..."
                value={buscaCliente}
                onChange={(e) => {
                  setBuscaCliente(e.target.value)
                  setMostrarBuscaCliente(true)
                }}
                onFocus={() => setMostrarBuscaCliente(true)}
              />

              {mostrarBuscaCliente && clientesFiltrados.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 74,
                    left: 0,
                    right: 0,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    boxShadow: '0 12px 24px rgba(0,0,0,0.10)',
                    zIndex: 50,
                    maxHeight: 220,
                    overflowY: 'auto',
                  }}
                >
                  {clientesFiltrados.map((item, index) => (
                    <button
                      key={`${item.id ?? item.codigo ?? item.nome ?? index}`}
                      type="button"
                      onClick={() => selecionarCliente(item)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        background: '#fff',
                        cursor: 'pointer',
                        padding: '12px 14px',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: '#111827', fontSize: 13 }}>
                        {item.nome || 'Sem nome'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        {[item.telefone || item.whatsapp, item.email].filter(Boolean).join(' • ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <Campo label="👤 Cliente" value={form.cliente} onChange={(v) => atualizar('cliente', v)} inputStyle={inputStyle} />
              <Campo label="📞 Telefone" value={form.telefone} onChange={(v) => atualizar('telefone', v)} inputStyle={inputStyle} />
              <Campo label="✉️ E-mail" value={form.email} onChange={(v) => atualizar('email', v)} inputStyle={inputStyle} />
              <Campo label="📍 Endereço" value={form.endereco} onChange={(v) => atualizar('endereco', v)} inputStyle={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 12 }}>
              <Campo label="🖨️ Equipamento" value={form.equipamento} onChange={(v) => atualizar('equipamento', v)} inputStyle={inputStyle} />
              <Campo label="🔐 Serial / IMEI" value={form.serial} onChange={(v) => atualizar('serial', v)} inputStyle={inputStyle} />
              <Campo label="🏷️ Marca" value={form.marca} onChange={(v) => atualizar('marca', v)} inputStyle={inputStyle} />
              <Campo label="🔧 Modelo" value={form.modelo} onChange={(v) => atualizar('modelo', v)} inputStyle={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <SelectCampo label="🛠️ Status" value={form.status} onChange={(v) => atualizar('status', v)} options={STATUS_OPTIONS} inputStyle={inputStyle} />
              <SelectCampo label="🚨 Prioridade" value={form.prioridade} onChange={(v) => atualizar('prioridade', v)} options={PRIORIDADE_OPTIONS} inputStyle={inputStyle} />
              <Campo label="👨‍🔧 Técnico" value={form.tecnico} onChange={(v) => atualizar('tecnico', v)} inputStyle={inputStyle} />
              <Campo label="📅 Previsão" type="date" value={form.previsao || hojeInput()} onChange={(v) => atualizar('previsao', v)} inputStyle={inputStyle} />
            </div>

            <div style={{ marginTop: 12 }}>
              <TextAreaCampo label="⚠️ Defeito informado" value={form.defeito} onChange={(v) => atualizar('defeito', v)} inputStyle={inputStyle} />
            </div>

            <div style={{ marginTop: 12 }}>
              <TextAreaCampo label="📦 Checklist / acessórios" value={form.checklist} onChange={(v) => atualizar('checklist', v)} inputStyle={inputStyle} />
            </div>

            <div style={{ marginTop: 12 }}>
              <TextAreaCampo label="📝 Observação" value={form.observacao} onChange={(v) => atualizar('observacao', v)} inputStyle={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <Campo label="💰 Valor do serviço" type="number" value={String(form.valor || 0)} onChange={(v) => atualizar('valor', Number(v || 0))} inputStyle={inputStyle} />
              <Campo label="💵 Entrada" type="number" value={String(form.entrada || 0)} onChange={(v) => atualizar('entrada', Number(v || 0))} inputStyle={inputStyle} />
              <div>
                <label style={labelStyle}>📌 Saldo</label>
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', fontWeight: 800 }}>
                  {moeda(form.saldo)}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              <button onClick={limpar} style={{ ...buttonBase, background: '#d1d5db', color: '#111827' }}>
                Limpar
              </button>
              <button onClick={salvar} style={{ ...buttonBase, background: '#f97316', color: '#fff' }}>
                {editandoId ? 'Atualizar OS' : 'Salvar OS'}
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', lineHeight: 1 }}>
              Gestão de OS
            </div>
            <div style={{ color: '#6b7280', marginTop: 6, marginBottom: 14 }}>
              Pesquisa rápida, filtros por status, prioridade e lista completa.
            </div>

            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              placeholder="Buscar por número, cliente, equipamento, serial..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <SelectCampo
                label="Filtro status"
                value={filtroStatus}
                onChange={setFiltroStatus}
                options={['Todos', ...STATUS_OPTIONS]}
                inputStyle={inputStyle}
              />
              <SelectCampo
                label="Filtro prioridade"
                value={filtroPrioridade}
                onChange={setFiltroPrioridade}
                options={['Todas', ...PRIORIDADE_OPTIONS]}
                inputStyle={inputStyle}
              />
              <SelectCampo
                label="Ordenação"
                value={ordem}
                onChange={(v) => setOrdem(v as 'recentes' | 'antigas' | 'cliente')}
                options={['recentes', 'antigas', 'cliente']}
                inputStyle={inputStyle}
              />
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 999,
                padding: '8px 14px',
                fontWeight: 800,
                color: '#111827',
                display: 'inline-block',
                marginBottom: 12,
              }}
            >
              {listaFiltrada.length} registro(s)
            </div>

            <div style={{ maxHeight: isMobile ? 'unset' : 760, overflowY: 'auto', paddingRight: 4 }}>
              {listaFiltrada.length === 0 ? (
                <div style={{ ...cardStyle, color: '#475569' }}>
                  Nenhuma ordem de serviço encontrada.
                </div>
              ) : (
                listaFiltrada.map((item) => {
                  const itemCorrigido = normalizarItem(item)
                  const statusCor = corStatus(itemCorrigido.status)
                  const prioridadeCor = corPrioridade(itemCorrigido.prioridade)

                  return (
                    <div
                      key={itemCorrigido.id}
                      style={{
                        ...cardStyle,
                        marginBottom: 10,
                        padding: '10px',
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: '#111827' }}>OS #{itemCorrigido.numero}</div>
                          <span style={{ background: statusCor.bg, color: statusCor.color, borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 800 }}>
                            {itemCorrigido.status}
                          </span>
                          <span style={{ background: prioridadeCor.bg, color: prioridadeCor.color, borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 800 }}>
                            {itemCorrigido.prioridade}
                          </span>
                          {itemCorrigido.orcamentoId ? (
                            <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 800 }}>
                              Importada do orçamento
                            </span>
                          ) : null}
                        </div>

                        <div style={{ fontWeight: 800, color: '#111827', fontSize: 13, marginBottom: 2, lineHeight: 1.2 }}>
                          {itemCorrigido.cliente || '-'}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>
                          {[itemCorrigido.equipamento, itemCorrigido.marca, itemCorrigido.modelo].filter(Boolean).join(' • ') || '-'}
                        </div>
                        <div style={{ color: '#374151', fontSize: 11 }}>
                          <strong>Data:</strong> {itemCorrigido.data || '-'} &nbsp; • &nbsp;
                          <strong>Valor:</strong> {moeda(itemCorrigido.valor)}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: 8,
                        }}
                      >
                        <button onClick={() => abrir(itemCorrigido)} style={{ ...buttonBase, background: '#2563eb', color: '#fff' }}>
                          Abrir
                        </button>
                        <button onClick={() => copiarLink(itemCorrigido)} style={{ ...buttonBase, background: '#7c3aed', color: '#fff' }}>
                          Copiar link
                        </button>
                        <button onClick={() => compartilharWhatsApp(itemCorrigido)} style={{ ...buttonBase, background: '#16a34a', color: '#fff' }}>
                          WhatsApp
                        </button>
                        <button onClick={() => editar(itemCorrigido)} style={{ ...buttonBase, background: '#f59e0b', color: '#fff' }}>
                          Editar
                        </button>
                        <button onClick={() => duplicar(itemCorrigido)} style={{ ...buttonBase, background: '#14b8a6', color: '#fff' }}>
                          Duplicar
                        </button>
                        <button onClick={() => excluir(itemCorrigido.id)} style={{ ...buttonBase, background: '#ef4444', color: '#fff' }}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResumoCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 18,
        padding: 18,
        border: '2px solid #e5e7eb',
        boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>{valor}</div>
    </div>
  )
}

function Campo({
  label,
  value,
  onChange,
  inputStyle,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputStyle: React.CSSProperties
  type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800, color: '#374151' }}>{label}</label>
      <input type={type} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function TextAreaCampo({
  label,
  value,
  onChange,
  inputStyle,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputStyle: React.CSSProperties
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800, color: '#374151' }}>{label}</label>
      <textarea style={{ ...inputStyle, minHeight: 90 }} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function SelectCampo({
  label,
  value,
  onChange,
  options,
  inputStyle,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  inputStyle: React.CSSProperties
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 800, color: '#374151' }}>{label}</label>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  )
}
