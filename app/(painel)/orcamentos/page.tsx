'use client'

import { useEffect, useMemo, useState } from 'react'

type Cliente = {
  id: number
  nome: string
  telefone: string
  email: string
  endereco: string
}

type Produto = {
  id: number
  nome: string
  valor: number
}

type ItemOrcamento = {
  id: number
  nome: string
  quantidade: number
  valor: number
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
  status: string
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

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
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
    corSecundaria: '#e5e7eb',
    corTabela: '#f3f4f6',
    mostrarQuantidade: true,
    logoUrl: '/logo-connect.png',
  })

  const [formasPagamento, setFormasPagamento] = useState<string[]>(['PIX', 'DINHEIRO', 'CARTAO 1X'])
  const [clienteBusca, setClienteBusca] = useState('')
  const [produtoBusca, setProdutoBusca] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [quantidade, setQuantidade] = useState(1)
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

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
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
        setConfig((anterior) => ({ ...anterior, ...dados }))
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
        if (Array.isArray(lista)) setOrcamentosSalvos(lista)
      } catch {}
    }
  }, [])

  const subtotal = useMemo(() => itens.reduce((acc, item) => acc + item.quantidade * item.valor, 0), [itens])
  const total = useMemo(() => Math.max(0, subtotal + valorEntrega - valorDesconto), [subtotal, valorEntrega, valorDesconto])

  const resumo = useMemo(() => {
    const totalDocumentos = orcamentosSalvos.length
    const pendentes = orcamentosSalvos.filter((item) => item.status === 'Pendente').length
    const convertidos = orcamentosSalvos.filter((item) => item.status === 'Convertido').length
    const somaValores = orcamentosSalvos.reduce((acc, item) => acc + Number(item.total || 0), 0)
    return { totalDocumentos, pendentes, convertidos, somaValores }
  }, [orcamentosSalvos])

  const clientesFiltrados = useMemo(() => {
    const termo = clienteBusca.trim().toLowerCase()
    if (!termo) return clientesMock
    return clientesMock.filter((cliente) => cliente.nome.toLowerCase().includes(termo) || cliente.telefone.toLowerCase().includes(termo))
  }, [clienteBusca])

  const produtosFiltrados = useMemo(() => {
    const termo = produtoBusca.trim().toLowerCase()
    if (!termo) return produtosMock
    return produtosMock.filter((produto) => produto.nome.toLowerCase().includes(termo))
  }, [produtoBusca])

  function notificar(texto: string, tipo: Toast['tipo'] = 'success') {
    setToast({ texto, tipo })
  }

  function salvarListaOrcamentos(lista: OrcamentoSalvo[]) {
    setOrcamentosSalvos(lista)
    localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(lista))
  }

  function gerarNumeroDocumentoIgnorandoAtual() {
    const numeros = orcamentosSalvos.filter((o) => o.id !== editandoOrcamentoId).map((o) => Number(o.numero)).filter((n) => !Number.isNaN(n))
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
    return `${window.location.origin}/impressao-orcamento/${id}`
  }

  function novoOrcamento() {
    setClienteSelecionado(null)
    setClienteBusca('')
    setProdutoBusca('')
    setItens([])
    setQuantidade(1)
    setTituloPdf(config.tituloPdf || 'Orçamento Comercial')
    setObservacao(config.rodapePdf || 'Obrigado pela preferência.')
    setFormaPagamento(config.formaPagamentoPadrao || formasPagamento[0] || 'PIX')
    setValidade(config.validadePadrao || '')
    setPrazoEntrega(config.prazoEntregaPadrao || '')
    setValorEntrega(0)
    setValorDesconto(0)
    setMostrarBuscaCliente(false)
    setMostrarBuscaProduto(false)
    setEditandoId(null)
    setEditandoOrcamentoId(null)
  }

  function selecionarCliente(cliente: Cliente) {
    setClienteSelecionado(cliente)
    setClienteBusca(cliente.nome)
    setMostrarBuscaCliente(false)
  }

  function adicionarOuAtualizarProduto(produto: Produto) {
    if (!quantidade || quantidade <= 0) {
      notificar('Digite uma quantidade válida.', 'error')
      return
    }
    if (editandoId !== null) {
      setItens((atual) => atual.map((item) => item.id === editandoId ? { ...item, nome: produto.nome, quantidade, valor: produto.valor } : item))
      setEditandoId(null)
      notificar('Item atualizado.')
    } else {
      const novoItem: ItemOrcamento = { id: Date.now(), nome: produto.nome, quantidade, valor: produto.valor }
      setItens((atual) => [...atual, novoItem])
      notificar('Item adicionado.')
    }
    setProdutoBusca('')
    setQuantidade(1)
    setMostrarBuscaProduto(false)
  }

  function editarItem(item: ItemOrcamento) {
    setProdutoBusca(item.nome)
    setQuantidade(item.quantidade)
    setEditandoId(item.id)
    setMostrarBuscaProduto(true)
  }

  function removerItem(id: number) {
    setItens((atual) => atual.filter((item) => item.id !== id))
    if (editandoId === id) {
      setEditandoId(null)
      setProdutoBusca('')
      setQuantidade(1)
    }
    notificar('Item removido.', 'info')
  }

  function alterarQuantidadeItem(id: number, novaQtd: number) {
    if (!novaQtd || novaQtd <= 0) return
    setItens((atual) => atual.map((item) => (item.id === id ? { ...item, quantidade: novaQtd } : item)))
  }

  function alterarValorItem(id: number, novoValor: number) {
    if (novoValor < 0) return
    setItens((atual) => atual.map((item) => (item.id === id ? { ...item, valor: novoValor } : item)))
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
      const listaAtualizada = orcamentosSalvos.map((item) => item.id === editandoOrcamentoId ? atualizado : item)
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
    const listaAtualizada = [novo, ...orcamentosSalvos]
    salvarListaOrcamentos(listaAtualizada)
    notificar('Orçamento salvo com sucesso!')
  }

  function gerarVendaAutomatica(orc: OrcamentoSalvo) {
    const salvas = localStorage.getItem(VENDAS_KEY)
    const vendas: VendaSalva[] = salvas ? JSON.parse(salvas) : []
    const jaExiste = vendas.find((item) => item.orcamentoId === orc.id)
    if (jaExiste) return false
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
    gerarVendaAutomatica(orc)
    const atualizados = orcamentosSalvos.map((item) => item.id === orc.id ? { ...item, status: 'Convertido' } : item)
    salvarListaOrcamentos(atualizados)
    window.dispatchEvent(new Event('storage'))
    notificar('OS criada e venda registrada automaticamente!')
  }

  function editarOrcamento(orc: OrcamentoSalvo) {
    setEditandoOrcamentoId(orc.id)
    setClienteSelecionado(orc.cliente)
    setClienteBusca(orc.cliente?.nome || '')
    setItens(orc.itens || [])
    setQuantidade(1)
    setTituloPdf(orc.titulo || 'Orçamento Comercial')
    setObservacao(orc.observacao || '')
    setFormaPagamento(orc.formaPagamento || 'PIX')
    setValidade(orc.validade || '')
    setPrazoEntrega(orc.prazoEntrega || '')
    setValorEntrega(Number(orc.entrega || 0))
    setValorDesconto(Number(orc.desconto || 0))
    setMostrarBuscaCliente(false)
    setMostrarBuscaProduto(false)
    setEditandoId(null)
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

  function compartilharLinkOrcamento(orc: OrcamentoSalvo) {
    const telefone = String(orc.cliente?.telefone || '').replace(/\D/g, '')
    const mensagem = `Olá ${orc.cliente?.nome || ''}! Segue o link do orçamento ${orc.numero}:
${orc.link}`
    if (telefone) {
      window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank')
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
    const numero = clienteSelecionado.telefone.replace(/\D/g, '')
    let mensagem = `📄 *${tituloPdf}*

`
    mensagem += `👤 *Cliente:* ${clienteSelecionado.nome}
`
    mensagem += `📞 *Telefone:* ${clienteSelecionado.telefone}
`
    mensagem += `📧 *E-mail:* ${clienteSelecionado.email || '-'}
`
    mensagem += `📍 *Endereço:* ${clienteSelecionado.endereco || '-'}
`
    mensagem += `💳 *Pagamento:* ${formaPagamento}
`
    if (validade) mensagem += `📅 *Validade:* ${validade}
`
    if (prazoEntrega) mensagem += `🚚 *Prazo de entrega:* ${prazoEntrega}
`
    if (valorEntrega > 0) mensagem += `🚛 *Entrega:* ${moeda(valorEntrega)}
`
    if (valorDesconto > 0) mensagem += `🏷 *Desconto:* ${moeda(valorDesconto)}
`
    mensagem += `
🧾 *Itens:*
`
    itens.forEach((item, index) => {
      const subtotalItem = item.quantidade * item.valor
      mensagem += `${index + 1}. ${item.nome}
`
      mensagem += `   Qtd: ${item.quantidade} | Valor: ${moeda(item.valor)} | Subtotal: ${moeda(subtotalItem)}
`
    })
    mensagem += `
💰 *Subtotal:* ${moeda(subtotal)}`
    mensagem += `
💰 *Total:* ${moeda(total)}`
    mensagem += `

${observacao}`
    window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  function gerarPDF() {
    notificar('PDF pronto para visualização.', 'info')
    window.print()
  }

  const pageStyle: React.CSSProperties = {
    maxWidth: 1180,
    margin: '0 auto',
    padding: isMobile ? 12 : 20,
    color: '#111827',
  }
  const shellStyle: React.CSSProperties = {
    background: '#f5f1e8',
    borderRadius: isMobile ? 18 : 28,
    padding: isMobile ? 14 : 24,
    boxShadow: '0 14px 34px rgba(0,0,0,0.10)',
    border: `2px solid ${config.corSecundaria || '#e5e7eb'}`,
  }
  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: isMobile ? 14 : 20,
    padding: isMobile ? 12 : 16,
    boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
    border: `2px solid ${config.corSecundaria || '#e5e7eb'}`,
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
    border: `1px solid ${config.corSecundaria || '#e5e7eb'}`,
    background: '#fff',
    color: '#111827',
    padding: '10px 12px',
    boxSizing: 'border-box',
    outline: 'none',
    fontSize: 14,
  }
  const buttonBase: React.CSSProperties = {
    padding: 12,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 800,
  }

  return (
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

      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Painel Comercial</div>
      <h1 style={{ margin: '0 0 16px 0', fontSize: isMobile ? 34 : 44, lineHeight: 1, fontWeight: 900, color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>Orçamentos</h1>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <ResumoCard titulo="Salvos" valor={String(resumo.totalDocumentos)} />
        <ResumoCard titulo="Pendentes" valor={String(resumo.pendentes)} />
        <ResumoCard titulo="Convertidos" valor={String(resumo.convertidos)} />
        <ResumoCard titulo="Total" valor={moeda(resumo.somaValores)} />
      </div>

      <div style={shellStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={cardStyle}>
              <label style={labelStyle}>👤 Cliente</label>
              <input value={clienteBusca} onChange={(e) => { setClienteBusca(e.target.value); setMostrarBuscaCliente(true) }} onFocus={() => setMostrarBuscaCliente(true)} placeholder="Pesquisar cliente..." style={inputStyle} />
              {mostrarBuscaCliente && (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {clientesFiltrados.map((cliente) => (
                    <button key={cliente.id} onClick={() => selecionarCliente(cliente)} style={{ textAlign: 'left', border: `1px solid ${config.corSecundaria}`, background: '#fff', borderRadius: 10, padding: 10, cursor: 'pointer', fontWeight: 700 }}>
                      {cliente.nome} • {cliente.telefone}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <label style={labelStyle}>📦 Produto / Serviço</label>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 120px', gap: 10 }}>
                <input value={produtoBusca} onChange={(e) => { setProdutoBusca(e.target.value); setMostrarBuscaProduto(true) }} onFocus={() => setMostrarBuscaProduto(true)} placeholder="Pesquisar produto..." style={inputStyle} />
                <input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value || 1))} style={inputStyle} />
              </div>
              {mostrarBuscaProduto && (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {produtosFiltrados.map((produto) => (
                    <button key={produto.id} onClick={() => adicionarOuAtualizarProduto(produto)} style={{ textAlign: 'left', border: `1px solid ${config.corSecundaria}`, background: '#fff', borderRadius: 10, padding: 10, cursor: 'pointer', fontWeight: 700 }}>
                      {produto.nome} • {moeda(produto.valor)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Itens</div>
              {itens.length === 0 ? (
                <div style={{ color: '#64748b' }}>Nenhum item adicionado.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {itens.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 90px 110px auto', gap: 10, alignItems: 'center', border: `1px solid ${config.corSecundaria}`, borderRadius: 12, padding: 10 }}>
                      <div style={{ fontWeight: 800 }}>{item.nome}</div>
                      <input type="number" min={1} value={item.quantidade} onChange={(e) => alterarQuantidadeItem(item.id, Number(e.target.value || 1))} style={inputStyle} />
                      <input type="number" min={0} step="0.01" value={item.valor} onChange={(e) => alterarValorItem(item.id, Number(e.target.value || 0))} style={inputStyle} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => editarItem(item)} style={{ ...buttonBase, background: '#2563eb', color: '#fff', padding: '10px 12px' }}>Editar</button>
                        <button onClick={() => removerItem(item.id)} style={{ ...buttonBase, background: '#dc2626', color: '#fff', padding: '10px 12px' }}>Remover</button>
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
              <input value={tituloPdf} onChange={(e) => setTituloPdf(e.target.value)} style={inputStyle} />
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>💳 Pagamento</label>
                  <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} style={inputStyle}>
                    {formasPagamento.map((forma) => <option key={forma} value={forma}>{forma}</option>)}
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
                <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900 }}>💰 Total: {moeda(total)}</div>
              </div>
            </div>

            <div style={cardStyle}>
              <label style={labelStyle}>📝 Observação</label>
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} style={{ width: '100%', minHeight: 90, borderRadius: 12, border: `1px solid ${config.corSecundaria}`, background: '#fff', color: '#111827', padding: 12, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontSize: 14 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, auto)', justifyContent: isMobile ? 'stretch' : 'flex-end', gap: 10 }}>
              <button onClick={novoOrcamento} style={{ ...buttonBase, background: '#d1d5db', color: '#111827' }}>Limpar</button>
              <button onClick={salvarOrcamento} style={{ ...buttonBase, background: '#f97316', color: '#fff' }}>{editandoOrcamentoId !== null ? 'Atualizar orçamento' : 'Salvar orçamento'}</button>
              <button onClick={gerarPDF} style={{ ...buttonBase, background: '#2563eb', color: '#fff' }}>Gerar PDF</button>
              <button onClick={enviarWhatsApp} style={{ ...buttonBase, background: '#22c55e', color: '#052e16' }}>Enviar no WhatsApp</button>
            </div>
          </div>
        </div>

        <div style={{ ...shellStyle, marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 28, color: '#111827' }}>Documentos salvos</h2>
            <div style={{ background: '#fff', border: `1px solid ${config.corSecundaria}`, borderRadius: 999, padding: '8px 14px', fontWeight: 800 }}>
              {orcamentosSalvos.length} registro(s)
            </div>
          </div>

          <div>
            {orcamentosSalvos.length === 0 ? (
              <div style={{ ...cardStyle, color: '#475569' }}>Nenhum orçamento salvo ainda.</div>
            ) : (
              orcamentosSalvos.map((orc) => (
                <div key={orc.id} style={{ ...cardStyle, marginBottom: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 4 }}>{orc.numero} - {orc.titulo}</div>
                    <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Cliente:</strong> {orc.cliente?.nome || '-'}</div>
                    <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Status:</strong> {orc.status}</div>
                    <div style={{ fontSize: 13, marginBottom: 2 }}><strong>Valor:</strong> {moeda(orc.total)}</div>
                    <div style={{ fontSize: 13 }}><strong>Emissão:</strong> {orc.data}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, auto)', gap: 8, justifyContent: isMobile ? 'stretch' : 'end' }}>
                    <button onClick={() => (window.location.href = `/impressao-orcamento/${orc.id}`)} style={{ ...buttonBase, background: '#f97316', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Visualizar</button>
                    <button onClick={() => compartilharLinkOrcamento(orc)} style={{ ...buttonBase, background: '#16a34a', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Compartilhar</button>
                    <button onClick={() => editarOrcamento(orc)} style={{ ...buttonBase, background: '#2563eb', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Editar</button>
                    <button onClick={() => excluirOrcamento(orc.id)} style={{ ...buttonBase, background: '#dc2626', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Excluir</button>
                    <button onClick={() => abrirLinkOrcamento(orc.link)} style={{ ...buttonBase, background: '#7c3aed', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Abrir link</button>
                    <button onClick={() => gerarOS(orc)} style={{ ...buttonBase, background: '#059669', color: '#fff', height: 36, padding: '0 14px', fontSize: 13 }}>Gerar OS + Venda</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResumoCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div style={{ background: '#ffffff', borderRadius: 18, padding: 18, border: '2px solid #e5e7eb', boxShadow: '0 10px 26px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>{valor}</div>
    </div>
  )
}
