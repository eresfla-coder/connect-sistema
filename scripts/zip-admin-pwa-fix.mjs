import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const root = path.resolve(import.meta.dirname, '..')
const dest = path.join(root, 'entrega-admin-pwa-fix')
const files = [
  'lib/access.ts',
  'lib/abrirExterno.ts',
  'lib/assinaturaAcesso.ts',
  'lib/assinaturaServer.ts',
  'lib/verificarAcesso.ts',
  'hooks/useAssinatura.ts',
  'app/api/assinatura/status/route.ts',
  'app/(painel)/layout.tsx',
  'app/(painel)/planos/page.tsx',
  'app/(painel)/components/painel/PainelShell.tsx',
  'components/assinatura/TrialBanner.tsx',
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
const zip = path.join(root, 'entrega-admin-pwa-fix.zip')
if (fs.existsSync(zip)) fs.unlinkSync(zip)
execSync(`powershell -Command "Compress-Archive -Path '${dest}' -DestinationPath '${zip}' -Force"`, { cwd: root })
console.log(zip, fs.statSync(zip).size)
