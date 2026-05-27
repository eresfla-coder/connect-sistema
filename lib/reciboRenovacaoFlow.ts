import type { DadosReciboEmitido } from '@/components/recibos/ReciboEmitidoView'
import { abrirReciboPdfEmNovaJanela } from '@/lib/recibo-print-html'
import {
  formatarDataBr,
  formatarMoedaBr,
  type ReciboRenovacaoManual,
} from '@/lib/renovacaoManual'
import { gerarLinkPublicoRecibo, RECIBO_VISUALIZACAO_KEY } from '@/lib/recibo-publico'

export function reciboRenovacaoParaEmitido(
  recibo: ReciboRenovacaoManual,
  extras?: {
    telefoneCliente?: string | null
    nomeSistema?: string
    nomeEmpresaEmissora?: string
  },
): DadosReciboEmitido {
  const sistema = String(extras?.nomeSistema || 'Connect Sistema').trim()
  const emissora = String(extras?.nomeEmpresaEmissora || 'Connect Sistemas').trim()

  const observacao = [
    `Recibo nº ${recibo.numero}`,
    `Plano: ${recibo.plano}`,
    `Validade até ${formatarDataBr(recibo.validadeAte)}`,
    recibo.clienteEmail ? `E-mail: ${recibo.clienteEmail}` : '',
    recibo.observacao || '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    nomeCliente: recibo.clienteNome || 'Cliente',
    clienteTelefone: String(extras?.telefoneCliente || '').trim(),
    referente: `Renovação manual — ${sistema}`,
    valorNumero: recibo.valor,
    dataRecibo: recibo.dataPagamento,
    formaPagamento: recibo.formaPagamento,
    observacao,
    config: {
      nomeEmpresa: emissora,
      responsavel: emissora,
      cidadeUf: 'Parnamirim/RN',
      telefone: '',
      corPrimaria: '#16a34a',
      corSecundaria: '#f0fdf4',
      logoUrl: '/logo-connect.png',
    },
  }
}

export function persistirReciboRenovacaoLocal(dados: DadosReciboEmitido) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(RECIBO_VISUALIZACAO_KEY, JSON.stringify(dados))
  } catch (error) {
    console.warn('[RECIBO_RENOVACAO] falha ao salvar local:', error)
  }
}

export async function prepararLinkPublicoReciboRenovacao(dados: DadosReciboEmitido) {
  persistirReciboRenovacaoLocal(dados)
  return gerarLinkPublicoRecibo(dados)
}

export function abrirPdfReciboRenovacao(dados: DadosReciboEmitido): boolean {
  persistirReciboRenovacaoLocal(dados)
  return abrirReciboPdfEmNovaJanela(dados)
}

export function montarMensagemWhatsappReciboRenovacao(
  recibo: ReciboRenovacaoManual,
  linkPublico?: string,
) {
  const linhas = [
    `Olá ${recibo.clienteNome || 'cliente'}!`,
    '',
    `Recibo da renovação ${recibo.plano} — ${formatarMoedaBr(recibo.valor)}.`,
    `Pagamento: ${recibo.formaPagamento} em ${formatarDataBr(recibo.dataPagamento)}.`,
    `Validade até ${formatarDataBr(recibo.validadeAte)}.`,
    `Nº ${recibo.numero}.`,
  ]
  if (linkPublico?.trim()) {
    linhas.push('', '🔗 Ver recibo:', linkPublico.trim())
  }
  return linhas.join('\n')
}
