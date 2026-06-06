import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isAdminMasterServer } from '@/lib/access-server'
import { normalizarTier } from '@/lib/planosSaaS'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request)
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Não autorizado.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    const user = authData?.user

    if (authError || !user?.email || !isAdminMasterServer(user.email)) {
      return NextResponse.json({ ok: false, message: 'Acesso restrito ao admin master.' }, { status: 403 })
    }

    const [{ data: perfis }, { data: assinaturas }, { data: pagamentos }] = await Promise.all([
      supabase.from('perfis').select('id,status,ativo,vencimento,valor_plano,plano_tier,data_criacao,ultimo_pagamento'),
      supabase.from('assinaturas').select('user_id,plano,plano_tier,status,data_fim,cancelado_em,renovacao_automatica,valor_mensal'),
      supabase
        .from('pagamentos')
        .select('status,created_at,valor,plano')
        .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString()),
    ])

    const listaPerfis = perfis || []
    const listaAssinaturas = assinaturas || []
    const listaPagamentos = pagamentos || []

    const trials = listaPerfis.filter((p) => String(p.status || '').toLowerCase() === 'trial' || String(p.status || '').toLowerCase() === 'teste')
    const ativos = listaPerfis.filter((p) => {
      const st = String(p.status || '').toLowerCase()
      return p.ativo !== false && (st === 'ativo' || st === 'active')
    })
    const cancelados = listaAssinaturas.filter((a) => String(a.status || '').toLowerCase() === 'cancelada')
    const mrr = ativos.reduce((acc, p) => acc + Number(p.valor_plano || 0), 0)

    const porPlano = { starter: 0, pro: 0, empresa: 0, trial: 0 }
    listaAssinaturas.forEach((a) => {
      const tier = normalizarTier(a.plano_tier || a.plano)
      porPlano[tier] = (porPlano[tier] || 0) + 1
    })

    const pagos90 = listaPagamentos.filter((p) => String(p.status || '').toLowerCase() === 'pago')
    const conversoes = trials.length + ativos.length > 0 ? Math.round((ativos.length / (trials.length + ativos.length)) * 100) : 0
    const churn = listaPerfis.length > 0 ? Math.round((cancelados.length / listaPerfis.length) * 100) : 0

    const renovacaoAutomatica = listaAssinaturas.filter((a) => a.renovacao_automatica === true).length

    return NextResponse.json({
      ok: true,
      metricas: {
        mrr,
        assinantesAtivos: ativos.length,
        testesGratis: trials.length,
        cancelamentos: cancelados.length,
        conversaoTrialPercent: conversoes,
        churnPercent: churn,
        renovacaoAutomatica,
        porPlano,
        pagamentos90d: pagos90.length,
        receita90d: pagos90.reduce((acc, p) => acc + Number(p.valor || 0), 0),
      },
      amostra: {
        perfis: listaPerfis.length,
        assinaturas: listaAssinaturas.length,
      },
    })
  } catch (error: any) {
    console.error('ADMIN_METRICAS_ASSINATURA_ERROR', error)
    return NextResponse.json({ ok: false, message: error?.message || 'Erro ao carregar métricas.' }, { status: 500 })
  }
}
