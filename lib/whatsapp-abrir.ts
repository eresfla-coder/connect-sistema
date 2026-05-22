import { normalizarTelefoneWhatsApp } from '@/lib/assinatura-cobranca'

/** Abre WhatsApp sem derrubar a aba/PWA do Connect (PC, Android, iPhone). */
export function abrirWhatsAppExterno(url: string) {
  if (typeof window === 'undefined' || !url) return

  const abrir = () => {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  try {
    const popup = window.open(url, '_blank', 'noopener,noreferrer')
    if (!popup || popup.closed) {
      abrir()
    }
  } catch {
    abrir()
  }
}

export function montarUrlWhatsApp(telefone: string, mensagem: string) {
  const numero = normalizarTelefoneWhatsApp(telefone)
  if (!numero) {
    return `https://wa.me/?text=${encodeURIComponent(mensagem)}`
  }
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

export function abrirWhatsAppComTelefone(telefone: string, mensagem: string) {
  abrirWhatsAppExterno(montarUrlWhatsApp(telefone, mensagem))
}
