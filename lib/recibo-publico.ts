export const DEFAULT_LOGO_PATH = '/logo-connect.png'
export const RECIBO_DOCUMENT_TYPE = 'recibo'

export type ConfigReciboPublico = {
  nomeEmpresa?: string
  cidadeUf?: string
  telefone?: string
  responsavel?: string
  corPrimaria?: string
  corSecundaria?: string
  logoUrl?: string
  logo?: string
  endereco?: string
}

export type DadosReciboPublico = {
  id?: string | number
  numero?: string | number
  numeroRecibo?: string | number
  nomeCliente?: string
  clienteTelefone?: string
  referente?: string
  valorNumero?: string | number
  dataRecibo?: string
  formaPagamento?: string
  observacao?: string
  emitidoDigitalmenteEm?: string
  config?: ConfigReciboPublico
}

export function somenteDigitos(valor?: string) {
  return String(valor || '').replace(/\D/g, '')
}

export function normalizarTelefoneWhatsApp(valor?: string) {
  const telefone = somenteDigitos(valor)
  if (!telefone) return ''

  const semPrefixoInternacional = telefone.replace(/^00/, '')
  const telefoneNacional = semPrefixoInternacional.startsWith('55')
    ? semPrefixoInternacional.slice(2)
    : semPrefixoInternacional

  return `55${telefoneNacional.replace(/^0+/, '')}`
}

export function normalizarLogoRecibo(config?: ConfigReciboPublico) {
  return config?.logoUrl || config?.logo || DEFAULT_LOGO_PATH
}

export function prepararSnapshotRecibo(dados: DadosReciboPublico): DadosReciboPublico {
  const config = dados.config || {}

  return {
    ...dados,
    emitidoDigitalmenteEm: dados.emitidoDigitalmenteEm || new Date().toISOString(),
    config: {
      ...config,
      logoUrl: normalizarLogoRecibo(config),
    },
  }
}

export function encodeReciboFallback(dados: DadosReciboPublico) {
  const json = JSON.stringify(prepararSnapshotRecibo(dados))
  const bytes = new TextEncoder().encode(json)
  let binario = ''

  bytes.forEach((byte) => {
    binario += String.fromCharCode(byte)
  })

  return btoa(binario)
}

export function decodeReciboFallback(valor: string): DadosReciboPublico | null {
  try {
    const normalizado = valor.replace(/-/g, '+').replace(/_/g, '/')
    const base64 = normalizado.padEnd(Math.ceil(normalizado.length / 4) * 4, '=')
    const binario = atob(base64)
    const bytes = Uint8Array.from(binario, (char) => char.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    const dados = JSON.parse(json)

    return dados && typeof dados === 'object' ? prepararSnapshotRecibo(dados) : null
  } catch {
    return null
  }
}

function montarUrlPublica(origin: string, id: string, token?: string) {
  const base = `${origin}/visualizar/recibo/${encodeURIComponent(id)}`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export async function gerarLinkPublicoRecibo(dados: DadosReciboPublico, origin: string) {
  const snapshot = prepararSnapshotRecibo(dados)

  try {
    const resposta = await fetch('/api/public-docs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_type: RECIBO_DOCUMENT_TYPE,
        snapshot,
      }),
    })

    if (!resposta.ok) {
      throw new Error('Falha ao criar documento público.')
    }

    const documento = await resposta.json()
    const id = String(documento?.id || '')
    const token = String(documento?.token || '')

    if (!id || !token) {
      throw new Error('Documento público sem id ou token.')
    }

    return montarUrlPublica(origin, id, token)
  } catch {
    const idFallback = String(snapshot.id || snapshot.numero || snapshot.numeroRecibo || 'recibo')
    return `${montarUrlPublica(origin, idFallback)}?d=${encodeURIComponent(encodeReciboFallback(snapshot))}`
  }
}
