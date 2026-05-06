type PageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Pagamento
      </h1>

      <p>ID: {id}</p>
    </div>
  )
}