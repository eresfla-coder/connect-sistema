import fs from 'fs'
import path from 'path'

const root = path.resolve('.')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function write(rel, content) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf8')
  console.log('OK', rel)
}

let os = read('app/(painel)/ordens-servico/page.tsx')
if (!os.includes("from '@/lib/empresaPublica'")) {
  os = os.replace(
    "import { abrirNovaAbaOuMesma, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'",
    "import { abrirNovaAbaOuMesma, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'\nimport { montarUrlPublicaDocumento, timestampVersaoPublica } from '@/lib/empresaPublica'"
  )
}
os = os.replace(
  'return `${base}/view/os/${id}?token=${encodeURIComponent(token)}`',
  "const v = timestampVersaoPublica(json?.updated_at || Date.now())\n      return montarUrlPublicaDocumento('/view/os', String(id), { token, v })"
)
write('app/(painel)/ordens-servico/page.tsx', os)

let orc = read('app/(painel)/orcamentos/page.tsx')
if (!orc.includes("from '@/lib/empresaPublica'")) {
  orc = orc.replace(
    "import { buscarConfiguracao } from '@/lib/configuracaoEmpresa'",
    "import { buscarConfiguracao } from '@/lib/configuracaoEmpresa'\nimport { montarUrlPublicaDocumento, timestampVersaoPublica } from '@/lib/empresaPublica'"
  )
}
orc = orc.replace(
  'if (json?.token) return `${base}/impressao-orcamento/${id}?preview=1&p=${json.token}`',
  `if (json?.token) {
          const v = timestampVersaoPublica(json?.updated_at || Date.now())
          return montarUrlPublicaDocumento('/impressao-orcamento', String(id), { token: json.token, preview: true, v })
        }`
)
write('app/(painel)/orcamentos/page.tsx', orc)

const impressaoOsPage = `import type { Metadata } from 'next'
import { buildMetadataDocumentoPublico } from '@/lib/metadataDocumentoPublico'
import ImpressaoOrdemServicoClient from './ImpressaoOrdemServicoClient'

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
    pathPrefix: '/impressao-ordem-servico',
    versaoUrl: sp.v || null,
  })
}

export default function Page() {
  return <ImpressaoOrdemServicoClient />
}
`
write('app/impressao-ordem-servico/[id]/page.tsx', impressaoOsPage)

const viewOrcPage = impressaoOsPage
  .replace('ImpressaoOrdemServicoClient', 'ViewOrcamentoClient')
  .replace("'ordem_servico'", "'orcamento'")
  .replace('/impressao-ordem-servico', '/view/orcamento')
write('app/view/orcamento/[id]/page.tsx', viewOrcPage)
