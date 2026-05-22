'use client'

import { useEffect, useMemo, useState } from 'react'
import { carregarDadosAdminAssinatura } from '@/lib/admin-dados-assinatura'
import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'
import {
  calcularMetricasFinanceiras,
  gerarGraficoMensalPadrao,
  type MetricasFinanceiras,
} from '@/lib/financeiro-admin'
import FinanceiroPremiumPainel from './premium/FinanceiroPremiumPainel'

/** Rota oficial: /admin/financeiro — painel AAA integrado via FinanceiroPremiumPainel */
export default function AdminFinanceiroPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [adminLiberado, setAdminLiberado] = useState(true)
  const [resumos, setResumos] = useState<ResumoAssinatura[]>([])
  const [metricas, setMetricas] = useState<MetricasFinanceiras | null>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<ResumoAssinatura | null>(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro('')

      try {
        const dados = await carregarDadosAdminAssinatura()
        if (!ativo) return

        setAdminLiberado(dados.souAdmin)
        setResumos(dados.resumos)

        if (dados.erro) {
          setErro(dados.erro)
        }

        setMetricas(
          calcularMetricasFinanceiras(
            dados.resumos,
            dados.pagamentos,
            dados.assinaturas,
          ),
        )
      } catch {
        if (!ativo) return
        setErro('Erro inesperado ao carregar o painel financeiro.')
        setResumos([])
        setMetricas(metricasVazias())
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  const metricasExibir = useMemo(
    () => metricas ?? metricasVazias(),
    [metricas],
  )

  return (
    <div className="fp-page-root" style={{ paddingBottom: isMobile ? 20 : 0 }}>
      <FinanceiroPremiumPainel
        isMobile={isMobile}
        carregando={carregando}
        erro={erro}
        adminLiberado={adminLiberado}
        resumos={resumos}
        metricas={metricasExibir}
        clienteSelecionado={clienteSelecionado}
        onSelecionarCliente={setClienteSelecionado}
      />
    </div>
  )
}

function metricasVazias(): MetricasFinanceiras {
  return {
    faturamentoPrevistoMes: 0,
    totalRecebido: 0,
    totalAtrasado: 0,
    clientesVencendoHoje: 0,
    mrrEstimado: 0,
    ticketMedio: 0,
    graficoMensal: gerarGraficoMensalPadrao(),
    ranking: [],
  }
}
