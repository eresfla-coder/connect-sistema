/** Abrir links externos (WhatsApp, etc.) sem sair da tela do sistema. */

export const WHATSAPP_FALLBACK_EVENT = 'connect-whatsapp-fallback'

export function isDispositivoMobile() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  return (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  )
}

/** PWA / atalho na tela inicial (iOS standalone ou display-mode standalone). */
export function isModoPwa() {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch {}
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  return false
}

/** URL do WhatsApp (api.whatsapp.com). */
export function montarUrlWhatsapp(telefone: string, mensagem: string) {
  const phone = String(telefone || '').replace(/\D/g, '')
  const text = encodeURIComponent(mensagem)
  if (phone) return `https://api.whatsapp.com/send?phone=${phone}&text=${text}`
  return `https://api.whatsapp.com/send?text=${text}`
}

function normalizarUrlWhatsapp(url: string) {
  try {
    const u = new URL(url)
    if (u.hostname === 'wa.me' || u.hostname === 'www.wa.me') {
      const pathPhone = u.pathname.replace(/^\//, '').replace(/\D/g, '')
      const text = u.searchParams.get('text') || ''
      return montarUrlWhatsapp(pathPhone, text ? decodeURIComponent(text.replace(/\+/g, ' ')) : '')
    }
  } catch {}
  return url
}

function abrirComAnchor(destino: string) {
  const a = document.createElement('a')
  a.href = destino
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function dispararWhatsappFallback(url: string) {
  if (typeof window === 'undefined' || !url) return
  window.dispatchEvent(new CustomEvent(WHATSAPP_FALLBACK_EVENT, { detail: { url } }))
}

export type ResultadoAbrirWhatsapp = {
  url: string
  abriu: boolean
  mostrarLink: boolean
}

/**
 * Abre WhatsApp em nova aba — a página do Connect permanece aberta.
 * PWA: link visível (evento). PC: window.open. Mobile: anchor se popup falhar.
 */
export function abrirWhatsappUrl(url: string): ResultadoAbrirWhatsapp {
  const destino = normalizarUrlWhatsapp(String(url || '').trim())
  if (!destino) return { url: '', abriu: false, mostrarLink: false }

  if (isModoPwa()) {
    dispararWhatsappFallback(destino)
    return { url: destino, abriu: false, mostrarLink: true }
  }

  const nova = window.open(destino, '_blank', 'noopener,noreferrer')
  if (nova) {
    try {
      nova.opener = null
    } catch {}
    return { url: destino, abriu: true, mostrarLink: false }
  }

  if (isDispositivoMobile()) {
    try {
      abrirComAnchor(destino)
      return { url: destino, abriu: true, mostrarLink: false }
    } catch {}
  }

  dispararWhatsappFallback(destino)
  return { url: destino, abriu: false, mostrarLink: true }
}

/**
 * Prepara link público, monta mensagem e abre WhatsApp.
 */
export async function abrirWhatsappAposPrepararLink(opts: {
  telefone: string
  linkRapido: string
  prepararLinkCompleto: () => Promise<string>
  montarMensagem: (link: string) => string
}): Promise<ResultadoAbrirWhatsapp> {
  let link = opts.linkRapido
  if (isDispositivoMobile() && !isModoPwa()) {
    void opts.prepararLinkCompleto().catch(() => {})
  } else if (!isModoPwa()) {
    link = await opts.prepararLinkCompleto()
  } else {
    try {
      link = await opts.prepararLinkCompleto()
    } catch (e) {
      throw e
    }
  }

  const url = montarUrlWhatsapp(opts.telefone, opts.montarMensagem(link))
  const resultado = abrirWhatsappUrl(url)
  if (!resultado.abriu && !resultado.mostrarLink) {
    throw new Error('Não foi possível abrir o WhatsApp.')
  }
  return resultado
}

export function abrirNovaAbaOuMesma(url: string) {
  if (!url) return false
  const nova = window.open(url, '_blank', 'noopener,noreferrer')
  if (nova) return true
  try {
    abrirComAnchor(url)
    return true
  } catch {
    return false
  }
}

export async function comTimeout<T>(promise: Promise<T>, ms = 14000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
