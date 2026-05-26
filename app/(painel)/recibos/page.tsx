'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ReciboEmitidoView, type DadosReciboEmitido } from '@/components/recibos/ReciboEmitidoView'
import { abrirReciboPdfEmNovaJanela } from '@/lib/recibo-print-html'
import { abrirWhatsappAposPrepararLink } from '@/lib/abrirExterno'
import {
  gerarLinkPublicoRecibo,
  montarMensagemWhatsappRecibo,
  normalizarTelefoneWhatsapp,
  RECIBO_VISUALIZACAO_KEY,
} from '@/lib/recibo-publico'

export default function RecibosPage() {
  const router = useRouter()
  const [dados, setDados] = useState<DadosReciboEmitido | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECIBO_VISUALIZACAO_KEY)
      if (raw) setDados(JSON.parse(raw))
    } catch {}
    setCarregado(true)
  }, [])

  async function enviarWhatsApp() {
    if (!dados || loadingWhatsapp) return
    const telefone = normalizarTelefoneWhatsapp(dados?.clienteTelefone)
    setLoadingWhatsapp(true)
    try {
      await abrirWhatsappAposPrepararLink({
        telefone,
        linkRapido: '',
        prepararLinkCompleto: async () => gerarLinkPublicoRecibo(dados),
        montarMensagem: (link) => montarMensagemWhatsappRecibo(dados, link),
      })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Não foi possível enviar pelo WhatsApp.')
    } finally {
      setLoadingWhatsapp(false)
    }
  }

  function abrirPdf() {
    if (!dados || loadingPdf) return
    setLoadingPdf(true)
    window.setTimeout(() => {
      const ok = abrirReciboPdfEmNovaJanela(dados)
      setLoadingPdf(false)
      if (!ok) alert('Não foi possível abrir o PDF. Verifique se pop-ups estão liberados.')
    }, 80)
  }

  if (!carregado) return null

  if (!dados) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7fb' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>Nenhum recibo aberto</h2>
          <p style={{ margin: '0 0 16px', color: '#64748b' }}>Gere um recibo avulso ou abra o último recibo salvo.</p>
          <button type="button" onClick={() => router.push('/recibo-avulso')} style={{ minHeight: 44, borderRadius: 14, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 900, padding: '0 18px', cursor: 'pointer' }}>Ir para recibo avulso</button>
        </div>
      </div>
    )
  }

  return (
    <ReciboEmitidoView
      dados={dados}
      isMobile={isMobile}
      onFechar={() => router.push('/ordens-servico')}
      onVoltar={() => router.push('/recibo-avulso')}
      onNovo={() => router.push('/recibo-avulso')}
      onEnviarLink={enviarWhatsApp}
      onPdf={abrirPdf}
      loadingWhatsapp={loadingWhatsapp}
      loadingPdf={loadingPdf}
    />
  )
}
