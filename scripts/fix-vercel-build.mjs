/**
 * Corrige imports que quebram `npm run build` no Vercel.
 * Feche os arquivos no Cursor/VS Code e rode: node scripts/fix-vercel-build.mjs
 */
import fs from 'fs'
import path from 'path'

function patch(file, replacements) {
  const full = path.join(process.cwd(), file)
  let c = fs.readFileSync(full, 'utf8')
  let changed = false
  for (const [from, to] of replacements) {
    if (c.includes(to)) continue
    if (!c.includes(from)) {
      console.error(`[${file}] trecho não encontrado:`, from.slice(0, 60))
      process.exit(1)
    }
    c = c.replace(from, to)
    changed = true
  }
  if (changed) {
    fs.writeFileSync(full, c, 'utf8')
    console.log('OK', file)
  } else {
    console.log('já OK', file)
  }
}

patch('app/(painel)/orcamentos/page.tsx', [
  [
    "import { abrirNovaAbaOuMesma, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'",
    "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'",
  ],
])

patch('app/(painel)/ordens-servico/page.tsx', [
  [
    "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, comTimeout } from '@/lib/abrirExterno'",
    "import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'",
  ],
])

console.log('\nPronto. Rode: npm run build')
