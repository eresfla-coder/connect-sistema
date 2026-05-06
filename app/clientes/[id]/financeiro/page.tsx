import FinanceiroModule from '@/components/financeiro/FinanceiroModule'

export default async function ClienteFinanceiroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FinanceiroModule clientId={id} embedded />
}
