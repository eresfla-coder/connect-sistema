import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { dataMaisDias } from '@/lib/access'
import { isUsuarioAdminServer } from '@/lib/access-server'
import { PLANOS_CATALOGO, TRIAL_DIAS, type PlanoTier, type RecorrenciaPlano } from '@/lib/planosSaaS'
import { isPerfilPermanente, resolverSnapshotAssinatura } from '@/lib/assinaturaAcesso'

type PerfilAssinaturaSync = {
  id?: string
  status?: string | null
  ativo?: boolean | null
  vencimento?: string | null
  valor_plano?: number | null
  plano_tier?: string | null
  status_pagamento?: string | null
}

export async function sincronizarAssinaturaComPerfil(userId: string, perfil?: PerfilAssinaturaSync | null) {
  if (!perfil?.id && !userId) return false

  const statusNorm = String(perfil?.status || '').toLowerCase()
  const permanente = isPerfilPermanente(perfil)
  const pagante =
    permanente ||
    statusNorm === 'ativo' ||
    ['pago', 'em_dia'].includes(String(perfil?.status_pagamento || '').toLowerCase())

  if (!pagante) return false

  const supabase = getSupabaseAdmin()
  let tier = String(perfil?.plano_tier || (permanente ? 'empresa' : 'starter'))
  if (tier === 'trial') tier = permanente ? 'empresa' : 'starter'

  const vencimento = permanente
    ? '2099-12-31'
    : String(perfil?.vencimento || dataMaisDias(30)).slice(0, 10)
  const valorMensal = Number(perfil?.valor_plano ?? 0)

  const { error } = await supabase.from('assinaturas').upsert(
    {
      user_id: userId,
      plano: `${tier}_mensal`,
      plano_tier: tier,
      status: 'ativa',
      data_fim: `${vencimento}T23:59:59.999Z`,
      data_trial_fim: null,
      proxima_cobranca: vencimento,
      trial_dias: 0,
      renovacao_automatica: false,
      valor_mensal: valorMensal > 0 ? valorMensal : null,
      gateway: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    console.warn('[ASSINATURA_SYNC_PERFIL]', error.message)
    return false
  }

  return true
}

export async function garantirTrialAssinatura(userId: string, email?: string | null) {
  if (isUsuarioAdminServer({ email })) {
    return { trialFim: null, email, admin: true as const }
  }

  const supabase = getSupabaseAdmin()
  const { data: perfil } = await supabase
    .from('perfis')
    .select('id,status,ativo,vencimento,plano_tier,valor_plano,status_pagamento')
    .eq('id', userId)
    .maybeSingle()

  if (perfil && (isPerfilPermanente(perfil) || String(perfil.status || '').toLowerCase() === 'ativo')) {
    await sincronizarAssinaturaComPerfil(userId, perfil)
    return { trialFim: null, email, skip: true as const }
  }

  const trialFim = dataMaisDias(TRIAL_DIAS)

  const { data: assinatura } = await supabase
    .from('assinaturas')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!assinatura) {
    await supabase.from('assinaturas').upsert(
      {
        user_id: userId,
        plano: 'trial',
        plano_tier: 'trial',
        status: 'trial',
        data_trial_fim: trialFim,
        data_fim: trialFim,
        proxima_cobranca: trialFim,
        trial_dias: TRIAL_DIAS,
        renovacao_automatica: false,
      },
      { onConflict: 'user_id' },
    )
  }

  if (perfil && String(perfil.status || '').toLowerCase() === 'trial' && !perfil.vencimento) {
    await supabase
      .from('perfis')
      .update({ vencimento: trialFim, plano_tier: 'trial', ativo: true })
      .eq('id', userId)
  }

  return { trialFim, email }
}

export async function obterAssinaturaUsuario(userId: string) {
  const supabase = getSupabaseAdmin()

  const [{ data: perfil }, { data: assinatura }] = await Promise.all([
    supabase
      .from('perfis')
      .select('id,email,status,ativo,vencimento,valor_plano,plano_tier,ultimo_pagamento,status_pagamento')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('assinaturas')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const snapshot = resolverSnapshotAssinatura(perfil, assinatura, 0, {
    email: perfil?.email || null,
  })

  return { perfil, assinatura, snapshot }
}

export function montarPayloadAtivacao(params: {
  userId: string
  tier: PlanoTier
  recorrencia: RecorrenciaPlano
  vencimentoIso: string
  gatewayAssinaturaId?: string
  gatewayClienteId?: string
  valorPago?: number
  renovacaoAutomatica?: boolean
}) {
  const planoChave = `${params.tier}_${params.recorrencia}`
  const cfg = PLANOS_CATALOGO[params.tier]
  const valorMensal = cfg?.precos.mensal ?? params.valorPago ?? 0
  const valorAnual = cfg?.precos.anual ?? valorMensal * 10

  return {
    assinatura: {
      user_id: params.userId,
      plano: planoChave,
      plano_tier: params.tier,
      status: 'ativa',
      data_fim: params.vencimentoIso,
      proxima_cobranca: params.vencimentoIso,
      data_trial_fim: null,
      trial_dias: 0,
      renovacao_automatica: params.renovacaoAutomatica !== false,
      valor_mensal: valorMensal,
      valor_anual: valorAnual,
      gateway: 'mercado_pago',
      gateway_assinatura_id: params.gatewayAssinaturaId || '',
      gateway_cliente_id: params.gatewayClienteId || '',
    },
    perfil: {
      ativo: true,
      status: 'ativo',
      vencimento: params.vencimentoIso,
      ultimo_pagamento: new Date().toISOString(),
      status_pagamento: 'pago',
      valor_plano: valorMensal,
      plano_tier: params.tier,
    },
  }
}
