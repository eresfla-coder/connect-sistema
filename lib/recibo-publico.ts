import type { DadosReciboEmitido } from '@/components/recibos/ReciboEmitidoView'

export const RECIBO_VISUALIZACAO_KEY = 'connect_recibo_visualizacao'

export const SITE_URL_RECIBO = (process.env.NEXT_PUBLIC_SITE_URL || 'https://painel.appconnectpro.com.br').replace(/\/$/, '')

export function normalizarTelefoneWhatsapp(valor?: string) {
  let telefone = String(valor || '').replace(/\D/g, '')
  if (!telefone) return ''

  while (telefone.startsWith('00')) telefone = telefone.slice(2)
  if (telefone.startsWith('55')) telefone = telefone.slice(2)
  telefone = telefone.replace(/^0+/, '')
  if (telefone.length > 11) telefone = telefone.slice(-11)
  if (telefone.length < 10) return ''

  return `55${telefone}`
}

function gerarTokenRecibo() {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `${Date.now()}${Math.random().toString(36).slice(2)}`
  }
}

function prepararPayloadReciboPublico(dados: DadosReciboEmitido) {
  try {
    const payload = JSON.parse(JSON.stringify(dados)) as DadosReciboEmitido
    const logoUrl = payload.config?.logoUrl
    if (typeof logoUrl === 'string' && logoUrl.startsWith('data:') && logoUrl.length > 120_000) {
      payload.config = { ...payload.config, logoUrl: '' }
    }
    return payload
  } catch {
    return dados
  }
}

export async function gerarLinkPublicoRecibo(dados: DadosReciboEmitido): Promise<string> {
  const documentId = String(Date.now())
  const token = gerarTokenRecibo()
  const snapshotDoRecibo = prepararPayloadReciboPublico(dados)

  try {
    const response = await fetch('/api/public-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_type: 'recibo',
        document_id: documentId,
        token,
        payload: snapshotDoRecibo,
      }),
    })

    const raw = await response.text()
    let json: { success?: boolean; error?: string } | null = null
    try {
      json = raw ? JSON.parse(raw) : null
    } catch {
      json = null
    }

    if (response.ok && json?.success !== false) {
      return `${SITE_URL_RECIBO}/visualizar/recibo/${documentId}?token=${encodeURIComponent(token)}`
    }

    const msgApi = String(json?.error || '').trim()
    throw new Error(
      msgApi || 'Não foi possível gerar o link público do recibo. Verifique sua conexão e tente novamente.',
    )
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('Não foi possível gerar o link público do recibo. Verifique sua conexão e tente novamente.')
  }
}

export function montarMensagemWhatsappRecibo(dados: DadosReciboEmitido, link: string) {
  let mensagem = `Olá ${dados?.nomeCliente || 'cliente'}!\n\n`
  mensagem += `Segue seu recibo.\n`
  mensagem += `Referente a: ${dados?.referente || 'pagamento'}.\n`
  mensagem += `\n🔗 Acesse aqui:\n${link}`
  return mensagem
}
