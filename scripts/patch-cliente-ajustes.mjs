import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')

function patch(file, fn) {
  const full = path.join(root, file)
  let s = fs.readFileSync(full, 'utf8')
  const next = fn(s)
  if (next === s) console.warn('NO CHANGE:', file)
  else {
    fs.writeFileSync(full, next)
    console.log('OK:', file)
  }
}

patch('components/recibos/ReciboEmitidoView.tsx', (s) => {
  if (!s.includes('loadingWhatsapp = false')) {
    s = s.replace(
      '  modoPublico = false,\n}: Props)',
      '  modoPublico = false,\n  loadingWhatsapp = false,\n  loadingPdf = false,\n}: Props)',
    )
  }
  const marker = 'onClick={onEnviarLink}'
  if (s.includes(marker) && !s.includes('disabled={loadingWhatsapp}')) {
    s = s.replace(
      /(\{showEnviarLink \? \(\s*<button\s*\n\s*onClick=\{onEnviarLink\}\s*\n\s*style=\{\{[^}]+\}\}\s*\n\s*>\s*\n\s*🟢 Enviar link\s*\n\s*<\/button>\s*\n\s*\) : null\}\s*\n\s*<button\s*\n\s*onClick=\{onPdf\}\s*\n\s*style=\{\{[^}]+\}\}\s*\n\s*>\s*\n\s*📄 Visualizar \/ Baixar PDF\s*\n\s*<\/button>)/s,
      `{showEnviarLink ? (
            <button
              onClick={onEnviarLink}
              disabled={loadingWhatsapp}
              style={{ minHeight: 50, minWidth: isMobile ? 150 : 190, background: loadingWhatsapp ? '#94a3b8' : 'linear-gradient(135deg,#16a34a 0%, #065f46 100%)', color: '#fff', border: '1px solid rgba(34,197,94,.50)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: loadingWhatsapp ? 'wait' : 'pointer', boxShadow: '0 0 28px rgba(34,197,94,.30), inset 0 1px 0 rgba(255,255,255,.14)', opacity: loadingWhatsapp ? 0.85 : 1 }}
            >
              {loadingWhatsapp ? '⏳ Preparando link…' : '🟢 Enviar link'}
            </button>
          ) : null}

          <button
            onClick={onPdf}
            disabled={loadingPdf}
            style={{ minHeight: 50, minWidth: isMobile ? 180 : 230, background: loadingPdf ? '#64748b' : 'linear-gradient(135deg,#0f3bff 0%, #001b6b 100%)', color: '#fff', border: '1px solid rgba(59,130,246,.55)', borderRadius: 18, padding: '0 20px', fontWeight: 950, cursor: loadingPdf ? 'wait' : 'pointer', boxShadow: '0 0 28px rgba(37,99,235,.30), inset 0 1px 0 rgba(255,255,255,.14)', opacity: loadingPdf ? 0.85 : 1 }}
          >
            {loadingPdf ? '⏳ Abrindo PDF…' : '📄 Visualizar / Baixar PDF'}
          </button>`,
    )
  }
  return s
})

patch('app/(painel)/recibo-avulso/page.tsx', (s) => {
  if (!s.includes('loadingWhatsapp')) {
    s = s.replace(
      'const [isMobile, setIsMobile] = useState(false)',
      'const [isMobile, setIsMobile] = useState(false)\n  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false)\n  const [loadingPdf, setLoadingPdf] = useState(false)',
    )
  }

  // Remove duplicate local helpers now in lib/recibo-publico
  s = s.replace(/function normalizarTelefoneWhatsapp[\s\S]*?return `55\$\{telefone\}`\n\}\n\n/g, '')
  s = s.replace(/function gerarToken\(\)[\s\S]*?\}\n\nfunction prepararPayloadReciboPublico[\s\S]*?\}\n\nasync function gerarLinkPublicoRecibo[\s\S]*?return ''\n\}\n\n/g, '')

  s = s.replace(
    `  async function enviarWhatsApp() {
    if (!dados) return

    const telefone = normalizarTelefoneWhatsapp(dados?.clienteTelefone)
    try {
      const link = await gerarLinkPublicoRecibo(dados)
      if (!link) {
        alert('Não foi possível gerar o link do recibo.')
        return
      }

      let mensagem = \`Olá \${dados?.nomeCliente || 'cliente'}!\\n\\n\`
      mensagem += \`Segue seu recibo.\\n\`
      mensagem += \`Referente a: \${dados?.referente || 'pagamento'}.\\n\`
      mensagem += \`\\n🔗 Acesse aqui:\\n\${link}\`

      const zap = abrirWhatsappUrl(montarUrlWhatsapp(telefone, mensagem))
      if (!zap.abriu && !zap.mostrarLink) {
        alert('Não foi possível abrir o WhatsApp.')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar pelo WhatsApp.'
      alert(msg)
    }
  }`,
    `  async function enviarWhatsApp() {
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
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar pelo WhatsApp.'
      alert(msg)
    } finally {
      setLoadingWhatsapp(false)
    }
  }`,
  )

  s = s.replace(
    `  function abrirVisualizacaoPDF() {
    if (!dados) return
    abrirReciboPdfEmNovaJanela(dados)
  }`,
    `  function abrirVisualizacaoPDF() {
    if (!dados || loadingPdf) return
    setLoadingPdf(true)
    window.setTimeout(() => {
      const ok = abrirReciboPdfEmNovaJanela(dados)
      setLoadingPdf(false)
      if (!ok) alert('Não foi possível abrir o PDF. Verifique se pop-ups estão liberados ou tente novamente.')
    }, 80)
  }`,
  )

  s = s.replace(
    `      onPdf={abrirVisualizacaoPDF}
    />`,
    `      onPdf={abrirVisualizacaoPDF}
      loadingWhatsapp={loadingWhatsapp}
      loadingPdf={loadingPdf}
    />`,
  )

  s = s.replace(
    `  function fecharRecibo() {
    window.close()

    setTimeout(() => {
      document.body.innerHTML = \``,
    `  function fecharRecibo() {
    try {
      window.close()
    } catch {}
    router.push('/ordens-servico')
    return

    setTimeout(() => {
      document.body.innerHTML = \``,
  )

  return s
})

const recibosPage = `'use client'

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
      <motionPlaceholder />
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

function motionPlaceholder() {
  return (
    <motionPlaceholderInner />
  )
}

function motionPlaceholderInner() {
  const router = useRouter()
  return (
    <motionPlaceholderView router={router} />
  )
}

function motionPlaceholderView({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <motionPlaceholderContent router={router} />
  )
}

function motionPlaceholderContent({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
      <motionPlaceholderBox router={router} />
    </motionPlaceholderContent>
  )
}

function motionPlaceholderBox({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 420 }}>
      <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>Nenhum recibo aberto</h2>
      <p style={{ margin: '0 0 16px', color: '#64748b' }}>Gere um recibo avulso ou abra o último recibo salvo.</p>
      <button
        type="button"
        onClick={() => router.push('/recibo-avulso')}
        style={{ minHeight: 44, borderRadius: 14, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 900, padding: '0 18px', cursor: 'pointer' }}
      >
        Ir para recibo avulso
      </button>
    </motionPlaceholderBox>
  )
}
`

// Simplify recibos page - the above got too complex with placeholder nesting
const recibosSimple = `'use client'

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
      <motionEmpty router={router} />
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

function EmptyRecibo({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <motionEmpty router={router} />
  )
}

function motionEmpty({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
      <CardEmpty router={router} />
    </div>
  )
}

function CardEmpty({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 420 }}>
      <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>Nenhum recibo aberto</h2>
      <p style={{ margin: '0 0 16px', color: '#64748b' }}>Gere um recibo avulso ou abra o último recibo salvo.</p>
      <button
        type="button"
        onClick={() => router.push('/recibo-avulso')}
        style={{ minHeight: 44, borderRadius: 14, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 900, padding: '0 18px', cursor: 'pointer' }}
      >
        Ir para recibo avulso
      </button>
    </motionEmpty>
  )
}
`

// Fix the broken JSX in recibosSimple
const recibosFinal = recibosSimple
  .replace('function EmptyRecibo[\s\S]*', '')
  .replace(
    `  if (!dados) {
    return (
      <motionEmpty router={router} />
    )
  }`,
    `  if (!dados) {
    return (
      <motionEmpty router={router} />
    )
  }`,
  )

// Actually write clean recibos page
fs.writeFileSync(
  path.join(root, 'app/(painel)/recibos/page.tsx'),
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
      <motionEmpty router={router} />
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

function motionEmpty({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <motionEmptyInner router={router} />
  )
}

function motionEmptyInner({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>Nenhum recibo aberto</h2>
        <p style={{ margin: '0 0 16px', color: '#64748b' }}>Gere um recibo avulso ou abra o último recibo salvo.</p>
        <button
          type="button"
          onClick={() => router.push('/recibo-avulso')}
          style={{ minHeight: 44, borderRadius: 14, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 900, padding: '0 18px', cursor: 'pointer' }}
        >
          Ir para recibo avulso
        </button>
      </div>
    </div>
  )
}
`,
)
console.log('OK: app/(painel)/recibos/page.tsx')
