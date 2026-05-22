import type { Metadata } from 'next'
import './financeiro-premium.css'

export const metadata: Metadata = {
  title: 'Financeiro Premium AAA | Connect Sistema',
  description: 'Painel financeiro administrativo premium do Connect Sistema',
}

export default function AdminFinanceiroLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-connect-financeiro-aaa="v2" style={{ width: '100%', minHeight: '100%' }}>
      {children}
    </div>
  )
}
