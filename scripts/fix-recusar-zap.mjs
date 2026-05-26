import fs from 'fs'
import path from 'path'

const p = path.join(import.meta.dirname, '..', 'components/documentos/OrcamentoDocumentoPage.tsx')
let s = fs.readFileSync(p, 'utf8')
const old = `  async function recusarOrcamentoDigital() {
    await salvarOrcamentoAprovado('Cancelado')
    const docProposta = String(orc?.tipoDocumento || '').toLowerCase() === 'proposta_comercial'
    setMensagemAprovacao(\`\${docProposta ? 'Proposta' : 'Orçamento'} marcado como recusado. A empresa será avisada pelo WhatsApp.\`)
    await abrirWhatsappSeguro(async () => {
      const url = urlAvisoEmpresaWhatsapp('recusado')
      if (!url) throw new Error('Telefone da empresa não configurado.')
      return url
    })
  }`
const novo = `  async function recusarOrcamentoDigital() {
    const docProposta = String(orc?.tipoDocumento || '').toLowerCase() === 'proposta_comercial'
    await abrirWhatsappSeguro(async () => {
      await salvarOrcamentoAprovado('Cancelado')
      const url = urlAvisoEmpresaWhatsapp('recusado')
      if (!url) throw new Error('Telefone da empresa não configurado.')
      return url
    })
    setMensagemAprovacao(\`\${docProposta ? 'Proposta' : 'Orçamento'} marcado como recusado. A empresa será avisada pelo WhatsApp.\`)
  }`
if (s.includes(old)) {
  s = s.replace(old, novo)
  fs.writeFileSync(p, s)
  console.log('fixed recusar')
} else {
  console.log('pattern not found')
}
