import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { chamarMercadoPago } from '@/lib/mercadoPago'

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

    const supabase = getSupabaseAdmin()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    const user = authData?.user

    if (authError || !user?.id) {
      return NextResponse.json({ ok: false, message: 'Sessão inválida.' }, { status: 401 })
    }

    const { data: assinatura } = await supabase
      .from('assinaturas')
      .select('gateway_assinatura_id,renovacao_automatica,status,data_fim')
      .eq('user_id', user.id)
      .maybeSingle()

    const preapprovalId = String(assinatura?.gateway_assinatura_id || '').trim()
    if (preapprovalId.startsWith('preapproval') || preapprovalId.length > 8) {
      try {
        await chamarMercadoPago(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        })
      } catch (error) {
        console.error('MP_CANCEL_PREAPPROVAL', { preapprovalId, error })
      }
    }

    const agora = new Date().toISOString()

    await supabase
      .from('assinaturas')
      .update({
        status: 'cancelada',
        renovacao_automatica: false,
        cancelado_em: agora,
      })
      .eq('user_id', user.id)

    await supabase
      .from('perfis')
      .update({
        status_pagamento: 'cancelado',
      })
      .eq('id', user.id)

    return NextResponse.json({
      ok: true,
      message: 'Renovação automática cancelada. O acesso permanece até o fim do período pago.',
      acessoAte: assinatura?.data_fim || null,
    })
  } catch (error: any) {
    console.error('ASSINATURA_CANCELAR_ERROR', error)
    return NextResponse.json({ ok: false, message: error?.message || 'Erro ao cancelar assinatura.' }, { status: 500 })
  }
}
