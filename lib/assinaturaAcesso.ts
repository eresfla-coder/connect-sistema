import { isUsuarioAdmin, normalizarStatus, type PerfilAdminCheck } from '@/lib/access'
import { contarDocumentosPainelSync } from '@/lib/orcamentos-local'
import { obterUserIdPainelSync } from '@/lib/connect-user-storage'
import {
  TRIAL_DIAS,
  normalizarRecorrencia,
  normalizarTier,
  obterPlanoConfig,
  tierPorValor,
  type PlanoTier,
  type RecursosPlano,
} from '@/lib/planosSaaS'

export type ModuloPremium =
  | 'connect_ai'
  | 'financeiro'
  | 'crm'
  | 'automacoes'
  | 'multi_usuario'
  | 'pdf_premium'

export type SnapshotAssinatura = {
  tier: PlanoTier
  status: string
  ativo: boolean
  vencimento: string | null
  proximaCobranca: string | null
  renovacaoAutomatica: boolean
  diasRestantesTrial: number | null
  emTrial: boolean
  isAdminMaster?: boolean
  documentosUsados: number
  limiteDocumentos: number
  limiteUsuarios: number
  recursos: RecursosPlano
}

/** Assinatura liberada para admin/master (sem trial nem bloqueio). */
export function snapshotAssinaturaAdmin(documentosUsados = 0): SnapshotAssinatura {
  const cfg = obterPlanoConfig('empresa')!
  return {
    tier: 'empresa',
    status: 'ativo',
    ativo: true,
    vencimento: null,
    proximaCobranca: null,
    renovacaoAutomatica: false,
    diasRestantesTrial: null,
    emTrial: false,
    isAdminMaster: true,
    documentosUsados,
    limiteDocumentos: cfg.limites.documentosMes * 100,
    limiteUsuarios: 99,
    recursos: cfg.recursos,
  }
}

export type EntradaPerfilAssinatura = {
  status?: string | null
  ativo?: boolean | null
  vencimento?: string | null
  valor_plano?: number | null
  plano_tier?: string | null
}

export type EntradaAssinaturaDb = {
  plano?: string | null
  plano_tier?: string | null
  status?: string | null
  data_fim?: string | null
  data_trial_fim?: string | null
  proxima_cobranca?: string | null
  renovacao_automatica?: boolean | null
  valor_mensal?: number | null
}

const MODULO_RECURSO: Record<ModuloPremium, keyof RecursosPlano> = {
  connect_ai: 'connectAi',
  financeiro: 'financeiro',
  crm: 'crm',
  automacoes: 'automacoes',
  multi_usuario: 'multiUsuario',
  pdf_premium: 'pdfPremium',
}

export function contarDocumentosLocal(userId?: string | null): number {
  if (typeof window === 'undefined') return 0
  return contarDocumentosPainelSync(userId ?? obterUserIdPainelSync())
}

export function diasRestantesDeData(dataIso?: string | null): number | null {
  if (!dataIso) return null
  const fim = new Date(dataIso)
  if (Number.isNaN(fim.getTime())) return null
  return Math.ceil((fim.getTime() - Date.now()) / 86400000)
}

export function resolverSnapshotAssinatura(
  perfil?: EntradaPerfilAssinatura | null,
  assinatura?: EntradaAssinaturaDb | null,
  documentosUsados = 0,
  opts?: { email?: string | null },
): SnapshotAssinatura {
  if (isUsuarioAdmin({ email: opts?.email, perfil: perfil as PerfilAdminCheck })) {
    return snapshotAssinaturaAdmin(documentosUsados)
  }

  const statusPerfil = normalizarStatus(perfil?.status)
  const statusAssinatura = String(assinatura?.status || '').toLowerCase()
  const ativoPerfil = perfil?.ativo !== false

  let tier = normalizarTier(assinatura?.plano_tier || assinatura?.plano || perfil?.plano_tier)
  if (tier === 'trial' && Number(perfil?.valor_plano || 0) > 0) {
    tier = tierPorValor(Number(perfil?.valor_plano))
  }

  const cfg = obterPlanoConfig(tier === 'trial' ? 'starter' : tier)
  const recursos = cfg?.recursos || obterPlanoConfig('starter')!.recursos
  const limiteDocumentos = cfg?.limites.documentosMes ?? 80
  const limiteUsuarios = cfg?.limites.usuarios ?? 1

  const vencimento = perfil?.vencimento || assinatura?.data_fim || assinatura?.data_trial_fim || null
  const diasTrial = diasRestantesDeData(assinatura?.data_trial_fim || vencimento)
  const emTrial =
    statusPerfil === 'teste' ||
    statusAssinatura === 'trial' ||
    (diasTrial !== null && diasTrial >= 0 && tier === 'trial')

  const expirado = diasRestantesDeData(vencimento) !== null && (diasRestantesDeData(vencimento) as number) < 0
  const bloqueado = !ativoPerfil || statusPerfil === 'bloqueado' || statusAssinatura === 'cancelada' || expirado

  return {
    tier: emTrial && tier !== 'empresa' && tier !== 'pro' ? 'trial' : tier,
    status: bloqueado ? 'bloqueado' : emTrial ? 'trial' : statusPerfil === 'ativo' ? 'ativo' : statusPerfil,
    ativo: !bloqueado,
    vencimento,
    proximaCobranca: assinatura?.proxima_cobranca || vencimento,
    renovacaoAutomatica: assinatura?.renovacao_automatica !== false,
    diasRestantesTrial: emTrial ? Math.max(0, diasTrial ?? TRIAL_DIAS) : null,
    emTrial,
    documentosUsados,
    limiteDocumentos,
    limiteUsuarios,
    recursos,
  }
}

export function podeAcessarModulo(snapshot: SnapshotAssinatura, modulo: ModuloPremium): boolean {
  if (!snapshot.ativo && !snapshot.emTrial) return false
  const chave = MODULO_RECURSO[modulo]
  return !!snapshot.recursos[chave]
}

export function atingiuLimiteDocumentos(snapshot: SnapshotAssinatura): boolean {
  if (snapshot.emTrial) return false
  return snapshot.documentosUsados >= snapshot.limiteDocumentos
}

export function mensagemUpgradeModulo(modulo: ModuloPremium): string {
  const mapa: Record<ModuloPremium, string> = {
    connect_ai: 'Connect AI está no plano Pro ou Empresa.',
    financeiro: 'Financeiro completo está no plano Pro ou Empresa.',
    crm: 'CRM avançado está no plano Pro ou Empresa.',
    automacoes: 'Automações estão no plano Empresa.',
    multi_usuario: 'Multiusuário está no plano Empresa.',
    pdf_premium: 'PDF premium está no plano Pro ou Empresa.',
  }
  return mapa[modulo]
}

export function tierRecomendadoParaModulo(modulo: ModuloPremium): PlanoTier {
  if (modulo === 'automacoes' || modulo === 'multi_usuario') return 'empresa'
  return 'pro'
}

export function parsePlanoPagamento(plano?: string | null, valor?: number | null) {
  const raw = String(plano || '').trim().toLowerCase()
  if (raw.includes('_')) {
    const [tierPart, recPart] = raw.split('_')
    return {
      tier: normalizarTier(tierPart),
      recorrencia: normalizarRecorrencia(recPart),
    }
  }
  if (raw === 'mensal' || raw === 'anual') {
    return { tier: 'starter' as PlanoTier, recorrencia: normalizarRecorrencia(raw) }
  }
  return { tier: tierPorValor(Number(valor || 0)), recorrencia: 'mensal' as const }
}
