'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { showConnectToast } from '@/components/ui/ConnectToast'

export type PixCheckoutDados = {
  pagamentoId: string
  paymentId?: string
  qrCode: string
  qrCodeBase64?: string
  valor: number
  tier: string
}

type Props = {
  aberto: boolean
  dados: PixCheckoutDados | null
  onFechar: () => void
  onAprovado: () => void
}

export function PixPagamentoPanel({ aberto, dados, onFechar, onAprovado }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [status, setStatus] = useState('pending')

  const verificarStatus = useCallback(async () => {
    if (!dados?.pagamentoId) return
    setConsultando(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) return

      const res = await fetch(`/api/mercado-pago/pix?pagamentoId=${encodeURIComponent(dados.pagamentoId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.ok) return

      const st = String(payload.status || '').toLowerCase()
      setStatus(st)

      if (payload.aprovado || st === 'approved') {
        showConnectToast('Pagamento PIX confirmado! Seu plano foi liberado.', 'success')
        onAprovado()
        onFechar()
      }
    } finally {
      setConsultando(false)
    }
  }, [dados?.pagamentoId, onAprovado, onFechar])

  useEffect(() => {
    if (!aberto || !dados?.pagamentoId) return
    setStatus('pending')
    setCopiado(false)
    void verificarStatus()
    const timer = window.setInterval(() => void verificarStatus(), 6000)
    return () => window.clearInterval(timer)
  }, [aberto, dados?.pagamentoId, verificarStatus])

  if (!aberto || !dados) return null

  const qrSrc = dados.qrCodeBase64
    ? dados.qrCodeBase64.startsWith('data:')
      ? dados.qrCodeBase64
      : `data:image/png;base64,${dados.qrCodeBase64}`
    : ''

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15,23,42,.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
      onClick={onFechar}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 24px 60px rgba(15,23,42,.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase', color: '#16a34a' }}>
              PIX — Plano {String(dados.tier).toUpperCase()}
            </div>
            <h2 style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 950, color: '#0f172a' }}>Pague com PIX</h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 20,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: '12px 0 0', color: '#475569', fontSize: 14, fontWeight: 700, lineHeight: 1.45 }}>
          Após pagar, seu plano será liberado automaticamente em até alguns minutos.
        </p>

        <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 800, color: '#64748b' }}>
          Status:{' '}
          <span style={{ color: status === 'approved' ? '#16a34a' : '#d97706' }}>
            {status === 'approved' ? 'Pago' : 'Aguardando pagamento'}
          </span>
        </p>

        {qrSrc ? (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <img
              src={qrSrc}
              alt="QR Code PIX"
              width={220}
              height={220}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}
            />
          </div>
        ) : null}

        {dados.qrCode ? (
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 6 }}>
              Copia e cola
            </label>
            <textarea
              readOnly
              value={dados.qrCode}
              style={{
                width: '100%',
                minHeight: 88,
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                padding: 12,
                fontSize: 12,
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(dados.qrCode).then(() => {
                  setCopiado(true)
                  showConnectToast('Código PIX copiado.', 'success')
                  setTimeout(() => setCopiado(false), 2000)
                })
              }}
              style={{
                marginTop: 8,
                width: '100%',
                minHeight: 42,
                border: 'none',
                borderRadius: 12,
                background: 'linear-gradient(135deg,#16a34a,#15803d)',
                color: '#fff',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {copiado ? 'Copiado!' : 'Copiar código PIX'}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          disabled={consultando}
          onClick={() => void verificarStatus()}
          style={{
            marginTop: 12,
            width: '100%',
            minHeight: 40,
            borderRadius: 12,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#0f172a',
            fontWeight: 800,
            cursor: consultando ? 'wait' : 'pointer',
          }}
        >
          {consultando ? 'Verificando...' : 'Já paguei — verificar agora'}
        </button>
      </div>
    </div>
  )
}
