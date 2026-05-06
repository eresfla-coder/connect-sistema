'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function OrdemServicoDetalheRedirectPage() {
  const params = useParams<{ id: string }>()

  useEffect(() => {
    const id = String(params?.id ?? '').trim()
    if (!id) return
    window.location.replace(`/view/os/${id}`)
  }, [params])

  return <div style={{ padding: 24, color: '#334155' }}>Abrindo visualização da OS...</div>
}
