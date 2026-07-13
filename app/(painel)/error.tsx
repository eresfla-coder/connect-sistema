'use client'

export default function PainelError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        textAlign: 'center',
        color: '#0f172a',
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 950 }}>Algo travou nesta tela</h1>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
          Seus dados continuam salvos. Recarregue a página para continuar.
        </p>
        {error?.message ? (
          <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 12, wordBreak: 'break-word' }}>
            {error.message}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginRight: 8,
            padding: '12px 18px',
            borderRadius: 12,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 18px',
            borderRadius: 12,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#0f172a',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Recarregar
        </button>
      </div>
    </div>
  )
}
