import PainelShell from './components/PainelShell'

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PainelShell>{children}</PainelShell>
}