import fs from 'fs'
const p = 'app/(painel)/connect-ai/page.tsx'
let c = fs.readFileSync(p, 'utf8')
if (!c.includes("from '@/lib/abrirExterno'")) {
  c = c.replace(
    "import ModuloPremiumGate from '@/components/assinatura/ModuloPremiumGate'",
    "import ModuloPremiumGate from '@/components/assinatura/ModuloPremiumGate'\nimport { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'"
  )
}
c = c.replace(
  `function abrirWhatsApp(telefone: string, texto: string) {
  const tel = normalizarTelefone(telefone)
  const url = tel
    ? \`https://wa.me/\${tel}?text=\${encodeURIComponent(texto)}\`
    : \`https://wa.me/?text=\${encodeURIComponent(texto)}\`
  window.open(url, '_blank', 'noopener,noreferrer')
}`,
  `function abrirWhatsApp(telefone: string, texto: string) {
  abrirWhatsappUrl(montarUrlWhatsapp(normalizarTelefone(telefone), texto))
}`
)
fs.writeFileSync(p, c)
console.log('connect-ai ok')
