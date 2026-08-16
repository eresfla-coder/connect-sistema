/** Abrir links externos (WhatsApp, etc.) sem sair da tela do sistema. */

import {
  resolverLinkParaEnvio,
  suporteWebShareUrl,
  tentarCompartilharUrlNativa,
} from '@/lib/compartilhar-documento'

export const WHATSAPP_FALLBACK_EVENT = 'connect-whatsapp-fallback'

export function isDispositivoMobile() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  return (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  )
}

/** iPhone / iPad / iPod (inclui iPadOS desktop UA). */
export function isIosWebkit() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iP(hone|od|ad)/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
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
  modo?: 'whatsapp' | 'web-share' | 'fallback'
}

/**
 * Abre WhatsApp em nova aba — a página do Connect permanece aberta.
 * Após await (comum no iOS), preferir <a> em WebKit móvel: window.open costuma ser bloqueado.
 */
export function abrirWhatsappUrl(url: string): ResultadoAbrirWhatsapp {
  const destino = normalizarUrlWhatsapp(String(url || '').trim())
  if (!destino) return { url: '', abriu: false, mostrarLink: false, modo: 'whatsapp' }

  if (isModoPwa()) {
    dispararWhatsappFallback(destino)
    return { url: destino, abriu: false, mostrarLink: true, modo: 'fallback' }
  }

  const preferirAnchor = isIosWebkit() || (isDispositivoMobile() && !isModoPwa())

  if (preferirAnchor) {
    try {
      abrirComAnchor(destino)
      return { url: destino, abriu: true, mostrarLink: false, modo: 'whatsapp' }
    } catch {}
  }

  const nova = window.open(destino, '_blank', 'noopener,noreferrer')
  if (nova) {
    try {
      nova.opener = null
    } catch {}
    return { url: destino, abriu: true, mostrarLink: false, modo: 'whatsapp' }
  }

  if (!preferirAnchor && isDispositivoMobile()) {
    try {
      abrirComAnchor(destino)
      return { url: destino, abriu: true, mostrarLink: false, modo: 'whatsapp' }
    } catch {}
  }

  dispararWhatsappFallback(destino)
  return { url: destino, abriu: false, mostrarLink: true, modo: 'fallback' }
}

/**
 * Prepara link público completo e abre WhatsApp.
 * Nunca abre com link vazio (bug histórico no Recibo mobile).
 */
export async function abrirWhatsappAposPrepararLink(opts: {
  telefone: string
  linkRapido: string
  prepararLinkCompleto: () => Promise<string>
  montarMensagem: (link: string) => string
}): Promise<ResultadoAbrirWhatsapp> {
  const link = await resolverLinkParaEnvio({
    linkRapido: opts.linkRapido,
    prepararLinkCompleto: opts.prepararLinkCompleto,
  })

  const url = montarUrlWhatsapp(opts.telefone, opts.montarMensagem(link))
  const resultado = abrirWhatsappUrl(url)
  if (!resultado.abriu && !resultado.mostrarLink) {
    throw new Error('Não foi possível abrir o WhatsApp.')
  }
  return { ...resultado, url }
}

/**
 * Fluxo robusto de envio de link:
 * 1) resolve URL pública;
 * 2) no mobile com Web Share, tenta sheet nativo (URL + texto);
 * 3) se cancelar/falhar/indisponível, cai para WhatsApp com o mesmo link.
 */
export async function enviarLinkDocumento(opts: {
  telefone: string
  titulo: string
  linkRapido?: string
  prepararLinkCompleto: () => Promise<string>
  montarMensagem: (link: string) => string
  /** Se true (padrão no iPhone), tenta navigator.share antes do WhatsApp. */
  tentarShareNativo?: boolean
}): Promise<ResultadoAbrirWhatsapp> {
  const link = await resolverLinkParaEnvio({
    linkRapido: opts.linkRapido,
    prepararLinkCompleto: opts.prepararLinkCompleto,
  })
  const mensagem = opts.montarMensagem(link)
  const tentarShare =
    opts.tentarShareNativo !== false &&
    isDispositivoMobile() &&
    suporteWebShareUrl()

  if (tentarShare) {
    const share = await tentarCompartilharUrlNativa({
      titulo: opts.titulo,
      texto: mensagem,
      url: link,
    })
    if (share.modo === 'web-share') {
      if (share.ok === true) {
        return { url: link, abriu: true, mostrarLink: false, modo: 'web-share' }
      }
      const motivo = share.ok === false ? share.motivo : ''
      if (motivo === 'cancelado') {
        return { url: link, abriu: false, mostrarLink: false, modo: 'web-share' }
      }
    }
  }

  const url = montarUrlWhatsapp(opts.telefone, mensagem)
  const resultado = abrirWhatsappUrl(url)
  if (!resultado.abriu && !resultado.mostrarLink) {
    throw new Error('Não foi possível abrir o compartilhamento do link.')
  }
  return { ...resultado, url }
}

export function abrirNovaAbaOuMesma(url: string) {
  if (!url) return false

  if (isIosWebkit()) {
    try {
      abrirComAnchor(url)
      return true
    } catch {}
  }

  const nova = window.open(url, '_blank', 'noopener,noreferrer')
  if (nova) return true
  try {
    abrirComAnchor(url)
    return true
  } catch {
    return false
  }
}

/**
 * Abre janela em branco no mesmo gesto do toque (crítico no Safari iOS).
 * Sem noopener: precisamos da referência para document.write.
 */
export function abrirJanelaEmBrancoNoGesto(): Window | null {
  if (typeof window === 'undefined') return null
  try {
    const janela = window.open('', '_blank')
    if (!janela) return null
    try {
      janela.opener = null
    } catch {}
    return janela
  } catch {
    return null
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
