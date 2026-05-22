import {
  calcularDiasVencimento,
  formatarDataBR,
  inicioDoDia,
  type PerfilAssinatura,
} from '@/lib/assinatura-cobranca'

export const DIAS_TRIAL_PADRAO = Number(
  process.env.NEXT_PUBLIC_CONNECT_TRIAL_DIAS || '7',
)

export function dataIsoVencimentoTrial(dias = DIAS_TRIAL_PADRAO) {
  const fim = inicioDoDia()
  fim.setDate(fim.getDate() + dias)
  const ano = fim.getFullYear()
  const mes = String(fim.getMonth() + 1).padStart(2, '0')
  const dia = String(fim.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function perfilAcessoBloqueado(perfil?: PerfilAssinatura | null) {
  if (!perfil) return true
  if (perfil.ativo === false) return true
  if (perfil.status === 'bloqueado') return true

  const dias = calcularDiasVencimento(perfil.vencimento)
  if (dias !== null && dias < 0) return true

  return false
}

export type InfoTrial = {
  emTrial: boolean
  diasRestantes: number | null
  vencimentoFormatado: string
  expirado: boolean
  textoBanner: string
}

export function infoTrialAssinatura(perfil?: PerfilAssinatura | null): InfoTrial {
  const dias = calcularDiasVencimento(perfil?.vencimento)
  const emTrial = perfil?.status === 'teste'
  const vencimentoFormatado = formatarDataBR(perfil?.vencimento)
  const expirado = dias !== null && dias < 0

  let textoBanner = ''

  if (emTrial) {
    if (dias === null) {
      textoBanner = `Teste grátis ativo — configure seu vencimento em Minha Conta`
    } else if (dias < 0) {
      textoBanner = `Teste encerrado — renove para continuar`
    } else if (dias === 0) {
      textoBanner = `Último dia do seu teste grátis`
    } else {
      textoBanner = `Teste grátis — ${dias} ${dias === 1 ? 'dia' : 'dias'} restante${dias === 1 ? '' : 's'}`
    }
  } else if (dias !== null && dias >= 0 && dias <= 5) {
    textoBanner = `Plano vence em ${dias} ${dias === 1 ? 'dia' : 'dias'} (${vencimentoFormatado})`
  }

  return {
    emTrial,
    diasRestantes: dias,
    vencimentoFormatado,
    expirado,
    textoBanner,
  }
}
