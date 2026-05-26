'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { emailDoUsuarioAuth, isUsuarioAdmin } from '@/lib/access'
import {
  contarDocumentosLocal,
  resolverSnapshotAssinatura,
  type SnapshotAssinatura,
} from '@/lib/assinaturaAcesso'
import { PLANOS_CATALOGO } from '@/lib/planosSaaS'

export function useAssinatura() {
  const [snapshot, setSnapshot] = useState<SnapshotAssinatura | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const atualizar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) {
        setSnapshot(null)
        return
      }

      const docs = contarDocumentosLocal()
      const response = await fetch('/api/assinatura/status', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-connect-docs-count': String(docs),
        },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)

      const email = emailDoUsuarioAuth(session?.session?.user)

      if (!response.ok || !payload?.ok) {
        setErro(payload?.message || 'Não foi possível carregar assinatura.')
        const local = resolverSnapshotAssinatura(null, null, docs, { email })
        setSnapshot(local)
        return
      }

      if (payload.isAdminMaster || payload.snapshot?.isAdminMaster) {
        setSnapshot(payload.snapshot)
        return
      }

      const merged = resolverSnapshotAssinatura(payload.perfil, payload.assinatura, docs, { email })
      setSnapshot(merged)
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
      setSnapshot(resolverSnapshotAssinatura(null, null, contarDocumentosLocal()))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void atualizar()
    const onStorage = () => void atualizar()
    window.addEventListener('storage', onStorage)
    window.addEventListener('connect-data-change', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('connect-data-change', onStorage)
    }
  }, [atualizar])

  return { snapshot, loading, erro, atualizar, catalogo: PLANOS_CATALOGO }
}
