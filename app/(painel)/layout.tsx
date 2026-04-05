'use client'

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      
      {/* SIDEBAR */}
      <aside
        style={{
          width: 220,
          background: '#111',
          color: '#fff',
          padding: 16,
        }}
      >
        <h2 style={{ marginBottom: 20 }}>Painel</h2>

        <button
          onClick={() => alert('logout')}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 8,
            border: 'none',
            background: '#ff4d4f',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </aside>

      {/* CONTEÚDO */}
      <main
        style={{
          flex: 1,
          background: '#020617',
          padding: 16,
        }}
      >
        {children}
      </main>
    </div>
  )
}