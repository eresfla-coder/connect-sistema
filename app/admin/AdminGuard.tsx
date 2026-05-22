'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { perfilEhAdminConnect } from '@/lib/assinatura-cobranca'
import { carregarPerfilUsuario } from '@/lib/sync-perfil'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [liberado, setLiberado] = useState(false)

  useEffect(() => {
    let ativo = true

    async function validar() {
      const { perfil, erro } = await carregarPerfilUsuario({ forcar: true })

      if (!ativo) return

      if (!perfil || erro || !perfilEhAdminConnect(perfil)) {
        router.replace('/dashboard')
        return
      }

      setLiberado(true)
    }

    validar()
    return () => {
      ativo = false
    }
  }, [router])

  if (!liberado) {
    return (
      <div style={{ color: '#fff', padding: 32, textAlign: 'center' }}>
        Validando acesso administrativo...
      </div>
    )
  }

  return <>{children}</>
}
