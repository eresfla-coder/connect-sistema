import { chamarMercadoPago, siteUrlConnect } from '@/lib/mercadoPago'
import type { PlanoTier } from '@/lib/planosSaaS'

export type DadosPixMercadoPago = {
  paymentId: string
  status: string
  qrCode: string
  qrCodeBase64: string
  ticketUrl: string
  valor: number
  expiraEm?: string | null
}

export function extrairDadosPixPagamento(pagamentoMp: Record<string, unknown>): DadosPixMercadoPago {
  const poi = (pagamentoMp?.point_of_interaction || {}) as Record<string, unknown>
  const tx = (poi?.transaction_data || {}) as Record<string, unknown>

  return {
    paymentId: String(pagamentoMp?.id || ''),
    status: String(pagamentoMp?.status || 'pending'),
    qrCode: String(tx?.qr_code || ''),
    qrCodeBase64: String(tx?.qr_code_base64 || ''),
    ticketUrl: String(tx?.ticket_url || ''),
    valor: Number(pagamentoMp?.transaction_amount || 0),
    expiraEm: tx?.expiration_date ? String(tx.expiration_date) : null,
  }
}

export async function criarPagamentoPixMercadoPago(params: {
  pagamentoId: string
  userId: string
  userEmail?: string
  userName?: string
  tier: PlanoTier
  valor: number
}) {
  const baseUrl = siteUrlConnect()
  const nome = String(params.userName || 'Cliente Connect').trim()
  const partesNome = nome.split(/\s+/).filter(Boolean)
  const firstName = partesNome[0] || 'Cliente'
  const lastName = partesNome.slice(1).join(' ') || 'Connect'

  const body: Record<string, unknown> = {
    transaction_amount: params.valor,
    description: `Connect Sistema - Plano ${params.tier}`,
    payment_method_id: 'pix',
    external_reference: params.pagamentoId,
    notification_url: `${baseUrl}/api/webhooks/mercado-pago`,
    payer: {
      email: params.userEmail || `cliente+${params.userId.slice(0, 8)}@connect.local`,
      first_name: firstName,
      last_name: lastName,
    },
    metadata: {
      user_id: params.userId,
      tier: params.tier,
      plano: params.tier,
      periodicidade: 'mensal',
      recorrencia: 'mensal',
      tipo: 'pix',
    },
  }

  const pagamentoMp = (await chamarMercadoPago('/v1/payments', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'X-Idempotency-Key': params.pagamentoId,
    },
  })) as Record<string, unknown>

  return {
    pagamentoMp,
    pix: extrairDadosPixPagamento(pagamentoMp),
  }
}

export async function consultarPagamentoPixMercadoPago(paymentId: string) {
  const pagamentoMp = (await chamarMercadoPago(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  )) as Record<string, unknown>
  return {
    pagamentoMp,
    pix: extrairDadosPixPagamento(pagamentoMp),
  }
}
