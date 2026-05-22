import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'

type Item = {
  nome: string
  quantidade: number
  preco: number
  total: number
}

type OrcamentoWhatsapp = {
  cliente_nome: string
  telefone?: string
  itens: Item[]
  total: number
  empresa?: {
    nome_empresa?: string
    telefone?: string
  }
}

export function enviarWhatsapp(orcamento: OrcamentoWhatsapp) {
  let mensagem = `*${orcamento.empresa?.nome_empresa || 'ORÇAMENTO'}*\n\n`

  mensagem += `Cliente: ${orcamento.cliente_nome}\n`

  if (orcamento.telefone) {
    mensagem += `Telefone: ${orcamento.telefone}\n`
  }

  mensagem += `\n*Itens:*\n`

  orcamento.itens.forEach((item) => {
    mensagem += `• ${item.nome}\n`
    mensagem += `  ${item.quantidade} x R$ ${item.preco.toFixed(2)} = R$ ${item.total.toFixed(2)}\n`
  })

  mensagem += `\n*Total: R$ ${orcamento.total.toFixed(2)}*`

  if (orcamento.empresa?.telefone) {
    mensagem += `\n\nContato da empresa: ${orcamento.empresa.telefone}`
  }

  abrirWhatsAppComTelefone(orcamento.telefone || '', mensagem)
}