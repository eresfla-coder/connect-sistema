import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'

export const NOME_SISTEMA_COBRANCA = 'Connect Sistema'

export type PerfilAssinatura = {
  id: string
  email?: string | null
  nome?: string | null
  nome_empresa?: string | null
  telefone?: string | null
  whatsapp?: string | null
  celular?: string | null
  ativo?: boolean | null
  status?: string | null
  vencimento?: string | null
  valor_mensalidade?: number | string | null
  mensalidade?: number | string | null
  valor_plano?: number | string | null
  is_admin?: boolean | null
}

export type GrupoCobranca = 'vencendo_hoje' | 'atrasado' | 'ativo'

export type ResumoAssinatura = {
  perfil: PerfilAssinatura
  nomeCliente: string
  telefone: string
  valorMensalidade: number
  vencimentoFormatado: string
  diasAtraso: number
  diasParaVencer: number
  grupo: GrupoCobranca
  statusTexto: string
  statusMensagem: string
  badge: { label: string; corFundo: string; corTexto: string }
}

const COLUNAS_PERFIS =
  'id, email, nome, nome_empresa, telefone, whatsapp, celular, ativo, status, vencimento, valor_mensalidade, mensalidade, valor_plano, is_admin'

const COLUNAS_PERFIS_MINIMAS = 'id, email, ativo, status, vencimento'

export function colunasPerfisCobranca() {
  return COLUNAS_PERFIS
}

export function colunasPerfisCobrancaMinimas() {
  return COLUNAS_PERFIS_MINIMAS
}

export function parseDataLocal(valor?: string | null) {
  const texto = String(valor || '').trim()
  if (!texto) return null

  const apenasData = texto.slice(0, 10)
  const partes = apenasData.split('-').map(Number)
  if (partes.length === 3 && partes.every((n) => Number.isFinite(n))) {
    const [ano, mes, dia] = partes
    return new Date(ano, mes - 1, dia)
  }

  const data = new Date(texto)
  if (Number.isNaN(data.getTime())) return null
  data.setHours(0, 0, 0, 0)
  return data
}

export function inicioDoDia(data = new Date()) {
  const copia = new Date(data)
  copia.setHours(0, 0, 0, 0)
  return copia
}

export function calcularDiasVencimento(vencimento?: string | null) {
  const dataVencimento = parseDataLocal(vencimento)
  if (!dataVencimento) return null

  const hoje = inicioDoDia()
  const alvo = inicioDoDia(dataVencimento)
  const umDia = 24 * 60 * 60 * 1000
  return Math.round((alvo.getTime() - hoje.getTime()) / umDia)
}

export function formatarDataBR(valor?: string | null) {
  const data = parseDataLocal(valor)
  if (!data) return '—'
  return data.toLocaleDateString('pt-BR')
}

export function formatarMoeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function somenteDigitos(valor?: string | null) {
  return String(valor || '').replace(/\D/g, '')
}

export function normalizarTelefoneWhatsApp(valor?: string | null) {
  const telefone = somenteDigitos(valor)
  if (!telefone) return ''

  const semPrefixoInternacional = telefone.replace(/^00/, '')
  const telefoneNacional = semPrefixoInternacional.startsWith('55')
    ? semPrefixoInternacional.slice(2)
    : semPrefixoInternacional

  return `55${telefoneNacional.replace(/^0+/, '')}`
}

export function lerValorMensalidade(perfil: PerfilAssinatura) {
  const bruto =
    perfil.valor_mensalidade ?? perfil.mensalidade ?? perfil.valor_plano ?? 0

  if (typeof bruto === 'number') return bruto
  const texto = String(bruto).replace(/[^\d,.-]/g, '').replace(',', '.')
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

export function nomeClienteAssinatura(perfil: PerfilAssinatura) {
  const nome =
    perfil.nome?.trim() ||
    perfil.nome_empresa?.trim() ||
    perfil.email?.split('@')[0]?.trim()

  return nome || 'Cliente'
}

export function telefoneClienteAssinatura(perfil: PerfilAssinatura) {
  return perfil.whatsapp || perfil.telefone || perfil.celular || ''
}

function statusBadge(grupo: GrupoCobranca, dias: number | null) {
  if (grupo === 'atrasado') {
    const diasAtraso = dias !== null && dias < 0 ? Math.abs(dias) : 0
    return {
      label: diasAtraso > 0 ? `Atrasado · ${diasAtraso}d` : 'Atrasado',
      corFundo: 'rgba(239,68,68,0.18)',
      corTexto: '#fecaca',
    }
  }

  if (grupo === 'vencendo_hoje') {
    return {
      label: 'Vence hoje',
      corFundo: 'rgba(245,158,11,0.20)',
      corTexto: '#fde68a',
    }
  }

  return {
    label: dias !== null && dias > 0 ? `Ativo · ${dias}d` : 'Plano ativo',
    corFundo: 'rgba(34,197,94,0.18)',
    corTexto: '#bbf7d0',
  }
}

export function textoStatusCobranca(
  perfil: PerfilAssinatura,
  dias: number | null,
): { statusTexto: string; statusMensagem: string } {
  if (perfil.ativo === false || perfil.status === 'bloqueado') {
    return {
      statusTexto: 'bloqueada',
      statusMensagem: 'bloqueada',
    }
  }

  if (dias === null) {
    if (perfil.status === 'teste') {
      return { statusTexto: 'em teste grátis', statusMensagem: 'em teste grátis' }
    }
    if (perfil.status === 'ativo') {
      return { statusTexto: 'ativa', statusMensagem: 'ativa' }
    }
    return { statusTexto: 'ativa', statusMensagem: 'ativa' }
  }

  if (dias < 0) {
    const atraso = Math.abs(dias)
    const plural = atraso === 1 ? 'dia' : 'dias'
    return {
      statusTexto: `vencida há ${atraso} ${plural}`,
      statusMensagem: `vencida há ${atraso} ${plural}`,
    }
  }

  if (dias === 0) {
    return {
      statusTexto: 'vencendo hoje',
      statusMensagem: 'vencendo hoje',
    }
  }

  const plural = dias === 1 ? 'dia' : 'dias'
  return {
    statusTexto: `ativa — vence em ${dias} ${plural}`,
    statusMensagem: `ativa — vence em ${dias} ${plural}`,
  }
}

export function classificarAssinatura(perfil: PerfilAssinatura): GrupoCobranca {
  const dias = calcularDiasVencimento(perfil.vencimento)
  const bloqueado = perfil.ativo === false || perfil.status === 'bloqueado'

  if (bloqueado || (dias !== null && dias < 0)) return 'atrasado'
  if (dias === 0) return 'vencendo_hoje'
  return 'ativo'
}

export function montarResumoAssinatura(perfil: PerfilAssinatura): ResumoAssinatura {
  const dias = calcularDiasVencimento(perfil.vencimento)
  const grupo = classificarAssinatura(perfil)
  const { statusTexto, statusMensagem } = textoStatusCobranca(perfil, dias)
  const diasAtraso = dias !== null && dias < 0 ? Math.abs(dias) : 0
  const diasParaVencer = dias !== null && dias > 0 ? dias : 0

  return {
    perfil,
    nomeCliente: nomeClienteAssinatura(perfil),
    telefone: telefoneClienteAssinatura(perfil),
    valorMensalidade: lerValorMensalidade(perfil),
    vencimentoFormatado: formatarDataBR(perfil.vencimento),
    diasAtraso,
    diasParaVencer,
    grupo,
    statusTexto,
    statusMensagem,
    badge: statusBadge(grupo, dias),
  }
}

export function montarMensagemCobranca(resumo: ResumoAssinatura) {
  const valor =
    resumo.valorMensalidade > 0
      ? formatarMoeda(resumo.valorMensalidade)
      : 'consulte o suporte'

  return `Olá ${resumo.nomeCliente}, sua assinatura do ${NOME_SISTEMA_COBRANCA} está ${resumo.statusMensagem}. Valor: ${valor}. Vencimento: ${resumo.vencimentoFormatado}.`
}

export function abrirWhatsAppCobranca(resumo: ResumoAssinatura) {
  abrirWhatsAppComTelefone(resumo.telefone, montarMensagemCobranca(resumo))
}

export function perfilEhAdminConnect(perfil?: PerfilAssinatura | null) {
  if (!perfil) return false
  if (perfil.is_admin === true) return true
  if (perfil.status === 'admin') return true

  const emailsAdmin = String(
    process.env.NEXT_PUBLIC_CONNECT_ADMIN_EMAILS || '',
  )
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const email = String(perfil.email || '').trim().toLowerCase()
  if (email && emailsAdmin.includes(email)) return true

  return false
}
