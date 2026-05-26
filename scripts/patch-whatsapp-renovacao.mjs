import fs from 'fs'
import path from 'path'

const root = process.cwd()

function patch(file, replacements) {
  const full = path.join(root, file)
  let c = fs.readFileSync(full, 'utf8')
  let changed = false
  for (const [from, to] of replacements) {
    if (c.includes(to)) continue
    if (!c.includes(from)) {
      console.error(`[${file}] NOT FOUND:`, from.slice(0, 80))
      process.exit(1)
    }
    c = c.replace(from, to)
    changed = true
  }
  if (changed) {
    fs.writeFileSync(full, c, 'utf8')
    console.log('OK', file)
  } else console.log('skip', file)
}

patch('app/(painel)/ordens-servico/page.tsx', [
  [
    `    setZapOsCarregando(item.id)
    try {
      const link = await linkPublicoOS(item)

      let mensagem = \`Olá \${item.cliente || 'cliente'}!\\n\\n\`
      mensagem += \`Segue sua ordem de serviço *\${item.numero}*.\\n\`

      if (item.equipamento) mensagem += \`Equipamento: \${item.equipamento}\\n\`
      if (item.status) mensagem += \`Status: \${item.status}\\n\`

      mensagem += \`Valor: \${moeda(item.valor)}\\n\`
      mensagem += \`Saldo: \${moeda(item.saldo)}\\n\\n\`
      mensagem += \`Acesse aqui:\\n\${link}\`

      const url = \`https://wa.me/\${telefone}?text=\${encodeURIComponent(mensagem)}\`
      abrirWhatsappUrl(url)
    } finally {
      window.setTimeout(() => setZapOsCarregando(null), 500)
    }`,
    `    setZapOsCarregando(item.id)
    try {
      await abrirWhatsappAposPrepararLink({
        telefone,
        linkRapido: linkFallbackOS(item),
        prepararLinkCompleto: () => linkPublicoOS(item),
        montarMensagem: (link) => {
          let mensagem = \`Olá \${item.cliente || 'cliente'}!\\n\\n\`
          mensagem += \`Segue sua ordem de serviço *\${item.numero}*.\\n\`
          if (item.equipamento) mensagem += \`Equipamento: \${item.equipamento}\\n\`
          if (item.status) mensagem += \`Status: \${item.status}\\n\`
          mensagem += \`Valor: \${moeda(item.valor)}\\n\`
          mensagem += \`Saldo: \${moeda(item.saldo)}\\n\\n\`
          mensagem += \`Acesse aqui:\\n\${link}\`
          return mensagem
        },
      })
    } catch {
      alert('Não foi possível abrir o WhatsApp. Tente novamente.')
    } finally {
      window.setTimeout(() => setZapOsCarregando(null), 800)
    }`,
  ],
])

patch('app/(painel)/orcamentos/page.tsx', [
  [
    `import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout } from '@/lib/abrirExterno'`,
    `import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout, montarUrlWhatsapp } from '@/lib/abrirExterno'`,
  ],
  [
    `    const destino = numero ? \`https://wa.me/\${numero}?text=\${encodeURIComponent(mensagem)}\` : \`https://wa.me/?text=\${encodeURIComponent(mensagem)}\`
    abrirWhatsappUrl(destino)`,
    `    abrirWhatsappUrl(montarUrlWhatsapp(numero, mensagem))`,
  ],
])

patch('app/(painel)/recibo-avulso/page.tsx', [
  [
    `import { useEffect, useMemo, useState } from 'react'`,
    `import { useEffect, useMemo, useState } from 'react'
import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'`,
  ],
  [
    `    const texto = encodeURIComponent(mensagem)

    const url = isMobile
      ? telefone
        ? \`whatsapp://send?phone=\${telefone}&text=\${texto}\`
        : \`whatsapp://send?text=\${texto}\`
      : telefone
        ? \`https://wa.me/\${telefone}?text=\${texto}\`
        : \`https://wa.me/?text=\${texto}\`

    if (isMobile) {
      window.location.href = url
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')`,
    `    abrirWhatsappUrl(montarUrlWhatsapp(telefone, mensagem))`,
  ],
])

patch('app/(painel)/contratos/page.tsx', [
  [
    `import { supabase } from '@/lib/supabase-browser'`,
    `import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'
import { supabase } from '@/lib/supabase-browser'`,
  ],
  [
    `    window.open(\`https://wa.me/55\${numero}?text=\${encodeURIComponent(texto)}\`, '_blank')`,
    `    abrirWhatsappUrl(montarUrlWhatsapp(\`55\${numero}\`, texto))`,
  ],
])

patch('app/(painel)/recibos/page.tsx', [
  [
    `import extenso from 'extenso'`,
    `import extenso from 'extenso'
import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'`,
  ],
  [
    `    window.open(url, '_blank')
  }`,
    `    abrirWhatsappUrl(montarUrlWhatsapp(telefone ? \`55\${telefone}\` : '', mensagem))
  }`,
  ],
])

console.log('Patches applied')
