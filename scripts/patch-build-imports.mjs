import fs from 'fs'
import path from 'path'

// --- orcamentos: import abrirWhatsappAposPrepararLink ---
const orc = path.join(process.cwd(), 'app/(painel)/orcamentos/page.tsx')
let orcC = fs.readFileSync(orc, 'utf8')
const orcOld =
  "import { abrirNovaAbaOuMesma, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'"
const orcNew =
  "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'"
if (!orcC.includes('abrirWhatsappAposPrepararLink')) {
  if (orcC.includes(orcOld)) {
    orcC = orcC.replace(orcOld, orcNew)
    fs.writeFileSync(orc, orcC, 'utf8')
    console.log('Fixed orcamentos import')
  } else {
    console.error('orcamentos import not found')
    process.exit(1)
  }
} else {
  console.log('orcamentos import OK')
}

// --- ordens-servico: import abrirWhatsappUrl + usar abrirWhatsappAposPrepararLink ---
const os = path.join(process.cwd(), 'app/(painel)/ordens-servico/page.tsx')
let osC = fs.readFileSync(os, 'utf8')

const osImportOld =
  "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, comTimeout } from '@/lib/abrirExterno'"
const osImportNew =
  "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'"
if (!osC.includes('abrirWhatsappUrl')) {
  if (osC.includes(osImportOld)) {
    osC = osC.replace(osImportOld, osImportNew)
  }
}

const osFnOld = `    setZapOsCarregando(item.id)
    try {
      const link = await linkPublicoOS(item)

      let mensagem = \`Olá \${item.cliente || 'cliente'}!\\n\\n\`
      mensagem += \`Segue sua ordem de serviço *\${item.numero}*.\\n\`

      if (item.equipamento) mensagem += \`Equipamento: \${item.equipamento}\\n\`
      if (item.status) mensagem += \`Status: \${item.status}\\n\`

      mensagem += \`Valor: \${moeda(item.valor)}\\n\`
      mensagem += \`Saldo: \${moeda(item.saldo)}\\n\\n\`
      mensagem += \`Acesse aqui:\\n\${link}\`

      const url = \`https://wa.me/\${telefone}?text=\${encodeURIComponent(mensagem)}\`
      abrirWhatsappUrl(url)
    } finally {
      window.setTimeout(() => setZapOsCarregando(null), 500)
    }`

const osFnNew = `    setZapOsCarregando(item.id)
    try {
      await abrirWhatsappAposPrepararLink({
        telefone,
        linkRapido: linkFallbackOS(item),
        prepararLinkCompleto: () => linkPublicoOS(item),
        montarMensagem: (link) => {
          let mensagem = \`Olá \${item.cliente || 'cliente'}!\\n\\n\`
          mensagem += \`Segue sua ordem de serviço *\${item.numero}*.\\n\`
          if (item.equipamento) mensagem += \`Equipamento: \${item.equipamento}\\n\`
          if (item.status) mensagem += \`Status: \${item.status}\\n\`
          mensagem += \`Valor: \${moeda(item.valor)}\\n\`
          mensagem += \`Saldo: \${moeda(item.saldo)}\\n\\n\`
          mensagem += \`Acesse aqui:\\n\${link}\`
          return mensagem
        },
      })
    } catch {
      alert('Não foi possível abrir o WhatsApp. Tente novamente.')
    } finally {
      window.setTimeout(() => setZapOsCarregando(null), 800)
    }`

if (osC.includes('await abrirWhatsappAposPrepararLink')) {
  console.log('OS whatsapp flow OK')
} else if (osC.includes(osFnOld)) {
  osC = osC.replace(osFnOld, osFnNew)
  fs.writeFileSync(os, osC, 'utf8')
  console.log('Fixed OS enviarWhatsAppOS')
} else {
  console.log('OS enviarWhatsAppOS pattern skip')
  fs.writeFileSync(os, osC, 'utf8')
}

console.log('Done')
