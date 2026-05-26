import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const root = path.resolve(import.meta.dirname, '..')
const dest = path.join(root, 'entrega-whatsapp-mobile-os-orcamento')
const files = [
  'lib/abrirExterno.ts',
  'components/WhatsAppFallbackBar.tsx',
  'app/(painel)/ordens-servico/page.tsx',
  'app/(painel)/orcamentos/page.tsx',
  'app/(painel)/contratos/page.tsx',
  'app/(painel)/recibo-avulso/page.tsx',
  'components/documentos/OrcamentoDocumentoPage.tsx',
]

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })

for (const f of files) {
  const target = path.join(dest, f)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(root, f), target)
}

const zip = path.join(root, 'entrega-whatsapp-mobile-os-orcamento.zip')
if (fs.existsSync(zip)) fs.unlinkSync(zip)
execSync(`powershell -Command "Compress-Archive -Path '${dest}' -DestinationPath '${zip}' -Force"`, { cwd: root })
console.log('ZIP:', zip, fs.statSync(zip).size, 'bytes')
