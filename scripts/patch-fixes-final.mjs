import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))

function writeRel(rel, content) {
  fs.writeFileSync(path.join(root, '..', rel), content)
  console.log('OK:', rel)
}

// orcamentos fixes
const orcPath = path.join(root, '../app/(painel)/orcamentos/page.tsx')
let orc = fs.readFileSync(orcPath, 'utf8')

if (!orc.includes("from '@/lib/orcamento-pagamento'")) {
  orc = orc.replace(
    "import { supabase } from '@/lib/supabase'",
    "import { supabase } from '@/lib/supabase'\nimport {\n  extrairFormasPagamentoOrcamento,\n  montarFormasPagamentoOrcamento,\n  OPCOES_PAGAMENTO_ORCAMENTO,\n} from '@/lib/orcamento-pagamento'",
  )
}
if (!orc.includes('formasPagamentoLista?:')) {
  orc = orc.replace(
    '  formaPagamento: string\n  validade: string',
    '  formaPagamento: string\n  formasPagamentoLista?: string[]\n  observacaoPagamento?: string\n  ocultarValorUnitarioM2?: boolean\n  validade: string',
  )
}
if (!orc.includes('formasPagamentoSelecionadas')) {
  orc = orc.replace(
    "  const [formaPagamento, setFormaPagamento] = useState('PIX')\n  const [parcelasBoleto, setParcelasBoleto] = useState('')",
    "  const [formaPagamento, setFormaPagamento] = useState('PIX')\n  const [formasPagamentoSelecionadas, setFormasPagamentoSelecionadas] = useState<string[]>(['Pix'])\n  const [observacaoFormasPagamento, setObservacaoFormasPagamento] = useState('')\n  const [ocultarValorUnitarioM2, setOcultarValorUnitarioM2] = useState(false)\n  const [parcelasBoleto, setParcelasBoleto] = useState('')",
  )
}
orc = orc.replace(/\n\s{16}formaPagamento: pagamentoOrcamentoTexto/g, '\n        formaPagamento: pagamentoOrcamentoTexto')
if (!orc.includes('setFormasPagamentoSelecionadas([config')) {
  orc = orc.replace(
    `    setFormaPagamento(config.formaPagamentoPadrao || formasPagamento[0] || 'PIX')
    setParcelasBoleto('')`,
    `    setFormaPagamento(config.formaPagamentoPadrao || formasPagamento[0] || 'PIX')
    setFormasPagamentoSelecionadas([config.formaPagamentoPadrao || formasPagamento[0] || 'Pix'])
    setObservacaoFormasPagamento('')
    setOcultarValorUnitarioM2(false)
    setParcelasBoleto('')`,
  )
}
writeRel('app/(painel)/orcamentos/page.tsx', orc)

// recibo-avulso
const recPath = path.join(root, '../app/(painel)/recibo-avulso/page.tsx')
let rec = fs.readFileSync(recPath, 'utf8')
rec = rec.replace(
  /import \{ abrirWhatsappAposPrepararLink, abrirWhatsappUrl, montarUrlWhatsapp \}/,
  'import { abrirWhatsappAposPrepararLink }',
)
rec = rec.replace(
  /  function fecharRecibo\(\) \{[\s\S]*?\n  \}\n\n  function abrirVisualizacaoPDF/,
  `  function fecharRecibo() {
    try {
      window.close()
    } catch {}
    router.push('/ordens-servico')
  }

  function abrirVisualizacaoPDF`,
)
writeRel('app/(painel)/recibo-avulso/page.tsx', rec)

writeRel(
  'app/(painel)/recibos/page.tsx',
  `'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ReciboEmitidoView, type DadosReciboEmitido } from '@/components/recibos/ReciboEmitidoView'
import { abrirReciboPdfEmNovaJanela } from '@/lib/recibo-print-html'
import { abrirWhatsappAposPrepararLink } from '@/lib/abrirExterno'
import {
  gerarLinkPublicoRecibo,
  montarMensagemWhatsappRecibo,
  normalizarTelefoneWhatsapp,
  RECIBO_VISUALIZACAO_KEY,
} from '@/lib/recibo-publico'

export default function RecibosPage() {
  const router = useRouter()
  const [dados, setDados] = useState<DadosReciboEmitido | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECIBO_VISUALIZACAO_KEY)
      if (raw) setDados(JSON.parse(raw))
    } catch {}
    setCarregado(true)
  }, [])

  async function enviarWhatsApp() {
    if (!dados || loadingWhatsapp) return
    const telefone = normalizarTelefoneWhatsapp(dados?.clienteTelefone)
    setLoadingWhatsapp(true)
    try {
      await abrirWhatsappAposPrepararLink({
        telefone,
        linkRapido: '',
        prepararLinkCompleto: async () => gerarLinkPublicoRecibo(dados),
        montarMensagem: (link) => montarMensagemWhatsappRecibo(dados, link),
      })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Não foi possível enviar pelo WhatsApp.')
    } finally {
      setLoadingWhatsapp(false)
    }
  }

  function abrirPdf() {
    if (!dados || loadingPdf) return
    setLoadingPdf(true)
    window.setTimeout(() => {
      const ok = abrirReciboPdfEmNovaJanela(dados)
      setLoadingPdf(false)
      if (!ok) alert('Não foi possível abrir o PDF. Verifique se pop-ups estão liberados.')
    }, 80)
  }

  if (!carregado) return null

  if (!dados) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
        <motionEmpty />
      </div>
    )
  }

  return (
    <ReciboEmitidoView
      dados={dados}
      isMobile={isMobile}
      onFechar={() => router.push('/ordens-servico')}
      onVoltar={() => router.push('/recibo-avulso')}
      onNovo={() => router.push('/recibo-avulso')}
      onEnviarLink={enviarWhatsApp}
      onPdf={abrirPdf}
      loadingWhatsapp={loadingWhatsapp}
      loadingPdf={loadingPdf}
    />
  )
}
`.replace(
    `<motionEmpty />`,
    `<motionEmpty />`.replace(
      '<motionEmpty />',
      `<motionEmpty />`,
    ),
  ),
)

// fix recibos empty - the above still has motionEmpty placeholder, rewrite properly
writeRel(
  'app/(painel)/recibos/page.tsx',
  fs.readFileSync(path.join(root, '../app/(painel)/recibos/page.tsx'), 'utf8').replace(
    `  if (!dados) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
        <motionEmpty />
      </div>
    )
  }`,
    `  if (!dados) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>Nenhum recibo aberto</h2>
          <p style={{ margin: '0 0 16px', color: '#64748b' }}>Gere um recibo avulso ou abra o último recibo salvo.</p>
          <button type="button" onClick={() => router.push('/recibo-avulso')} style={{ minHeight: 44, borderRadius: 14, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 900, padding: '0 18px', cursor: 'pointer' }}>Ir para recibo avulso</button>
        </div>
      </div>
    )
  }`,
  ),
)
