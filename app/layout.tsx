import type { Metadata } from 'next'
import PainelShell from './components/PainelShell'

export const metadata: Metadata = {
  title: 'Connect Sistema',
  description: 'Gestão comercial e SaaS Connect Sistema',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Connect Sistema',
  },
}

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PainelShell>{children}</PainelShell>
}