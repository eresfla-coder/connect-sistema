import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const root = path.resolve(import.meta.dirname, '..')
const dest = path.join(root, 'entrega-revert-whatsapp-config-supabase')
const files = [
  'lib/abrirExterno.ts',
  'lib/configuracaoEmpresa.ts',
  'app/(painel)/configuracoes/page.tsx',
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
const zip = path.join(root, 'entrega-revert-whatsapp-config-supabase.zip')
if (fs.existsSync(zip)) fs.unlinkSync(zip)
execSync(`powershell -Command "Compress-Archive -Path '${dest}' -DestinationPath '${zip}' -Force"`, { cwd: root })
console.log(zip, fs.statSync(zip).size)
