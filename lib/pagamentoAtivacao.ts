import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { montarPayloadAtivacao } from '@/lib/assinaturaServer'
import { parsePlanoPagamento } from '@/lib/assinaturaAcesso'
import { chaveCheckout, diasPlano, normalizarTier, resolverCheckout, valorPlano, type PlanoTier, type RecorrenciaPlano } from '@/lib/planosSaaS'
import { calcularNovoVencimentoPago, dataNegocio, diaVencimento } from '@/lib/vigencia'
import { perfilComBloqueioGravado, statusVinculoAposPagamento } from '@/lib/admin-ciclo-comercial'

export const CODIGO_ATIVACAO_INCOMPLETA = 'ATIVACAO_INCOMPLETA'

export class AtivacaoIncompletaError extends Error {
  code = CODIGO_ATIVACAO_INCOMPLETA
  etapa: string
  /** true quando o pagamento voltou ao status anterior e um novo processamento é seguro. */
  retrySeguro: boolean

  constructor(etapa: string, retrySeguro: boolean, causa?: unknown) {
    super(`Ativação do pagamento incompleta (${etapa}).`)
    this.etapa = etapa
    this.retrySeguro = retrySeguro
    if (causa) console.error('CONNECT_ATIVACAO_INCOMPLETA', { etapa, retrySeguro, causa })
  }
}

export type ResultadoSyncVinculo = 'atualizado' | 'sem_vinculo' | 'ambiguo' | 'indisponivel'

const ERROS_TABELA_AUSENTE = new Set(['42P01', 'PGRST205'])

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
  const mp = pagamentoMp || {}
  const dataAprovacao = String(mp?.date_approved || agora.toISOString())
  const diaPagamento = diaVencimento(dataAprovacao) || dataNegocio(agora)

  const { data: atual, error: atualErr } = await supabase
    .from('pagamentos')
    .select('id,user_id,status')
    .eq('id', pagamento.id)
    .maybeSingle()
  if (atualErr || !atual?.id) {
    throw new AtivacaoIncompletaError('leitura_pagamento', true, atualErr)
  }
  if (String(atual.user_id) !== String(pagamento.user_id)) {
    throw new AtivacaoIncompletaError('usuario_divergente', true)
  }

  const resultadoBase = { tier, recorrencia, tipoPix }

  if (atual.status === 'pago') {
    return { ...resultadoBase, novoVencimento: null as string | null, jaProcessado: true, vinculo: null }
  }

  const { data: perfil, error: perfilErr } = await supabase
    .from('perfis')
    .select('id,vencimento,status,ativo')
    .eq('id', pagamento.user_id)
    .maybeSingle()
  if (perfilErr || !perfil?.id) {
    throw new AtivacaoIncompletaError('leitura_perfil', true, perfilErr)
  }
  const bloqueioPreservado = perfilComBloqueioGravado(perfil)

  const dias = tipoPix ? 30 : diasPlano(tier, recorrencia)
  const novoVencimento = calcularNovoVencimentoPago(perfil.vencimento, dias, agora)

  const payloadAtivacao = montarPayloadAtivacao({
    userId: pagamento.user_id,
    tier,
    recorrencia,
    vencimentoDia: novoVencimento,
    ultimoPagamentoDia: diaPagamento,
    gatewayAssinaturaId: String(mp?.id || ''),
    gatewayClienteId: String((mp?.payer as { id?: string })?.id || ''),
    valorPago: Number(mp?.transaction_amount || pagamento.valor || 0),
    renovacaoAutomatica: !tipoPix,
  })
  if (bloqueioPreservado) {
    // Pagamento credita o período, mas não remove bloqueio gravado (motivo não é rastreável).
    const { status: _status, ativo: _ativo, ...semLiberacao } = payloadAtivacao.perfil
    payloadAtivacao.perfil = semLiberacao as typeof payloadAtivacao.perfil
  }

  const metodoPagamento = tipoPix
    ? 'pix'
    : String(mp?.payment_method_id || mp?.payment_type_id || 'mercado_pago')

  // Claim atômico (uma linha): só quem troca o status lido por 'pago' aplica o período.
  const claimQuery = supabase
    .from('pagamentos')
    .update({
      status: 'pago',
      metodo: metodoPagamento,
      gateway_pagamento_id: String(mp?.id || ''),
      paid_amount: Number(mp?.transaction_amount || pagamento.valor || 0),
      plano: `${tier}_${recorrencia}`,
      recorrencia,
      data_pagamento: dataAprovacao,
    })
    .eq('id', pagamento.id)
  const { data: claim, error: claimErr } = await (atual.status == null
    ? claimQuery.is('status', null)
    : claimQuery.eq('status', atual.status)
  ).select('id')
  if (claimErr) throw new AtivacaoIncompletaError('claim_pagamento', true, claimErr)
  if (!Array.isArray(claim) || claim.length !== 1) {
    return { ...resultadoBase, novoVencimento: null as string | null, jaProcessado: true, vinculo: null }
  }

  const liberarClaim = async () => {
    const { data, error } = await supabase
      .from('pagamentos')
      .update({ status: atual.status ?? null })
      .eq('id', pagamento.id)
      .eq('status', 'pago')
      .select('id')
    return !error && Array.isArray(data) && data.length === 1
  }

  const falhar = async (etapa: string, causa?: unknown): Promise<never> => {
    throw new AtivacaoIncompletaError(etapa, await liberarClaim(), causa)
  }

  const { data: assinaturaGravada, error: assinaturaErr } = await supabase
    .from('assinaturas')
    .upsert(payloadAtivacao.assinatura, { onConflict: 'user_id' })
    .select('user_id')
  if (assinaturaErr || !Array.isArray(assinaturaGravada) || assinaturaGravada.length !== 1) {
    await falhar('assinatura', assinaturaErr)
  }

  let vinculo: ResultadoSyncVinculo
  try {
    vinculo = await sincronizarVinculoAdminPagamento({
      userId: pagamento.user_id,
      novoVencimento,
      diaPagamento,
      perfilBloqueado: bloqueioPreservado,
    })
  } catch (e) {
    return falhar('vinculo_admin', e)
  }

  let perfilQuery = supabase.from('perfis').update(payloadAtivacao.perfil).eq('id', pagamento.user_id)
  perfilQuery = perfil.vencimento
    ? perfilQuery.eq('vencimento', perfil.vencimento)
    : perfilQuery.is('vencimento', null)
  const { data: perfilGravado, error: perfilUpErr } = await perfilQuery.select('id,vencimento')
  const perfilOk =
    !perfilUpErr &&
    Array.isArray(perfilGravado) &&
    perfilGravado.length === 1 &&
    diaVencimento(perfilGravado[0]?.vencimento) === novoVencimento
  if (!perfilOk) {
    // Resposta perdida ≠ escrita perdida: só libera o claim se o perfil comprovadamente não recebeu o período.
    const { data: conferencia, error: confErr } = await supabase
      .from('perfis')
      .select('id,vencimento')
      .eq('id', pagamento.user_id)
      .maybeSingle()
    if (confErr) throw new AtivacaoIncompletaError('perfil_incerto', false, perfilUpErr || confErr)
    if (diaVencimento(conferencia?.vencimento) !== novoVencimento) {
      await falhar('perfil', perfilUpErr || 'perfil alterado durante a ativação')
    }
  }

  if (bloqueioPreservado) {
    console.warn('CONNECT_PAGAMENTO_BLOQUEIO_PRESERVADO', { user: String(pagamento.user_id).slice(0, 8) })
  }
  return { ...resultadoBase, novoVencimento, jaProcessado: false, vinculo, bloqueioPreservado }
}

/**
 * Atualiza SOMENTE o vínculo Connect inequívoco do usuário (perfil_id + acesso_connect).
 * Nunca cria vínculo, nunca usa nome/e-mail, nunca toca vínculos de outros sistemas.
 */
export async function sincronizarVinculoAdminPagamento(params: {
  userId: string
  novoVencimento: string
  diaPagamento: string
  perfilBloqueado: boolean
}): Promise<ResultadoSyncVinculo> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('admin_cliente_sistemas')
    .select('id,perfil_id,acesso_connect,status,sistema:admin_sistemas(origem)')
    .eq('perfil_id', params.userId)
    .eq('acesso_connect', true)
  if (error) {
    if (ERROS_TABELA_AUSENTE.has(String((error as { code?: string }).code || ''))) return 'indisponivel'
    throw error
  }

  const candidatos = (Array.isArray(data) ? data : []).filter((v: Record<string, any>) => {
    const sistema = Array.isArray(v.sistema) ? v.sistema[0] : v.sistema
    return (
      String(v.perfil_id) === String(params.userId) &&
      v.acesso_connect === true &&
      String(sistema?.origem || '').toLowerCase() === 'connect'
    )
  })
  if (candidatos.length === 0) return 'sem_vinculo'
  if (candidatos.length > 1) {
    console.warn('CONNECT_PAGAMENTO_VINCULO_AMBIGUO', {
      user: String(params.userId).slice(0, 8),
      vinculos: candidatos.length,
    })
    return 'ambiguo'
  }

  const alvo = candidatos[0] as { id: string; status?: string | null }
  const statusNovo = statusVinculoAposPagamento({ statusAtual: alvo.status, perfilBloqueado: params.perfilBloqueado })
  const { data: gravado, error: upErr } = await supabase
    .from('admin_cliente_sistemas')
    .update({
      data_vencimento: params.novoVencimento,
      ...(statusNovo ? { status: statusNovo } : {}),
      status_pagamento: 'em_dia',
      ultimo_pagamento: params.diaPagamento,
    })
    .eq('id', alvo.id)
    .eq('perfil_id', params.userId)
    .eq('acesso_connect', true)
    .select('id,data_vencimento')
  if (upErr) throw upErr
  if (
    !Array.isArray(gravado) ||
    gravado.length !== 1 ||
    diaVencimento(gravado[0]?.data_vencimento) !== params.novoVencimento
  ) {
    throw new Error('Vínculo administrativo não confirmou a atualização.')
  }
  return 'atualizado'
}
