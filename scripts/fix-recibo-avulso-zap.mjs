import fs from 'fs'
const p = 'app/(painel)/recibo-avulso/page.tsx'
let c = fs.readFileSync(p, 'utf8')
if (!c.includes("from '@/lib/abrirExterno'")) {
  c = c.replace(
    "import { abrirReciboPdfEmNovaJanela } from '@/lib/recibo-print-html'",
    "import { abrirReciboPdfEmNovaJanela } from '@/lib/recibo-print-html'\nimport { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'"
  )
}
const start = c.indexOf('    const texto = encodeURIComponent(mensagem)')
const end = c.indexOf('  function fecharRecibo()', start)
if (start > 0 && end > start) {
  c = c.slice(0, start) + '    abrirWhatsappUrl(montarUrlWhatsapp(telefone, mensagem))\n' + c.slice(end)
  fs.writeFileSync(p, c)
  console.log('recibo-avulso fixed')
} else {
  console.log('pattern not found')
  process.exit(1)
}
