'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  DEFAULT_LOGO_PATH,
  loadPublicDocument,
  normalizeBrazilWhatsAppNumber,
} from '@/lib/connect-public'

const STORAGE_KEY = 'connect_orcamentos_salvos'
const CONFIG_KEY = 'connect_configuracoes'

type ClienteType =
  | string
  | {
      id?: string
      nome?: string
      telefone?: string
      email?: string
      endereco?: string
      cpf?: string
      cnpj?: string
    }
  | null
  | undefined

type ItemType = {
  nome?: string
  descricao?: string
  quantidade?: number | string
  valor?: number | string
  preco?: number | string
  total?: number | string
}

type OrcamentoType = {
  id?: string | number
  numero?: string | number
  cliente?: ClienteType
  nomeCliente?: string
  telefone?: string
  email?: string
  endereco?: string
  itens?: ItemType[]
  total?: number | string
  subtotal?: number | string
  desconto?: number | string
  observacoes?: string
  observacao?: string
  status?: string
  validade?: string
  formaPagamento?: string
  condicoesPagamento?: string
  data?: string
  createdAt?: string
}

type ConfigType = {
  nomeSistema?: string
  nomeEmpresa?: string
  telefone?: string
  whatsapp?: string
  email?: string
  endereco?: string
  logoUrl?: string
  logo?: string
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function paraNumero(valor: unknown) {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string') {
    const tratado = valor
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')
    const numero = Number(tratado)
    return Number.isFinite(numero) ? numero : 0
  }
  return 0
}

function formatarData(data?: string) {
  if (!data) return '-'
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return data
  return d.toLocaleDateString('pt-BR')
}

function getClienteNome(cliente: ClienteType, orcamento: OrcamentoType) {
  if (typeof cliente === 'string') return cliente
  return (
    cliente?.nome ||
    orcamento.nomeCliente ||
    '-'
  )
}

function getClienteTelefone(cliente: ClienteType, orcamento: OrcamentoType) {
  if (typeof cliente === 'string') return orcamento.telefone || '-'
  return cliente?.telefone || orcamento.telefone || '-'
}

function getClienteEmail(cliente: ClienteType, orcamento: OrcamentoType) {
  if (typeof cliente === 'string') return orcamento.email || '-'
  return cliente?.email || orcamento.email || '-'
}

function getClienteEndereco(cliente: ClienteType, orcamento: OrcamentoType) {
  if (typeof cliente === 'string') return orcamento.endereco || '-'
  return cliente?.endereco || orcamento.endereco || '-'
}

function normalizarItens(itens: unknown): ItemType[] {
  if (!Array.isArray(itens)) return []
  return itens.map((item) => ({
    nome: item?.nome || item?.descricao || 'Item',
    descricao: item?.descricao || '',
    quantidade: item?.quantidade ?? 1,
    valor: item?.valor ?? item?.preco ?? 0,
    preco: item?.preco ?? item?.valor ?? 0,
    total:
      item?.total ??
      paraNumero(item?.quantidade ?? 1) * paraNumero(item?.valor ?? item?.preco ?? 0),
  }))
}

export default function OrcamentoPublicoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const [orcamento, setOrcamento] = useState<OrcamentoType | null>(null)
  const [config, setConfig] = useState<ConfigType | null>(null)
  const [carregado, setCarregado] = useState(false)

  const idParam = useMemo(() => String(params?.id || ''), [params])
  const token = searchParams.get('token')

  useEffect(() => {
    let ativo = true

    async function carregarDocumento() {
      try {
        const salvos: OrcamentoType[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        const configuracoes: ConfigType = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')

        const encontrado = salvos.find(
          (item) =>
            String(item.id || '') === idParam ||
            String(item.numero || '') === idParam
        )

        if (token) {
          try {
            const publico = await loadPublicDocument<OrcamentoType, ConfigType>(
              'quotation',
              idParam,
              token
            )

            if (!ativo) return

            if (publico) {
              setOrcamento(publico.document || encontrado || null)
              setConfig(publico.config || configuracoes || null)
              setCarregado(true)
              return
            }
          } catch (error) {
            console.error('Erro ao carregar orçamento público do Supabase:', error)
          }
        }

        if (!ativo) return
        setOrcamento(encontrado || null)
        setConfig(configuracoes || null)
        setCarregado(true)
      } catch (error) {
        console.error('Erro ao carregar orçamento público:', error)
        if (!ativo) return
        setOrcamento(null)
        setConfig(null)
        setCarregado(true)
      }
    }

    carregarDocumento()

    return () => {
      ativo = false
    }
  }, [idParam, token])

  function atualizarStatus(novoStatus: string) {
    try {
      const salvos: OrcamentoType[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

      const atualizados = salvos.map((item) => {
        if (
          String(item.id || '') === idParam ||
          String(item.numero || '') === idParam
        ) {
          return { ...item, status: novoStatus }
        }
        return item
      })

      localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados))
      setOrcamento((prev) => (prev ? { ...prev, status: novoStatus } : prev))
      alert(`Orçamento ${novoStatus.toLowerCase()} com sucesso.`)
    } catch (error) {
      console.error(error)
      alert('Não foi possível atualizar o status.')
    }
  }

  function imprimir() {
    window.print()
  }

  function falarWhatsapp() {
    if (!orcamento) return

    const numeroBruto =
      config?.whatsapp ||
      config?.telefone ||
      (typeof orcamento.cliente === 'object' ? orcamento.cliente?.telefone : '') ||
      orcamento.telefone ||
      ''

    const numero = normalizeBrazilWhatsAppNumber(String(numeroBruto))
    const texto = `Olá! Tenho uma dúvida sobre o orçamento #${orcamento.numero || ''}.`

    if (!numero) {
      alert('Número de WhatsApp não configurado.')
      return
    }

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank')
  }

  if (!carregado) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
          padding: 20,
        }}
      >
        <div>Carregando orçamento...</div>
      </div>
    )
  }

  if (!orcamento) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
          padding: 20,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            background: '#ffffff',
            borderRadius: 20,
            padding: 24,
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
            textAlign: 'center',
          }}
        >
          <h1 style={{ marginTop: 0, color: '#0f172a' }}>Orçamento não encontrado</h1>
          <p style={{ color: '#475569', marginBottom: 0 }}>
            Esse orçamento não foi localizado ou o link público expirou.
          </p>
        </div>
      </div>
    )
  }

  const cliente = orcamento.cliente
  const itens = normalizarItens(orcamento.itens)
  const subtotal =
    paraNumero(orcamento.subtotal) ||
    itens.reduce((acc, item) => acc + paraNumero(item.total), 0)
  const desconto = paraNumero(orcamento.desconto)
  const total = paraNumero(orcamento.total) || Math.max(subtotal - desconto, 0)

  const nomeEmpresa =
    config?.nomeSistema || config?.nomeEmpresa || 'Connect Sistema'

  const logo =
    config?.logoUrl === '/logo-connect.png'
      ? DEFAULT_LOGO_PATH
      : config?.logoUrl || config?.logo || DEFAULT_LOGO_PATH

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#eef2f7',
        padding: 16,
        fontFamily: 'Arial, sans-serif',
        color: '#0f172a',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 920,
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: 24,
          boxShadow: '0 18px 50px rgba(15,23,42,0.10)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(90deg, #0f172a, #1e293b)',
            color: '#ffffff',
            padding: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: '#ffffff',
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={logo}
                  alt="Logo"
                  style={{ width: 46, height: 46, objectFit: 'contain' }}
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{nomeEmpresa}</div>
                <div style={{ opacity: 0.85, fontSize: 13 }}>
                  Visualização pública do orçamento
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.12)',
                padding: '10px 14px',
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Nº {orcamento.numero || orcamento.id || '-'}
            </div>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 18,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 700 }}>
                CLIENTE
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                {getClienteNome(cliente, orcamento)}
              </div>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 4 }}>
                <strong>Telefone:</strong> {getClienteTelefone(cliente, orcamento)}
              </div>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 4 }}>
                <strong>E-mail:</strong> {getClienteEmail(cliente, orcamento)}
              </div>
              <div style={{ fontSize: 14, color: '#334155' }}>
                <strong>Endereço:</strong> {getClienteEndereco(cliente, orcamento)}
              </div>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 18,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 700 }}>
                INFORMAÇÕES
              </div>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 6 }}>
                <strong>Data:</strong> {formatarData(orcamento.data || orcamento.createdAt)}
              </div>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 6 }}>
                <strong>Validade:</strong> {formatarData(orcamento.validade)}
              </div>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 6 }}>
                <strong>Pagamento:</strong> {orcamento.formaPagamento || orcamento.condicoesPagamento || '-'}
              </div>
              <div style={{ fontSize: 14, color: '#334155' }}>
                <strong>Status:</strong> {orcamento.status || 'Pendente'}
              </div>
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 18,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                background: '#f8fafc',
                padding: 14,
                fontWeight: 800,
                fontSize: 14,
                color: '#0f172a',
              }}
            >
              Itens do orçamento
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 640,
                }}
              >
                <thead>
                  <tr style={{ background: '#ffffff' }}>
                    <th style={{ textAlign: 'left', padding: 14, borderBottom: '1px solid #e2e8f0' }}>Item</th>
                    <th style={{ textAlign: 'left', padding: 14, borderBottom: '1px solid #e2e8f0' }}>Descrição</th>
                    <th style={{ textAlign: 'center', padding: 14, borderBottom: '1px solid #e2e8f0' }}>Qtd.</th>
                    <th style={{ textAlign: 'right', padding: 14, borderBottom: '1px solid #e2e8f0' }}>Valor</th>
                    <th style={{ textAlign: 'right', padding: 14, borderBottom: '1px solid #e2e8f0' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length > 0 ? (
                    itens.map((item, index) => (
                      <tr key={index}>
                        <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>
                          {item.nome || 'Item'}
                        </td>
                        <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>
                          {item.descricao || '-'}
                        </td>
                        <td
                          style={{
                            padding: 14,
                            borderBottom: '1px solid #e2e8f0',
                            textAlign: 'center',
                          }}
                        >
                          {paraNumero(item.quantidade || 1)}
                        </td>
                        <td
                          style={{
                            padding: 14,
                            borderBottom: '1px solid #e2e8f0',
                            textAlign: 'right',
                          }}
                        >
                          {formatarMoeda(paraNumero(item.valor ?? item.preco))}
                        </td>
                        <td
                          style={{
                            padding: 14,
                            borderBottom: '1px solid #e2e8f0',
                            textAlign: 'right',
                            fontWeight: 700,
                          }}
                        >
                          {formatarMoeda(paraNumero(item.total))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: 18,
                          textAlign: 'center',
                          color: '#64748b',
                        }}
                      >
                        Nenhum item encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {(orcamento.observacoes || orcamento.observacao) && (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 18,
                padding: 18,
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 700 }}>
                OBSERVAÇÕES
              </div>
              <div style={{ fontSize: 14, color: '#334155', whiteSpace: 'pre-wrap' }}>
                {orcamento.observacoes || orcamento.observacao}
              </div>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr minmax(260px, 320px)',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <div />

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 18,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  fontSize: 14,
                  color: '#334155',
                }}
              >
                <span>Subtotal</span>
                <strong>{formatarMoeda(subtotal)}</strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  fontSize: 14,
                  color: '#334155',
                }}
              >
                <span>Desconto</span>
                <strong>{formatarMoeda(desconto)}</strong>
              </div>

              <div
                style={{
                  height: 1,
                  background: '#e2e8f0',
                  margin: '14px 0',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 20,
                  color: '#0f172a',
                  fontWeight: 800,
                }}
              >
                <span>Total</span>
                <span>{formatarMoeda(total)}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 24,
            }}
          >
            <button
              onClick={() => atualizarStatus('Aprovado')}
              style={{
                border: 'none',
                background: '#16a34a',
                color: '#ffffff',
                height: 46,
                padding: '0 18px',
                borderRadius: 14,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Aprovar orçamento
            </button>

            <button
              onClick={() => atualizarStatus('Reprovado')}
              style={{
                border: 'none',
                background: '#dc2626',
                color: '#ffffff',
                height: 46,
                padding: '0 18px',
                borderRadius: 14,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Reprovar
            </button>

            <button
              onClick={falarWhatsapp}
              style={{
                border: 'none',
                background: '#0f172a',
                color: '#ffffff',
                height: 46,
                padding: '0 18px',
                borderRadius: 14,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Falar no WhatsApp
            </button>

            <button
              onClick={imprimir}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                height: 46,
                padding: '0 18px',
                borderRadius: 14,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}