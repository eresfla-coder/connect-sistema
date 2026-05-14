'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

const STORAGE_KEY = 'connect_ordens_servico_salvas'

function configPublicaOS() {
  try {
    const raw = localStorage.getItem('connect_configuracoes')
    const cfg = raw ? JSON.parse(raw) : {}
    return {
      nomeEmpresa: cfg?.nomeEmpresa || 'LOJA CONNECT',
      telefone: cfg?.celularEmpresa || cfg?.celular || cfg?.whatsappEmpresa || cfg?.whatsapp || cfg?.telefoneEmpresa || cfg?.telefone || '',
      whatsapp: cfg?.whatsappEmpresa || cfg?.whatsapp || cfg?.celularEmpresa || cfg?.celular || cfg?.telefoneEmpresa || cfg?.telefone || '',
      celularEmpresa: cfg?.celularEmpresa || cfg?.celular || cfg?.whatsappEmpresa || cfg?.whatsapp || cfg?.telefoneEmpresa || cfg?.telefone || '',
      telefoneEmpresa: cfg?.telefoneEmpresa || cfg?.telefone || cfg?.celularEmpresa || cfg?.celular || cfg?.whatsappEmpresa || cfg?.whatsapp || '',
      email: cfg?.email || 'lojaconnect@hotmail.com',
      endereco: cfg?.endereco || '',
      cidadeUf: cfg?.cidadeUf || '',
      logoUrl: cfg?.logoUrl || '/logo-connect.png',
    }
  } catch {
    return {
      nomeEmpresa: 'LOJA CONNECT',
      telefone: '',
      whatsapp: '',
      celularEmpresa: '',
      telefoneEmpresa: '',
      email: 'lojaconnect@hotmail.com',
      endereco: '',
      cidadeUf: '',
      logoUrl: '/logo-connect.png',
    }
  }
}

export default function OrdemServicoDetalheRedirectPage() {
  const params = useParams<{ id: string }>()

  useEffect(() => {
    const id = String(params?.id ?? '').trim()
    if (!id) return

    async function abrirPublico() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const lista = raw ? JSON.parse(raw) : []
        const item = Array.isArray(lista) ? lista.find((os) => String(os?.id) === id) : null
        const payload = item ? { ...item, cfg: configPublicaOS() } : null
        const tokenLocal = Array.from(crypto.getRandomValues(new Uint8Array(12)))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')

        if (payload) {
          const resp = await fetch('/api/public-docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              document_type: 'ordem_servico',
              document_id: id,
              token: tokenLocal,
              payload,
            }),
          })

          if (resp.ok) {
            const json = await resp.json().catch(() => null)
            const token = String(json?.token || tokenLocal).trim()
            if (token) {
              window.location.replace(`/view/os/${id}?token=${encodeURIComponent(token)}`)
              return
            }
          }
        }
      } catch {}

      window.location.replace(`/view/os/${id}`)
    }

    void abrirPublico()
  }, [params])

  return <div style={{ padding: 24, color: '#334155' }}>Abrindo visualização da OS...</div>
}
