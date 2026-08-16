/**
 * Helpers de compartilhamento de documentos (URL / WhatsApp / Web Share).
 * Sem geração de PDF real: o “PDF” do recibo hoje é HTML + window.print.
 */

export type ResultadoCompartilharUrl =
  | { modo: 'web-share'; ok: true }
  | { modo: 'web-share'; ok: false; motivo: string }
  | { modo: 'indisponivel' }

export function linkPublicoUtil(link: string | null | undefined) {
  const texto = String(link || '').trim()
  if (!texto) return ''
  try {
    const url = new URL(texto, typeof window !== 'undefined' ? window.location.origin : 'https://local')
    if (!/^https?:$/i.test(url.protocol)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

/**
 * Resolve o link a enviar: sempre prioriza o link completo preparado.
 * Se a preparação falhar e houver linkRapido válido, usa o rápido.
 */
export async function resolverLinkParaEnvio(opts: {
  linkRapido?: string
  prepararLinkCompleto: () => Promise<string>
}): Promise<string> {
  let preparado = ''
  let erroPrep: unknown = null
  try {
    preparado = linkPublicoUtil(await opts.prepararLinkCompleto())
  } catch (erro) {
    erroPrep = erro
  }

  if (preparado) return preparado

  const rapido = linkPublicoUtil(opts.linkRapido)
  if (rapido) return rapido

  if (erroPrep instanceof Error && erroPrep.message) throw erroPrep
  throw new Error('Não foi possível gerar o link público do documento.')
}

export function suporteWebShareUrl(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export function suporteWebShareArquivos(): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return false
  try {
    const arquivo = new File(['x'], 'teste.pdf', { type: 'application/pdf' })
    return navigator.canShare({ files: [arquivo] })
  } catch {
    return false
  }
}

/**
 * Tenta o sheet nativo com URL (iOS/Android). Não anexa PDF.
 * Se falhar (gesto expirado, cancelamento), devolve ok:false para o caller usar WhatsApp.
 */
export async function tentarCompartilharUrlNativa(opts: {
  titulo: string
  texto: string
  url: string
}): Promise<ResultadoCompartilharUrl> {
  const url = linkPublicoUtil(opts.url)
  if (!url) return { modo: 'indisponivel' }
  if (!suporteWebShareUrl()) return { modo: 'indisponivel' }

  try {
    await navigator.share({
      title: opts.titulo,
      text: opts.texto,
      url,
    })
    return { modo: 'web-share', ok: true }
  } catch (erro) {
    const nome = erro instanceof DOMException ? erro.name : ''
    if (nome === 'AbortError') {
      return { modo: 'web-share', ok: false, motivo: 'cancelado' }
    }
    return {
      modo: 'web-share',
      ok: false,
      motivo: erro instanceof Error ? erro.message : 'falha_share',
    }
  }
}
