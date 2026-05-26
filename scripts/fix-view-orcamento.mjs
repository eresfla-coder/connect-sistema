import fs from 'fs'
import path from 'path'
const content = `import type { Metadata } from 'next'
import { buildMetadataDocumentoPublico } from '@/lib/metadataDocumentoPublico'
import ViewOrcamentoClient from './ViewOrcamentoClient'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ p?: string; token?: string; v?: string }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params
  const sp = await searchParams
  const token = sp.p || sp.token || null
  return buildMetadataDocumentoPublico({
    tipo: 'orcamento',
    documentoId: id,
    token,
    pathPrefix: '/view/orcamento',
    versaoUrl: sp.v || null,
  })
}

export default function Page() {
  return <ViewOrcamentoClient />
}
`
fs.writeFileSync(path.join('app/view/orcamento/[id]/page.tsx'), content, 'utf8')
console.log('fixed')
