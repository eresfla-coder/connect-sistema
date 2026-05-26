import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')

function patch(file, fn) {
  const p = path.join(root, file)
  let s = fs.readFileSync(p, 'utf8')
  const next = fn(s)
  if (next !== s) {
    fs.writeFileSync(p, next)
    console.log('updated', file)
  } else {
    console.log('skip', file)
  }
}

patch('app/(painel)/ordens-servico/page.tsx', (os) => {
  if (!os.includes('zapOsFallbackUrl')) {
    os = os.replace(
      'const [zapOsCarregando, setZapOsCarregando] = useState<string | number | null>(null)',
      'const [zapOsCarregando, setZapOsCarregando] = useState<string | number | null>(null)\n  const [zapOsFallbackUrl, setZapOsFallbackUrl] = useState<string | null>(null)'
    )
  }
  if (!os.includes("WhatsAppFallbackBar")) {
    os = os.replace(
      "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'",
      "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, comTimeout } from '@/lib/abrirExterno'\nimport WhatsAppFallbackBar from '@/components/WhatsAppFallbackBar'"
    )
  }
  return os
})

patch('app/(painel)/orcamentos/page.tsx', (orc) => {
  if (!orc.includes('abrirWhatsappSeguro')) {
    orc = orc.replace(
      "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout, montarUrlWhatsapp } from '@/lib/abrirExterno'",
      "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappSeguro, comTimeout, montarUrlWhatsapp } from '@/lib/abrirExterno'\nimport WhatsAppFallbackBar from '@/components/WhatsAppFallbackBar'"
    )
  }
  if (!orc.includes('setZapOrcFallbackUrl(null)\n    setZapOrcCarregando(orc.id)')) {
    orc = orc.replace(
      `    const telefone = telefoneWhatsappBrasil(orc.cliente?.telefone)
    setZapOrcCarregando(orc.id)
    try {
      let cfgEnvio = mergeConfigPublicacao(config)
      try {
        cfgEnvio = mergeConfigPublicacao(config, await configParaPublicar())
      } catch {}
      const linkRapido = gerarLinkDocumento(orc.id, prepararOrcamentoCliente(orc), cfgEnvio)
      await abrirWhatsappAposPrepararLink({`,
      `    const telefone = telefoneWhatsappBrasil(orc.cliente?.telefone)
    setZapOrcFallbackUrl(null)
    setZapOrcCarregando(orc.id)
    try {
      let cfgEnvio = mergeConfigPublicacao(config)
      try {
        cfgEnvio = mergeConfigPublicacao(config, await configParaPublicar())
      } catch {}
      const linkRapido = gerarLinkDocumento(orc.id, prepararOrcamentoCliente(orc), cfgEnvio)
      const resultado = await abrirWhatsappAposPrepararLink({`
    )
    orc = orc.replace(
      `        },
      })
    } catch {
      notificar('Não foi possível abrir o WhatsApp. Tente novamente.', 'error')
    } finally {
      window.setTimeout(() => setZapOrcCarregando(null), 800)
    }
  }

  async function enviarWhatsApp() {`,
      `        },
      })
      if (resultado.precisaFallback) setZapOrcFallbackUrl(resultado.url)
    } catch {
      notificar('Não foi possível abrir o WhatsApp. Tente novamente.', 'error')
    } finally {
      window.setTimeout(() => setZapOrcCarregando(null), 800)
    }
  }

  async function enviarWhatsApp() {`
    )
  }
  return orc
})

patch('app/(painel)/contratos/page.tsx', (ct) => {
  if (!ct.includes('zapContratoFallbackUrl')) {
    ct = ct.replace(
      'const [enviando, setEnviando] = useState(false)',
      'const [enviando, setEnviando] = useState(false)\n  const [zapContratoFallbackUrl, setZapContratoFallbackUrl] = useState<string | null>(null)'
    )
  }
  if (ct.includes('abrirWhatsappUrl(montarUrlWhatsapp')) {
    const start = ct.indexOf('  async function enviarWhatsApp(c: ContratoServico) {')
    const end = ct.indexOf('  async function gerarPDF', start)
    if (start >= 0 && end > start) {
      const novo = `  async function enviarWhatsApp(c: ContratoServico) {
    setEnviando(true)
    setZapContratoFallbackUrl(null)
    try {
      const resultado = await abrirWhatsappSeguro(async () => {
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
    try {
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
        throw new Error('Não foi possível gerar o link público do contrato.')
      }
      const json = await resp.json().catch(() => null)
      updatedAt = timestampVersaoPublica(json?.updated_at || Date.now())
    } catch {
      throw new Error('Não foi possível gerar o link público do contrato.')
    }

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
    return montarUrlWhatsapp(\`55\${numero}\`, texto)
      })
      if (resultado.precisaFallback) setZapContratoFallbackUrl(resultado.url)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível abrir o WhatsApp.'
      alert(msg)
    } finally {
      setTimeout(() => setEnviando(false), 800)
    }
  }

`
      ct = ct.slice(0, start) + novo + ct.slice(end)
    }
  }
  if (!ct.includes('<WhatsAppFallbackBar')) {
    ct = ct.replace(
      "    <div style={{ padding: '0 0 80px' }}>",
      "    <div style={{ padding: '0 0 80px' }}>\n      <WhatsAppFallbackBar url={zapContratoFallbackUrl} onFechar={() => setZapContratoFallbackUrl(null)} />"
    )
  }
  return ct
})

console.log('done')
