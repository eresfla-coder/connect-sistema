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
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margem = 12

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 30, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text(empresa.nome_empresa || 'ORÇAMENTO', margem, 14)

  doc.setFontSize(9)
  doc.text(empresa.cnpj_cpf || '', margem, 21)
  doc.text(empresa.telefone || '', margem, 26)

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

      doc.addImage(base64, 'PNG', 168, 5, 26, 20)
    } catch {
      // segue sem logo
    }
  }

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(10)
  doc.text(`Cliente: ${orcamento.cliente_nome || '-'}`, margem, 42)
  doc.text(`Telefone: ${orcamento.telefone || '-'}`, margem, 48)
  doc.text(`Pagamento: ${orcamento.forma_pagamento_nome || '-'}`, 112, 42)
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 112, 48)

  autoTable(doc, {
    startY: 58,
    head: [['Item', 'Qtd', 'Preço', 'Total']],
    body: orcamento.itens.map((item) => [
      item.nome,
      String(item.quantidade),
      `R$ ${item.preco.toFixed(2)}`,
      `R$ ${item.total.toFixed(2)}`,
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 2.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [34, 197, 94],
      textColor: [255, 255, 255],
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 32 },
    },
    margin: { left: margem, right: margem, bottom: 18 },
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
  })

  const finalY = (doc as any).lastAutoTable?.finalY || 120
  let resumoY = finalY + 10

  if (resumoY > pageHeight - 42) {
    doc.addPage()
    resumoY = margem
  }

  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  doc.text(`Subtotal: R$ ${orcamento.subtotal.toFixed(2)}`, 138, resumoY)
  doc.text(`Desconto: R$ ${orcamento.desconto.toFixed(2)}`, 138, resumoY + 7)

  doc.setFontSize(13)
  doc.setTextColor(22, 163, 74)
  doc.text(`Total: R$ ${orcamento.total.toFixed(2)}`, 138, resumoY + 18)

  doc.setTextColor(71, 85, 105)
  doc.setFontSize(9)

  let rodapeY = resumoY + 30
  if (empresa.endereco) {
    doc.text(`Endereço: ${empresa.endereco}`, margem, rodapeY)
    rodapeY += 5
  }
  if (empresa.email) {
    doc.text(`E-mail: ${empresa.email}`, margem, rodapeY)
  }

  const nomeArquivo = (orcamento.cliente_nome || 'cliente')
    .replace(/\s+/g, '-')
    .toLowerCase()

  doc.save(`orcamento-${nomeArquivo}.pdf`)
}