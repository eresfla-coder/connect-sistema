function normalizeOrigin(value?: string | null) {
  const texto = String(value || '').trim()
  if (!texto) return ''

  try {
    const parsed = new URL(texto.includes('://') ? texto : `https://${texto}`)
    return parsed.origin
  } catch {
    return ''
  }
}

/** Origem publica do app para links de auth e compartilhamento. */
export function getPublicAppOrigin() {
  const envOrigin = normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  )

  if (typeof window !== 'undefined' && window.location?.origin) {
    const currentOrigin = window.location.origin
    const envEhLocal = envOrigin.includes('localhost') || envOrigin.includes('127.0.0.1')
    const atualEhLocal =
      currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')

    // Em producao, nunca usar localhost do .env por engano.
    if (envEhLocal && !atualEhLocal) return currentOrigin
    if (envOrigin && !envEhLocal) return envOrigin
    return currentOrigin
  }

  return envOrigin
}
