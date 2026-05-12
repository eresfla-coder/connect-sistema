'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

// Rota legada: redireciona para /view/os/[id] ou /impressao-ordem-servico/[id]
export default function Page() {
  const params = useParams()
  const hash = String(params?.hash ?? '')

  useEffect(() => {
    if (!hash) return
    window.location.replace(`/impressao-ordem-servico/${hash}?preview=1`)
  }, [hash])

  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', color: '#334155' }}>Redirecionando...</div>
}
