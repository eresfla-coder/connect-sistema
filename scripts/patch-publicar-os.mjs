import fs from 'fs'
const p = 'app/(painel)/ordens-servico/page.tsx'
let c = fs.readFileSync(p, 'utf8')
if (!c.includes("tipo: 'ordem_servico'")) {
  c = c.replace(
    `body: JSON.stringify({
          document_type: 'ordem_servico',`,
    `body: JSON.stringify({
          tipo: 'ordem_servico',
          document_type: 'ordem_servico',`
  )
  c = c.replace(
    `document_id: String(id),
          token: tokenLocal,`,
    `document_id: String(id),
          documentoId: String(id),
          token: tokenLocal,`
  )
  fs.writeFileSync(p, c)
  console.log('publicarOS patched')
} else {
  console.log('already ok')
}
