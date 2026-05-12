import type { ReactNode } from 'react'
import './globals.css'
import PainelShell from './components/PainelShell'

export const metadata = {
  title: 'Connect Sistema',
  description: 'Gestão comercial, orçamentos e ordens de serviço',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>
        <PainelShell>{children}</PainelShell>
      </body>
    </html>
  )
}