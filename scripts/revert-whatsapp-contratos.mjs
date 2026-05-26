import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')

function patchContratos() {
  const p = path.join(root, 'app/(painel)/contratos/page.tsx')
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(
    "import { abrirWhatsappSeguro, montarUrlWhatsapp } from '@/lib/abrirExterno'\nimport WhatsAppFallbackBar from '@/components/WhatsAppFallbackBar'",
    "import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'"
  )
  s = s.replace(
    '  const [enviando, setEnviando] = useState(false)\n  const [zapContratoFallbackUrl, setZapContratoFallbackUrl] = useState<string | null>(null)',
    '  const [enviando, setEnviando] = useState(false)'
  )
  s = s.replace(
    '      <WhatsAppFallbackBar url={zapContratoFallbackUrl} onFechar={() => setZapContratoFallbackUrl(null)} />\n',
    ''
  )

  const start = s.indexOf('  async function enviarWhatsApp(c: ContratoServico) {')
  const end = s.indexOf('  async function gerarPDF', start)
  if (start < 0 || end < 0) throw new Error('enviarWhatsApp block not found')

  const novo = `  async function enviarWhatsApp(c: ContratoServico) {
    setEnviando(true)
    try {
      let cfgRaw: Record<string, unknown> = {}
      try {
        cfgRaw = (await buscarConfiguracao()) as unknown as Record<string, unknown>
      } catch {
        try {
          cfgRaw = JSON.parse(localStorage.getItem('connect_configuracoes') || '{}')
        } catch {}
      }
      const empresaView = empresaContratoFromConfig(cfgRaw)
      const empresa = empresaView.nome

      const token = (() => {
        try {
          return crypto.randomUUID().replace(/-/g, '')
        } catch {
          return \`\${Date.now()}\${Math.random().toString(36).slice(2)}\`
        }
      })()

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const { data: sessao } = await supabase.auth.getSession()
        if (sessao?.session?.access_token) {
          headers.Authorization = \`Bearer \${sessao.session.access_token}\`
        }
      } catch {}

      let updatedAt = Date.now()
      const resp = await fetch('/api/public-docs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          document_type: 'contrato',
          tipo: 'contrato',
          document_id: String(c.id),
          documentoId: String(c.id),
          token,
          payload: payloadContratoPublico(c as unknown as Record<string, unknown>, empresaView, { token }),
        }),
      })
      if (!resp.ok) {
        throw new Error('Não foi possível gerar o link público do contrato. Tente novamente.')
      }
      const json = await resp.json().catch(() => null)
      updatedAt = timestampVersaoPublica(json?.updated_at || Date.now())

      const base = SITE_URL || (typeof window !== 'undefined' ? window.location.origin.replace(/\\/$/, '') : '')
      const link = \`\${base}/visualizar/contrato/\${encodeURIComponent(String(c.id))}?token=\${encodeURIComponent(token)}&v=\${updatedAt}\`

      const texto = \`Olá \${c.cliente?.nome || ''}!

Segue seu *Contrato de Prestação de Serviço* Nº \${c.numero} da *\${empresa}*.

*Serviço:* \${c.descricaoServico}
*Valor:* \${moedaHTML(c.valorTotal)}
*Parcelas:* \${c.parcelas}x de \${moedaHTML(c.valorParcela)}

Acesse e assine digitalmente:
\${link}

Atenciosamente,
\${empresa}\`

      const numero = String(c.cliente?.telefone || '').replace(/\\D/g, '')
      if (!abrirWhatsappUrl(montarUrlWhatsapp(\`55\${numero}\`, texto))) {
        throw new Error('Não foi possível abrir o WhatsApp.')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar pelo WhatsApp.'
      alert(msg)
    } finally {
      setTimeout(() => setEnviando(false), 800)
    }
  }

`
  s = s.slice(0, start) + novo + s.slice(end)
  fs.writeFileSync(p, s)
  console.log('contratos ok')
}

function patchReciboAvulso() {
  const p = path.join(root, 'app/(painel)/recibo-avulso/page.tsx')
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(
    "import { abrirWhatsappSeguro, montarUrlWhatsapp } from '@/lib/abrirExterno'",
    "import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'"
  )
  const old = `  async function enviarWhatsApp() {
    if (!dados) return

    const telefone = normalizarTelefoneWhatsapp(dados?.clienteTelefone)
    await abrirWhatsappSeguro(async () => {
      const link = await gerarLinkPublicoRecibo(dados)
      if (!link) throw new Error('Não foi possível gerar o link do recibo.')

      let mensagem = \`Olá \${dados?.nomeCliente || 'cliente'}!\\n\\n\`
      mensagem += \`Segue seu recibo.\\n\`
      mensagem += \`Referente a: \${dados?.referente || 'pagamento'}.\\n\`
      mensagem += \`\\n🔗 Acesse aqui:\\n\${link}\`

      return montarUrlWhatsapp(telefone, mensagem)
    })
  }`
  const novo = `  async function enviarWhatsApp() {
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

      if (!abrirWhatsappUrl(montarUrlWhatsapp(telefone, mensagem))) {
        alert('Não foi possível abrir o WhatsApp.')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar pelo WhatsApp.'
      alert(msg)
    }
  }`
  if (!s.includes(old)) throw new Error('recibo block not found')
  s = s.replace(old, novo)
  fs.writeFileSync(p, s)
  console.log('recibo ok')
}

function patchOrcamentoDoc() {
  const p = path.join(root, 'components/documentos/OrcamentoDocumentoPage.tsx')
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(
    "import { abrirWhatsappSeguro, montarUrlWhatsapp } from '@/lib/abrirExterno'",
    "import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'"
  )
  s = s.replace(
    `    await abrirWhatsappSeguro(async () => {
      const atualizado = await salvarOrcamentoAprovado('Aprovado', assinatura)
      if (atualizado) gerarOSDaAprovacao(atualizado)
      const url = urlAvisoEmpresaWhatsapp('aprovado')
      if (!url) throw new Error('Telefone da empresa não configurado.')
      return url
    })`,
    `    const atualizado = await salvarOrcamentoAprovado('Aprovado', assinatura)
    if (atualizado) gerarOSDaAprovacao(atualizado)
    const url = urlAvisoEmpresaWhatsapp('aprovado')
    if (url) abrirWhatsappUrl(url)`
  )
  s = s.replace(
    `    await abrirWhatsappSeguro(async () => {
      await salvarOrcamentoAprovado('Cancelado')
      const url = urlAvisoEmpresaWhatsapp('recusado')
      if (!url) throw new Error('Telefone da empresa não configurado.')
      return url
    })`,
    `    await salvarOrcamentoAprovado('Cancelado')
    const url = urlAvisoEmpresaWhatsapp('recusado')
    if (url) abrirWhatsappUrl(url)`
  )
  fs.writeFileSync(p, s)
  console.log('orcamento doc ok')
}

patchContratos()
patchReciboAvulso()
patchOrcamentoDoc()
