'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { carregarDadosAdminAssinatura } from '@/lib/admin-dados-assinatura'
import { formatarMoeda, type ResumoAssinatura } from '@/lib/assinatura-cobranca'
import CentralAdminHero from './components/CentralAdminHero'

export default function CentralAdminPage() {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [resumos, setResumos] = useState<ResumoAssinatura[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const carregarPainel = useCallback(async () => {
    setCarregando(true)
    setErro('')

    try {
      const dados = await carregarDadosAdminAssinatura()
      if (dados.erro) setErro(dados.erro)
      setResumos(dados.resumos)
    } catch {
      setErro('Não foi possível atualizar a Central Admin.')
      setResumos([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregarPainel()
  }, [carregarPainel, reloadKey])

  const stats = useMemo(() => {
    const ativos = resumos.filter((r) => r.grupo === 'ativo').length
    const atrasados = resumos.filter((r) => r.grupo === 'atrasado').length
    const vencendoHoje = resumos.filter((r) => r.grupo === 'vencendo_hoje').length
    const mrr = resumos
      .filter((r) => r.grupo === 'ativo')
      .reduce((t, r) => t + r.valorMensalidade, 0)
    return { ativos, atrasados, vencendoHoje, mrr, total: resumos.length }
  }, [resumos])

  function montarTextoResumo() {
    return [
      'Central Admin — Connect Sistema',
      `Clientes: ${stats.total}`,
      `Ativos: ${stats.ativos}`,
      `Atrasados: ${stats.atrasados}`,
      `Vencendo hoje: ${stats.vencendoHoje}`,
      `MRR estimado: ${formatarMoeda(stats.mrr)}`,
    ].join('\n')
  }

  function handleCopiarResumo() {
    const texto = montarTextoResumo()
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(texto).then(
        () => alert('Resumo copiado para a área de transferência.'),
        () => alert(texto),
      )
      return
    }
    alert(texto)
  }

  return (
    <div
      style={{
        color: '#fff',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <CentralAdminHero
          isMobile={isMobile}
          carregando={carregando}
          onNovoCliente={() => router.push('/admin/painel-cliente')}
          onAtualizarPainel={() => setReloadKey((k) => k + 1)}
          onCopiarResumo={handleCopiarResumo}
        />

        {erro ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#fecaca',
              fontWeight: 700,
            }}
          >
            {erro}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: 12,
          }}
        >
          <StatCard titulo="Total" valor={String(stats.total)} />
          <StatCard titulo="Ativos" valor={String(stats.ativos)} cor="#4ade80" />
          <StatCard titulo="Atrasados" valor={String(stats.atrasados)} cor="#f87171" />
          <StatCard titulo="MRR" valor={formatarMoeda(stats.mrr)} cor="#7dd3fc" />
        </div>

        {carregando ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 700, padding: 24 }}>
            Atualizando dados...
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({
  titulo,
  valor,
  cor = '#f8fafc',
}: {
  titulo: string
  valor: string
  cor?: string
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8' }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8, color: cor }}>{valor}</div>
    </div>
  )
}
