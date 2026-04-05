'use client'

type ConfigRecibo = {
  nomeEmpresa?: string
  cidadeUf?: string
  telefone?: string
  responsavel?: string
  corPrimaria?: string
  logo?: string
  logoUrl?: string
  empresaLogo?: string
}

type Props = {
  os: any
  configuracoes?: ConfigRecibo
  style?: React.CSSProperties
  label?: string
}

export default function AbrirReciboButton({
  os,
  configuracoes,
  style,
  label = '🧾 Gerar recibo',
}: Props) {
  function abrirRecibo() {
    const dadosRecibo = {
      nomeCliente:
        os?.nomeCliente ||
        os?.cliente ||
        'Cliente não informado',

      clienteTelefone:
        os?.telefone ||
        os?.whatsapp ||
        '',

      referente:
        os?.servicoExecutado ||
        os?.descricao ||
        os?.equipamento ||
        os?.modelo ||
        'Serviço realizado',

      valorNumero:
        os?.valorPago ||
        os?.valor ||
        os?.total ||
        os?.valorTotal ||
        0,

      dataRecibo: new Date().toISOString().slice(0, 10),

      formaPagamento:
        os?.formaPagamento ||
        os?.pagamento ||
        'Dinheiro',

      config: {
        nomeEmpresa: configuracoes?.nomeEmpresa || 'LOJA CONNECT',
        cidadeUf: configuracoes?.cidadeUf || 'PARNAMIRIM-RN',
        telefone: configuracoes?.telefone || '84992181399',
        responsavel: configuracoes?.responsavel || 'ERES FAUSTINO',
        corPrimaria: configuracoes?.corPrimaria || '#22c55e',
        logo: configuracoes?.logo || '',
        logoUrl: configuracoes?.logoUrl || '',
        empresaLogo: configuracoes?.empresaLogo || '',
      },
    }

    localStorage.setItem(
      'connect_recibo_visualizacao',
      JSON.stringify(dadosRecibo)
    )

    // força sempre o layout novo
    window.open('/recibos', '_blank')
  }

  return (
    <button type="button" onClick={abrirRecibo} style={style}>
      {label}
    </button>
  )
}