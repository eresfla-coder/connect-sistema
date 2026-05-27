'use client'

import { useEffect } from 'react'

export default function PWAClient() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registros) => {
        for (const registro of registros) {
          void registro.unregister()
        }
      })
    }

    if ('caches' in window) {
      void caches.keys().then((chaves) => {
        for (const chave of chaves) {
          if (chave.startsWith('connect-') || chave.includes('next-pwa')) {
            void caches.delete(chave)
          }
        }
      })
    }
  }, [])

  return null
}
