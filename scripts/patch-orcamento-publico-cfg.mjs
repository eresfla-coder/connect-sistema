import fs from 'fs'
import path from 'path'

const file = path.join(process.cwd(), 'app/(painel)/orcamentos/page.tsx')
let c = fs.readFileSync(file, 'utf8')

const from = '    return gerarLinkDocumento(id, dados)\n  }\n\n  function visualizarOrcamentoInterno'
const to = '    return gerarLinkDocumento(id, dados, cfgPublica)\n  }\n\n  function visualizarOrcamentoInterno'

if (c.includes('gerarLinkDocumento(id, dados, cfgPublica)')) {
  console.log('cfgPublica fallback already set')
} else if (c.includes(from)) {
  c = c.replace(from, to)
  fs.writeFileSync(file, c, 'utf8')
  console.log('Patched gerarLinkDocumentoPublico fallback')
} else {
  console.error('pattern not found')
  process.exit(1)
}
