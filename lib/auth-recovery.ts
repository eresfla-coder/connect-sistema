export const PASSWORD_RECOVERY_FLAG = 'connect_password_recovery'

export function markPasswordRecoveryPending() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, '1')
}

export function clearPasswordRecoveryPending() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(PASSWORD_RECOVERY_FLAG)
}

export function isPasswordRecoveryPending() {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(PASSWORD_RECOVERY_FLAG) === '1'
}

export function isRecoveryFromUrl() {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  const params = new URLSearchParams(window.location.search)
  return (
    hash.includes('type=recovery') ||
    params.get('type') === 'recovery' ||
    isPasswordRecoveryPending()
  )
}

export function buildAuthCallbackUrl(nextPath = '/redefinir-senha') {
  if (typeof window === 'undefined') return '/auth/callback'
  const url = new URL('/auth/callback', window.location.origin)
  url.searchParams.set('next', nextPath)
  return url.toString()
}
