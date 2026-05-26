'use client'

type Props = {
  label?: string
  compact?: boolean
}

export default function ConnectLoading({ label = 'Carregando...', compact = false }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: compact ? 120 : '40vh',
        display: 'grid',
        placeItems: 'center',
        gap: 14,
        padding: 24,
        color: '#334155',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <div
        className="connect-loading-spinner"
        style={{
          width: compact ? 36 : 48,
          height: compact ? 36 : 48,
          borderRadius: '50%',
          border: '3px solid #dbeafe',
          borderTopColor: '#2563eb',
        }}
      />
      <span style={{ fontWeight: 800, fontSize: compact ? 14 : 16 }}>{label}</span>
      <style jsx global>{`
        .connect-loading-spinner {
          animation: connect-spin 0.85s linear infinite;
        }
        @keyframes connect-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
