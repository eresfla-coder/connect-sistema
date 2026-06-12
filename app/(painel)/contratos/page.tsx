'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Search, Trash2, Printer, Share2, Pencil, Eye } from 'lucide-react'
import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'
import { buscarConfiguracao } from '@/lib/configuracaoEmpresa'
import { empresaContratoFromConfig, payloadContratoPublico } from '@/lib/contratoEmpresa'
import {
  buscarContratosPersistidos,
  persistirContrato,
  removerContratoPersistido,
  type ContratoServico,
} from '@/lib/contratosPersistencia'
import { carregarClientesPainelDetalhado } from '@/lib/clientes-painel'
import { timestampVersaoPublica } from '@/lib/empresaPublica'
import { supabase } from '@/lib/supabase-browser'

type Cliente = {
  id: number | string
  nome: string
  telefone?: string
  cpf?: string
  cnpj?: string
  endereco?: string
  tipoPessoa?: 'PF' | 'PJ'
  dataNascimento?: string
  ie?: string
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

function moedaHTML(valor?: number) {
  if (valor == null) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function gerarNumero(lista: ContratoServico[]) {
  const max = lista.reduce((m, c) => {
    const n = parseInt(c.numero)
    return n > m ? n : m
  }, 0)
  return String(max + 1).padStart(4, '0')
}

const FORMAS_PAGAMENTO = ['PIX', 'DINHEIRO', 'BOLETO', 'CARTÃO 1X', 'CARTÃO 2X', 'CARTÃO 3X', 'CARTÃO 4X', 'CARTÃO 5X', 'DEPÓSITO', 'TRANSFERÊNCIA']
const CLAUSULAS_PADRAO = `
1. OBJETO: O presente contrato tem como objeto a prestação do serviço descrito acima, a ser executado pela CONTRATADA em favor do CONTRATANTE.

2. PRAZO DE EXECUÇÃO: O serviço será executado no prazo estipulado no campo "Prazo de execução", contado a partir da assinatura deste instrumento.

3. PAGAMENTO: O valor total do serviço será pago na forma e condições acima estabelecidas. O atraso no pagamento acarreta juros de 1% ao mês e multa de 2%.

4. GARANTIA: A CONTRATADA garante o serviço pelo prazo indicado acima, contra defeitos de execução.

5. RESCISÃO: O descumprimento de qualquer cláusula poderá ensejar a rescisão deste contrato, com aplicação das penalidades legais cabíveis.

6. FORO: Fica eleito o foro da cidade descrita acima para dirimir quaisquer dúvidas oriundas deste contrato.
`.trim()

export default function ContratosPage() {
  const [contratos, setContratos] = useState<ContratoServico[]>([])
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [form, setForm] = useState<Partial<ContratoServico>>({
    numero: '',
    descricaoServico: '',
    descricaoServicoItens: [],
    clausulasExtras: CLAUSULAS_PADRAO,
    valorTotal: 0,
    parcelas: 1,
    valorParcela: 0,
    formaPagamento: 'PIX',
    prazoExecucao: '30 dias',
    garantia: '90 dias',
    cidadeContrato: 'Parnamirim/RN',
    status: 'Rascunho',
  })

  const router = useRouter()

  async function recarregarContratos() {
    const lista = await buscarContratosPersistidos()
    setContratos(lista)
  }

  useEffect(() => {
    void recarregarContratos()

    const aplicarClientes = (lista: Awaited<ReturnType<typeof carregarClientesPainelDetalhado>>['clientes']) => {
      setClientes(
        lista.map((cliente) => ({
          id: cliente.id,
          nome: cliente.nome,
          telefone: cliente.telefone,
          cpf: cliente.cpf,
          cnpj: cliente.cnpj,
          endereco: cliente.endereco,
          tipoPessoa: cliente.tipoPessoa,
        })),
      )
    }

    void carregarClientesPainelDetalhado('contratos').then(({ clientes: lista }) => {
      aplicarClientes(lista)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user?.id) return
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        void carregarClientesPainelDetalhado('contratos').then(({ clientes: lista }) => {
          aplicarClientes(lista)
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!form.numero && contratos.length >= 0) {
      setForm(f => ({ ...f, numero: gerarNumero(contratos) }))
    }
  }, [contratos, form.numero])

  useEffect(() => {
    const vt = Number(form.valorTotal || 0)
    const par = Number(form.parcelas || 1)
    if (par > 0) {
      setForm(f => ({ ...f, valorParcela: vt / par }))
    }
  }, [form.valorTotal, form.parcelas])

  async function deletarContrato(id: string) {
    if (!confirm('Excluir contrato?')) return
    await removerContratoPersistido(id)
    setContratos((prev) => prev.filter((c) => c.id !== id))
  }

  function clientePorId(id: string) {
    return clientes.find(c => String(c.id) === id)
  }

  const filtrados = contratos.filter(c =>
    (c.numero || '').toLowerCase().includes(busca.toLowerCase()) ||
    (c.cliente?.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
    (c.descricaoServico || '').toLowerCase().includes(busca.toLowerCase())
  )

  function abrirModal() {
    setEditandoId(null)
    setForm({
      numero: gerarNumero(contratos),
      descricaoServico: '',
      descricaoServicoItens: [],
      clausulasExtras: CLAUSULAS_PADRAO,
      valorTotal: 0,
      parcelas: 1,
      valorParcela: 0,
      formaPagamento: 'PIX',
      prazoExecucao: '30 dias',
      garantia: '90 dias',
      cidadeContrato: 'Parnamirim/RN',
      status: 'Rascunho',
      observacoes: '',
    })
    setModal(true)
  }

  function editarContrato(c: ContratoServico) {
    setEditandoId(c.id)
    setForm({
      numero: c.numero,
      data: c.data,
      validade: c.validade,
      cliente: c.cliente as Cliente,
      descricaoServico: c.descricaoServico,
      descricaoServicoItens: c.descricaoServicoItens || [],
      clausulasExtras: c.clausulasExtras,
      valorTotal: c.valorTotal,
      parcelas: c.parcelas,
      valorParcela: c.valorParcela,
      formaPagamento: c.formaPagamento,
      prazoExecucao: c.prazoExecucao,
      garantia: c.garantia,
      cidadeContrato: c.cidadeContrato,
      status: c.status,
      observacoes: c.observacoes || '',
    })
    setModal(true)
  }

  function visualizarContrato(c: ContratoServico) {
    router.push(`/impressao-contrato/${encodeURIComponent(String(c.id))}?preview=1`)
  }

  async function salvarContrato() {
    if (!form.cliente?.nome) {
      alert('Selecione o cliente.')
      return
    }
    if (!form.descricaoServico) {
      alert('Informe o serviço.')
      return
    }

    setSalvando(true)
    try {
      const existente = editandoId ? contratos.find((c) => c.id === editandoId) : null
      const contrato: ContratoServico = {
        id: editandoId || Date.now().toString(),
        numero: form.numero || gerarNumero(contratos),
        data: existente?.data || new Date().toLocaleDateString('pt-BR'),
        validade: form.validade || existente?.validade || new Date(Date.now() + 365 * 86400000).toLocaleDateString('pt-BR'),
        cliente: form.cliente as Cliente,
        descricaoServico: form.descricaoServico || '',
        descricaoServicoItens: form.descricaoServicoItens || [],
        clausulasExtras: form.clausulasExtras || CLAUSULAS_PADRAO,
        valorTotal: Number(form.valorTotal || 0),
        parcelas: Number(form.parcelas || 1),
        valorParcela: Number(form.valorParcela || 0),
        formaPagamento: form.formaPagamento || 'PIX',
        prazoExecucao: form.prazoExecucao || '30 dias',
        garantia: form.garantia || '90 dias',
        cidadeContrato: form.cidadeContrato || 'Parnamirim/RN',
        status: (form.status as ContratoServico['status']) || existente?.status || 'Rascunho',
        observacoes: form.observacoes || '',
      }

      const salvo = await persistirContrato(contrato)
      if (editandoId) {
        setContratos((prev) => prev.map((c) => (c.id === salvo.id ? salvo : c)))
      } else {
        setContratos((prev) => [salvo, ...prev.filter((c) => c.id !== salvo.id)])
      }
      setModal(false)
      setEditandoId(null)
    } finally {
      setSalvando(false)
    }
  }

  async function enviarWhatsApp(c: ContratoServico) {
    setEnviando(true)
    try {
      let cfgRaw: Record<string, unknown> = {}
      try {
        cfgRaw = (await buscarConfiguracao()) as unknown as Record<string, unknown>
      } catch {
        try {
          cfgRaw = JSON.parse(localStorage.getItem('connect_configuracoes') || '{}')
        } catch {}
      }
      const empresaView = empresaContratoFromConfig(cfgRaw)
      const empresa = empresaView.nome

      const token = (() => {
        try {
          return crypto.randomUUID().replace(/-/g, '')
        } catch {
          return `${Date.now()}${Math.random().toString(36).slice(2)}`
        }
      })()

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const { data: sessao } = await supabase.auth.getSession()
        if (sessao?.session?.access_token) {
          headers.Authorization = `Bearer ${sessao.session.access_token}`
        }
      } catch {}

      let updatedAt = Date.now()
      const resp = await fetch('/api/public-docs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          document_type: 'contrato',
          tipo: 'contrato',
          document_id: String(c.id),
          documentoId: String(c.id),
          token,
          payload: payloadContratoPublico(c as unknown as Record<string, unknown>, empresaView, { token }),
        }),
      })
      if (!resp.ok) {
        throw new Error('Não foi possível gerar o link público do contrato. Tente novamente.')
      }
      const json = await resp.json().catch(() => null)
      updatedAt = timestampVersaoPublica(json?.updated_at || Date.now())

      const base = SITE_URL || (typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '')
      const link = `${base}/visualizar/contrato/${encodeURIComponent(String(c.id))}?token=${encodeURIComponent(token)}&v=${updatedAt}`

      const texto = `Olá ${c.cliente?.nome || ''}!

Segue seu *Contrato de Prestação de Serviço* Nº ${c.numero} da *${empresa}*.

*Serviço:* ${c.descricaoServico}
*Valor:* ${moedaHTML(c.valorTotal)}
*Parcelas:* ${c.parcelas}x de ${moedaHTML(c.valorParcela)}

Acesse e assine digitalmente:
${link}

Atenciosamente,
${empresa}`

      const numero = String(c.cliente?.telefone || '').replace(/\D/g, '')
      const zap = abrirWhatsappUrl(montarUrlWhatsapp(`55${numero}`, texto))
      if (!zap.abriu && !zap.mostrarLink) {
        throw new Error('Não foi possível abrir o WhatsApp.')
      }

      const enviado: ContratoServico = { ...c, status: 'Enviado' }
      const salvo = await persistirContrato(enviado)
      setContratos((prev) => prev.map((item) => (item.id === salvo.id ? salvo : item)))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar pelo WhatsApp.'
      alert(msg)
    } finally {
      setTimeout(() => setEnviando(false), 800)
    }
  }

  async function gerarPDF(c: ContratoServico) {
    setGerandoPDF(true)
    window.open(`/impressao-contrato/${c.id}?preview=1`, '_blank')
    setTimeout(() => setGerandoPDF(false), 1000)
  }

  function excluir(id: string) {
    deletarContrato(id)
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: 0 }}>Contratos de Serviço</h1>
        <button onClick={abrirModal} style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 20px', fontWeight: 900, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={20} /> Novo Contrato
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <Search size={20} style={{ color: '#94a3b8' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, cliente ou serviço..." style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15, outline: 'none' }} />
      </div>

      {filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
          <FileText size={48} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 17, fontWeight: 700, color: '#64748b' }}>Nenhum contrato cadastrado.</p>
          <p>Clique em "Novo Contrato" para criar o primeiro.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtrados.map(c => (
            <div key={c.id} style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 16, padding: '16px 18px', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ background: c.status === 'Assinado' ? '#22c55e' : c.status === 'Enviado' ? '#3b82f6' : '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 8 }}>{c.status}</span>
                  <h3 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Contrato Nº {c.numero}</h3>
                  <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>{c.cliente?.nome}</p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>{c.descricaoServico?.slice(0, 60)}{c.descricaoServico?.length > 60 ? '...' : ''}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{moedaHTML(c.valorTotal)}</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{c.data}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => visualizarContrato(c)} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Eye size={15} /> Visualizar
                </button>
                <button onClick={() => editarContrato(c)} style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={15} /> Editar
                </button>
                <button onClick={() => gerarPDF(c)} disabled={gerandoPDF} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Printer size={15} /> PDF
                </button>
                <button onClick={() => enviarWhatsApp(c)} disabled={enviando} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Share2 size={15} /> WhatsApp
                </button>
                <button onClick={() => excluir(c.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trash2 size={15} /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '24px 28px', width: '100%', maxWidth: 620, maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{editandoId ? 'Editar Contrato' : 'Novo Contrato'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#94a3b8' }}>&times;</button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Cliente</label>
                <select
                  value={form.cliente?.id || ''}
                  onChange={e => {
                    const cli = clientePorId(e.target.value)
                    if (cli) setForm(f => ({ ...f, cliente: cli }))
                    else setForm(f => ({ ...f, cliente: undefined }))
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }}
                >
                  <option value="">Selecione um cliente...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.nome} {c.cpf ? `| CPF: ${c.cpf}` : c.cnpj ? `| CNPJ: ${c.cnpj}` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Descrição do Serviço</label>
                <input value={form.descricaoServico || ''} onChange={e => setForm(f => ({ ...f, descricaoServico: e.target.value }))} placeholder="Ex: Assessoria contábil mensal, Manutenção de sites..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }} />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Itens do Serviço (um por linha)</label>
                <textarea
                  rows={4}
                  value={Array.isArray(form.descricaoServicoItens) ? form.descricaoServicoItens.join('\n') : ''}
                  onChange={e => setForm(f => ({ ...f, descricaoServicoItens: e.target.value.split('\n').filter(Boolean) }))}
                  placeholder="- Declaração de Imposto de Renda&#10;- Folha de pagamento&#10;- DCTF e EFD Contribuições"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Valor Total R$</label>
                  <input type="number" value={form.valorTotal || ''} onChange={e => setForm(f => ({ ...f, valorTotal: parseFloat(e.target.value) || 0 }))} placeholder="0,00" style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Parcelas</label>
                  <input type="number" min={1} max={24} value={form.parcelas || 1} onChange={e => setForm(f => ({ ...f, parcelas: parseInt(e.target.value) || 1 }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Forma de Pagamento</label>
                  <select value={form.formaPagamento || 'PIX'} onChange={e => setForm(f => ({ ...f, formaPagamento: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }}>
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Valor Parcela</label>
                  <input readOnly value={moedaHTML(form.valorParcela || 0)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15, background: '#f3f4f6' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Prazo de Execução</label>
                  <input value={form.prazoExecucao || ''} onChange={e => setForm(f => ({ ...f, prazoExecucao: e.target.value }))} placeholder="30 dias" style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Garantia do Serviço</label>
                  <input value={form.garantia || ''} onChange={e => setForm(f => ({ ...f, garantia: e.target.value }))} placeholder="90 dias" style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Observações</label>
                <textarea
                  rows={3}
                  value={form.observacoes || ''}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Observações internas ou para o cliente..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 14, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Cláusulas Adicionais (contrato)</label>
                <textarea
                  rows={10}
                  value={form.clausulasExtras || CLAUSULAS_PADRAO}
                  onChange={e => setForm(f => ({ ...f, clausulasExtras: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 14, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {editandoId ? (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Status</label>
                  <select
                    value={form.status || 'Rascunho'}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as ContratoServico['status'] }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 15 }}
                  >
                    <option value="Rascunho">Rascunho</option>
                    <option value="Enviado">Enviado</option>
                    <option value="Assinado">Assinado</option>
                    <option value="Vencido">Vencido</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => { setModal(false); setEditandoId(null) }} style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #dbe3ef', background: '#fff', fontWeight: 900, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => void salvarContrato()} disabled={salvando} style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 900, cursor: 'pointer', opacity: salvando ? 0.7 : 1 }}>
                  {salvando ? 'Salvando...' : editandoId ? 'Atualizar Contrato' : 'Salvar Contrato'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
