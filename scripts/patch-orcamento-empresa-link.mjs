import fs from 'fs'
import path from 'path'

const file = path.join(process.cwd(), 'app/(painel)/orcamentos/page.tsx')
let c = fs.readFileSync(file, 'utf8')

const oldFn = `  function gerarLinkDocumento(id: number, dados?: OrcamentoSalvo) {
    const base = baseUrlDocumentoPublico()
    const urlBase = \`\${base}/impressao-orcamento/\${id}?preview=1\`

    if (!dados) return urlBase

    try {
      const payload = serializarCompactoOrcamento(dados, config)
      return payload ? \`\${urlBase}&d=\${payload}\` : urlBase
    } catch {
      return urlBase
    }
  }`

const newFn = `  function gerarLinkDocumento(id: number, dados?: OrcamentoSalvo, cfgOverride?: ConfiguracaoSistema) {
    const base = baseUrlDocumentoPublico()
    const urlBase = \`\${base}/impressao-orcamento/\${id}?preview=1\`

    if (!dados) return urlBase

    try {
      const cfgEnvio = cfgOverride || config
      const payload = serializarCompactoOrcamento(dados, cfgEnvio)
      return payload ? \`\${urlBase}&d=\${payload}\` : urlBase
    } catch {
      return urlBase
    }
  }`

if (c.includes('cfgOverride?: ConfiguracaoSistema')) {
  console.log('gerarLinkDocumento already patched')
} else if (c.includes(oldFn)) {
  c = c.replace(oldFn, newFn)
  fs.writeFileSync(file, c, 'utf8')
  console.log('Patched gerarLinkDocumento')
} else {
  console.error('gerarLinkDocumento pattern not found')
  process.exit(1)
}
