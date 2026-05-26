'use client'

type Props = {
  url: string | null
  onFechar: () => void
}

/** Barra fixa quando popup do WhatsApp é bloqueado (mobile/PWA). */
export default function WhatsAppFallbackBar({ url, onFechar }: Props) {
  if (!url) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 13000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '12px 14px',
        borderRadius: 14,
        background: '#0f172a',
        border: '1px solid rgba(148,163,184,0.35)',
        boxShadow: '0 16px 40px rgba(2,6,23,0.45)',
      }}
    >
      <span style={{ flex: 1, minWidth: 140, color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>
        Toque no botão para abrir o WhatsApp (atalho/PWA):
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: '10px 16px',
          borderRadius: 10,
          background: 'linear-gradient(135deg,#22c55e,#16a34a)',
          color: '#fff',
          fontWeight: 900,
          fontSize: 14,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Abrir WhatsApp
      </a>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar aviso"
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.4)',
          background: 'transparent',
          color: '#94a3b8',
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        Fechar
      </button>
    </div>
  )
}
