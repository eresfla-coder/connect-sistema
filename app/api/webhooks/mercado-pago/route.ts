import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { chamarMercadoPago } from '@/lib/mercadoPago'
import { montarPayloadAtivacao } from '@/lib/assinaturaServer'
import { parsePlanoPagamento } from '@/lib/assinaturaAcesso'
import { diasPlano, resolverCheckout, type PlanoTier, type RecorrenciaPlano } from '@/lib/planosSaaS'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function adicionarDias(base: Date, dias: number) {
  const data = new Date(base)
  data.setDate(data.getDate() + dias)
  return data
}

async function registrarEvento(eventId: string, payload: unknown, status: string, error?: string) {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('webhook_events').upsert(
      {
        event_id: eventId,
        gateway: 'mercado_pago',
        event_type: 'payment',
        payload,
        status,
        error: error || null,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )
  } catch {}
}

async function eventoJaProcessado(eventId: string) {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase.from('webhook_events').select('status').eq('event_id', eventId).maybeSingle()
    return data?.status === 'processed' || data?.status === 'already_processed'
  } catch {
    return false
  }
}

function extrairPaymentId(request: NextRequest, body: any) {
  return String(
    request.nextUrl.searchParams.get('data.id') ||
      request.nextUrl.searchParams.get('id') ||
      body?.data?.id ||
      body?.id ||
      '',
  ).trim()
}

function validarAssinaturaMercadoPago(request: NextRequest, resourceId: string) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) return true

  const signature = request.headers.get('x-signature') || ''
  const requestId = request.headers.get('x-request-id') || ''
  const partes = Object.fromEntries(
    signature
      .split(',')
      .map((parte) => parte.split('=').map((item) => item.trim()))
      .filter((parte) => parte.length === 2),
  )
  const ts = partes.ts
  const v1 = partes.v1

  if (!requestId || !ts || !v1) return false

  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`
  const esperado = createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(esperado), Buffer.from(v1))
  } catch {
    return false
  }
}

async function ativarPagamentoAprovado(pagamento: { id: string; user_id: string; valor: number; plano?: string | null }, pagamentoMp: any) {
  const supabase = getSupabaseAdmin()
  const parsed = parsePlanoPagamento(pagamento.plano, pagamento.valor)
  let tier: PlanoTier = parsed.tier === 'trial' ? 'starter' : parsed.tier
  let recorrencia: RecorrenciaPlano = parsed.recorrencia

  const metadata = pagamentoMp?.metadata || {}
  if (metadata?.tier) {
    const resolvido = resolverCheckout({ tier: metadata.tier, recorrencia: metadata.recorrencia })
    tier = resolvido.tier
    recorrencia = resolvido.recorrencia
  }

  const agora = new Date()
  const { data: perfil } = await supabase.from('perfis').select('id,vencimento').eq('id', pagamento.user_id).maybeSingle()

  const vencimentoAtual = perfil?.vencimento ? new Date(perfil.vencimento) : null
  const baseVencimento =
    vencimentoAtual && !Number.isNaN(vencimentoAtual.getTime()) && vencimentoAtual > agora ? vencimentoAtual : agora

  const dias = diasPlano(tier, recorrencia)
  const novoVencimento = adicionarDias(baseVencimento, dias).toISOString()
  const payloadAtivacao = montarPayloadAtivacao({
    userId: pagamento.user_id,
    tier,
    recorrencia,
    vencimentoIso: novoVencimento,
    gatewayAssinaturaId: String(pagamentoMp?.id || ''),
    gatewayClienteId: String(pagamentoMp?.payer?.id || ''),
    valorPago: Number(pagamentoMp?.transaction_amount || pagamento.valor || 0),
  })

  await supabase
    .from('pagamentos')
    .update({
      status: 'pago',
      metodo: String(pagamentoMp?.payment_method_id || pagamentoMp?.payment_type_id || 'mercado_pago'),
      gateway_pagamento_id: String(pagamentoMp?.id || ''),
      paid_amount: Number(pagamentoMp?.transaction_amount || pagamento.valor || 0),
      plano: `${tier}_${recorrencia}`,
      recorrencia,
      data_pagamento: pagamentoMp?.date_approved || agora.toISOString(),
    })
    .eq('id', pagamento.id)

  await supabase.from('assinaturas').upsert(payloadAtivacao.assinatura, { onConflict: 'user_id' })
  await supabase.from('perfis').update(payloadAtivacao.perfil).eq('id', pagamento.user_id)

  return { tier, recorrencia, novoVencimento }
}

export async function POST(request: NextRequest) {
  let eventId = ''

  try {
    const body = await request.json().catch(() => ({}))
    const topic = String(request.nextUrl.searchParams.get('type') || body?.type || 'payment').toLowerCase()
    const resourceId = extrairPaymentId(request, body) || String(body?.data?.id || body?.id || '').trim()

    if (!resourceId) {
      return NextResponse.json({ ok: true, ignored: true, message: 'Evento sem id.' })
    }

    if (!validarAssinaturaMercadoPago(request, resourceId)) {
      console.error('CONNECT_WEBHOOK_ASSINATURA_INVALIDA', { resourceId, topic })
      return NextResponse.json({ ok: false, message: 'Assinatura inválida.' }, { status: 401 })
    }

    eventId = `mercado_pago:${topic}:${resourceId}`
    if (await eventoJaProcessado(eventId)) {
      return NextResponse.json({ ok: true, alreadyProcessed: true })
    }

    if (topic.includes('preapproval') || topic.includes('subscription')) {
      const preapproval = await chamarMercadoPago(`/preapproval/${encodeURIComponent(resourceId)}`)
      const externalReference = String(preapproval?.external_reference || '').trim()
      const status = String(preapproval?.status || '').toLowerCase()

      if (!externalReference) {
        await registrarEvento(eventId, { body, preapproval }, 'ignored', 'Preapproval sem external_reference.')
        return NextResponse.json({ ok: true, ignored: true })
      }

      const supabase = getSupabaseAdmin()
      const { data: pagamento } = await supabase
        .from('pagamentos')
        .select('id,user_id,valor,status,plano')
        .eq('id', externalReference)
        .maybeSingle()

      if (!pagamento?.id) {
        await registrarEvento(eventId, { body, preapproval }, 'error', 'Pagamento local não encontrado.')
        return NextResponse.json({ ok: false, message: 'Pagamento não encontrado.' }, { status: 404 })
      }

      if (status === 'authorized' || status === 'active') {
        const parsed = parsePlanoPagamento(pagamento.plano, pagamento.valor)
        const tier = parsed.tier === 'trial' ? 'starter' : parsed.tier
        const recorrencia = parsed.recorrencia
        const novoVencimento = adicionarDias(new Date(), diasPlano(tier, recorrencia)).toISOString()
        const payloadAtivacao = montarPayloadAtivacao({
          userId: pagamento.user_id,
          tier,
          recorrencia,
          vencimentoIso: novoVencimento,
          gatewayAssinaturaId: resourceId,
          gatewayClienteId: String(preapproval?.payer_id || ''),
        })

        await supabase.from('assinaturas').upsert(payloadAtivacao.assinatura, { onConflict: 'user_id' })
        await supabase.from('perfis').update(payloadAtivacao.perfil).eq('id', pagamento.user_id)
        await supabase.from('pagamentos').update({ status: 'pago' }).eq('id', pagamento.id)

        await registrarEvento(eventId, { body, preapproval }, 'processed')
        return NextResponse.json({ ok: true, status: 'assinatura_ativa', vencimento: novoVencimento })
      }

      await registrarEvento(eventId, { body, preapproval }, status || 'ignored')
      return NextResponse.json({ ok: true, status })
    }

    const pagamentoMp = await chamarMercadoPago(`/v1/payments/${encodeURIComponent(resourceId)}`)
    const externalReference = String(pagamentoMp?.external_reference || '').trim()

    if (!externalReference) {
      await registrarEvento(eventId, { body, pagamentoMp }, 'ignored', 'Pagamento sem external_reference.')
      return NextResponse.json({ ok: true, ignored: true })
    }

    const supabase = getSupabaseAdmin()
    const { data: pagamento, error: pagamentoError } = await supabase
      .from('pagamentos')
      .select('id,user_id,valor,status,plano')
      .eq('id', externalReference)
      .maybeSingle()

    if (pagamentoError || !pagamento?.id) {
      await registrarEvento(eventId, { body, pagamentoMp }, 'error', 'Pagamento local não encontrado.')
      return NextResponse.json({ ok: false, message: 'Pagamento local não encontrado.' }, { status: 404 })
    }

    const statusMp = String(pagamentoMp?.status || '').toLowerCase()
    const aprovado = statusMp === 'approved'
    const valorPago = Number(pagamentoMp?.transaction_amount || pagamentoMp?.transaction_details?.total_paid_amount || 0)
    const valorEsperado = Number(pagamento.valor || 0)

    if (valorEsperado > 0 && Math.abs(valorPago - valorEsperado) > 0.01) {
      await registrarEvento(eventId, { body, pagamentoMp }, 'error', 'Valor divergente.')
      return NextResponse.json({ ok: false, message: 'Valor divergente.' }, { status: 409 })
    }

    if (!aprovado) {
      const statusLocal = statusMp === 'rejected' || statusMp === 'cancelled' ? 'falhou' : 'pendente'
      await supabase
        .from('pagamentos')
        .update({
          status: statusLocal,
          gateway_pagamento_id: String(pagamentoMp?.id || resourceId),
          failure_reason: String(pagamentoMp?.status_detail || statusMp || ''),
        })
        .eq('id', pagamento.id)

      await registrarEvento(eventId, { body, pagamentoMp }, statusLocal)
      return NextResponse.json({ ok: true, status: statusLocal })
    }

    if (pagamento.status === 'pago') {
      await registrarEvento(eventId, { body, pagamentoMp }, 'already_processed')
      return NextResponse.json({ ok: true, alreadyProcessed: true })
    }

    const resultado = await ativarPagamentoAprovado(pagamento, pagamentoMp)
    await registrarEvento(eventId, { body, pagamentoMp }, 'processed')

    return NextResponse.json({ ok: true, status: 'pago', ...resultado })
  } catch (error: any) {
    console.error('CONNECT_WEBHOOK_MERCADO_PAGO_ERROR', { eventId, message: error?.message, error })
    if (eventId) await registrarEvento(eventId, null, 'error', error?.message || 'Erro no webhook.')
    return NextResponse.json({ ok: false, message: error?.message || 'Erro no webhook.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'mercado-pago-webhook' })
}
