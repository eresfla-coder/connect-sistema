import fs from 'fs'
import path from 'path'

const file = path.join(process.cwd(), 'app/(painel)/ordens-servico/page.tsx')
let c = fs.readFileSync(file, 'utf8')

const oldBtn = `                            <button type="button" className="connect-os-action-btn" title="WhatsApp" onClick={() => void enviarWhatsAppOS(itemCorrigido)} style={mobileActionButton(colors, 'green')}>
                              📲 Zap
                            </button>`

const newBtn = `                            <button
                              type="button"
                              className={\`connect-os-action-btn connect-zap-btn\${zapOsCarregando === itemCorrigido.id ? ' connect-zap-btn--loading' : ''}\`}
                              title="WhatsApp"
                              disabled={zapOsCarregando === itemCorrigido.id}
                              onClick={() => void enviarWhatsAppOS(itemCorrigido)}
                              style={mobileActionButton(colors, 'green')}
                            >
                              {zapOsCarregando === itemCorrigido.id ? '⏳ Abrindo…' : '📲 Zap'}
                            </button>`

if (!c.includes(oldBtn)) {
  if (c.includes('⏳ Abrindo…')) {
    console.log('OS mobile Zap button already patched')
    process.exit(0)
  }
  console.error('Pattern not found in ordens-servico/page.tsx')
  process.exit(1)
}

c = c.replace(oldBtn, newBtn)
fs.writeFileSync(file, c, 'utf8')
console.log('Patched OS mobile WhatsApp button')
