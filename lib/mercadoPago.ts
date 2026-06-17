import { fetchWithTimeout, FetchTimeoutError } from '@/lib/fetch-with-timeout'

export const MERCADO_PAGO_TIMEOUT_MS = 8000

export function siteUrlConnect() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
}

export async function chamarMercadoPago(path: string, init?: RequestInit) {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!token) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado.')
  }

  let response: Response
  try {
    response = await fetchWithTimeout(
      `https://api.mercadopago.com${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
        cache: 'no-store',
      },
      MERCADO_PAGO_TIMEOUT_MS,
    )
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw new Error('Mercado Pago demorou para responder. Tente novamente em instantes.')
    }
    throw error
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error('MERCADO_PAGO_API_ERROR', { path, status: response.status, data })
    throw new Error(data?.message || 'Erro na API Mercado Pago.')
  }

  return data
}

export function usarAssinaturaRecorrenteMp() {
  return process.env.MERCADO_PAGO_ASSINATURA_RECORRENTE !== 'false'
}
