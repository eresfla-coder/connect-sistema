'use client'

export function CompactPageShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <h1
          style={{
            fontSize: 20,
            marginBottom: 14,
            color: '#fff',
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>

        {children}
      </div>
    </div>
  )
}

export function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        width: '100%',
        background: 'rgba(17,24,39,0.92)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.08)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      {children}
    </div>
  )
}