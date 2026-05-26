import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { chamarMercadoPago, siteUrlConnect, usarAssinaturaRecorrenteMp } from '@/lib/mercadoPago'
import {
  chaveCheckout,
  diasPlano,
  resolverCheckout,
  valorPlano,
  type PlanoTier,
  type RecorrenciaPlano,
} from '@/lib/planosSaaS'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

async function criarCheckoutRecorrente(params: {
  pagamentoId: string
  userEmail?: string
  tier: PlanoTier
  recorrencia: RecorrenciaPlano
  valor: number
}) {
  const baseUrl = siteUrlConnect()
  const titulo = `Connect ${params.tier} — ${params.recorrencia === 'anual' ? 'Anual' : 'Mensal'}`

  const preapproval = await chamarMercadoPago('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: titulo,
      external_reference: params.pagamentoId,
      payer_email: params.userEmail,
      auto_recurring: {
        frequency: params.recorrencia === 'anual' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: params.valor,
        currency_id: 'BRL',
      },
      back_url: `${baseUrl}/assinatura?checkout=ok`,
      status: 'pending',
    }),
  })

  const checkoutUrl = preapproval?.init_point || preapproval?.sandbox_init_point || ''
  if (!checkoutUrl) throw new Error('Mercado Pago não retornou URL de assinatura recorrente.')

  return { checkoutUrl, gatewayId: String(preapproval?.id || '') }
}

async function criarCheckoutPro(params: {
  pagamentoId: string
  userEmail?: string
  tier: PlanoTier
  recorrencia: RecorrenciaPlano
  valor: number
}) {
  const baseUrl = siteUrlConnect()
  const titulo = `Assinatura Connect ${params.tier} (${params.recorrencia})`

  const preference = await chamarMercadoPago('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [
        {
          id: chaveCheckout(params.tier, params.recorrencia),
          title: titulo,
          description: `Connect Sistema — Plano ${params.tier}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: params.valor,
        },
      ],
      payer: { email: params.userEmail || undefined },
      external_reference: params.pagamentoId,
      notification_url: `${baseUrl}/api/webhooks/mercado-pago`,
      back_urls: {
        success: `${baseUrl}/assinatura?pagamento=aprovado`,
        pending: `${baseUrl}/planos?pagamento=pendente`,
        failure: `${baseUrl}/planos?pagamento=falhou`,
      },
      auto_return: 'approved',
      statement_descriptor: 'CONNECT',
      metadata: {
        tier: params.tier,
        recorrencia: params.recorrencia,
        dias: diasPlano(params.tier, params.recorrencia),
      },
    }),
  })

  const checkoutUrl = preference?.init_point || preference?.sandbox_init_point || ''
  if (!checkoutUrl) throw new Error('Mercado Pago não retornou URL de checkout.')

  return { checkoutUrl, gatewayId: String(preference?.id || '') }
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request)
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Sessão ausente.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { tier, recorrencia } = resolverCheckout(body)

    if (tier === 'trial') {
      return NextResponse.json({ ok: false, message: 'Plano inválido.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    const user = authData?.user

    if (authError || !user?.id) {
      return NextResponse.json({ ok: false, message: 'Sessão inválida.' }, { status: 401 })
    }

    const valor = valorPlano(tier, recorrencia)
    const planoChave = chaveCheckout(tier, recorrencia)
    const criadoDepoisDe = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: pagamentoPendente } = await supabase
      .from('pagamentos')
      .select('id,gateway_url,checkout_url,created_at')
      .eq('user_id', user.id)
      .eq('status', 'pendente')
      .eq('valor', valor)
      .eq('plano', planoChave)
      .gte('created_at', criadoDepoisDe)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const checkoutPendente = pagamentoPendente?.checkout_url || pagamentoPendente?.gateway_url
    if (checkoutPendente) {
      return NextResponse.json({
        ok: true,
        checkoutUrl: checkoutPendente,
        pagamentoId: pagamentoPendente.id,
        reused: true,
        tier,
        recorrencia,
      })
    }

    const descricao = `Assinatura ${tier} ${recorrencia} — Connect Sistema`
    const pagamentoId = crypto.randomUUID()

    const { data: pagamento, error: pagamentoError } = await supabase
      .from('pagamentos')
      .insert({
        id: pagamentoId,
        user_id: user.id,
        valor,
        status: 'pendente',
        metodo: 'mercado_pago',
        gateway: 'mercado_pago',
        external_reference: pagamentoId,
        plano: planoChave,
        recorrencia,
        currency: 'BRL',
        descricao,
        data_vencimento: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (pagamentoError || !pagamento?.id) {
      console.error('CONNECT_CHECKOUT_INSERT_ERROR', { user_id: user.id, tier, recorrencia, error: pagamentoError })
      return NextResponse.json({ ok: false, message: 'Não foi possível registrar o pagamento.' }, { status: 500 })
    }

    const usarRecorrente = usarAssinaturaRecorrenteMp() && recorrencia === 'mensal'
    const checkout = usarRecorrente
      ? await criarCheckoutRecorrente({
          pagamentoId: pagamento.id,
          userEmail: user.email || undefined,
          tier,
          recorrencia,
          valor,
        })
      : await criarCheckoutPro({
          pagamentoId: pagamento.id,
          userEmail: user.email || undefined,
          tier,
          recorrencia,
          valor,
        })

    await supabase
      .from('pagamentos')
      .update({
        gateway_pagamento_id: checkout.gatewayId,
        gateway_url: checkout.checkoutUrl,
        checkout_url: checkout.checkoutUrl,
      })
      .eq('id', pagamento.id)

    return NextResponse.json({
      ok: true,
      checkoutUrl: checkout.checkoutUrl,
      pagamentoId: pagamento.id,
      tier,
      recorrencia,
      recorrente: usarRecorrente,
    })
  } catch (error: any) {
    console.error('CONNECT_CHECKOUT_ERROR', { message: error?.message, error })
    return NextResponse.json(
      { ok: false, message: error?.message || 'Erro ao criar checkout Mercado Pago.' },
      { status: 500 },
    )
  }
}
