'use client'

import { useEffect, useMemo, useState } from 'react'

type DocumentoTipo = 'orcamento' | 'os'

type DocumentoDashboard = {
  id: string
  tipo: DocumentoTipo
  numero: string
  cliente: string
  telefone: string
  valor: number
  status: string
  criadoEm: string
  aprovado: boolean
  vendido: boolean
}

type ConfiguracoesSistema = {
  nomeSistema?: string
  subtitulo?: string
  logoUrl?: string
  whatsapp?: string
}

function formatarHorario(data: Date) {
  return data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatarDataExtensa(data: Date) {
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function parseNumero(valor: any) {
  if (typeof valor === 'number' && !Number.isNaN(valor)) return valor
  if (typeof valor === 'string') {
    const limpo = valor
      .replace(/\s/g, '')
      .replace(/R\$/gi, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim()

    const numero = Number(limpo)
    return Number.isFinite(numero) ? numero : 0
  }
  return 0
}

function normalizarTexto(valor: any) {
  return String(valor ?? '').trim()
}

function obterDataDocumento(item: any) {
  return (
    item?.criadoEm ||
    item?.createdAt ||
    item?.dataCriacao ||
    item?.data ||
    item?.dataCadastro ||
    item?.updatedAt ||
    new Date().toISOString()
  )
}

function obterNumeroDocumento(item: any, indice: number, prefixo: string) {
  return (
    normalizarTexto(item?.numero) ||
    normalizarTexto(item?.codigo) ||
    normalizarTexto(item?.id) ||
    `${prefixo}-${indice + 1}`
  )
}

function obterCliente(item: any) {
  const cliente = item?.cliente
  if (typeof cliente === 'string') return cliente
  if (cliente && typeof cliente === 'object') {
    return (
      normalizarTexto(cliente?.nome) ||
      normalizarTexto(cliente?.razaoSocial) ||
      normalizarTexto(cliente?.fantasia) ||
      'Cliente não informado'
    )
  }

  return (
    normalizarTexto(item?.clienteNome) ||
    normalizarTexto(item?.nomeCliente) ||
    normalizarTexto(item?.nome) ||
    'Cliente não informado'
  )
}

function obterTelefone(item: any) {
  const cliente = item?.cliente
  if (cliente && typeof cliente === 'object') {
    return (
      normalizarTexto(cliente?.telefone) ||
      normalizarTexto(cliente?.celular) ||
      normalizarTexto(cliente?.whatsapp) ||
      ''
    )
  }

  return (
    normalizarTexto(item?.telefone) ||
    normalizarTexto(item?.celular) ||
    normalizarTexto(item?.whatsapp) ||
    ''
  )
}

function obterValor(item: any) {
  return (
    parseNumero(item?.valorFinal) ||
    parseNumero(item?.valorTotal) ||
    parseNumero(item?.total) ||
    parseNumero(item?.valor) ||
    parseNumero(item?.subtotal) ||
    0
  )
}

function obterStatus(item: any) {
  return (
    normalizarTexto(item?.status) ||
    normalizarTexto(item?.situacao) ||
    normalizarTexto(item?.aprovacao) ||
    'gerado'
  )
}

function statusEhAprovado(status: string, item?: any) {
  const base = status.toLowerCase()

  if (item?.aprovado === true) return true
  if (item?.foiAprovado === true) return true
  if (item?.convertidoEmVenda === true) return true

  return (
    base.includes('aprov') ||
    base.includes('aceito') ||
    base.includes('conclu') ||
    base.includes('finaliz') ||
    base.includes('vend')
  )
}

function statusEhVendido(status: string, item?: any) {
  const base = status.toLowerCase()

  if (item?.vendido === true) return true
  if (item?.convertidoEmVenda === true) return true

  return base.includes('vend') || base.includes('fatur')
}

function lerJSONStorage(chave: string) {
  if (typeof window === 'undefined') return []
  try {
    const bruto = window.localStorage.getItem(chave)
    if (!bruto) return []
    const parsed = JSON.parse(bruto)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function lerConfiguracoes(): ConfiguracoesSistema {
  if (typeof window === 'undefined') return {}
  try {
    const bruto = window.localStorage.getItem('connect_configuracoes')
    if (!bruto) return {}
    const parsed = JSON.parse(bruto)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function transformarOrcamentosEmDocumentos(lista: any[]): DocumentoDashboard[] {
  return lista.map((item, indice) => {
    const status = obterStatus(item)

    return {
      id: normalizarTexto(item?.id) || `orc-${indice + 1}`,
      tipo: 'orcamento',
      numero: obterNumeroDocumento(item, indice, 'ORC'),
      cliente: obterCliente(item),
      telefone: obterTelefone(item),
      valor: obterValor(item),
      status,
      criadoEm: obterDataDocumento(item),
      aprovado: statusEhAprovado(status, item),
      vendido: statusEhVendido(status, item),
    }
  })
}

function transformarOsEmDocumentos(lista: any[]): DocumentoDashboard[] {
  return lista.map((item, indice) => {
    const status = obterStatus(item)

    return {
      id: normalizarTexto(item?.id) || `os-${indice + 1}`,
      tipo: 'os',
      numero: obterNumeroDocumento(item, indice, 'OS'),
      cliente: obterCliente(item),
      telefone: obterTelefone(item),
      valor: obterValor(item),
      status,
      criadoEm: obterDataDocumento(item),
      aprovado: statusEhAprovado(status, item),
      vendido: statusEhVendido(status, item),
    }
  })
}

function obterAnoAtual() {
  return new Date().getFullYear()
}

function obterPrimeiroDiaAnoAtual() {
  return `${obterAnoAtual()}-01-01`
}

function obterUltimoDiaAnoAtual() {
  return `${obterAnoAtual()}-12-31`
}

function converterParaDataInput(valor: string) {
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return ''
  return data.toISOString().slice(0, 10)
}

function etiquetaTipo(tipo: DocumentoTipo) {
  return tipo === 'orcamento' ? 'Orçamento' : 'Ordem de Serviço'
}

function corStatus(status: string) {
  const base = status.toLowerCase()

  if (base.includes('aprov') || base.includes('conclu') || base.includes('vend')) {
    return {
      fundo: 'rgba(34,197,94,0.18)',
      borda: 'rgba(34,197,94,0.40)',
      texto: '#86efac',
    }
  }

  if (base.includes('pend') || base.includes('anal')) {
    return {
      fundo: 'rgba(249,115,22,0.18)',
      borda: 'rgba(249,115,22,0.40)',
      texto: '#fdba74',
    }
  }

  return {
    fundo: 'rgba(148,163,184,0.16)',
    borda: 'rgba(148,163,184,0.28)',
    texto: '#cbd5e1',
  }
}

export default function DashboardPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [agora, setAgora] = useState(new Date())
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'orcamentos' | 'os'>('todos')
  const [dataInicio, setDataInicio] = useState(obterPrimeiroDiaAnoAtual())
  const [dataFim, setDataFim] = useState(obterUltimoDiaAnoAtual())
  const [documentos, setDocumentos] = useState<DocumentoDashboard[]>([])
  const [configuracoes, setConfiguracoes] = useState<ConfiguracoesSistema>({})

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const carregarDados = () => {
      const orcamentos = lerJSONStorage('connect_orcamentos_salvos')
      const ordensServico = lerJSONStorage('connect_ordens_servico_salvas')
      const config = lerConfiguracoes()

      const docs = [
        ...transformarOrcamentosEmDocumentos(orcamentos),
        ...transformarOsEmDocumentos(ordensServico),
      ].sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())

      setDocumentos(docs)
      setConfiguracoes(config)
    }

    carregarDados()
    window.addEventListener('storage', carregarDados)
    window.addEventListener('focus', carregarDados)

    return () => {
      window.removeEventListener('storage', carregarDados)
      window.removeEventListener('focus', carregarDados)
    }
  }, [])

  const documentosFiltrados = useMemo(() => {
    return documentos.filter((doc) => {
      const dataDoc = converterParaDataInput(doc.criadoEm)
      const dentroPeriodo =
        (!dataInicio || dataDoc >= dataInicio) &&
        (!dataFim || dataDoc <= dataFim)

      const dentroTipo =
        tipoFiltro === 'todos' ||
        (tipoFiltro === 'orcamentos' && doc.tipo === 'orcamento') ||
        (tipoFiltro === 'os' && doc.tipo === 'os')

      return dentroPeriodo && dentroTipo
    })
  }, [documentos, tipoFiltro, dataInicio, dataFim])

  const metricas = useMemo(() => {
    const gerados = documentosFiltrados.length
    const valorGerado = documentosFiltrados.reduce((acc, item) => acc + item.valor, 0)

    const aprovadosLista = documentosFiltrados.filter((item) => item.aprovado)
    const vendidosLista = documentosFiltrados.filter((item) => item.vendido)

    const aprovados = aprovadosLista.length
    const valorAprovado = aprovadosLista.reduce((acc, item) => acc + item.valor, 0)
    const vendidos = vendidosLista.length
    const taxaAprovacao = gerados > 0 ? (aprovados / gerados) * 100 : 0
    const taxaConversao = gerados > 0 ? (vendidos / gerados) * 100 : 0

    return {
      gerados,
      valorGerado,
      aprovados,
      valorAprovado,
      vendidos,
      taxaAprovacao,
      taxaConversao,
    }
  }, [documentosFiltrados])

  const graficoMensal = useMemo(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

    return meses.map((nome, indice) => {
      const documentosMes = documentosFiltrados.filter((doc) => {
        const data = new Date(doc.criadoEm)
        return !Number.isNaN(data.getTime()) && data.getMonth() === indice
      })

      const quantidade = documentosMes.length
      const valor = documentosMes.reduce((acc, item) => acc + item.valor, 0)

      return {
        nome,
        quantidade,
        valor,
      }
    })
  }, [documentosFiltrados])

  const maxQuantidade = Math.max(...graficoMensal.map((item) => item.quantidade), 1)
  const maxValor = Math.max(...graficoMensal.map((item) => item.valor), 1)
  const ultimosDocumentos = documentosFiltrados.slice(0, 6)

  const cards = [
    {
      titulo: 'QTDE GERADO',
      valor: String(metricas.gerados),
      descricao: 'Documentos no período',
      cor: 'linear-gradient(135deg, #ff7a00, #ff5e00)',
      brilho: 'rgba(255,190,92,0.22)',
    },
    {
      titulo: 'VALOR GERADO',
      valor: formatarMoeda(metricas.valorGerado),
      descricao: 'Soma total filtrada',
      cor: 'linear-gradient(135deg, #7c3aed, #b05cff)',
      brilho: 'rgba(205,168,255,0.20)',
    },
    {
      titulo: 'QTDE APROVADO',
      valor: String(metricas.aprovados),
      descricao: 'Aprovados ou concluídos',
      cor: 'linear-gradient(135deg, #22c55e, #56d76a)',
      brilho: 'rgba(157,255,182,0.20)',
    },
    {
      titulo: 'VALOR APROVADO',
      valor: formatarMoeda(metricas.valorAprovado),
      descricao: 'Valor dos aprovados',
      cor: 'linear-gradient(135deg, #d4a500, #f0c419)',
      brilho: 'rgba(255,238,164,0.24)',
    },
  ]

  const nomeSistema = configuracoes?.nomeSistema || 'CONNECT SISTEMA'
  const subtitulo = configuracoes?.subtitulo || 'Painel principal do sistema'
  const logoUrl = configuracoes?.logoUrl || '/logo-connect.png'

  return (
    <div
      style={{
        color: '#fff',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1320,
          margin: '0 auto',
          display: 'grid',
          gap: 18,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background:
              'radial-gradient(circle at top left, rgba(249,115,22,0.12), transparent 28%), radial-gradient(circle at top right, rgba(124,58,237,0.16), transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 30,
            padding: isMobile ? '18px 16px' : '24px 26px 30px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 320,
              height: 320,
              borderRadius: '50%',
              right: -100,
              top: -150,
              background: 'radial-gradient(circle, rgba(124,58,237,0.18), transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 240,
              height: 240,
              borderRadius: '50%',
              left: -80,
              bottom: -140,
              background: 'radial-gradient(circle, rgba(249,115,22,0.12), transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              paddingBottom: 14,
              marginBottom: 26,
              flexWrap: 'wrap',
              gap: 12,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: '#cbd5e1',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 1.6,
                  marginBottom: 6,
                }}
              >
                Horário atual
              </div>
              <div
                style={{
                  fontSize: isMobile ? 26 : 38,
                  fontWeight: 900,
                  lineHeight: 1,
                  textShadow: '0 0 20px rgba(255,255,255,0.08)',
                }}
              >
                {formatarHorario(agora)}
              </div>
            </div>

            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#cbd5e1',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 1.6,
                  marginBottom: 6,
                }}
              >
                Data atual
              </div>
              <div
                style={{
                  fontSize: isMobile ? 15 : 20,
                  fontWeight: 900,
                  textTransform: 'capitalize',
                }}
              >
                {formatarDataExtensa(agora)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 14,
              justifyItems: 'center',
              textAlign: 'center',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div
              style={{
                width: isMobile ? 118 : 152,
                height: isMobile ? 118 : 152,
                borderRadius: 36,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 22px 48px rgba(0,0,0,0.28)',
                border: '1px solid rgba(255,255,255,0.10)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <img
                src={logoUrl}
                alt={nomeSistema}
                style={{
                  width: isMobile ? 84 : 106,
                  height: isMobile ? 84 : 106,
                  objectFit: 'contain',
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: isMobile ? 29 : 52,
                  fontWeight: 900,
                  lineHeight: 1,
                  marginBottom: 8,
                  letterSpacing: 0.8,
                  textShadow: '0 0 24px rgba(255,255,255,0.04)',
                }}
              >
                {nomeSistema}
              </div>

              <div
                style={{
                  fontSize: isMobile ? 13 : 15,
                  color: '#cbd5e1',
                  fontWeight: 600,
                  opacity: 0.95,
                }}
              >
                {subtitulo}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: isMobile ? 24 : 34,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: 0.2,
          }}
        >
          Dashboard Gerencial
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 22,
            padding: 14,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.95fr 0.95fr 0.8fr',
            gap: 12,
            alignItems: 'end',
            boxShadow: '0 14px 32px rgba(0,0,0,0.16)',
            boxSizing: 'border-box',
          }}
        >
          <div>
            <div style={{ fontSize: 13, marginBottom: 8, color: '#d6d6d6', fontWeight: 700 }}>
              Documento
            </div>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as 'todos' | 'orcamentos' | 'os')}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                outline: 'none',
                padding: '0 12px',
                background: '#f3f4f6',
                color: '#111827',
                fontWeight: 800,
                boxSizing: 'border-box',
              }}
            >
              <option value="todos">Todos os Documentos</option>
              <option value="orcamentos">Orçamentos</option>
              <option value="os">Ordens de Serviço</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 13, marginBottom: 8, color: '#d6d6d6', fontWeight: 700 }}>
              De
            </div>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                outline: 'none',
                padding: '0 12px',
                background: '#f97316',
                color: '#fff',
                fontWeight: 800,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 13, marginBottom: 8, color: '#d6d6d6', fontWeight: 700 }}>
              Até
            </div>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                outline: 'none',
                padding: '0 12px',
                background: '#f97316',
                color: '#fff',
                fontWeight: 800,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={() => {
              setDataInicio(obterPrimeiroDiaAnoAtual())
              setDataFim(obterUltimoDiaAnoAtual())
              setTipoFiltro('todos')
            }}
            style={{
              height: 48,
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(90deg, #16a34a, #22c55e)',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
              padding: '0 18px',
              boxShadow: '0 12px 24px rgba(34,197,94,0.20)',
            }}
          >
            LIMPAR
          </button>
        </div>

        <div
          style={{
            textAlign: isMobile ? 'left' : 'center',
            fontSize: 13,
            color: '#f2b177',
            fontStyle: 'italic',
            marginTop: -2,
          }}
        >
          As informações abaixo são atualizadas com base no período filtrado acima
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
            gap: 14,
          }}
        >
          {cards.map((card) => (
            <div
              key={card.titulo}
              style={{
                background: card.cor,
                borderRadius: 24,
                padding: 20,
                minHeight: 132,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 18px 34px rgba(0,0,0,0.18)',
                boxSizing: 'border-box',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: -18,
                  top: -18,
                  width: 96,
                  height: 96,
                  borderRadius: '50%',
                  background: card.brilho,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: 0,
                  width: '100%',
                  height: 1,
                  background: 'rgba(255,255,255,0.18)',
                }}
              />

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  position: 'relative',
                  letterSpacing: 0.8,
                  opacity: 0.98,
                }}
              >
                {card.titulo}
              </div>

              <div
                style={{
                  fontSize: isMobile ? 28 : 38,
                  fontWeight: 900,
                  lineHeight: 1,
                  position: 'relative',
                  margin: '4px 0',
                }}
              >
                {card.valor}
              </div>

              <div
                style={{
                  position: 'relative',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.88)',
                  letterSpacing: 0.2,
                }}
              >
                {card.descricao}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.5fr 0.92fr',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 26,
              padding: isMobile ? 14 : 18,
              boxShadow: '0 14px 32px rgba(0,0,0,0.16)',
              boxSizing: 'border-box',
              minHeight: isMobile ? 'auto' : 680,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ color: '#ff8b2b', fontWeight: 900, fontSize: 13, marginBottom: 4 }}>
                  Desempenho mensal
                </div>
                <div style={{ fontSize: isMobile ? 24 : 33, fontWeight: 900 }}>
                  Evolução da operação
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 999,
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.24)',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: '#84cc16',
                      display: 'inline-block',
                    }}
                  />
                  Quantidade
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 999,
                    background: 'rgba(168,85,247,0.12)',
                    border: '1px solid rgba(168,85,247,0.24)',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: '#a855f7',
                      display: 'inline-block',
                    }}
                  />
                  Valor
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.10)',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.14))',
                padding: isMobile ? '14px 10px 14px' : '20px 18px 18px',
                boxSizing: 'border-box',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to top, rgba(255,255,255,0.02) 1px, transparent 1px)',
                  backgroundSize: '100% 64px',
                  opacity: 0.55,
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                  gap: isMobile ? 6 : 10,
                  alignItems: 'end',
                  minHeight: isMobile ? 280 : 390,
                  flex: 1,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {graficoMensal.map((item) => {
                  const alturaQuantidade = Math.max((item.quantidade / maxQuantidade) * 200, item.quantidade > 0 ? 16 : 8)
                  const alturaValor = Math.max((item.valor / maxValor) * 255, item.valor > 0 ? 18 : 10)

                  return (
                    <div
                      key={item.nome}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 10,
                        minWidth: 0,
                        height: '100%',
                      }}
                    >
                      <div
                        title={`${item.nome} | Qtd: ${item.quantidade} | Valor: ${formatarMoeda(item.valor)}`}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          gap: 5,
                          height: isMobile ? 220 : 305,
                          width: '100%',
                        }}
                      >
                        <div
                          style={{
                            width: isMobile ? 10 : 16,
                            height: alturaQuantidade,
                            borderRadius: 999,
                            background: 'linear-gradient(180deg, #d6ff7b, #84cc16)',
                            boxShadow: '0 12px 24px rgba(132,204,22,0.34)',
                            transition: 'all 0.3s ease',
                          }}
                        />
                        <div
                          style={{
                            width: isMobile ? 10 : 16,
                            height: alturaValor,
                            borderRadius: 999,
                            background: 'linear-gradient(180deg, #ddb6ff, #7c3aed)',
                            boxShadow: '0 12px 24px rgba(124,58,237,0.34)',
                            transition: 'all 0.3s ease',
                          }}
                        />
                      </div>

                      <div
                        style={{
                          fontSize: isMobile ? 10 : 13,
                          fontWeight: 800,
                          color: '#fff',
                          textAlign: 'center',
                          opacity: 0.95,
                        }}
                      >
                        {item.nome}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                  gap: 10,
                  marginTop: 18,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    padding: '12px 12px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, marginBottom: 6 }}>
                    Total gerado
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {formatarMoeda(metricas.valorGerado)}
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px 12px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, marginBottom: 6 }}>
                    Total aprovado
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {formatarMoeda(metricas.valorAprovado)}
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px 12px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, marginBottom: 6 }}>
                    Docs gerados
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {metricas.gerados}
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px 12px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, marginBottom: 6 }}>
                    Docs aprovados
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {metricas.aprovados}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 16,
              minHeight: isMobile ? 'auto' : 680,
            }}
          >
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 26,
                padding: 18,
                boxShadow: '0 14px 32px rgba(0,0,0,0.16)',
              }}
            >
              <div
                style={{
                  height: 50,
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #f97316, #ff7a00)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 16,
                  marginBottom: 18,
                  boxShadow: '0 12px 24px rgba(249,115,22,0.22)',
                  letterSpacing: 0.3,
                }}
              >
                Painel de Conversão
              </div>

              <div
                style={{
                  borderRadius: 18,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(0,0,0,0.12)',
                  padding: 18,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: '#d1d5db', marginBottom: 10 }}>
                  Aproveitamento do período
                </div>

                <div style={{ fontSize: 58, fontWeight: 900, lineHeight: 1, marginBottom: 14 }}>
                  {metricas.taxaAprovacao.toFixed(0)}%
                </div>

                <div
                  style={{
                    width: '100%',
                    height: 12,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(metricas.taxaAprovacao, 100)}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #22c55e, #84cc16)',
                      boxShadow: '0 0 18px rgba(34,197,94,0.24)',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  {[
                    ['Gerados', String(metricas.gerados)],
                    ['Aprovados', String(metricas.aprovados)],
                    ['Vendidos', String(metricas.vendidos)],
                    ['Conversão', `${metricas.taxaConversao.toFixed(0)}%`],
                  ].map(([titulo, valor]) => (
                    <div
                      key={titulo}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 14,
                        padding: 12,
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: '#cbd5e1',
                          textTransform: 'uppercase',
                          marginBottom: 6,
                          letterSpacing: 0.4,
                        }}
                      >
                        {titulo}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 900 }}>{valor}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: '#cbd5e1',
                    lineHeight: 1.5,
                  }}
                >
                  Quanto maior a taxa de aprovação e conversão, maior o potencial comercial do sistema.
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 26,
                overflow: 'hidden',
                boxShadow: '0 14px 32px rgba(0,0,0,0.16)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 390,
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(90deg, #f97316, #ff7a00)',
                  padding: '14px 18px',
                  fontWeight: 900,
                  fontSize: 15,
                  textTransform: 'uppercase',
                  letterSpacing: 0.45,
                }}
              >
                Últimos documentos gerados
              </div>

              <div style={{ padding: 14, display: 'grid', gap: 10, flex: 1 }}>
                {ultimosDocumentos.length === 0 ? (
                  <div
                    style={{
                      padding: 18,
                      borderRadius: 16,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#cbd5e1',
                      textAlign: 'center',
                    }}
                  >
                    Nenhum documento encontrado no período selecionado.
                  </div>
                ) : (
                  ultimosDocumentos.map((doc) => {
                    const statusStyle = corStatus(doc.status)

                    return (
                      <div
                        key={`${doc.tipo}-${doc.id}`}
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))',
                          border: '1px solid rgba(255,255,255,0.08)',
                          display: 'grid',
                          gap: 8,
                          transition: 'all 0.2s ease',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 900,
                                fontSize: 15,
                                lineHeight: 1.35,
                                marginBottom: 4,
                              }}
                            >
                              {etiquetaTipo(doc.tipo)} - {doc.cliente}
                            </div>
                            <div
                              style={{
                                color: '#cbd5e1',
                                fontSize: 12,
                                lineHeight: 1.4,
                              }}
                            >
                              Nº {doc.numero} {doc.telefone ? `• ${doc.telefone}` : ''}
                            </div>
                          </div>

                          <div
                            style={{
                              padding: '6px 10px',
                              borderRadius: 999,
                              background: statusStyle.fundo,
                              border: `1px solid ${statusStyle.borda}`,
                              color: statusStyle.texto,
                              fontSize: 11,
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              letterSpacing: 0.4,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {doc.status}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            paddingTop: 9,
                          }}
                        >
                          <div style={{ color: '#cbd5e1', fontSize: 12 }}>
                            {converterParaDataInput(doc.criadoEm) || '--'}
                          </div>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 20,
                              textShadow: '0 0 14px rgba(255,255,255,0.03)',
                            }}
                          >
                            {formatarMoeda(doc.valor)}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}