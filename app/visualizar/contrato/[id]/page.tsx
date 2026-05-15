'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

import ContratoDocumentoPage from '@/components/documentos/ContratoDocumentoPage'

export default function VisualizarContratoPublicoPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff' }}>
          <Loader2 className="animate-spin" size={32} />
        </div>
      }
    >
      <ContratoDocumentoPage />
    </Suspense>
  )
}
