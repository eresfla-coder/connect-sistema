'use client'

import { useAssinatura } from '@/hooks/useAssinatura'
import { podeAcessarModulo, type ModuloPremium } from '@/lib/assinaturaAcesso'
import UpgradePrompt from '@/components/assinatura/UpgradePrompt'
import ConnectLoading from '@/components/ui/ConnectLoading'

type Props = {
  modulo: ModuloPremium
  children: React.ReactNode
}

export default function ModuloPremiumGate({ modulo, children }: Props) {
  const { snapshot, loading } = useAssinatura()

  if (loading) return <ConnectLoading compact label="Verificando plano..." />

  if (!snapshot || !podeAcessarModulo(snapshot, modulo)) {
    return (
      <div style={{ padding: 12 }}>
        <UpgradePrompt modulo={modulo} />
        <div style={{ opacity: 0.45, pointerEvents: 'none', filter: 'grayscale(.2)' }}>{children}</div>
      </div>
    )
  }

  return <>{children}</>
}
