'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildPublicReciboPath, savePublicDocument } from '@/lib/connect-public'

type DadosRecibo = {
  id?: string
  numero?: string
  criadoEm?: string
  nomeCliente?: string
  clienteTelefone?: string
  referente?: string
  valorNumero?: string | number
  dataRecibo?: string
  formaPagamento?: string
  observacao?: string
  config?: {
    nomeEmpresa?: string
    cidadeUf?: string
    telefone?: string
    responsavel?: string
    corPrimaria?: string
    corSecundaria?: string
    logoUrl?: string
    endereco?: string
  }
}

type ConfigType = {
  nomeEmpresa?: string
  cidadeUf?: string
  cidade?: string
  telefone?: string
  responsavel?: string
  corPrimaria?: string
  corSecundaria?: string
  logoUrl?: string
  logo?: string
  endereco?: string
  formaPagamentoPadrao?: string
}

type ClienteSalvo = {
  id?: string | number
  nome?: string
  telefone?: string
  celular?: string
  whatsapp?: string
  email?: string
  endereco?: string
}

type OrdemServico = {
  id?: number | string
  numero?: string
  cliente?: string
  telefone?: string
  email?: string
  endereco?: string
  equipamento?: string
  defeito?: string
  observacao?: string
  valor?: number | string
  saldo?: number | string
  data?: string
  ultimaAtualizacao?: string
  formaPagamento?: string
  pagamento?: string
  recebidoEm?: string
  servico?: string
  referente?: string
}

type OrcamentoSalvo = {
  id?: number | string
  numero?: string
  titulo?: string
  cliente?: {
    nome?: string
    telefone?: string
    email?: string
    endereco?: string
  } | null
  total?: number
  observacao?: string
  formaPagamento?: string
  data?: string
}

const CONFIG_KEY = 'connect_configuracoes'
const RECIBO_VIEW_KEY = 'connect_recibo_visualizacao'
const OS_KEY = 'connect_ordens_servico_salvas'
const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const FORMAS_KEY = 'connect_formas_pagamento'
const CLIENTES_KEY = 'connect_clientes'

function hojeInput() {
  return new Date().toISOString().slice(0, 10)
}

function formatarDataBR(data?: string) {
  if (!data) return new Date().toLocaleDateString('pt-BR')

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(data))) return String(data)

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
    const [ano, mes, dia] = String(data).split('-')
    return `${dia}/${mes}/${ano}`
  }

  const d = new Date(`${data}T00:00:00`)
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('pt-BR')
  return d.toLocaleDateString('pt-BR')
}

function normalizarNumero(valor: string) {
  const limpo = String(valor || '')
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : 0
}

function moeda(valor?: string | number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function numeroPorExtensoSimples(valor?: string | number) {
  const n = Number(valor || 0)
  if (!n) return 'ZERO REAIS'
  return moeda(n).replace('R$', '').trim()
}

function lerConfig(): ConfigType {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    const cfg = raw ? JSON.parse(raw) : {}
    return cfg && typeof cfg === 'object' ? cfg : {}
  } catch {
    return {}
  }
}

function lerUltimaOS(): OrdemServico | null {
  try {
    const raw = localStorage.getItem(OS_KEY)
    const lista = raw ? JSON.parse(raw) : []
    if (!Array.isArray(lista) || lista.length === 0) return null
    return lista[0] || null
  } catch {
    return null
  }
}

function lerUltimoOrcamento(): OrcamentoSalvo | null {
  try {
    const raw = localStorage.getItem(ORCAMENTOS_KEY)
    const lista = raw ? JSON.parse(raw) : []
    if (!Array.isArray(lista) || lista.length === 0) return null
    return lista[0] || null
  } catch {
    return null
  }
}

function lerFormasPagamento(): string[] {
  try {
    const raw = localStorage.getItem(FORMAS_KEY)
    const lista = raw ? JSON.parse(raw) : []
    if (!Array.isArray(lista)) return []

    return lista
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'nome' in item) {
          return String((item as { nome?: string }).nome || '')
        }
        return ''
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function lerClientes(): ClienteSalvo[] {
  try {
    const raw = localStorage.getItem(CLIENTES_KEY)
    const lista = raw ? JSON.parse(raw) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function formatarDataInput(valor?: string) {
  if (!valor) return hojeInput()

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
    const [dia, mes, ano] = valor.split('/')
    return `${ano}-${mes}-${dia}`
  }

  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return hojeInput()
  return d.toISOString().slice(0, 10)
}

function emojiPagamento(forma?: string) {
  const valor = String(forma || '').toLowerCase()
  if (valor.includes('pix')) return '📲'
  if (valor.includes('crédito') || valor.includes('credito')) return '💳'
  if (valor.includes('débito') || valor.includes('debito')) return '💳'
  if (valor.includes('boleto')) return '🧾'
  if (valor.includes('transfer')) return '🏦'
  return '💵'
}

export default function BotaoReciboAvulso() {
  const router = useRouter()

  const [aberto, setAberto] = useState(false)
  const [config, setConfig] = useState<ConfigType>({})
  const [formasPagamento, setFormasPagamento] = useState<string[]>([])
  const [clientes, setClientes] = useState<ClienteSalvo[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [clienteId, setClienteId] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [referente, setReferente] = useState('')
  const [valorNumero, setValorNumero] = useState('')
  const [dataRecibo, setDataRecibo] = useState(hojeInput())
  const [formaPagamento, setFormaPagamento] = useState('Pix')
  const [observacao, setObservacao] = useState('Obrigado pela preferência.')

  useEffect(() => {
    const cfg = lerConfig()
    setConfig(cfg)
    setFormasPagamento(lerFormasPagamento())
    setClientes(lerClientes())

    const onResize = () => setIsMobile(window.innerWidth < 1180)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const corPrimaria = config.corPrimaria || '#16a34a'
  const corSecundaria = config.corSecundaria || '#f5f1e8'
  const corCard = '#ffffff'
  const corTextoSuave = '#64748b'

  const formas = useMemo(() => {
    const lista = formasPagamento.filter((item, index, arr) => arr.indexOf(item) === index)
    if (lista.length > 0) return lista

    return [config.formaPagamentoPadrao || 'Pix', 'Dinheiro', 'Cartão']
      .filter((item, index, arr) => item && arr.indexOf(item) === index)
  }, [formasPagamento, config])

  function recarregarBase() {
    const cfg = lerConfig()
    const formasSalvas = lerFormasPagamento()
    const clientesSalvos = lerClientes()

    setConfig(cfg)
    setFormasPagamento(formasSalvas)
    setClientes(clientesSalvos)

    return { cfg, formasSalvas }

  }

  function resetarFormulario() {
    const { cfg, formasSalvas } = recarregarBase()

    setClienteId('')
    setNomeCliente('')
    setClienteTelefone('')
    setReferente('')
    setValorNumero('')
    setDataRecibo(hojeInput())
    setFormaPagamento(cfg.formaPagamentoPadrao || formasSalvas[0] || 'Pix')
    setObservacao('Obrigado pela preferência.')
  }

  function abrirModal() {
    resetarFormulario()
    setAberto(true)
  }

  function preencherCliente(cliente: ClienteSalvo | null) {
    if (!cliente) return
    setClienteId(String(cliente.id ?? ''))
    setNomeCliente(cliente.nome || '')
    setClienteTelefone(cliente.telefone || cliente.celular || cliente.whatsapp || '')
  }

  function puxarUltimaOS() {
    const os = lerUltimaOS()
    const cfg = lerConfig()
    const formasSalvas = lerFormasPagamento()

    if (!os) {
      alert('Nenhuma OS encontrada para importar.')
      return
    }

    setClienteId('')
    setNomeCliente(os.cliente || '')
    setClienteTelefone(os.telefone || '')
    setReferente(os.servico || os.referente || os.equipamento || os.defeito || 'Serviço realizado')
    setValorNumero(String(os.valor || os.saldo || 0))
    setDataRecibo(formatarDataInput(os.data || os.ultimaAtualizacao))
    setFormaPagamento(
      os.formaPagamento ||
        os.pagamento ||
        os.recebidoEm ||
        cfg.formaPagamentoPadrao ||
        formasSalvas[0] ||
        'Pix'
    )
    setObservacao(os.observacao || 'Obrigado pela preferência.')
  }

  function puxarUltimoOrcamento() {
    const orc = lerUltimoOrcamento()
    const cfg = lerConfig()
    const formasSalvas = lerFormasPagamento()

    if (!orc) {
      alert('Nenhum orçamento encontrado para importar.')
      return
    }

    setClienteId('')
    setNomeCliente(orc.cliente?.nome || '')
    setClienteTelefone(orc.cliente?.telefone || '')
    setReferente(orc.titulo || 'Orçamento / serviço')
    setValorNumero(String(orc.total || 0))
    setDataRecibo(formatarDataInput(orc.data))
    setFormaPagamento(
      orc.formaPagamento ||
        cfg.formaPagamentoPadrao ||
        formasSalvas[0] ||
        'Pix'
    )
    setObservacao(orc.observacao || 'Obrigado pela preferência.')
  }

  async function salvarEAbrir() {
    if (salvando) return

    const valor = normalizarNumero(valorNumero)

    if (!nomeCliente.trim()) {
      alert('Preencha o nome do cliente.')
      return
    }

    if (!referente.trim()) {
      alert('Preencha o referente / serviço.')
      return
    }

    if (valor <= 0) {
      alert('Informe um valor válido.')
      return
    }

    const cfg = lerConfig()
    const fichaId = `recibo-${Date.now()}`
    const criadoEm = new Date().toISOString()

    const dados: DadosRecibo = {
      id: fichaId,
      numero: fichaId.replace('recibo-', ''),
      criadoEm,
      nomeCliente: nomeCliente.trim(),
      clienteTelefone: clienteTelefone.trim(),
      referente: referente.trim(),
      valorNumero: valor,
      dataRecibo,
      formaPagamento: formaPagamento || cfg.formaPagamentoPadrao || 'Pix',
      observacao: observacao.trim(),
      config: {
        nomeEmpresa: cfg.nomeEmpresa || 'LOJA CONNECT',
        cidadeUf: cfg.cidadeUf || cfg.cidade || '',
        telefone: cfg.telefone || '',
        responsavel: cfg.responsavel || '',
        corPrimaria: cfg.corPrimaria || '#16a34a',
        corSecundaria: cfg.corSecundaria || '#f5f1e8',
        logoUrl: cfg.logoUrl || cfg.logo || '',
        endereco: cfg.endereco || '',
      },
    }

    localStorage.setItem(RECIBO_VIEW_KEY, JSON.stringify(dados))
    setAberto(false)

    try {
      setSalvando(true)
      const publicDoc = await savePublicDocument({
        document_type: 'recibo',
        document_id: fichaId,
        document: dados,
        config: dados.config,
      })

      router.push(buildPublicReciboPath(publicDoc.document_id, publicDoc.token))
    } catch (error) {
      console.error('Erro ao publicar recibo:', error)
      router.push('/recibo-avulso')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrirModal}
        style={{
          background: '#f97316',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '0 16px',
          height: 40,
          fontWeight: 800,
          cursor: 'pointer',
          fontSize: 12,
          boxShadow: '0 10px 20px rgba(0,0,0,0.12)',
        }}
      >
        Recibo avulso
      </button>

      {aberto ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: isMobile ? 0 : 250,
            background: 'rgba(15,23,42,0.50)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
            zIndex: 9999,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 1180,
              background: corSecundaria,
              borderRadius: 24,
              boxShadow: '0 24px 70px rgba(0,0,0,0.28)',
              border: `2px solid ${corPrimaria}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '20px 22px',
                background: `linear-gradient(135deg, ${corPrimaria}, #1f2937)`,
                color: '#fff',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
                Criar recibo avulso
              </div>
              <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.84)' }}>
                Preencha do zero, puxe OS/orçamento ou selecione um cliente cadastrado.
              </div>
            </div>

            <div
              style={{
                padding: 20,
                maxHeight: '82vh',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
                gap: 18,
                background: corSecundaria,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginBottom: 14,
                  }}
                >
                  <button
                    type="button"
                    onClick={resetarFormulario}
                    style={{
                      background: '#111827',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Limpar tudo
                  </button>

                  <button
                    type="button"
                    onClick={puxarUltimaOS}
                    style={{
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Puxar última OS
                  </button>

                  <button
                    type="button"
                    onClick={puxarUltimoOrcamento}
                    style={{
                      background: '#7c3aed',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Puxar último orçamento
                  </button>
                </div>

                <div
                  style={{
                    marginBottom: 12,
                    padding: 14,
                    borderRadius: 16,
                    background: '#ffffff',
                    border: `2px solid ${corPrimaria}`,
                  }}
                >
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#374151',
                    }}
                  >
                    Cliente cadastrado
                  </label>

                  <select
                    value={clienteId}
                    onChange={(e) => {
                      const valor = e.target.value
                      setClienteId(valor)
                      const cliente = clientes.find((item) => String(item.id ?? '') === valor)
                      preencherCliente(cliente || null)
                    }}
                    style={{
                      width: '100%',
                      minHeight: 46,
                      borderRadius: 10,
                      border: `1px solid ${corPrimaria}`,
                      background: '#ffffff',
                      color: '#111827',
                      padding: '10px 12px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      fontSize: 14,
                    }}
                  >
                    <option value="">Selecionar cliente cadastrado</option>
                    {clientes.map((cliente) => (
                      <option key={String(cliente.id ?? cliente.nome ?? '')} value={String(cliente.id ?? '')}>
                        {cliente.nome || 'Cliente sem nome'}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <Campo label="Cliente" value={nomeCliente} onChange={setNomeCliente} placeholder="Nome do cliente" corPrimaria={corPrimaria} />
                  <Campo label="Telefone" value={clienteTelefone} onChange={setClienteTelefone} placeholder="Telefone / WhatsApp" corPrimaria={corPrimaria} />
                  <Campo label="Serviço / Referente" value={referente} onChange={setReferente} placeholder="Ex: troca de tela, manutenção, entrada" corPrimaria={corPrimaria} />
                  <Campo label="Valor" value={valorNumero} onChange={setValorNumero} placeholder="Ex: 75,00" corPrimaria={corPrimaria} />
                  <Campo label="Data" value={dataRecibo} onChange={setDataRecibo} type="date" corPrimaria={corPrimaria} />

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 6,
                        fontSize: 13,
                        fontWeight: 800,
                        color: '#374151',
                      }}
                    >
                      Forma de pagamento
                    </label>

                    <select
                      value={formaPagamento}
                      onChange={(e) => setFormaPagamento(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: 44,
                        borderRadius: 10,
                        border: `1px solid ${corPrimaria}`,
                        background: '#ffffff',
                        color: '#111827',
                        padding: '10px 12px',
                        boxSizing: 'border-box',
                        outline: 'none',
                        fontSize: 14,
                      }}
                    >
                      {formas.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#374151',
                    }}
                  >
                    Observação
                  </label>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Observações do recibo"
                    style={{
                      width: '100%',
                      minHeight: 100,
                      borderRadius: 12,
                      border: `2px solid ${corPrimaria}`,
                      background: '#ffffff',
                      color: '#111827',
                      padding: 12,
                      boxSizing: 'border-box',
                      resize: 'vertical',
                      outline: 'none',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                    marginTop: 18,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAberto(false)}
                    style={{
                      background: '#e5e7eb',
                      color: '#111827',
                      border: 'none',
                      borderRadius: 10,
                      padding: '11px 16px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={salvarEAbrir}
                    disabled={salvando}
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '11px 16px',
                      fontWeight: 800,
                      cursor: salvando ? 'wait' : 'pointer',
                      opacity: salvando ? 0.75 : 1,
                    }}
                  >
                    {salvando ? 'Gerando ficha...' : 'Criar recibo'}
                  </button>
                </div>
              </div>

              <div>
                <div
                  style={{
                    background: corSecundaria,
                    borderRadius: 22,
                    padding: 14,
                    border: `2px solid ${corPrimaria}`,
                    position: isMobile ? 'static' : 'sticky',
                    top: 0,
                  }}
                >
                  <div
                    style={{
                      background: corCard,
                      borderRadius: 18,
                      padding: 14,
                      border: `1px solid ${corPrimaria}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        borderBottom: `3px solid ${corPrimaria}`,
                        paddingBottom: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#111827' }}>
                          {config.nomeEmpresa || 'LOJA CONNECT'}
                        </div>
                        <div style={{ fontSize: 12, color: corTextoSuave, marginTop: 4 }}>
                          {config.endereco || ''}
                        </div>
                        <div style={{ fontSize: 12, color: corTextoSuave }}>
                          {config.cidadeUf || config.cidade || ''}
                        </div>
                        <div style={{ fontSize: 12, color: corTextoSuave }}>
                          {config.telefone || ''}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>
                          Recibo
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                          {formatarDataBR(dataRecibo)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        border: `1px solid ${corPrimaria}`,
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 10,
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        alignItems: 'center',
                        background: '#ffffff',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 16, color: '#111827', lineHeight: 1.3 }}>
                          Recebi de <strong>{nomeCliente || 'Cliente não informado'}</strong>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 14, color: '#374151' }}>
                          Referente a <strong>{referente || 'Serviço / pagamento'}</strong>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: '#374151' }}>
                          {numeroPorExtensoSimples(normalizarNumero(valorNumero))}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-block',
                            background: corPrimaria,
                            color: '#fff',
                            padding: '6px 12px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            marginBottom: 8,
                          }}
                        >
                          RECIBO
                        </div>
                        <br />
                        <div style={{ fontSize: 11, fontWeight: 900, color: '#6b7280', marginBottom: 4 }}>
                          VALOR
                        </div>
                        <div
                          style={{
                            display: 'inline-block',
                            background: '#fff59d',
                            padding: '8px 12px',
                            borderRadius: 12,
                            fontSize: 24,
                            fontWeight: 900,
                            color: '#111827',
                          }}
                        >
                          {moeda(normalizarNumero(valorNumero))}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                      <MiniInfo titulo="Cliente" valor={nomeCliente || '-'} corPrimaria={corPrimaria} />
                      <MiniInfo titulo="Pagamento" valor={formaPagamento || '-'} corPrimaria={corPrimaria} />
                      <MiniInfo titulo="Data" valor={formatarDataBR(dataRecibo)} corPrimaria={corPrimaria} />
                    </div>

                    <div
                      style={{
                        border: `1px solid ${corPrimaria}`,
                        borderRadius: 14,
                        padding: 10,
                        marginBottom: 8,
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 5, color: '#6b7280' }}>
                        {emojiPagamento(formaPagamento)} Observações
                      </div>
                      <div style={{ fontSize: 14 }}>{observacao || 'Obrigado pela preferência.'}</div>
                    </div>

                    <div style={{ marginTop: 8, textAlign: 'center' }}>
                      <div
                        style={{
                          width: 220,
                          maxWidth: '100%',
                          margin: '0 auto',
                          borderTop: '2px solid #111827',
                          paddingTop: 4,
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>
                          {config.responsavel || 'ERES FAUSTINO'}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>
                          EMITENTE / ASSINATURA
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  corPrimaria,
}: {
  label: string
  value: string
  onChange: (valor: string) => void
  placeholder?: string
  type?: string
  corPrimaria: string
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          marginBottom: 6,
          fontSize: 13,
          fontWeight: 800,
          color: '#374151',
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight: 44,
          borderRadius: 10,
          border: `1px solid ${corPrimaria}`,
          background: '#ffffff',
          color: '#111827',
          padding: '10px 12px',
          boxSizing: 'border-box',
          outline: 'none',
          fontSize: 14,
        }}
      />
    </div>
  )
}

function MiniInfo({
  titulo,
  valor,
  corPrimaria,
}: {
  titulo: string
  valor: string
  corPrimaria: string
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: `1px solid ${corPrimaria}`,
        borderRadius: 12,
        padding: 10,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 4 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#111827', wordBreak: 'break-word' }}>
        {valor}
      </div>
    </div>
  )
}