'use client'

type Props = {
  titulo: string
  descricao?: string
  icone?: string
  acao?: React.ReactNode
}

export default function ConnectEmpty({ titulo, descricao, icone = '📋', acao }: Props) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '32px 20px',
        borderRadius: 20,
        border: '1px dashed rgba(148,163,184,.45)',
        background: 'linear-gradient(180deg,#f8fafc,#fff)',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 10 }}>{icone}</div>
      <div style={{ fontSize: 18, fontWeight: 950, color: '#0f172a' }}>{titulo}</div>
      {descricao ? (
        <p style={{ margin: '8px auto 0', maxWidth: 420, color: '#64748b', fontWeight: 700, lineHeight: 1.45, fontSize: 14 }}>
          {descricao}
        </p>
      ) : null}
      {acao ? <div style={{ marginTop: 16 }}>{acao}</div> : null}
    </div>
  )
}
