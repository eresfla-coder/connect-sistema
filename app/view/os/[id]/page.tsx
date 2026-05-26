import type { Metadata } from 'next'
import { buildMetadataDocumentoPublico } from '@/lib/metadataDocumentoPublico'
import ViewOsClient from './ViewOsClient'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ p?: string; token?: string; v?: string }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params
  const sp = await searchParams
  const token = sp.p || sp.token || null
  return buildMetadataDocumentoPublico({
    tipo: 'ordem_servico',
    documentoId: id,
    token,
    pathPrefix: '/view/os',
    versaoUrl: sp.v || null,
  })
}

export default function Page() {
  return <ViewOsClient />
}
