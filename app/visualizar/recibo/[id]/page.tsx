'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { ReciboEmitidoView, type DadosReciboEmitido } from '@/components/recibos/ReciboEmitidoView'
import { abrirReciboPdfEmNovaJanela } from '@/lib/recibo-print-html'

function ReciboPublicoInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = String(params?.id || '').trim()
  const token = String(searchParams.get('token') || '').trim()

  const [dados, setDados] = useState<DadosReciboEmitido | null>(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    let vivo = true

    async function carregar() {
      setLoading(true)
      setErro('')
      setDados(null)

      if (!id || !token) {
        if (vivo) {
          setErro('Este link está incompleto. Peça ao emitente um novo link com o código de acesso.')
          setLoading(false)
        }
        return
      }

      try {
        const url = `/api/public-docs?document_type=recibo&document_id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`
        const resp = await fetch(url, { cache: 'no-store' })
        if (!resp.ok) {
          if (vivo) {
            setErro('Recibo não encontrado ou link inválido. Peça um novo link ao emitente.')
            setLoading(false)
          }
          return
        }
        const row = await resp.json()
        const payload = row?.payload
        if (!payload || typeof payload !== 'object') {
          if (vivo) {
            setErro('Não foi possível carregar os dados deste recibo.')
            setLoading(false)
          }
          return
        }
        const { token: _t, user_id: _u, owner_user_id: _o, ...rest } = payload as Record<string, unknown>
        if (vivo) {
          setDados(rest as DadosReciboEmitido)
          setLoading(false)
        }
      } catch {
        if (vivo) {
          setErro('Erro ao carregar o recibo. Verifique sua conexão e tente de novo.')
          setLoading(false)
        }
      }
    }

    void carregar()
    return () => {
      vivo = false
    }
  }, [id, token])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,#f4f7fb 0%,#eaf1fb 100%)' }}>
        <Loader2 className="animate-spin" size={36} color="#2563eb" />
      </div>
    )
  }

  if (erro || !dados) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,#f4f7fb 0%,#eaf1fb 100%)', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 420, color: '#334155', fontSize: 16, lineHeight: 1.5, fontWeight: 600 }}>{erro || 'Recibo não encontrado.'}</div>
      </div>
    )
  }

  return (
    <ReciboEmitidoView
      dados={dados}
      isMobile={isMobile}
      showEnviarLink={false}
      onFechar={() => {
        window.close()
      }}
      onVoltar={() => {
        if (window.history.length > 1) window.history.back()
        else window.close()
      }}
      onNovo={() => {}}
      onEnviarLink={() => {}}
      onPdf={() => abrirReciboPdfEmNovaJanela(dados)}
    />
  )
}

export default function VisualizarReciboPublicoPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,#f4f7fb 0%,#eaf1fb 100%)' }}>
          <Loader2 className="animate-spin" size={36} color="#2563eb" />
        </div>
      }
    >
      <ReciboPublicoInner />
    </Suspense>
  )
}
