import fs from 'fs'
const p = 'components/financeiro/FinanceiroModule.tsx'
let s = fs.readFileSync(p, 'utf8')
if (!s.includes("from '@/lib/abrirExterno'")) {
  s = s.replace(
    "import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'",
    "import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'\nimport { abrirWhatsappUrl } from '@/lib/abrirExterno'"
  )
  fs.writeFileSync(p, s)
}
console.log('done')
