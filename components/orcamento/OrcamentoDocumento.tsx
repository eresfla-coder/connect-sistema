'use client'

export default function OrcamentoDocumento({ dados, config }: any) {
  if (!dados) return null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', background: '#fff', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <strong>{config?.nomeEmpresa || 'LOJA CONNECT'}</strong>
        </div>

        <div style={{ textAlign: 'right', fontSize: 12 }}>
          <div>{config?.endereco || 'Endereço não informado'}</div>
          <div>{config?.cidadeUf || ''}</div>
          <div>{config?.telefone || ''}</div>
        </div>
      </div>

      <h2 style={{ textAlign: 'center', marginBottom: 20 }}>
        {dados?.titulo || 'PROPOSTA COMERCIAL PREMIUM'}
      </h2>

      <table style={{ width: '100%', marginTop: 20, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ padding: 8 }}>Descrição</th>
            <th>Qtd</th>
            <th>Valor</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {(dados?.itens || []).map((item: any, i: number) => (
            <tr key={i}>
              <td style={{ padding: 8 }}>{item.nome}</td>
              <td style={{ textAlign: 'center' }}>{item.quantidade}</td>
              <td style={{ textAlign: 'center' }}>R$ {item.valor}</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                R$ {item.total ?? item.quantidade * item.valor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 30, textAlign: 'right' }}>
        <span
          style={{
            background: '#fde68a',
            padding: '8px 14px',
            borderRadius: 6,
            fontWeight: 'bold',
            fontSize: 18,
          }}
        >
          Total: R$ {dados?.total || 0}
        </span>
      </div>

      <div style={{ marginTop: 20 }}>
        <strong>Observações:</strong>
        <p>{dados?.obs || dados?.observacao || 'Obrigado pela preferência.'}</p>
      </div>
    </div>
  )
}