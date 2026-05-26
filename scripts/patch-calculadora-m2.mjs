import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/(painel)/produtos/page.tsx')
let s = fs.readFileSync(p, 'utf8')

if (!s.includes("from '@/components/produtos/CalculadoraPrecoM2Modal'")) {
  s = s.replace(
    "import { useEffect, useMemo, useState, type CSSProperties } from 'react'\n",
    "import { useEffect, useMemo, useState, type CSSProperties } from 'react'\nimport { CalculadoraPrecoM2Modal } from '@/components/produtos/CalculadoraPrecoM2Modal'\nimport { ProdutosFabMenu } from '@/components/produtos/ProdutosFabMenu'\n",
  )
}

if (!s.includes('calculadoraM2Aberta')) {
  s = s.replace(
    'const [drawerAberto, setDrawerAberto] = useState(false)\n',
    'const [drawerAberto, setDrawerAberto] = useState(false)\n  const [calculadoraM2Aberta, setCalculadoraM2Aberta] = useState(false)\n',
  )
}

if (!s.includes('function abrirCalculadoraM2')) {
  s = s.replace(
    `  function aplicarPrecoSugerido() {
    if (calculoAtual.precoSugerido <= 0) return
    setPreco(formatarDecimalVisual(calculoAtual.precoSugerido))
  }

  function salvarProduto()`,
    `  function aplicarPrecoSugerido() {
    if (calculoAtual.precoSugerido <= 0) return
    setPreco(formatarDecimalVisual(calculoAtual.precoSugerido))
  }

  function abrirCalculadoraM2() {
    if (!drawerAberto) {
      if (!editandoId) {
        limparFormulario()
        setTipoCadastro('produto')
        setTipoCalculo('m2')
      }
      setDrawerAberto(true)
    }
    setCalculadoraM2Aberta(true)
  }

  function aplicarPrecoCalculadoM2(valor: number) {
    setPreco(formatarDecimalVisual(Number(valor.toFixed(2))))
    if (tipoCadastro !== 'servico') setTipoCalculo('m2')
  }

  const labelPrecoVenda = tipoCalculo === 'm2' ? 'Preço de venda por m²' : 'Preço de venda'

  function salvarProduto()`,
  )
}

fs.writeFileSync(p, s)
console.log('ok')
