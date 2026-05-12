'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LOGO_PATH,
  buildAbsoluteUrl,
  buildPublicDocumentPath,
  buildPrintOrcamentoPath,
  buildPublicOrcamentoPath,
  normalizeBrazilWhatsAppNumber,
  savePublicDocument,
} from '@/lib/connect-public'

type TipoPessoaCliente = 'PF' | 'PJ'

type Cliente = {
  id: number
  nome: string
  telefone: string
  email: string
  endereco: string
  tipoPessoa?: TipoPessoaCliente
  cpf?: string
  cnpj?: string
  razaoSocial?: string
  nomeFantasia?: string
}

type Produto = {
  id: number
  nome: string
  valor: number
}

type TipoCalculoItem = 'unidade' | 'm2'
type StatusOrcamento = 'Pendente' | 'Aprovado' | 'Convertido' | 'Cancelado'

type ItemOrcamento = {
  id: number
  nome: string
  quantidade: number
  valor: number
  tipoCalculo?: TipoCalculoItem
  largura?: number
  altura?: number
  metragem?: number
  valorM2?: number
}

type OrcamentoSalvo = {
  id: number
  numero: string
  titulo: string
  cliente: Cliente | null
  itens: ItemOrcamento[]
  subtotal: number
  entrega: number
  desconto: number
  total: number
  formaPagamento: string
  validade: string
  prazoEntrega: string
  observacao: string
  status: StatusOrcamento
  data: string
  link: string
}

type VendaSalva = {
  id: number
  numero: string
  orcamentoId?: number
  cliente: Cliente | null
  itens: ItemOrcamento[]
  subtotal: number
  desconto: number
  total: number
  formaPagamento: string
  observacao: string
  status: string
  data: string
  origem: string
}

type ConfiguracaoSistema = {
  nomeEmpresa: string
  telefone: string
  email: string
  endereco: string
  cidadeUf: string
  responsavel: string
  tituloPdf: string
  rodapePdf: string
  validadePadrao: string
  prazoEntregaPadrao: string
  formaPagamentoPadrao: string
  corPrimaria: string
  corSecundaria: string
  corTabela: string
  mostrarQuantidade: boolean
  logoUrl: string
}

type Toast = {
  texto: string
  tipo: 'success' | 'error' | 'info'
}

const CONFIG_KEY = 'connect_configuracoes'
const FORMAS_KEY = 'connect_formas_pagamento'
const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const OS_KEY = 'connect_ordens_servico_salvas'
const VENDAS_KEY = 'connect_vendas_salvas'
const PRODUTOS_KEY = 'connect_produtos'
const CLIENTES_KEY = 'connect_clientes'

const NOVO_CLIENTE_INICIAL = {
  nome: '',
  telefone: '',
  email: '',
  endereco: '',
  cpf: '',
  cnpj: '',
  razaoSocial: '',
  nomeFantasia: '',
}

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatarDecimalVisual(valor?: number) {
  if (!valor) return ''
  return String(valor).replace('.', ',')
}

function textoParaNumeroDecimal(valor: string) {
  const texto = valor.replace(/\s/g, '').replace(',', '.')
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function calcularMetragem(largura?: number, altura?: number) {
  return Number((Number(largura || 0) * Number(altura || 0)).toFixed(4))
}

function calcularTotalItem(item: ItemOrcamento) {
  if (item.tipoCalculo === 'm2') {
    const metragem = Number(item.metragem || calcularMetragem(item.largura, item.altura))
    const valorM2 = Number(item.valorM2 ?? item.valor ?? 0)
    return metragem * valorM2
  }

  return Number(item.quantidade || 0) * Number(item.valor || 0)
}

function normalizarStatus(status?: string): StatusOrcamento {
  if (status === 'Aprovado' || status === 'Convertido' || status === 'Cancelado') return status
  return 'Pendente'
}

export default function OrcamentoPage() {
  const clientesMock: Cliente[] = [
    { id: 1, nome: 'ERIC DAMASCENO', telefone: '84992181399', email: 'lojaconnect@hotmail.com', endereco: 'GILBERTO ROBERTO GOMES,243' },
    { id: 2, nome: 'MARIA SOUZA', telefone: '84999998888', email: 'maria@email.com', endereco: 'RUA DAS FLORES,120' },
  ]

  const produtosMock: Produto[] = [
    { id: 1, nome: 'FORMATAÇÃO PC', valor: 100 },
    { id: 2, nome: 'TROCA DE TELA', valor: 250 },
    { id: 3, nome: 'LIMPEZA TÉCNICA', valor: 80 },
    { id: 4, nome: 'FONTE PC 200W GOLDEN', valor: 129.9 },
  ]

  const [isMobile, setIsMobile] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [darkMode, setDarkMode] = useState(false)

  const [config, setConfig] = useState<ConfiguracaoSistema>({
    nomeEmpresa: 'LOJA CONNECT',
    telefone: '84992181399',
    email: 'lojaconnect@hotmail.com',
    endereco: 'GILBERTO ROBERTO GOMES,243',
    cidadeUf: 'PARNAMIRIM-RN',
    responsavel: 'ERES FAUSTINO',
    tituloPdf: 'Orçamento Comercial',
    rodapePdf: 'Obrigado pela preferência.',
    validadePadrao: '7 dias',
    prazoEntregaPadrao: '3 dias',
    formaPagamentoPadrao: 'CARTAO 1X',
    corPrimaria: '#111827',
    corSecundaria: '#1d4ed8',
    corTabela: '#f3f4f6',
    mostrarQuantidade: true,
    logoUrl: DEFAULT_LOGO_PATH,
  })

  const [formasPagamento, setFormasPagamento] = useState<string[]>(['PIX', 'DINHEIRO', 'CARTAO 1X'])
  const [clientes, setClientes] = useState<Cliente[]>(clientesMock)
  const [produtos, setProdutos] = useState<Produto[]>(produtosMock)

  const [clienteBusca, setClienteBusca] = useState('')
  const [produtoBusca, setProdutoBusca] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [quantidade, setQuantidade] = useState(1)

  const [modoItem, setModoItem] = useState<TipoCalculoItem>('unidade')
  const [larguraItem, setLarguraItem] = useState(0)
  const [alturaItem, setAlturaItem] = useState(0)

  const [itens, setItens] = useState<ItemOrcamento[]>([])
  const [tituloPdf, setTituloPdf] = useState('Orçamento Comercial')
  const [observacao, setObservacao] = useState('Obrigado pela preferência.')
  const [formaPagamento, setFormaPagamento] = useState('PIX')
  const [validade, setValidade] = useState('')
  const [prazoEntrega, setPrazoEntrega] = useState('')
  const [valorEntrega, setValorEntrega] = useState(0)
  const [valorDesconto, setValorDesconto] = useState(0)
  const [mostrarBuscaCliente, setMostrarBuscaCliente] = useState(false)
  const [mostrarBuscaProduto, setMostrarBuscaProduto] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [orcamentosSalvos, setOrcamentosSalvos] = useState<OrcamentoSalvo[]>([])
  const [editandoOrcamentoId, setEditandoOrcamentoId] = useState<number | null>(null)

  const [mostrarNovoCliente, setMostrarNovoCliente] = useState(false)
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaCliente>('PF')
  const [novoCliente, setNovoCliente] = useState({
    ...NOVO_CLIENTE_INICIAL,
  })

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const atualizar = () => setDarkMode(media.matches)
    atualizar()
    media.addEventListener?.('change', atualizar)
    return () => media.removeEventListener?.('change', atualizar)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const salvoConfig = localStorage.getItem(CONFIG_KEY)
    if (salvoConfig) {
      try {
        const dados = JSON.parse(salvoConfig)
        setConfig((anterior) => ({
          ...anterior,
          ...dados,
          logoUrl: dados.logoUrl === '/logo-connect.png' ? DEFAULT_LOGO_PATH : dados.logoUrl || anterior.logoUrl,
        }))
        setTituloPdf(dados.tituloPdf || 'Orçamento Comercial')
        setObservacao(dados.rodapePdf || 'Obrigado pela preferência.')
        setFormaPagamento(dados.formaPagamentoPadrao || 'PIX')
        setValidade(dados.validadePadrao || '')
        setPrazoEntrega(dados.prazoEntregaPadrao || '')
      } catch {}
    }

    const salvoFormas = localStorage.getItem(FORMAS_KEY)
    if (salvoFormas) {
      try {
        const lista = JSON.parse(salvoFormas)
        if (Array.isArray(lista) && lista.length > 0) {
          const normalizadas = lista
            .map((item) => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && 'nome' in item) return String(item.nome)
              return ''
            })
            .filter(Boolean)

          const unicas = normalizadas.filter((item, index, arr) => arr.indexOf(item) === index)
          if (unicas.length > 0) {
            setFormasPagamento(unicas)
            setFormaPagamento(unicas[0])
          }
        }
      } catch {}
    }

    const salvos = localStorage.getItem(ORCAMENTOS_KEY)
    if (salvos) {
      try {
        const lista = JSON.parse(salvos)
        if (Array.isArray(lista)) {
          setOrcamentosSalvos(
            lista.map((item) => ({
              ...item,
              status: normalizarStatus(item.status),
              link: gerarLinkDocumento(Number(item.id)),
            }))
          )
        }
      } catch {}
    }

    const salvosProdutos = localStorage.getItem(PRODUTOS_KEY)
    if (salvosProdutos) {
      try {
        const lista = JSON.parse(salvosProdutos)
        if (Array.isArray(lista) && lista.length > 0) {
          const normalizados = lista
            .map((produto: any, index: number) => ({
              id: Number(produto?.id ?? index + 1),
              nome: String(produto?.nome ?? produto?.descricao ?? '').trim(),
              valor: Number(produto?.valor ?? produto?.preco ?? 0),
            }))
            .filter((produto: Produto) => produto.nome)

          if (normalizados.length > 0) setProdutos(normalizados)
        }
      } catch {}
    }

    const salvosClientes = localStorage.getItem(CLIENTES_KEY)
    if (salvosClientes) {
      try {
        const lista = JSON.parse(salvosClientes)
        if (Array.isArray(lista) && lista.length > 0) {
          const normalizados = lista
            .map((cliente: any, index: number): Cliente => ({
              id: Number(cliente?.id ?? index + 1),
              nome: String(cliente?.nome ?? '').trim(),
              telefone: String(cliente?.telefone ?? ''),
              email: String(cliente?.email ?? ''),
              endereco: String(cliente?.endereco ?? ''),
              tipoPessoa: cliente?.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
              cpf: String(cliente?.cpf ?? ''),
              cnpj: String(cliente?.cnpj ?? ''),
              razaoSocial: String(cliente?.razaoSocial ?? ''),
              nomeFantasia: String(cliente?.nomeFantasia ?? ''),
            }))
            .filter((cliente: Cliente) => Boolean(cliente.nome))

          if (normalizados.length > 0) setClientes(normalizados)
        }
      } catch {}
    }
  }, [])

  const metragemAtual = useMemo(() => calcularMetragem(larguraItem, alturaItem), [larguraItem, alturaItem])
  const subtotal = useMemo(() => itens.reduce((acc, item) => acc + calcularTotalItem(item), 0), [itens])
  const total = useMemo(() => Math.max(0, subtotal + valorEntrega - valorDesconto), [subtotal, valorEntrega, valorDesconto])

  const resumo = useMemo(() => {
    const totalDocumentos = orcamentosSalvos.length
    const pendentes = orcamentosSalvos.filter((item) => item.status === 'Pendente').length
    const aprovados = orcamentosSalvos.filter((item) => item.status === 'Aprovado').length
    const convertidos = orcamentosSalvos.filter((item) => item.status === 'Convertido').length
    const cancelados = orcamentosSalvos.filter((item) => item.status === 'Cancelado').length
    const somaValores = orcamentosSalvos.reduce((acc, item) => acc + Number(item.total || 0), 0)
    const totalAprovado = orcamentosSalvos
      .filter((item) => item.status === 'Aprovado' || item.status === 'Convertido')
      .reduce((acc, item) => acc + Number(item.total || 0), 0)
    const taxaAprovacao = totalDocumentos > 0 ? ((aprovados + convertidos) / totalDocumentos) * 100 : 0
    const ticketMedio = totalDocumentos > 0 ? somaValores / totalDocumentos : 0

    return {
      totalDocumentos,
      pendentes,
      aprovados,
      convertidos,
      cancelados,
      somaValores,
      totalAprovado,
      taxaAprovacao,
      ticketMedio,
    }
  }, [orcamentosSalvos])

  const clientesFiltrados = useMemo(() => {
    const termo = clienteBusca.trim().toLowerCase()
    if (!termo) return clientes
    return clientes.filter((cliente) => cliente.nome.toLowerCase().includes(termo) || cliente.telefone.toLowerCase().includes(termo) || String(cliente.cpf || '').toLowerCase().includes(termo) || String(cliente.cnpj || '').toLowerCase().includes(termo))
  }, [clienteBusca, clientes])

  const produtosFiltrados = useMemo(() => {
    const termo = produtoBusca.trim().toLowerCase()
    if (!termo) return produtos
    return produtos.filter((produto) => produto.nome.toLowerCase().includes(termo))
  }, [produtoBusca, produtos])

  function notificar(texto: string, tipo: Toast['tipo'] = 'success') {
    setToast({ texto, tipo })
  }

  function salvarListaOrcamentos(lista: OrcamentoSalvo[]) {
    setOrcamentosSalvos(lista)
    localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(lista))
  }

  function salvarListaClientes(lista: Cliente[]) {
    setClientes(lista)
    localStorage.setItem(CLIENTES_KEY, JSON.stringify(lista))
  }

  async function buscarCNPJ() {
    try {
      const cnpj = String(novoCliente.cnpj || '').replace(/\D/g, '')

      if (cnpj.length !== 14) {
        notificar('Digite um CNPJ válido.', 'error')
        return
      }

      const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
      if (!resposta.ok) {
        notificar('Não foi possível consultar esse CNPJ.', 'error')
        return
      }

      const data = await resposta.json()

      setNovoCliente((atual) => ({
        ...atual,
        nome: data.nome_fantasia || data.razao_social || atual.nome,
        razaoSocial: data.razao_social || '',
        nomeFantasia: data.nome_fantasia || '',
        email: atual.email,
        telefone: atual.telefone,
        endereco: [data.descricao_tipo_de_logradouro || '', data.logradouro || '', data.numero || '', data.bairro || '', data.municipio || '', data.uf || '']
          .filter(Boolean)
          .join(' - '),
        cnpj,
      }))

      notificar('Dados do CNPJ carregados com sucesso!')
    } catch {
      notificar('Erro ao buscar CNPJ.', 'error')
    }
  }

  function cadastrarNovoClienteRapido() {
    const nomeBase = String(novoCliente.nome || '').trim()
    const razaoSocial = String(novoCliente.razaoSocial || '').trim()
    const nomeFantasia = String(novoCliente.nomeFantasia || '').trim()
    const telefone = String(novoCliente.telefone || '').trim()
    const email = String(novoCliente.email || '').trim()
    const endereco = String(novoCliente.endereco || '').trim()
    const cpf = String(novoCliente.cpf || '').trim()
    const cnpj = String(novoCliente.cnpj || '').trim()

    if (tipoPessoa === 'PF' && !nomeBase) {
      notificar('Digite o nome do cliente.', 'error')
      return
    }

    if (tipoPessoa === 'PJ' && !razaoSocial && !nomeBase) {
      notificar('Digite a razão social ou busque o CNPJ.', 'error')
      return
    }

    const cliente: Cliente = {
      id: Date.now(),
      nome: tipoPessoa === 'PJ' ? (razaoSocial || nomeFantasia || nomeBase) : nomeBase,
      telefone,
      email,
      endereco,
      tipoPessoa,
      cpf,
      cnpj,
      razaoSocial,
      nomeFantasia,
    }

    const listaAtualizada = [cliente, ...clientes]
    salvarListaClientes(listaAtualizada)
    selecionarCliente(cliente)
    setNovoCliente({ ...NOVO_CLIENTE_INICIAL })
    setTipoPessoa('PF')
    setMostrarNovoCliente(false)
    notificar('Cliente cadastrado com sucesso!')
  }

  function gerarNumeroDocumentoIgnorandoAtual() {
    const numeros = orcamentosSalvos
      .filter((o) => o.id !== editandoOrcamentoId)
      .map((o) => Number(o.numero))
      .filter((n) => !Number.isNaN(n))
    const maior = numeros.length ? Math.max(...numeros) : 0
    return String(maior + 1).padStart(4, '0')
  }

  function gerarNumeroVenda() {
    const salvas = localStorage.getItem(VENDAS_KEY)
    const vendas: VendaSalva[] = salvas ? JSON.parse(salvas) : []
    const numeros = vendas.map((v) => Number(v.numero)).filter((n) => !Number.isNaN(n))
    const maior = numeros.length ? Math.max(...numeros) : 0
    return String(maior + 1).padStart(4, '0')
  }

  function gerarLinkDocumento(id: number) {
    return buildAbsoluteUrl(buildPublicOrcamentoPath(id), window.location.origin)
  }

  function limparCamposItem() {
    setProdutoBusca('')
    setQuantidade(1)
    setModoItem('unidade')
    setLarguraItem(0)
    setAlturaItem(0)
    setMostrarBuscaProduto(false)
    setEditandoId(null)
  }

  function novoOrcamento() {
    setClienteSelecionado(null)
    setClienteBusca('')
    limparCamposItem()
    setItens([])
    setTituloPdf(config.tituloPdf || 'Orçamento Comercial')
    setObservacao(config.rodapePdf || 'Obrigado pela preferência.')
    setFormaPagamento(config.formaPagamentoPadrao || formasPagamento[0] || 'PIX')
    setValidade(config.validadePadrao || '')
    setPrazoEntrega(config.prazoEntregaPadrao || '')
    setValorEntrega(0)
    setValorDesconto(0)
    setMostrarBuscaCliente(false)
    setEditandoOrcamentoId(null)
    setMostrarNovoCliente(false)
    setNovoCliente({ ...NOVO_CLIENTE_INICIAL })
  }

  function selecionarCliente(cliente: Cliente) {
    setClienteSelecionado(cliente)
    setClienteBusca(cliente.nome)
    setMostrarBuscaCliente(false)
  }

  function adicionarOuAtualizarProduto(produto: Produto) {
    if (modoItem === 'unidade') {
      if (!quantidade || quantidade <= 0) {
        notificar('Digite uma quantidade válida.', 'error')
        return
      }

      if (editandoId !== null) {
        setItens((atual) =>
          atual.map((item) =>
            item.id === editandoId
              ? {
                  ...item,
                  nome: produto.nome,
                  quantidade,
                  valor: produto.valor,
                  tipoCalculo: 'unidade',
                  largura: 0,
                  altura: 0,
                  metragem: 0,
                  valorM2: 0,
                }
              : item
          )
        )
        notificar('Item atualizado.')
      } else {
        const novoItem: ItemOrcamento = {
          id: Date.now(),
          nome: produto.nome,
          quantidade,
          valor: produto.valor,
          tipoCalculo: 'unidade',
        }
        setItens((atual) => [...atual, novoItem])
        notificar('Item adicionado.')
      }

      limparCamposItem()
      return
    }

    if (!larguraItem || larguraItem <= 0) {
      notificar('Digite a largura do item.', 'error')
      return
    }

    if (!alturaItem || alturaItem <= 0) {
      notificar('Digite a altura do item.', 'error')
      return
    }

    const metragem = calcularMetragem(larguraItem, alturaItem)

    if (!metragem || metragem <= 0) {
      notificar('A metragem calculada é inválida.', 'error')
      return
    }

    if (editandoId !== null) {
      setItens((atual) =>
        atual.map((item) =>
          item.id === editandoId
            ? {
                ...item,
                nome: produto.nome,
                quantidade: 1,
                valor: produto.valor,
                tipoCalculo: 'm2',
                largura: larguraItem,
                altura: alturaItem,
                metragem,
                valorM2: produto.valor,
              }
            : item
        )
      )
      notificar('Item por m² atualizado.')
    } else {
      const novoItem: ItemOrcamento = {
        id: Date.now(),
        nome: produto.nome,
        quantidade: 1,
        valor: produto.valor,
        tipoCalculo: 'm2',
        largura: larguraItem,
        altura: alturaItem,
        metragem,
        valorM2: produto.valor,
      }
      setItens((atual) => [...atual, novoItem])
      notificar('Item por m² adicionado.')
    }

    limparCamposItem()
  }

  function editarItem(item: ItemOrcamento) {
    setProdutoBusca(item.nome)
    setEditandoId(item.id)
    setMostrarBuscaProduto(true)

    if (item.tipoCalculo === 'm2') {
      setModoItem('m2')
      setLarguraItem(Number(item.largura || 0))
      setAlturaItem(Number(item.altura || 0))
      setQuantidade(1)
    } else {
      setModoItem('unidade')
      setQuantidade(item.quantidade)
      setLarguraItem(0)
      setAlturaItem(0)
    }
  }

  function removerItem(id: number) {
    setItens((atual) => atual.filter((item) => item.id !== id))
    if (editandoId === id) limparCamposItem()
    notificar('Item removido.', 'info')
  }

  function alterarQuantidadeItem(id: number, novaQtd: number) {
    if (!novaQtd || novaQtd <= 0) return
    setItens((atual) => atual.map((item) => (item.id === id && item.tipoCalculo !== 'm2' ? { ...item, quantidade: novaQtd } : item)))
  }

  function alterarValorItem(id: number, novoValor: number) {
    if (novoValor < 0) return
    setItens((atual) =>
      atual.map((item) =>
        item.id === id
          ? item.tipoCalculo === 'm2'
            ? { ...item, valor: novoValor, valorM2: novoValor }
            : { ...item, valor: novoValor }
          : item
      )
    )
  }

  function alterarLarguraItemLista(id: number, novaLargura: number) {
    if (novaLargura <= 0) return
    setItens((atual) =>
      atual.map((item) => {
        if (item.id !== id || item.tipoCalculo !== 'm2') return item
        const novaMetragem = calcularMetragem(novaLargura, item.altura)
        return { ...item, largura: novaLargura, metragem: novaMetragem }
      })
    )
  }

  function alterarAlturaItemLista(id: number, novaAltura: number) {
    if (novaAltura <= 0) return
    setItens((atual) =>
      atual.map((item) => {
        if (item.id !== id || item.tipoCalculo !== 'm2') return item
        const novaMetragem = calcularMetragem(item.largura, novaAltura)
        return { ...item, altura: novaAltura, metragem: novaMetragem }
      })
    )
  }

  function salvarOrcamento() {
    if (!clienteSelecionado) {
      notificar('Selecione um cliente.', 'error')
      return
    }
    if (itens.length === 0) {
      notificar('Adicione pelo menos um item.', 'error')
      return
    }

    if (editandoOrcamentoId !== null) {
      const atual = orcamentosSalvos.find((item) => item.id === editandoOrcamentoId)
      const atualizado: OrcamentoSalvo = {
        id: editandoOrcamentoId,
        numero: atual?.numero || gerarNumeroDocumentoIgnorandoAtual(),
        titulo: tituloPdf,
        cliente: clienteSelecionado,
        itens,
        subtotal,
        entrega: valorEntrega,
        desconto: valorDesconto,
        total,
        formaPagamento,
        validade,
        prazoEntrega,
        observacao,
        status: atual?.status || 'Pendente',
        data: new Date().toLocaleDateString('pt-BR'),
        link: gerarLinkDocumento(editandoOrcamentoId),
      }
      const listaAtualizada = orcamentosSalvos.map((item) => (item.id === editandoOrcamentoId ? atualizado : item))
      salvarListaOrcamentos(listaAtualizada)
      notificar('Orçamento atualizado com sucesso!')
      novoOrcamento()
      return
    }

    const id = Date.now()
    const novo: OrcamentoSalvo = {
      id,
      numero: gerarNumeroDocumentoIgnorandoAtual(),
      titulo: tituloPdf,
      cliente: clienteSelecionado,
      itens,
      subtotal,
      entrega: valorEntrega,
      desconto: valorDesconto,
      total,
      formaPagamento,
      validade,
      prazoEntrega,
      observacao,
      status: 'Pendente',
      data: new Date().toLocaleDateString('pt-BR'),
      link: gerarLinkDocumento(id),
    }
    salvarListaOrcamentos([novo, ...orcamentosSalvos])
    notificar('Orçamento salvo com sucesso!')
  }

  function alterarStatusOrcamento(id: number, status: StatusOrcamento, mensagem: string) {
    const listaAtualizada = orcamentosSalvos.map((item) =>
      item.id === id ? { ...item, status } : item
    )
    salvarListaOrcamentos(listaAtualizada)
    notificar(mensagem, status === 'Cancelado' ? 'info' : 'success')
  }

  function gerarVenda(orc: OrcamentoSalvo) {
    const salvas = localStorage.getItem(VENDAS_KEY)
    const vendas: VendaSalva[] = salvas ? JSON.parse(salvas) : []
    const jaExiste = vendas.find((item) => item.orcamentoId === orc.id)
    if (jaExiste) {
      notificar('Essa venda já foi gerada.', 'info')
      return false
    }

    const novaVenda: VendaSalva = {
      id: Date.now() + 2,
      numero: gerarNumeroVenda(),
      orcamentoId: orc.id,
      cliente: orc.cliente,
      itens: orc.itens,
      subtotal: Number(orc.subtotal || 0),
      desconto: Number(orc.desconto || 0),
      total: Number(orc.total || 0),
      formaPagamento: orc.formaPagamento || 'PIX',
      observacao: orc.observacao || '',
      status: 'Concluída',
      data: new Date().toLocaleDateString('pt-BR'),
      origem: `Orçamento ${orc.numero}`,
    }
    localStorage.setItem(VENDAS_KEY, JSON.stringify([novaVenda, ...vendas]))
    window.dispatchEvent(new Event('storage'))
    alterarStatusOrcamento(orc.id, 'Aprovado', 'Venda gerada e orçamento aprovado!')
    return true
  }

  function gerarOS(orc: OrcamentoSalvo) {
    const listaOS = localStorage.getItem(OS_KEY)
    const ordens = listaOS ? JSON.parse(listaOS) : []
    const jaExiste = ordens.find((o: any) => o.orcamentoId === orc.id)
    if (jaExiste) {
      notificar('Essa OS já foi gerada.', 'info')
      return
    }

    const numeros = ordens.map((o: any) => Number(o.numero)).filter((n: number) => !Number.isNaN(n))
    const maior = numeros.length ? Math.max(...numeros) : 0
    const novoId = Date.now()
    const novaOS = {
      id: novoId,
      numero: String(maior + 1).padStart(4, '0'),
      cliente: orc.cliente?.nome || '',
      telefone: orc.cliente?.telefone || '',
      email: orc.cliente?.email || '',
      endereco: orc.cliente?.endereco || '',
      equipamento: 'Orçamento convertido',
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
      data: new Date().toLocaleDateString('pt-BR'),
      ultimaAtualizacao: new Date().toLocaleDateString('pt-BR'),
      link: `${window.location.origin}/impressao-ordem-servico/${novoId}`,
      orcamentoId: orc.id,
    }
    localStorage.setItem(OS_KEY, JSON.stringify([novaOS, ...ordens]))
    gerarVenda(orc)
    alterarStatusOrcamento(orc.id, 'Convertido', 'OS criada e orçamento convertido!')
    window.dispatchEvent(new Event('storage'))
  }

  function editarOrcamento(orc: OrcamentoSalvo) {
    setEditandoOrcamentoId(orc.id)
    setClienteSelecionado(orc.cliente)
    setClienteBusca(orc.cliente?.nome || '')
    setItens(orc.itens || [])
    limparCamposItem()
    setTituloPdf(orc.titulo || 'Orçamento Comercial')
    setObservacao(orc.observacao || '')
    setFormaPagamento(orc.formaPagamento || 'PIX')
    setValidade(orc.validade || '')
    setPrazoEntrega(orc.prazoEntrega || '')
    setValorEntrega(Number(orc.entrega || 0))
    setValorDesconto(Number(orc.desconto || 0))
    setMostrarBuscaCliente(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function excluirOrcamento(id: number) {
    const confirmar = window.confirm('Deseja excluir este orçamento?')
    if (!confirmar) return
    const listaAtualizada = orcamentosSalvos.filter((item) => item.id !== id)
    salvarListaOrcamentos(listaAtualizada)
    if (editandoOrcamentoId === id) novoOrcamento()
    notificar('Orçamento excluído.', 'info')
  }

  function abrirLinkOrcamento(link: string) {
    if (!link) return
    window.open(link, '_blank')
  }

  async function publicarOrcamento(orc: OrcamentoSalvo) {
    try {
      const publicado = await savePublicDocument({
        documentType: 'orcamento',
        documentId: orc.id,
        document: orc,
        config,
      })

      return buildAbsoluteUrl(
        buildPublicDocumentPath('orcamento', orc.id, publicado.token),
        window.location.origin
      )
    } catch (error) {
      console.error('Erro ao publicar orçamento:', error)
      notificar('Não foi possível publicar online. Usando link local.', 'info')
      return gerarLinkDocumento(orc.id)
    }
  }

  async function compartilharLinkOrcamento(orc: OrcamentoSalvo) {
    const telefone = normalizeBrazilWhatsAppNumber(orc.cliente?.telefone || '')
    const link = await publicarOrcamento(orc)
    let mensagem = `Olá ${orc.cliente?.nome || ''}!\n\n`
    mensagem += `Segue seu orçamento *${orc.numero}* no valor de *${moeda(orc.total)}*.\n`
    if (orc.validade) mensagem += `Validade: ${orc.validade}.\n`
    mensagem += `\nAcesse aqui: ${link}`
    if (telefone) {
      window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank')
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  function enviarWhatsApp() {
    if (!clienteSelecionado) {
      notificar('Selecione um cliente.', 'error')
      return
    }
    if (itens.length === 0) {
      notificar('Adicione pelo menos um item.', 'error')
      return
    }

    const numero = normalizeBrazilWhatsAppNumber(clienteSelecionado.telefone)
    let mensagem = `📄 *${tituloPdf}*\n\n`
    mensagem += `👤 *Cliente:* ${clienteSelecionado.nome}\n`
    mensagem += `💳 *Pagamento:* ${formaPagamento}\n`
    if (validade) mensagem += `📅 *Validade:* ${validade}\n`
    if (prazoEntrega) mensagem += `🚚 *Prazo de entrega:* ${prazoEntrega}\n`
    if (valorEntrega > 0) mensagem += `🚛 *Entrega:* ${moeda(valorEntrega)}\n`
    if (valorDesconto > 0) mensagem += `🏷 *Desconto:* ${moeda(valorDesconto)}\n`
    mensagem += `\n🧾 *Itens:*\n`

    itens.forEach((item, index) => {
      const subtotalItem = calcularTotalItem(item)
      if (item.tipoCalculo === 'm2') {
        mensagem += `${index + 1}. ${item.nome}\n`
        mensagem += `   Medida: ${Number(item.largura || 0).toFixed(2)} x ${Number(item.altura || 0).toFixed(2)} m\n`
        mensagem += `   Área: ${Number(item.metragem || 0).toFixed(2)} m² | Valor m²: ${moeda(Number(item.valorM2 ?? item.valor ?? 0))} | Subtotal: ${moeda(subtotalItem)}\n`
      } else {
        mensagem += `${index + 1}. ${item.nome}\n`
        mensagem += `   Qtd: ${item.quantidade} | Valor: ${moeda(item.valor)} | Subtotal: ${moeda(subtotalItem)}\n`
      }
    })

    mensagem += `\n💰 *Subtotal:* ${moeda(subtotal)}`
    mensagem += `\n💰 *Total:* ${moeda(total)}`
    mensagem += `\n\n${observacao}`
    mensagem += `\n\nSe aprovar, me responda e já deixo tudo encaminhado ✅`
    window.open(
      numero
        ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
        : `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
      '_blank'
    )
  }

  function gerarPDF() {
    notificar('PDF pronto para visualização.', 'info')
    window.print()
  }

  const colors = darkMode
    ? {
        bg: '#020617',
        shell: 'linear-gradient(180deg,#0f172a,#081225)',
        card: '#0f1b31',
        cardSoft: '#12223d',
        text: '#f8fafc',
        muted: '#94a3b8',
        border: 'rgba(59,130,246,0.28)',
        inputBg: '#08111f',
        inputBorder: 'rgba(148,163,184,0.28)',
        greenBg: 'linear-gradient(135deg,#facc15,#fde047)',
        greenBorder: '#eab308',
      }
    : {
        bg: '#f8fafc',
        shell: 'linear-gradient(180deg,#ffffff,#f8fbff)',
        card: '#ffffff',
        cardSoft: '#f8fafc',
        text: '#111827',
        muted: '#64748b',
        border: 'rgba(37,99,235,0.18)',
        inputBg: '#ffffff',
        inputBorder: '#dbeafe',
        greenBg: 'linear-gradient(135deg,#facc15,#fde047)',
        greenBorder: '#eab308',
      }

  const pageStyle: React.CSSProperties = {
    maxWidth: 1320,
    margin: '0 auto',
    padding: isMobile ? 12 : 20,
    color: colors.text,
  }

  const shellStyle: React.CSSProperties = {
    background: colors.shell,
    borderRadius: isMobile ? 18 : 28,
    padding: isMobile ? 14 : 24,
    boxShadow: darkMode ? '0 18px 48px rgba(2,6,23,0.55)' : '0 18px 44px rgba(15,23,42,0.10)',
    border: `1px solid ${colors.border}`,
  }

  const cardStyle: React.CSSProperties = {
    background: colors.card,
    borderRadius: isMobile ? 14 : 20,
    padding: isMobile ? 12 : 16,
    boxShadow: darkMode ? '0 10px 26px rgba(0,0,0,0.18)' : '0 10px 26px rgba(0,0,0,0.06)',
    border: `1px solid ${colors.border}`,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 800,
    color: colors.muted,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    color: colors.text,
    padding: '10px 12px',
    boxSizing: 'border-box',
    outline: 'none',
    fontSize: 14,
  }

  const buttonBase: React.CSSProperties = {
    padding: 12,
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
    transition: 'transform .18s ease, box-shadow .18s ease, opacity .18s ease',
  }

  const totalBoxStyle: React.CSSProperties = {
    ...inputStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    background: colors.greenBg,
    border: `1px solid ${colors.greenBorder}`,
    color: '#422006',
    fontSize: 16,
    letterSpacing: 0.3,
    boxShadow: '0 8px 20px rgba(250,204,21,0.30)',
  }

  function renderStatusBadge(status: StatusOrcamento) {
    const mapa: Record<StatusOrcamento, { fundo: string; texto: string; borda: string }> = {
      Pendente: { fundo: darkMode ? '#3f2b02' : '#fff7ed', texto: '#f59e0b', borda: '#f59e0b' },
      Aprovado: { fundo: darkMode ? '#052e16' : '#f0fdf4', texto: '#22c55e', borda: '#22c55e' },
      Convertido: { fundo: darkMode ? '#172554' : '#eff6ff', texto: '#3b82f6', borda: '#3b82f6' },
      Cancelado: { fundo: darkMode ? '#450a0a' : '#fef2f2', texto: '#ef4444', borda: '#ef4444' },
    }
    const item = mapa[status]
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 900,
          background: item.fundo,
          color: item.texto,
          border: `1px solid ${item.borda}`,
        }}
      >
        {status}
      </span>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, paddingBottom: 32 }}>
      <div style={pageStyle}>
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: isMobile ? 78 : 24,
              right: 18,
              zIndex: 999,
              minWidth: 260,
              maxWidth: 360,
              padding: '14px 16px',
              borderRadius: 14,
              color: '#fff',
              fontWeight: 800,
              boxShadow: '0 14px 30px rgba(0,0,0,0.25)',
              background:
                toast.tipo === 'success'
                  ? 'linear-gradient(90deg,#16a34a,#22c55e)'
                  : toast.tipo === 'error'
                  ? 'linear-gradient(90deg,#dc2626,#ef4444)'
                  : 'linear-gradient(90deg,#2563eb,#3b82f6)',
            }}
          >
            {toast.texto}
          </div>
        )}

        <div style={{ color: colors.muted, fontSize: 13, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
          Painel Comercial
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 44, lineHeight: 1, fontWeight: 900, color: colors.text }}>Orçamentos</h1>
            <div style={{ marginTop: 8, color: colors.muted, fontWeight: 700 }}>Módulo blindado com foco em fechamento e conversão</div>
          </div>
          {config.logoUrl ? (
            <div style={{ ...cardStyle, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={config.logoUrl} alt="Logo da empresa" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 13 }}>{config.nomeEmpresa || 'Empresa'}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>{darkMode ? 'Modo escuro automático' : 'Modo claro automático'}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: 14, marginBottom: 18 }}>
          <ResumoCard titulo="Salvos" valor={String(resumo.totalDocumentos)} darkMode={darkMode} />
          <ResumoCard titulo="Pendentes" valor={String(resumo.pendentes)} darkMode={darkMode} />
          <ResumoCard titulo="Aprovados" valor={String(resumo.aprovados)} darkMode={darkMode} />
          <ResumoCard titulo="Convertidos" valor={String(resumo.convertidos)} darkMode={darkMode} />
          <ResumoCard titulo="Taxa" valor={`${resumo.taxaAprovacao.toFixed(0)}%`} darkMode={darkMode} />
          <ResumoCard titulo="Ticket" valor={moeda(resumo.ticketMedio)} darkMode={darkMode} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div style={{ ...cardStyle, background: darkMode ? '#0c1d14' : '#f0fdf4', borderColor: 'rgba(34,197,94,0.30)' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: darkMode ? '#86efac' : '#166534', marginBottom: 6 }}>💰 Valor aprovado</div>
            <div style={{ fontSize: isMobile ? 26 : 34, fontWeight: 900, color: darkMode ? '#f0fdf4' : '#166534' }}>{moeda(resumo.totalAprovado)}</div>
          </div>
          <div style={{ ...cardStyle, background: darkMode ? '#2a1207' : '#fff7ed', borderColor: 'rgba(249,115,22,0.28)' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: darkMode ? '#fdba74' : '#c2410c', marginBottom: 6 }}>📌 Cancelados</div>
            <div style={{ fontSize: isMobile ? 26 : 34, fontWeight: 900, color: darkMode ? '#fff7ed' : '#7c2d12' }}>{resumo.cancelados}</div>
          </div>
        </div>

        <div style={shellStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.05fr 0.95fr', gap: 16 }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>👤 Cliente</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                    <button
                      onClick={() => {
                        setMostrarNovoCliente((valor) => !valor)
                        setMostrarBuscaCliente(false)
                      }}
                      style={{
                        ...buttonBase,
                        minHeight: 40,
                        padding: '10px 14px',
                        background: 'linear-gradient(135deg,#0ea5e9,#2563eb)',
                        color: '#fff',
                        fontSize: 13,
                        flex: isMobile ? 1 : undefined,
                        boxShadow: '0 10px 18px rgba(37,99,235,0.22)',
                      }}
                    >
                      + Novo cliente
                    </button>
                    <button
                      onClick={() => {
                        if (clientesFiltrados.length > 0) setMostrarBuscaCliente((valor) => !valor)
                      }}
                      style={{
                        ...buttonBase,
                        minHeight: 40,
                        padding: '10px 14px',
                        background: darkMode ? '#18253f' : '#eef2ff',
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        fontSize: 13,
                        flex: isMobile ? 1 : undefined,
                      }}
                    >
                      Buscar
                    </button>
                  </div>
                </div>

                <input
                  value={clienteBusca}
                  onChange={(e) => {
                    setClienteBusca(e.target.value)
                    setMostrarBuscaCliente(true)
                    setMostrarNovoCliente(false)
                  }}
                  onFocus={() => {
                    setMostrarBuscaCliente(true)
                    setMostrarNovoCliente(false)
                  }}
                  placeholder="Pesquisar cliente..."
                  style={inputStyle}
                />

                {clienteSelecionado && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 14,
                      border: `1px solid ${darkMode ? 'rgba(34,197,94,0.30)' : '#bbf7d0'}`,
                      background: darkMode ? '#0d1f16' : '#f0fdf4',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: darkMode ? '#dcfce7' : '#166534' }}>{clienteSelecionado.nome}</div>
                    <div style={{ fontSize: 13, color: colors.muted }}>📞 {clienteSelecionado.telefone || 'Sem telefone'}</div>
                    <div style={{ fontSize: 13, color: colors.muted }}>🪪 {clienteSelecionado.tipoPessoa === 'PJ' ? 'PJ' : 'PF'} {clienteSelecionado.cpf ? `• CPF: ${clienteSelecionado.cpf}` : ''} {clienteSelecionado.cnpj ? `• CNPJ: ${clienteSelecionado.cnpj}` : ''}</div>
                    {clienteSelecionado.email ? <div style={{ fontSize: 13, color: colors.muted }}>✉️ {clienteSelecionado.email}</div> : null}
                    {clienteSelecionado.endereco ? <div style={{ fontSize: 13, color: colors.muted }}>📍 {clienteSelecionado.endereco}</div> : null}
                  </div>
                )}

                {mostrarNovoCliente && (
                  <div
                    style={{
                      marginTop: 12,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 16,
                      padding: 12,
                      background: darkMode ? '#091224' : '#f8fbff',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 900, color: colors.text }}>Cadastro rápido de cliente</div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setTipoPessoa('PF')}
                        style={{
                          ...buttonBase,
                          minHeight: 38,
                          padding: '8px 12px',
                          background: tipoPessoa === 'PF' ? 'linear-gradient(135deg,#16a34a,#22c55e)' : darkMode ? '#1f2937' : '#e5e7eb',
                          color: tipoPessoa === 'PF' ? '#052e16' : colors.text,
                          fontSize: 12,
                        }}
                      >
                        Pessoa Física
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoPessoa('PJ')}
                        style={{
                          ...buttonBase,
                          minHeight: 38,
                          padding: '8px 12px',
                          background: tipoPessoa === 'PJ' ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : darkMode ? '#1f2937' : '#e5e7eb',
                          color: '#fff',
                          fontSize: 12,
                        }}
                      >
                        Pessoa Jurídica
                      </button>
                      {tipoPessoa === 'PJ' && (
                        <button
                          type="button"
                          onClick={buscarCNPJ}
                          style={{
                            ...buttonBase,
                            minHeight: 38,
                            padding: '8px 12px',
                            background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                            color: '#fff',
                            fontSize: 12,
                          }}
                        >
                          Buscar CNPJ
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : tipoPessoa === 'PJ' ? '1fr 1fr 1fr' : '1fr 1fr',
                        gap: 10
                      }}
                    >
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>
                          {tipoPessoa === 'PJ' ? 'Razão Social' : 'Nome'}
                        </label>
                        <input
                          value={tipoPessoa === 'PJ' ? novoCliente.razaoSocial : novoCliente.nome}
                          onChange={(e) =>
                            setNovoCliente((atual) => ({
                              ...atual,
                              [tipoPessoa === 'PJ' ? 'razaoSocial' : 'nome']: e.target.value,
                            }))
                          }
                          placeholder={tipoPessoa === 'PJ' ? 'Razão social' : 'Nome do cliente'}
                          style={inputStyle}
                        />
                      </div>

                      {tipoPessoa === 'PJ' ? (
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Nome Fantasia</label>
                          <input
                            value={novoCliente.nomeFantasia}
                            onChange={(e) => setNovoCliente((atual) => ({ ...atual, nomeFantasia: e.target.value, nome: e.target.value }))}
                            placeholder="Nome fantasia"
                            style={inputStyle}
                          />
                        </div>
                      ) : (
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>CPF</label>
                          <input
                            value={novoCliente.cpf}
                            onChange={(e) => setNovoCliente((atual) => ({ ...atual, cpf: e.target.value }))}
                            placeholder="CPF"
                            style={inputStyle}
                          />
                        </div>
                      )}

                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>
                          {tipoPessoa === 'PJ' ? 'CNPJ' : 'Telefone'}
                        </label>
                        <input
                          value={tipoPessoa === 'PJ' ? novoCliente.cnpj : novoCliente.telefone}
                          onChange={(e) =>
                            setNovoCliente((atual) => ({
                              ...atual,
                              [tipoPessoa === 'PJ' ? 'cnpj' : 'telefone']: e.target.value,
                            }))
                          }
                          placeholder={tipoPessoa === 'PJ' ? 'CNPJ' : 'Telefone'}
                          style={inputStyle}
                        />
                      </div>

                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Telefone</label>
                        <input
                          value={novoCliente.telefone}
                          onChange={(e) => setNovoCliente((atual) => ({ ...atual, telefone: e.target.value }))}
                          placeholder="Telefone"
                          style={inputStyle}
                        />
                      </div>

                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>E-mail</label>
                        <input
                          value={novoCliente.email}
                          onChange={(e) => setNovoCliente((atual) => ({ ...atual, email: e.target.value }))}
                          placeholder="E-mail"
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Endereço</label>
                        <input
                          value={novoCliente.endereco}
                          onChange={(e) => setNovoCliente((atual) => ({ ...atual, endereco: e.target.value }))}
                          placeholder="Endereço"
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={cadastrarNovoClienteRapido}
                        style={{
                          ...buttonBase,
                          minHeight: 42,
                          padding: '10px 14px',
                          background: 'linear-gradient(135deg,#16a34a,#22c55e)',
                          color: '#052e16',
                          boxShadow: '0 10px 18px rgba(34,197,94,0.20)',
                          flex: isMobile ? 1 : undefined,
                        }}
                      >
                        Salvar cliente
                      </button>
                      <button
                        onClick={() => {
                          setMostrarNovoCliente(false)
                          setNovoCliente({ ...NOVO_CLIENTE_INICIAL })
                        }}
                        style={{
                          ...buttonBase,
                          minHeight: 42,
                          padding: '10px 14px',
                          background: darkMode ? '#1f2937' : '#e5e7eb',
                          color: colors.text,
                          flex: isMobile ? 1 : undefined,
                        }}
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                )}

                {mostrarBuscaCliente && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {clientesFiltrados.length === 0 ? (
                      <div
                        style={{
                          border: `1px dashed ${colors.border}`,
                          background: colors.inputBg,
                          color: colors.muted,
                          borderRadius: 12,
                          padding: 12,
                          fontWeight: 700,
                        }}
                      >
                        Nenhum cliente encontrado. Use o botão <strong>+ Novo cliente</strong>.
                      </div>
                    ) : (
                      clientesFiltrados.map((cliente) => (
                        <button
                          key={cliente.id}
                          onClick={() => selecionarCliente(cliente)}
                          style={{
                            textAlign: 'left',
                            border: `1px solid ${colors.inputBorder}`,
                            background: colors.inputBg,
                            color: colors.text,
                            borderRadius: 12,
                            padding: 12,
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          <div style={{ fontWeight: 900 }}>{cliente.nome}</div>
                          <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                            {cliente.telefone || 'Sem telefone'} {cliente.email ? `• ${cliente.email}` : ''} {cliente.cpf ? `• CPF: ${cliente.cpf}` : ''} {cliente.cnpj ? `• CNPJ: ${cliente.cnpj}` : ''}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>📦 Produto / Serviço</label>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(2, 180px)', gap: 10, marginBottom: 10 }}>
                  <button
                    onClick={() => setModoItem('unidade')}
                    style={{
                      ...buttonBase,
                      background: modoItem === 'unidade' ? '#f97316' : darkMode ? '#e5e7eb' : '#e5e7eb',
                      color: modoItem === 'unidade' ? '#fff' : '#111827',
                    }}
                  >
                    Produto normal
                  </button>
                  <button
                    onClick={() => setModoItem('m2')}
                    style={{
                      ...buttonBase,
                      background: modoItem === 'm2' ? '#2563eb' : darkMode ? '#e5e7eb' : '#e5e7eb',
                      color: modoItem === 'm2' ? '#fff' : '#111827',
                    }}
                  >
                    Por metro quadrado
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : modoItem === 'm2' ? 'minmax(0,1fr) 120px 120px' : 'minmax(0,1fr) 120px', gap: 10 }}>
                  <input
                    value={produtoBusca}
                    onChange={(e) => {
                      setProdutoBusca(e.target.value)
                      setMostrarBuscaProduto(true)
                    }}
                    onFocus={() => setMostrarBuscaProduto(true)}
                    placeholder="Pesquisar produto..."
                    style={inputStyle}
                  />

                  {modoItem === 'unidade' ? (
                    <input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value || 1))} style={inputStyle} />
                  ) : (
                    <>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatarDecimalVisual(larguraItem)}
                        onChange={(e) => {
                          const valor = e.target.value
                          if (valor === '') {
                            setLarguraItem(0)
                            return
                          }
                          setLarguraItem(textoParaNumeroDecimal(valor))
                        }}
                        placeholder="Largura"
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatarDecimalVisual(alturaItem)}
                        onChange={(e) => {
                          const valor = e.target.value
                          if (valor === '') {
                            setAlturaItem(0)
                            return
                          }
                          setAlturaItem(textoParaNumeroDecimal(valor))
                        }}
                        placeholder="Altura"
                        style={inputStyle}
                      />
                    </>
                  )}
                </div>

                {modoItem === 'm2' && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: darkMode ? '#172554' : '#eff6ff', border: '1px solid #3b82f6', color: darkMode ? '#dbeafe' : '#1e3a8a', fontWeight: 800 }}>
                    Área calculada: {Number(metragemAtual || 0).toFixed(2)} m²
                  </div>
                )}

                {mostrarBuscaProduto && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {produtosFiltrados.map((produto) => (
                      <button
                        key={produto.id}
                        onClick={() => adicionarOuAtualizarProduto(produto)}
                        style={{
                          textAlign: 'left',
                          border: `1px solid ${colors.inputBorder}`,
                          background: colors.inputBg,
                          color: colors.text,
                          borderRadius: 10,
                          padding: 10,
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {produto.nome} • {modoItem === 'm2' ? `${moeda(produto.valor)} / m²` : moeda(produto.valor)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Itens</div>
                {itens.length === 0 ? (
                  <div style={{ color: colors.muted }}>Nenhum item adicionado.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {itens.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: `1.5px solid ${item.tipoCalculo === 'm2' ? '#22c55e' : '#1d4ed8'}`,
                          borderRadius: 16,
                          padding: 14,
                          background: darkMode ? '#091224' : '#ffffff',
                          boxShadow: darkMode ? '0 8px 24px rgba(0,0,0,0.20)' : '0 8px 22px rgba(37,99,235,0.08)',
                          display: 'grid',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: colors.text, lineHeight: 1.2, wordBreak: 'break-word', marginBottom: 4 }}>
                              {item.nome}
                            </div>
                            {item.tipoCalculo === 'm2' && (
                              <div style={{ fontSize: 12, color: colors.muted, fontWeight: 700 }}>
                                Área calculada: {Number(item.metragem || 0).toFixed(2)} m²
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              background: item.tipoCalculo === 'm2' ? (darkMode ? '#172554' : '#eff6ff') : darkMode ? '#1e293b' : '#f8fafc',
                              color: item.tipoCalculo === 'm2' ? '#60a5fa' : colors.muted,
                              border: `1px solid ${item.tipoCalculo === 'm2' ? '#3b82f6' : colors.inputBorder}`,
                              borderRadius: 999,
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.tipoCalculo === 'm2' ? 'Metro quadrado' : 'Produto normal'}
                          </div>
                        </div>

                        {item.tipoCalculo === 'm2' ? (
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(110px, 1fr))', gap: 10 }}>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Largura</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={formatarDecimalVisual(item.largura)}
                                onChange={(e) => alterarLarguraItemLista(item.id, textoParaNumeroDecimal(e.target.value))}
                                style={inputStyle}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Altura</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={formatarDecimalVisual(item.altura)}
                                onChange={(e) => alterarAlturaItemLista(item.id, textoParaNumeroDecimal(e.target.value))}
                                style={inputStyle}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>R$ / m²</label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={Number(item.valorM2 ?? item.valor ?? 0)}
                                onChange={(e) => alterarValorItem(item.id, Number(e.target.value || 0))}
                                style={inputStyle}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Total</label>
                              <div style={totalBoxStyle}>💰 {moeda(calcularTotalItem(item))}</div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '120px 140px 1fr', gap: 10 }}>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Qtd</label>
                              <input type="number" min={1} value={item.quantidade} onChange={(e) => alterarQuantidadeItem(item.id, Number(e.target.value || 1))} style={inputStyle} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>R$ Unitário</label>
                              <input type="number" min={0} step="0.01" value={item.valor} onChange={(e) => alterarValorItem(item.id, Number(e.target.value || 0))} style={inputStyle} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Total</label>
                              <div style={totalBoxStyle}>💰 {moeda(calcularTotalItem(item))}</div>
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 10, flexWrap: 'wrap', borderTop: `1px solid ${colors.inputBorder}`, paddingTop: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>
                            Total do item: <span style={{ color: '#22c55e' }}>{moeda(calcularTotalItem(item))}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={() => editarItem(item)} style={{ ...buttonBase, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', padding: '10px 14px', boxShadow: '0 8px 18px rgba(37,99,235,0.25)' }}>Editar</button>
                            <button onClick={() => removerItem(item.id)} style={{ ...buttonBase, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', padding: '10px 14px', boxShadow: '0 8px 18px rgba(239,68,68,0.22)' }}>Remover</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={cardStyle}>
                <label style={labelStyle}>📝 Título</label>
                <div style={{ display: 'grid', gridTemplateColumns: config.logoUrl ? '56px 1fr' : '1fr', gap: 10, alignItems: 'center' }}>
                  {config.logoUrl ? <img src={config.logoUrl} alt="Logo" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: '#fff', padding: 4 }} /> : null}
                  <input value={tituloPdf} onChange={(e) => setTituloPdf(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>💳 Pagamento</label>
                    <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} style={inputStyle}>
                      {formasPagamento.map((forma) => (
                        <option key={forma} value={forma}>{forma}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>📅 Validade</label>
                    <input value={validade} onChange={(e) => setValidade(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>🚚 Prazo entrega</label>
                    <input value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>🚛 Entrega</label>
                    <input type="number" min={0} step="0.01" value={valorEntrega} onChange={(e) => setValorEntrega(Number(e.target.value || 0))} style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>🏷 Desconto</label>
                  <input type="number" min={0} step="0.01" value={valorDesconto} onChange={(e) => setValorDesconto(Number(e.target.value || 0))} style={inputStyle} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Resumo</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 15 }}>Subtotal: <strong>{moeda(subtotal)}</strong></div>
                  <div style={{ fontSize: 15 }}>Entrega: <strong>{moeda(valorEntrega)}</strong></div>
                  <div style={{ fontSize: 15 }}>Desconto: <strong>{moeda(valorDesconto)}</strong></div>
                  <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900 }}>💰 Total: {moeda(total)}</div>
                </div>
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>📝 Observação</label>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, auto)', justifyContent: isMobile ? 'stretch' : 'flex-end', gap: 10 }}>
                <button onClick={novoOrcamento} style={{ ...buttonBase, background: '#d1d5db', color: '#111827' }}>Limpar</button>
                <button onClick={salvarOrcamento} style={{ ...buttonBase, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', boxShadow: '0 12px 20px rgba(249,115,22,0.22)' }}>{editandoOrcamentoId !== null ? 'Atualizar orçamento' : 'Salvar orçamento'}</button>
                <button onClick={gerarPDF} style={{ ...buttonBase, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', boxShadow: '0 12px 20px rgba(37,99,235,0.22)' }}>Gerar PDF</button>
                <button onClick={enviarWhatsApp} style={{ ...buttonBase, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#052e16', boxShadow: '0 12px 20px rgba(34,197,94,0.22)' }}>Enviar no WhatsApp</button>
              </div>
            </div>
          </div>

          <div style={{ ...shellStyle, marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 28, color: colors.text }}>Documentos salvos</h2>
              <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '8px 14px', fontWeight: 800 }}>
                {orcamentosSalvos.length} registro(s)
              </div>
            </div>

            <div>
              {orcamentosSalvos.length === 0 ? (
                <div style={{ ...cardStyle, color: colors.muted }}>Nenhum orçamento salvo ainda.</div>
              ) : (
                orcamentosSalvos.map((orc) => (
                  <div key={orc.id} style={{ ...cardStyle, marginBottom: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                        <div style={{ fontWeight: 900, fontSize: 15 }}>{orc.numero} - {orc.titulo}</div>
                        {renderStatusBadge(orc.status)}
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Cliente:</strong> {orc.cliente?.nome || '-'}</div>
                      <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Valor:</strong> {moeda(orc.total)}</div>
                      <div style={{ fontSize: 13 }}><strong>Emissão:</strong> {orc.data}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(8, auto)', gap: 8, justifyContent: isMobile ? 'stretch' : 'end' }}>
                      <button onClick={() => (window.location.href = buildPrintOrcamentoPath(orc.id))} style={{ ...buttonBase, background: '#f97316', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Visualizar</button>
                      <button onClick={() => compartilharLinkOrcamento(orc)} style={{ ...buttonBase, background: '#16a34a', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Compartilhar</button>
                      <button onClick={() => editarOrcamento(orc)} style={{ ...buttonBase, background: '#2563eb', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Editar</button>
                      <button onClick={() => alterarStatusOrcamento(orc.id, 'Aprovado', 'Orçamento aprovado!')} style={{ ...buttonBase, background: '#22c55e', color: '#052e16', height: 36, padding: '0 14px', fontSize: 13 }}>Aprovar</button>
                      <button onClick={() => alterarStatusOrcamento(orc.id, 'Cancelado', 'Orçamento cancelado.')} style={{ ...buttonBase, background: '#ef4444', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Cancelar</button>
                      <button onClick={() => abrirLinkOrcamento(orc.link)} style={{ ...buttonBase, background: '#7c3aed', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Abrir link</button>
                      <button onClick={() => gerarVenda(orc)} style={{ ...buttonBase, background: '#0891b2', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Gerar Venda</button>
                      <button onClick={() => gerarOS(orc)} style={{ ...buttonBase, background: '#059669', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Gerar OS</button>
                      <button onClick={() => excluirOrcamento(orc.id)} style={{ ...buttonBase, background: '#dc2626', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Excluir</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResumoCard({ titulo, valor, darkMode }: { titulo: string; valor: string; darkMode: boolean }) {
  return (
    <div
      style={{
        background: darkMode ? '#0f1b31' : '#ffffff',
        borderRadius: 18,
        padding: 18,
        border: `1px solid ${darkMode ? 'rgba(59,130,246,0.28)' : '#e5e7eb'}`,
        boxShadow: darkMode ? '0 10px 26px rgba(0,0,0,0.16)' : '0 10px 26px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: darkMode ? '#94a3b8' : '#6b7280', marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: darkMode ? '#f8fafc' : '#111827', lineHeight: 1 }}>{valor}</div>
    </div>
  )
}
