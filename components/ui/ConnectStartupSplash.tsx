'use client'

type Props = {
  primaryMessage?: string
  secondaryMessage?: string
}

const STARTUP_BG = '#f3f6fb'

export default function ConnectStartupSplash({
  primaryMessage = 'Preparando seu ambiente...',
  secondaryMessage = 'Carregando seus dados e configurações...',
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="connect-startup-splash"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))',
        backgroundColor: STARTUP_BG,
        color: '#334155',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        textAlign: 'center',
      }}
    >
      <img
        src="/logo-connect.png?v=90"
        alt="Connect — Gerador de Orçamentos e OS"
        width={120}
        height={120}
        style={{
          width: 'min(120px, 32vw)',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: 20,
          display: 'block',
        }}
      />

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
            fontWeight: 900,
            letterSpacing: '0.18em',
            color: '#0f172a',
          }}
        >
          CONNECT
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(0.95rem, 3.2vw, 1.125rem)',
            fontWeight: 700,
            color: '#475569',
          }}
        >
          Gerador de Orçamentos e OS
        </p>
      </div>

      <div
        className="connect-startup-spinner motion-reduce:animate-none"
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          marginTop: 8,
          borderRadius: '50%',
          border: '3px solid #dbeafe',
          borderTopColor: '#2563eb',
        }}
      />

      <div style={{ display: 'grid', gap: 6, marginTop: 4, maxWidth: 360 }}>
        <p style={{ margin: 0, fontSize: 'clamp(0.95rem, 3.2vw, 1rem)', fontWeight: 800, color: '#1e293b' }}>
          {primaryMessage}
        </p>
        <p style={{ margin: 0, fontSize: 'clamp(0.85rem, 2.8vw, 0.95rem)', fontWeight: 600, color: '#64748b' }}>
          {secondaryMessage}
        </p>
      </div>
    </div>
  )
}
