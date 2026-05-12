export const DEMO_FLAG_KEY = 'connect_demo_ativo'
export const DEMO_SEEDED_KEY = 'connect_demo_seeded_v94'

const hoje = new Date()
const iso = (dias = 0) => {
  const data = new Date(hoje)
  data.setDate(data.getDate() + dias)
  return data.toISOString().split('T')[0]
}

export function seedDemoData(force = false) {
  if (typeof window === 'undefined') return
  if (!force && window.localStorage.getItem(DEMO_SEEDED_KEY) === 'sim') return

  const clientes = [
    { id: 'demo-cliente-1', nome: 'Mercadinho Boa Compra', telefone: '84992181399', whatsapp: '84992181399', email: 'contato@boacompra.com.br', cpfCnpj: '12.345.678/0001-90', bairro: 'Centro', cidade: 'Parnamirim/RN', endereco: 'Rua Principal, 120', criadoEm: new Date().toISOString() },
    { id: 'demo-cliente-2', nome: 'Clínica Sorriso Fácil', telefone: '84999990000', whatsapp: '84999990000', email: 'financeiro@sorrisofacil.com.br', bairro: 'Nova Parnamirim', cidade: 'Parnamirim/RN', endereco: 'Av. Comercial, 550', criadoEm: new Date().toISOString() },
    { id: 'demo-cliente-3', nome: 'Salão Bella Mulher', telefone: '84988887777', whatsapp: '84988887777', email: 'atendimento@bellamulher.com.br', bairro: 'Cajupiranga', cidade: 'Parnamirim/RN', endereco: 'Rua das Flores, 45', criadoEm: new Date().toISOString() },
  ]

  const orcamentos = [
    { id: 'demo-orc-001', numero: '0001', cliente: 'Mercadinho Boa Compra', telefone: '84992181399', status: 'Aguardando aprovação', data: iso(-2), validade: iso(5), total: 489.9, itens: [{ descricao: 'Cartões de visita 4x4', quantidade: 1000, valorUnitario: 0.22, subtotal: 220 }, { descricao: 'Banner 80x120cm', quantidade: 1, valorUnitario: 269.9, subtotal: 269.9 }], criadoEm: new Date().toISOString() },
    { id: 'demo-orc-002', numero: '0002', cliente: 'Clínica Sorriso Fácil', telefone: '84999990000', status: 'Aprovado', data: iso(-1), validade: iso(7), total: 850, itens: [{ descricao: 'Manutenção preventiva em computadores', quantidade: 5, valorUnitario: 170, subtotal: 850 }], criadoEm: new Date().toISOString() },
  ]

  const ordens = [
    { id: 'demo-os-001', numero: '0001', cliente: 'Salão Bella Mulher', telefone: '84988887777', equipamento: 'Notebook Lenovo', defeito: 'Lento e com falha ao iniciar', status: 'Em andamento', prioridade: 'Alta', valorTotal: 280, saldo: 280, dataEntrada: iso(-1), criadoEm: new Date().toISOString() },
    { id: 'demo-os-002', numero: '0002', cliente: 'Mercadinho Boa Compra', telefone: '84992181399', equipamento: 'Impressora Epson', defeito: 'Falha na impressão colorida', status: 'Aberta', prioridade: 'Média', valorTotal: 190, saldo: 190, dataEntrada: iso(0), criadoEm: new Date().toISOString() },
  ]

  const financeiro = [
    { id: 'demo-fin-001', cliente_id: 'demo-cliente-1', cliente_nome: 'Mercadinho Boa Compra', cliente_whatsapp: '84992181399', cliente: 'Mercadinho Boa Compra', whatsapp: '84992181399', descricao: 'Orçamento 0001 - entrada', parcela: '1/2', valor: 244.95, valor_pago: 0, status: 'pendente', data_vencimento: iso(-3), vencimento: iso(-3), forma_pagamento: 'PIX', link_pagamento: '/pagar/demo-fin-001', criadoEm: new Date().toISOString() },
    { id: 'demo-fin-002', cliente_id: 'demo-cliente-2', cliente_nome: 'Clínica Sorriso Fácil', cliente_whatsapp: '84999990000', cliente: 'Clínica Sorriso Fácil', whatsapp: '84999990000', descricao: 'Manutenção preventiva - parcela 1', parcela: '1/1', valor: 850, valor_pago: 850, status: 'pago', data_vencimento: iso(-1), vencimento: iso(-1), forma_pagamento: 'Boleto', link_pagamento: '/pagar/demo-fin-002', criadoEm: new Date().toISOString() },
    { id: 'demo-fin-003', cliente_id: 'demo-cliente-3', cliente_nome: 'Salão Bella Mulher', cliente_whatsapp: '84988887777', cliente: 'Salão Bella Mulher', whatsapp: '84988887777', descricao: 'OS 0001 - conserto notebook', parcela: '1/1', valor: 280, valor_pago: 0, status: 'pendente', data_vencimento: iso(0), vencimento: iso(0), forma_pagamento: 'PIX', link_pagamento: '/pagar/demo-fin-003', criadoEm: new Date().toISOString() },
  ]

  const produtos = [
    { id: 'demo-prod-1', nome: 'Papel A4 pacote 500 folhas', categoria: 'Papelaria', precoVenda: 29.9, estoque: 24 },
    { id: 'demo-prod-2', nome: 'Mouse sem fio', categoria: 'Informática', precoVenda: 49.9, estoque: 12 },
    { id: 'demo-prod-3', nome: 'Serviço de formatação', categoria: 'Serviços', precoVenda: 120, estoque: 999 },
  ]

  const config = { nomeEmpresa: 'Connect Demonstração', telefone: '(84) 9 9218-1399', email: 'demo@connectsistemas.com.br', cidadeUf: 'Parnamirim/RN', responsavel: 'Connect Sistemas', corPrimaria: '#2563eb', corSecundaria: '#10b981', tituloPdf: 'Documento Comercial', rodapePdf: 'Sistema demonstrativo - dados fictícios.' }

  window.localStorage.setItem('connect_clientes', JSON.stringify(clientes))
  window.localStorage.setItem('connect_orcamentos_salvos', JSON.stringify(orcamentos))
  window.localStorage.setItem('connect_ordens_servico_salvas', JSON.stringify(ordens))
  window.localStorage.setItem('connect_financeiro_titulos', JSON.stringify(financeiro))
  window.localStorage.setItem('connect_produtos', JSON.stringify(produtos))
  window.localStorage.setItem('connect_configuracoes', JSON.stringify(config))
  window.localStorage.setItem(DEMO_FLAG_KEY, 'sim')
  window.localStorage.setItem(DEMO_SEEDED_KEY, 'sim')
  window.sessionStorage.setItem('connect_trial_notice', 'Modo demonstração ativo: dados fictícios para teste seguro.')
}

export function resetDemoData() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_SEEDED_KEY)
  seedDemoData(true)
}

export function isDemoMode() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DEMO_FLAG_KEY) === 'sim'
}

export function sairDemoMode() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_FLAG_KEY)
  window.localStorage.removeItem(DEMO_SEEDED_KEY)
  window.sessionStorage.removeItem('connect_trial_notice')
}


export const DEMO_BLOCKED_ACTION_MESSAGE =
  'Modo demonstração: esta ação é bloqueada para segurança. Crie uma conta grátis de 7 dias para salvar, enviar WhatsApp e gerar links reais.'

export function avisoDemoBloqueado() {
  if (typeof window === 'undefined') return
  window.alert(DEMO_BLOCKED_ACTION_MESSAGE)
}

function textoDoElemento(element: Element | null) {
  if (!element) return ''
  return String((element as HTMLElement).innerText || element.textContent || '').trim().toLowerCase()
}

function deveBloquearClique(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const acionador = target.closest('button, a, [role="button"], input[type="submit"]')
  if (!acionador) return false

  const texto = textoDoElemento(acionador)
  const href = String((acionador as HTMLAnchorElement).href || '')

  const termosBloqueados = [
    'salvar',
    'excluir',
    'apagar',
    'remover',
    'enviar whatsapp',
    'whatsapp',
    'gerar link',
    'copiar link',
    'aprovar',
    'recusar',
    'marcar pago',
    'bloquear',
    'resetar senha',
    'cobrar',
    'assinar',
    'criar orçamento',
    'nova os',
    'novo cliente',
    'novo produto',
    'novo lançamento',
    'nova venda',
  ]

  if (href.includes('wa.me') || href.includes('whatsapp')) return true
  return termosBloqueados.some((termo) => texto.includes(termo))
}

function deveBloquearFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url

  const method = String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false

  const normalizado = String(url || '')

  if (normalizado.includes('/rest/v1/')) return true
  if (normalizado.includes('/auth/v1/admin')) return true
  if (normalizado.includes('/api/public-docs')) return true
  if (normalizado.includes('/api/admin')) return true
  if (normalizado.includes('/api/')) return true

  return false
}

let demoGuardInstalado = false

export function installDemoGuard() {
  if (typeof window === 'undefined') return
  if (demoGuardInstalado) return

  demoGuardInstalado = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isDemoMode() && deveBloquearFetch(input, init)) {
      avisoDemoBloqueado()
      return new Response(JSON.stringify({ error: DEMO_BLOCKED_ACTION_MESSAGE, demoBlocked: true }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(input, init)
  }

  const originalOpen = window.open.bind(window)
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const destino = String(url || '')
    if (isDemoMode() && (destino.includes('wa.me') || destino.includes('whatsapp'))) {
      avisoDemoBloqueado()
      return null
    }
    return originalOpen(url as any, target, features)
  }) as typeof window.open

  document.addEventListener(
    'click',
    (event) => {
      if (!isDemoMode()) return
      if (!deveBloquearClique(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      avisoDemoBloqueado()
    },
    true,
  )

  document.addEventListener(
    'submit',
    (event) => {
      if (!isDemoMode()) return
      event.preventDefault()
      event.stopPropagation()
      avisoDemoBloqueado()
    },
    true,
  )
}
