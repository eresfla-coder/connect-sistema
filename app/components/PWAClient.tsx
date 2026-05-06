'use client'

import { useEffect } from 'react'

const LIMPEZA_KEY = 'connect_pwa_cleanup_v74_ok'

export default function PWAClient() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    async function limparPwaAntigoUmaVez() {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)))
        }
      } catch {}

      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)))
        }
      } catch {}

      try {
        localStorage.setItem(LIMPEZA_KEY, '1')
        localStorage.setItem('connect_atalho_versao_estavel', 'v74')
      } catch {}
    }

    const jaLimpou = (() => {
      try { return localStorage.getItem(LIMPEZA_KEY) === '1' } catch { return false }
    })()

    if (!jaLimpou) limparPwaAntigoUmaVez()
  }, [])

  return null
}
