'use client'

import { useState } from 'react'

export default function TesteSupabasePage() {
  const [resultado, setResultado] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function testar() {
    setLoading(true)
    setResultado(null)

    try {
      const resp = await fetch('/api/teste-supabase', {
        cache: 'no-store',
      })

      const data = await resp.json()
      setResultado(data)
    } catch (error: any) {
      setResultado({
        ok: false,
        etapa: 'pagina',
        erro: error?.message || 'Erro ao chamar /api/teste-supabase',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#fff',
        padding: 24,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0 }}>Teste Supabase</h1>

        <button
          onClick={testar}
          disabled={loading}
          style={{
            height: 46,
            padding: '0 18px',
            borderRadius: 12,
            border: 'none',
            background: '#f97316',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {loading ? 'Testando...' : 'Executar teste'}
        </button>

        <pre
          style={{
            marginTop: 20,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#020617',
            border: '1px solid #1e293b',
            borderRadius: 12,
            padding: 16,
            minHeight: 180,
          }}
        >
          {resultado ? JSON.stringify(resultado, null, 2) : 'Sem resultado ainda.'}
        </pre>
      </div>
    </div>
  )
}