import type { Metadata } from 'next'
import { buildMetadataContratoPublico } from '@/lib/metadataDocumentoPublico'
import VisualizarContratoClient from './VisualizarContratoClient'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string; v?: string }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params
  const sp = await searchParams
  return buildMetadataContratoPublico({
    documentoId: id,
    token: sp.token || null,
    pathPrefix: '/visualizar/contrato',
    versaoUrl: sp.v || null,
  })
}

export default function VisualizarContratoPublicoPage() {
  return <VisualizarContratoClient />
}
