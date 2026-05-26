'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { emailDoUsuarioAuth, isUsuarioAdmin } from '@/lib/access'
import { useAssinatura } from '@/hooks/useAssinatura'
import { PlanosComparativoVenda } from '@/components/planos/PlanosComparativoVenda'
import ConnectLoading from '@/components/ui/ConnectLoading'

export default function PlanosPage() {
  const params = useSearchParams()
  const tierUrl = params.get('tier')
  const { snapshot, loading: loadingAssinatura } = useAssinatura()
  const [logado, setLogado] = useState(false)
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    async function sessao() {
      const { data } = await supabase.auth.getSession()
      setLogado(!!data?.session?.user)
      setAdmin(isUsuarioAdmin({ email: emailDoUsuarioAuth(data.session?.user) }))
    }
    void sessao()
  }, [])

  if (loadingAssinatura && logado) {
    return (
      <div style={{ minHeight: '60vh', background: '#f8fbff' }}>
        <ConnectLoading label="Carregando comparativo..." />
      </div>
    )
  }

  const diasTrial = admin || snapshot?.isAdminMaster ? null : snapshot?.diasRestantesTrial
  const planoAtual =
    snapshot?.isAdminMaster ? 'empresa' : snapshot?.tier === 'trial' ? null : snapshot?.tier || null

  return (
    <PlanosComparativoVenda
      tierDestaqueUrl={tierUrl}
      planoAtual={planoAtual}
      logado={logado}
      diasTrial={diasTrial}
    />
  )
}
