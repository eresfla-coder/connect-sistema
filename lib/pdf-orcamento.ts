import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Item = {
  nome: string
  quantidade: number
  preco: number
  total: number
}

type EmpresaPdf = {
  nome_empresa?: string | null
  cnpj_cpf?: string | null
  endereco?: string | null
  telefone?: string | null
  email?: string | null
  logo_url?: string | null
}

type OrcamentoPdf = {
  cliente_nome: string
  telefone?: string
  forma_pagamento_nome?: string
  itens: Item[]
  subtotal: number
  desconto: number
  total: number
  empresa?: EmpresaPdf
}

export async function gerarPdfOrcamento(orcamento: OrcamentoPdf) {
  const doc = new jsPDF()
  const empresa = orcamento.empresa || {}

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 210, 34, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text(empresa.nome_empresa || 'ORÇAMENTO', 14, 16)

  doc.setFontSize(9)
  doc.text(empresa.cnpj_cpf || '', 14, 23)
  doc.text(empresa.telefone || '', 14, 28)

  if (empresa.logo_url) {
    try {
      const response = await fetch(empresa.logo_url)
      const blob = await response.blob()

      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      doc.addImage(base64, 'PNG', 165, 6, 28, 20)
    } catch {
      // segue sem logo
    }
  }

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(12)
  doc.text(`Cliente: ${orcamento.cliente_nome || '-'}`, 14, 46)
  doc.text(`Telefone: ${orcamento.telefone || '-'}`, 14, 53)
  doc.text(`Pagamento: ${orcamento.forma_pagamento_nome || '-'}`, 14, 60)
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 67)

  autoTable(doc, {
    startY: 77,
    head: [['Item', 'Qtd', 'Preço', 'Total']],
    body: orcamento.itens.map((item) => [
      item.nome,
      String(item.quantidade),
      `R$ ${item.preco.toFixed(2)}`,
      `R$ ${item.total.toFixed(2)}`,
    ]),
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [34, 197, 94],
      textColor: [255, 255, 255],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  })

  const finalY = (doc as any).lastAutoTable?.finalY || 120

  doc.setFontSize(12)
  doc.setTextColor(30, 41, 59)
  doc.text(`Subtotal: R$ ${orcamento.subtotal.toFixed(2)}`, 140, finalY + 12)
  doc.text(`Desconto: R$ ${orcamento.desconto.toFixed(2)}`, 140, finalY + 20)

  doc.setFontSize(14)
  doc.setTextColor(22, 163, 74)
  doc.text(`Total: R$ ${orcamento.total.toFixed(2)}`, 140, finalY + 32)

  doc.setTextColor(71, 85, 105)
  doc.setFontSize(9)

  let rodapeY = finalY + 48
  if (empresa.endereco) {
    doc.text(`Endereço: ${empresa.endereco}`, 14, rodapeY)
    rodapeY += 5
  }
  if (empresa.email) {
    doc.text(`E-mail: ${empresa.email}`, 14, rodapeY)
  }

  const nomeArquivo = (orcamento.cliente_nome || 'cliente')
    .replace(/\s+/g, '-')
    .toLowerCase()

  doc.save(`orcamento-${nomeArquivo}.pdf`)
}