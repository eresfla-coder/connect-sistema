import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  montarMensagemRenovacaoWhatsapp,
  montarReciboRenovacaoManual,
  nomePlanoRenovacao,
  type PlanoRenovacaoManual,
} from '@/lib/renovacaoManual'
import { PLANOS_CATALOGO } from '@/lib/planosSaaS'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BodyPayload = {
  user_id?: string
  plano_tier?: PlanoRenovacaoManual
  valor_pago?: number | string
  forma_pagamento?: string
  data_pagamento?: string
  proxima_validade?: string
  observacao?: string
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authHeader) return ''
  const [type, token] = authHeader.split(' ')
  if (String(type || '').toLowerCase() !== 'bearer' || !token) return ''
  return token.trim()
}

function parseValor(value?: number | string) {
  const n = Number(String(value ?? '0').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function isoData(valor?: string) {
  const s = String(valor || '').trim()
  if (!s) return new Date().toISOString()
  if (s.includes('T')) return new Date(s).toISOString()
  return new Date(`${s}T12:00:00`).toISOString()
}

function isoDataSomente(valor?: string) {
  return isoData(valor).slice(0, 10)
}

function whatsappUrlCliente(telefone: string | null | undefined, mensagem: string) {
  const tel = String(telefone || '').replace(/\D/g, '')
  if (!tel) return ''
  const phone = tel.startsWith('55') ? tel : `55${tel}`
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(mensagem)}`
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const body = (await req.json()) as BodyPayload

    const userId = String(body.user_id || '').trim()
    if (!userId) {
      return NextResponse.json({ error: 'Cliente não informado.' }, { status: 400 })
    }

    const tier = (['starter', 'pro', 'empresa'] as const).includes(body.plano_tier as PlanoRenovacaoManual)
      ? (body.plano_tier as PlanoRenovacaoManual)
      : 'starter'

    const valorPago = parseValor(body.valor_pago) || PLANOS_CATALOGO[tier].precos.mensal
    const formaPagamento = String(body.forma_pagamento || 'PIX').trim() || 'PIX'
    const dataPagamentoIso = isoData(body.data_pagamento)
    const proximaValidade = isoDataSomente(body.proxima_validade || body.data_pagamento)
    const observacaoNova = String(body.observacao || '').trim()

    const { data: perfilAtual, error: perfilErro } = await supabaseAdmin
      .from('perfis')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (perfilErro || !perfilAtual) {
      return NextResponse.json({ error: perfilErro?.message || 'Cliente não encontrado.' }, { status: 404 })
    }

    const obsAnterior = String((perfilAtual as { observacoes?: string }).observacoes || '').trim()
    const obsFinal = observacaoNova
      ? [obsAnterior, `[Renovação manual ${new Date().toLocaleDateString('pt-BR')}] ${observacaoNova}`]
          .filter(Boolean)
          .join('\n')
      : obsAnterior

    const perfilUpdate = {
      status: 'ativo',
      ativo: true,
      vencimento: proximaValidade,
      ultimo_pagamento: dataPagamentoIso,
      status_pagamento: 'pago',
      valor_plano: valorPago,
      plano_tier: tier,
      observacoes: obsFinal || null,
    }

    const { data: perfilAtualizado, error: updatePerfilErro } = await supabaseAdmin
      .from('perfis')
      .update(perfilUpdate)
      .eq('id', userId)
      .select('*')
      .maybeSingle()

    if (updatePerfilErro) {
      return NextResponse.json({ error: updatePerfilErro.message }, { status: 400 })
    }

    const assinaturaPayload: Record<string, unknown> = {
      user_id: userId,
      plano: `${tier}_mensal`,
      plano_tier: tier,
      status: 'ativa',
      data_fim: `${proximaValidade}T23:59:59.999Z`,
      data_trial_fim: null,
      proxima_cobranca: proximaValidade,
      trial_dias: 0,
      renovacao_automatica: false,
      valor_mensal: valorPago,
      valor_anual: PLANOS_CATALOGO[tier].precos.anual,
      gateway: 'manual',
      updated_at: new Date().toISOString(),
    }

    const { error: assinaturaErro } = await supabaseAdmin
      .from('assinaturas')
      .upsert(assinaturaPayload, { onConflict: 'user_id' })

    if (assinaturaErro) {
      console.warn('[RENOVAR_MANUAL] assinaturas:', assinaturaErro.message)
    }

    try {
      await supabaseAdmin.from('pagamentos').insert({
        user_id: userId,
        valor: valorPago,
        status: 'pago',
        forma_pagamento: formaPagamento,
        data_pagamento: dataPagamentoIso,
        gateway: 'manual',
        descricao: `Renovação manual — ${nomePlanoRenovacao(tier)}`,
      })
    } catch {
      /* tabela opcional */
    }

    const nomeCliente =
      String((perfilAtualizado as { nome_empresa?: string })?.nome_empresa || '').trim() ||
      String((perfilAtualizado as { email?: string })?.email || 'Cliente')

    const planoNome = nomePlanoRenovacao(tier)
    const numeroRecibo = `REN-${Date.now().toString().slice(-8)}`

    const recibo = montarReciboRenovacaoManual({
      numero: numeroRecibo,
      clienteNome: nomeCliente,
      clienteEmail: String((perfilAtualizado as { email?: string })?.email || ''),
      plano: planoNome,
      planoTier: tier,
      valor: valorPago,
      formaPagamento,
      dataPagamento: dataPagamentoIso,
      validadeAte: proximaValidade,
      observacao: observacaoNova,
    })

    const mensagemWhatsapp = montarMensagemRenovacaoWhatsapp({
      nomeCliente,
      plano: planoNome,
      valor: valorPago,
      validadeAte: proximaValidade,
    })

    return NextResponse.json({
      ok: true,
      cliente: perfilAtualizado,
      recibo,
      mensagemWhatsapp,
      whatsappUrl: whatsappUrlCliente((perfilAtualizado as { telefone?: string })?.telefone, mensagemWhatsapp),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao renovar cliente.'
    const status = msg === 'Acesso negado.' || msg === 'Sessão ausente.' || msg === 'Sessão inválida.' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
