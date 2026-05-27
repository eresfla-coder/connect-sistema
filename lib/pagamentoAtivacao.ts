import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { montarPayloadAtivacao } from '@/lib/assinaturaServer'
import { parsePlanoPagamento } from '@/lib/assinaturaAcesso'
import { chaveCheckout, diasPlano, normalizarTier, resolverCheckout, valorPlano, type PlanoTier, type RecorrenciaPlano } from '@/lib/planosSaaS'

function adicionarDias(base: Date, dias: number) {
  const data = new Date(base)
  data.setDate(data.getDate() + dias)
  return data
}

type PagamentoLocal = { id: string; user_id: string; valor: number; status: string; plano?: string | null }

export async function resolverPagamentoLocal(
  pagamentoMp: Record<string, unknown>,
  externalReference: string,
): Promise<PagamentoLocal | null> {
  const supabase = getSupabaseAdmin()
  const ref = String(externalReference || '').trim()

  if (ref) {
    const { data: porRef } = await supabase
      .from('pagamentos')
      .select('id,user_id,valor,status,plano')
      .eq('id', ref)
      .maybeSingle()
    if (porRef?.id) return porRef as PagamentoLocal
  }

  const mpId = String(pagamentoMp?.id || '').trim()
  if (mpId) {
    const { data: porGateway } = await supabase
      .from('pagamentos')
      .select('id,user_id,valor,status,plano')
      .eq('gateway_pagamento_id', mpId)
      .maybeSingle()
    if (porGateway?.id) return porGateway as PagamentoLocal
  }

  const metadata = (pagamentoMp?.metadata || {}) as Record<string, unknown>
  let userId = String(metadata.user_id || '').trim()
  let planoChave = ''

  if (!userId) {
    const payer = (pagamentoMp?.payer || {}) as Record<string, unknown>
    const email = String(payer.email || '').trim().toLowerCase()
    if (email) {
      const { data: perfil } = await supabase.from('perfis').select('id,plano_tier').eq('email', email).maybeSingle()
      if (perfil?.id) userId = String(perfil.id)
    }
  }

  if (!userId) {
    const preapprovalId = String(
      metadata.preapproval_id ||
        (pagamentoMp?.point_of_interaction as { transaction_data?: { subscription_id?: string } })?.transaction_data
          ?.subscription_id ||
        '',
    ).trim()
    if (preapprovalId) {
      const { data: assinatura } = await supabase
        .from('assinaturas')
        .select('user_id,plano')
        .eq('gateway_assinatura_id', preapprovalId)
        .maybeSingle()
      if (assinatura?.user_id) {
        userId = String(assinatura.user_id)
        planoChave = String(assinatura.plano || '')
      }
    }
  }

  if (!userId) return null

  const resolvido = resolverCheckout({
    tier: String(metadata.tier || metadata.plano || parsePlanoPagamento(planoChave, 0).tier || 'starter'),
    recorrencia: String(metadata.recorrencia || metadata.periodicidade || 'mensal'),
  })
  if (!planoChave) planoChave = chaveCheckout(resolvido.tier, resolvido.recorrencia)

  const valor = Number(pagamentoMp?.transaction_amount || valorPlano(resolvido.tier, resolvido.recorrencia) || 0)
  const tipoPix = String(metadata.tipo || '').toLowerCase() === 'pix'
  const novoId = crypto.randomUUID()

  const { data: criado, error } = await supabase
    .from('pagamentos')
    .insert({
      id: novoId,
      user_id: userId,
      valor,
      status: 'pendente',
      metodo: tipoPix ? 'pix' : 'mercado_pago',
      gateway: 'mercado_pago',
      external_reference: novoId,
      plano: planoChave,
      recorrencia: resolvido.recorrencia,
      currency: 'BRL',
      gateway_pagamento_id: mpId || null,
      descricao: `Cobrança Connect ${resolvido.tier}`,
    })
    .select('id,user_id,valor,status,plano')
    .single()

  if (error || !criado?.id) {
    console.error('CONNECT_RESOLVER_PAGAMENTO_ERROR', { userId, mpId, error })
    return null
  }

  return criado as PagamentoLocal
}

export async function ativarPagamentoAprovado(
  pagamento: { id: string; user_id: string; valor: number; plano?: string | null },
  pagamentoMp: Record<string, unknown> | null,
) {
  const supabase = getSupabaseAdmin()
  const parsed = parsePlanoPagamento(pagamento.plano, pagamento.valor)
  let tier: PlanoTier = parsed.tier === 'trial' ? 'starter' : parsed.tier
  let recorrencia: RecorrenciaPlano = parsed.recorrencia

  const metadata = (pagamentoMp?.metadata || {}) as Record<string, unknown>
  const tipoPix = String(metadata?.tipo || '').toLowerCase() === 'pix'

  if (metadata?.tier || metadata?.plano) {
    const resolvido = resolverCheckout({
      tier: String(metadata.tier || metadata.plano || ''),
      recorrencia: String(metadata.recorrencia || metadata.periodicidade || 'mensal'),
    })
    tier = resolvido.tier
    recorrencia = resolvido.recorrencia
  }

  if (tipoPix) {
    recorrencia = 'mensal'
    tier = normalizarTier(String(metadata.plano || metadata.tier || tier))
    if (tier === 'trial') tier = 'starter'
  }

  const agora = new Date()
  const { data: perfil } = await supabase.from('perfis').select('id,vencimento').eq('id', pagamento.user_id).maybeSingle()

  const vencimentoAtual = perfil?.vencimento ? new Date(perfil.vencimento) : null
  const baseVencimento =
    vencimentoAtual && !Number.isNaN(vencimentoAtual.getTime()) && vencimentoAtual > agora ? vencimentoAtual : agora

  const dias = tipoPix ? 30 : diasPlano(tier, recorrencia)
  const novoVencimento = adicionarDias(baseVencimento, dias).toISOString()

  const mp = pagamentoMp || {}
  const payloadAtivacao = montarPayloadAtivacao({
    userId: pagamento.user_id,
    tier,
    recorrencia,
    vencimentoIso: novoVencimento,
    gatewayAssinaturaId: String(mp?.id || ''),
    gatewayClienteId: String((mp?.payer as { id?: string })?.id || ''),
    valorPago: Number(mp?.transaction_amount || pagamento.valor || 0),
    renovacaoAutomatica: !tipoPix,
  })

  const metodoPagamento = tipoPix
    ? 'pix'
    : String(mp?.payment_method_id || mp?.payment_type_id || 'mercado_pago')

  await supabase
    .from('pagamentos')
    .update({
      status: 'pago',
      metodo: metodoPagamento,
      gateway_pagamento_id: String(mp?.id || ''),
      paid_amount: Number(mp?.transaction_amount || pagamento.valor || 0),
      plano: `${tier}_${recorrencia}`,
      recorrencia,
      data_pagamento: String(mp?.date_approved || agora.toISOString()),
    })
    .eq('id', pagamento.id)

  await supabase.from('assinaturas').upsert(payloadAtivacao.assinatura, { onConflict: 'user_id' })
  await supabase.from('perfis').update(payloadAtivacao.perfil).eq('id', pagamento.user_id)

  return { tier, recorrencia, novoVencimento, tipoPix }
}
