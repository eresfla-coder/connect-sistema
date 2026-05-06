'use client'

export default function DocumentoLayout({
  titulo,
  children
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: 20 }}>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 'bold',
          marginBottom: 20,
          color: '#ffffff',
          textShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        {titulo}
      </h1>

      <div
        style={{
          background: 'white',
          padding: 20,
          borderRadius: 12,
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
        }}
      >
        {children}
      </div>
    </div>
  )
}
