'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PainelIndexPage() {
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = window.location.hash

    if (params.get('code')) {
      const destino = `/auth/callback?${params.toString()}`
      router.replace(destino)
      return
    }

    if (hash.includes('type=recovery')) {
      router.replace(`/redefinir-senha${hash}`)
      return
    }

    router.replace('/dashboard')
  }, [router])

  return null
}