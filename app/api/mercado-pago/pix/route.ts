import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { ativarPagamentoAprovado } from '@/lib/pagamentoAtivacao'
import { consultarPagamentoPixMercadoPago, criarPagamentoPixMercadoPago } from '@/lib/mercadoPagoPix'
import { chaveCheckout, resolverCheckout, valorPlano } from '@/lib/planosSaaS'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
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

    if (recorrencia !== 'mensal') {
      return NextResponse.json(
        { ok: false, message: 'PIX disponível apenas para plano mensal. Use cartão para o plano anual.' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdmin()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    const user = authData?.user

    if (authError || !user?.id) {
      return NextResponse.json({ ok: false, message: 'Sessão inválida.' }, { status: 401 })
    }

    const valor = valorPlano(tier, 'mensal')
    const planoChave = chaveCheckout(tier, 'mensal')
    const criadoDepoisDe = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: pendente } = await supabase
      .from('pagamentos')
      .select('id,gateway_pagamento_id,status,created_at')
      .eq('user_id', user.id)
      .eq('status', 'pendente')
      .eq('metodo', 'pix')
      .eq('plano', planoChave)
      .gte('created_at', criadoDepoisDe)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pendente?.gateway_pagamento_id) {
      const consulta = await consultarPagamentoPixMercadoPago(pendente.gateway_pagamento_id)
      const statusMp = String(consulta.pagamentoMp?.status || '').toLowerCase()

      if (statusMp === 'approved' && pendente.status !== 'pago') {
        await ativarPagamentoAprovado(
          { id: pendente.id, user_id: user.id, valor, plano: planoChave },
          consulta.pagamentoMp,
        )
        return NextResponse.json({
          ok: true,
          status: 'approved',
          pagamentoId: pendente.id,
          paymentId: consulta.pix.paymentId,
          aprovado: true,
        })
      }

      if (statusMp === 'pending' || statusMp === 'in_process') {
        return NextResponse.json({
          ok: true,
          reused: true,
          pagamentoId: pendente.id,
          paymentId: consulta.pix.paymentId,
          status: consulta.pix.status,
          qrCode: consulta.pix.qrCode,
          qrCodeBase64: consulta.pix.qrCodeBase64,
          ticketUrl: consulta.pix.ticketUrl,
          valor: consulta.pix.valor,
          expiraEm: consulta.pix.expiraEm,
          tier,
          recorrencia: 'mensal',
        })
      }
    }

    const pagamentoId = crypto.randomUUID()
    const descricao = `Connect Sistema - Plano ${tier} (PIX mensal)`

    const { data: pagamento, error: pagamentoError } = await supabase
      .from('pagamentos')
      .insert({
        id: pagamentoId,
        user_id: user.id,
        valor,
        status: 'pendente',
        metodo: 'pix',
        gateway: 'mercado_pago',
        external_reference: pagamentoId,
        plano: planoChave,
        recorrencia: 'mensal',
        currency: 'BRL',
        descricao,
        data_vencimento: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (pagamentoError || !pagamento?.id) {
      console.error('CONNECT_PIX_INSERT_ERROR', { user_id: user.id, tier, error: pagamentoError })
      return NextResponse.json({ ok: false, message: 'Não foi possível registrar o pagamento PIX.' }, { status: 500 })
    }

    const nome =
      String(user.user_metadata?.nome || user.user_metadata?.full_name || user.user_metadata?.name || '').trim() ||
      String(user.email || '').split('@')[0]

    const { pagamentoMp, pix } = await criarPagamentoPixMercadoPago({
      pagamentoId: pagamento.id,
      userId: user.id,
      userEmail: user.email || undefined,
      userName: nome,
      tier,
      valor,
    })

    if (!pix.qrCode && !pix.qrCodeBase64) {
      console.error('CONNECT_PIX_SEM_QR', { paymentId: pix.paymentId, pagamentoMp })
      return NextResponse.json(
        { ok: false, message: 'Mercado Pago não retornou o QR Code PIX. Tente novamente em instantes.' },
        { status: 502 },
      )
    }

    await supabase
      .from('pagamentos')
      .update({
        gateway_pagamento_id: pix.paymentId,
        gateway_url: pix.ticketUrl || null,
      })
      .eq('id', pagamento.id)

    return NextResponse.json({
      ok: true,
      pagamentoId: pagamento.id,
      paymentId: pix.paymentId,
      status: pix.status,
      qrCode: pix.qrCode,
      qrCodeBase64: pix.qrCodeBase64,
      ticketUrl: pix.ticketUrl,
      valor: pix.valor,
      expiraEm: pix.expiraEm,
      tier,
      recorrencia: 'mensal',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao gerar PIX.'
    console.error('CONNECT_PIX_ERROR', { message, error })
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request)
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Sessão ausente.' }, { status: 401 })
    }

    const pagamentoId = String(request.nextUrl.searchParams.get('pagamentoId') || '').trim()
    if (!pagamentoId) {
      return NextResponse.json({ ok: false, message: 'pagamentoId obrigatório.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    const user = authData?.user

    if (authError || !user?.id) {
      return NextResponse.json({ ok: false, message: 'Sessão inválida.' }, { status: 401 })
    }

    const { data: pagamento, error } = await supabase
      .from('pagamentos')
      .select('id,user_id,valor,status,plano,gateway_pagamento_id,metodo')
      .eq('id', pagamentoId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error || !pagamento?.id) {
      return NextResponse.json({ ok: false, message: 'Pagamento não encontrado.' }, { status: 404 })
    }

    if (pagamento.status === 'pago') {
      return NextResponse.json({ ok: true, status: 'approved', aprovado: true, pagamentoId: pagamento.id })
    }

    const paymentId = String(pagamento.gateway_pagamento_id || '').trim()
    if (!paymentId) {
      return NextResponse.json({ ok: false, message: 'PIX ainda não gerado para este pagamento.' }, { status: 409 })
    }

    const consulta = await consultarPagamentoPixMercadoPago(paymentId)
    const statusMp = String(consulta.pagamentoMp?.status || '').toLowerCase()

    if (statusMp === 'approved') {
      await ativarPagamentoAprovado(pagamento, consulta.pagamentoMp)
      return NextResponse.json({
        ok: true,
        status: 'approved',
        aprovado: true,
        pagamentoId: pagamento.id,
        tier: consulta.pagamentoMp?.metadata
          ? String((consulta.pagamentoMp.metadata as Record<string, unknown>)?.tier || '')
          : undefined,
      })
    }

    return NextResponse.json({
      ok: true,
      status: statusMp || consulta.pix.status,
      aprovado: false,
      pagamentoId: pagamento.id,
      paymentId: consulta.pix.paymentId,
      qrCode: consulta.pix.qrCode,
      qrCodeBase64: consulta.pix.qrCodeBase64,
      valor: consulta.pix.valor,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao consultar PIX.'
    console.error('CONNECT_PIX_STATUS_ERROR', { message, error })
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
