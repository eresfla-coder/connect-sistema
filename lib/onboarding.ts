import { lerConfigEmpresaLocal } from '@/lib/connect-public'

export const ONBOARDING_STORAGE = 'connect_onboarding_estado_v1'

export type PassoOnboarding =
  | 'empresa'
  | 'cliente'
  | 'orcamento'
  | 'whatsapp'
  | 'os'

export type EstadoOnboarding = {
  concluido: boolean
  dispensado: boolean
  passoAtual: number
  manual: Partial<Record<PassoOnboarding, boolean>>
}

const PASSOS: PassoOnboarding[] = [
  'empresa',
  'cliente',
  'orcamento',
  'whatsapp',
  'os',
]

const ROTAS_PASSO: Record<PassoOnboarding, string> = {
  empresa: '/configuracoes',
  cliente: '/clientes',
  orcamento: '/orcamentos',
  whatsapp: '/orcamentos',
  os: '/ordens-servico',
}

export function rotasOnboarding() {
  return ROTAS_PASSO
}

function lerJson<T>(chave: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(chave)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function lerEstadoOnboarding(): EstadoOnboarding {
  return lerJson<EstadoOnboarding>(ONBOARDING_STORAGE, {
    concluido: false,
    dispensado: false,
    passoAtual: 0,
    manual: {},
  })
}

export function salvarEstadoOnboarding(estado: EstadoOnboarding) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ONBOARDING_STORAGE, JSON.stringify(estado))
}

export function marcarPassoOnboarding(passo: PassoOnboarding) {
  const estado = lerEstadoOnboarding()
  estado.manual[passo] = true
  salvarEstadoOnboarding(estado)
}

export function dispensarOnboarding() {
  const estado = lerEstadoOnboarding()
  estado.dispensado = true
  salvarEstadoOnboarding(estado)
}

function detectarPassosAutomaticos(): Record<PassoOnboarding, boolean> {
  const estado = lerEstadoOnboarding()
  const config = lerConfigEmpresaLocal()
  const clientes = lerJson<unknown[]>('connect_clientes', [])
  const orcamentos = lerJson<unknown[]>('connect_orcamentos_salvos', [])
  const os = lerJson<unknown[]>('connect_ordens_servico_salvas', [])

  const empresaOk =
    Boolean(config.nomeEmpresa?.trim()) &&
    config.nomeEmpresa !== 'LOJA CONNECT'

  return {
    empresa: empresaOk,
    cliente: Array.isArray(clientes) && clientes.length > 0,
    orcamento: Array.isArray(orcamentos) && orcamentos.length > 0,
    whatsapp: Boolean(estado.manual.whatsapp),
    os: Array.isArray(os) && os.length > 0,
  }
}

export function progressoOnboarding() {
  const estado = lerEstadoOnboarding()
  const auto = detectarPassosAutomaticos()

  const itens = PASSOS.map((passo) => ({
    passo,
    label: labelPasso(passo),
    rota: ROTAS_PASSO[passo],
    feito: Boolean(auto[passo] || estado.manual[passo]),
  }))

  const feitos = itens.filter((i) => i.feito).length
  const total = itens.length
  const percentual = total > 0 ? Math.round((feitos / total) * 100) : 0
  const concluido = feitos === total

  if (concluido && !estado.concluido) {
    estado.concluido = true
    salvarEstadoOnboarding(estado)
  }

  return {
    itens,
    feitos,
    total,
    percentual,
    concluido,
    dispensado: estado.dispensado,
    passoAtual: Math.min(estado.passoAtual, total - 1),
    deveExibir: !estado.dispensado && !concluido,
  }
}

function labelPasso(passo: PassoOnboarding) {
  switch (passo) {
    case 'empresa':
      return 'Cadastrar empresa'
    case 'cliente':
      return 'Cadastrar cliente'
    case 'orcamento':
      return 'Criar orçamento'
    case 'whatsapp':
      return 'Enviar WhatsApp'
    case 'os':
      return 'Criar OS'
    default:
      return passo
  }
}

export function avancarPassoOnboarding() {
  const estado = lerEstadoOnboarding()
  const { total } = progressoOnboarding()
  estado.passoAtual = Math.min(estado.passoAtual + 1, total - 1)
  salvarEstadoOnboarding(estado)
}
