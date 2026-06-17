import Link from 'next/link'

export const metadata = {
  title: 'Manutenção temporária',
  robots: { index: false, follow: false },
}

export default function ManutencaoPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 55%, #ffffff 100%)',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          borderRadius: 20,
          padding: 28,
          background: '#fff',
          border: '1px solid #dbeafe',
          boxShadow: '0 18px 50px rgba(37, 99, 235, 0.10)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', letterSpacing: 1.2, textTransform: 'uppercase' }}>
          Connect Sistema
        </div>
        <h1 style={{ margin: '12px 0 8px', fontSize: 28, color: '#0f172a' }}>Serviço temporariamente lento</h1>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.6, fontSize: 15 }}>
          Não conseguimos validar sua sessão a tempo. Isso costuma ocorrer quando o banco de dados está sob carga.
          Seus dados locais no navegador continuam seguros.
        </p>
        <ul style={{ margin: '18px 0 0', paddingLeft: 18, color: '#64748b', lineHeight: 1.7, fontSize: 14 }}>
          <li>Aguarde 1–2 minutos e tente novamente.</li>
          <li>Se já estiver logado, recarregue a página.</li>
          <li>Em caso de urgência, use outro navegador ou modo anônimo só para novo login.</li>
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 18px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff',
              fontWeight: 800,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Ir para login
          </Link>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 18px',
              borderRadius: 12,
              background: '#f1f5f9',
              color: '#0f172a',
              fontWeight: 800,
              textDecoration: 'none',
              fontSize: 14,
              border: '1px solid #e2e8f0',
            }}
          >
            Tentar painel novamente
          </Link>
        </div>
      </div>
    </main>
  )
}
