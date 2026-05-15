'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Search, Trash2, Printer, Share2, Loader2 } from 'lucide-react'
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

type ContratoServico = {
  id: string
  numero: string
  data: string
  validade: string
  cliente: Cliente
  descricaoServico: string
  descricaoServicoItens: string[]
  clausulasExtras: string
  valorTotal: number
  parcelas: number
  valorParcela: number
  formaPagamento: string
  prazoExecucao: string
  garantia: string
  cidadeContrato: string
  status: 'Rascunho' | 'Enviado' | 'Assinado' | 'Vencido'
}

const STORAGE_KEY = 'connect_contratos'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

// Migração: buscar do Supabase primeiro, fallback localStorage
async function buscarContratos(): Promise<ContratoServico[]> {
  try {
    const { data, error } = await supabase
      .from('contratos')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      const mapeados = data.map((item: any) => ({
        id: item.id,
        numero: item.numero,
        data: item.data,
        validade: item.validade,
        cliente: item.cliente_id ? {
          id: item.cliente_id,
          nome: item.cliente_nome,
        } : { id: '', nome: item.cliente_nome || '' },
        descricaoServico: item.descricao_servico,
        descricaoServicoItens: item.descricao_servico_itens || [],
        clausulasExtras: item.clausulas_extras,
        valorTotal: item.valor_total,
        parcelas: item.parcelas,
        valorParcela: item.valor_parcela,
        formaPagamento: item.forma_pagamento,
        prazoExecucao: item.prazo_execucao,
        garantia: item.garantia,
        cidadeContrato: item.cidade_contrato,
        status: item.status,
      }))
      // Sincronizar localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mapeados))
      return mapeados
    }
  } catch (e) {
    console.warn('[contratos] Erro Supabase:', e)
  }

  // Fallback localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const lista = JSON.parse(raw)
      if (Array.isArray(lista)) return lista
    }
  } catch {}

  return []
}

async function salvarContratoSupabase(contrato: ContratoServico): Promise<void> {
  // Sempre salvar localStorage
  try {
    const existentes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const lista = Array.isArray(existentes) ? existentes : []
    const idx = lista.findIndex((c: any) => c.id === contrato.id)
    if (idx >= 0) lista[idx] = contrato
    else lista.unshift(contrato)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
  } catch {}

  // Tentar Supabase
  try {
    const payload = {
      numero: contrato.numero,
      data: contrato.data,
      validade: contrato.validade,
      cliente_nome: contrato.cliente?.nome || '',
      descricao_servico: contrato.descricaoServico,
      descricao_servico_itens: contrato.descricaoServicoItens,
      clausulas_extras: contrato.clausulasExtras,
      valor_total: contrato.valorTotal,
      parcelas: contrato.parcelas,
      valor_parcela: contrato.valorParcela,
      forma_pagamento: contrato.formaPagamento,
      prazo_execucao: contrato.prazoExecucao,
      garantia: contrato.garantia,
      cidade_contrato: contrato.cidadeContrato,
      status: contrato.status,
    }

    await supabase.from('contratos').insert(payload)
  } catch (e) {
    console.warn('[contratos] Erro ao salvar no Supabase:', e)
  }
}

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
  const [enviando, setEnviando] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
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

  useEffect(() => {
    async function carregar() {
      const lista = await buscarContratos()
      setContratos(lista)

      try {
        const clientesSalvos = localStorage.getItem('connect_clientes')
        if (clientesSalvos) {
          const lista = JSON.parse(clientesSalvos)
          if (Array.isArray(lista)) setClientes(lista)
        }
      } catch {}
    }
    carregar()
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

  function salvarLista(nova: ContratoServico[]) {
    setContratos(nova)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nova))
  }

  async function deletarContrato(id: string) {
    if (!confirm('Excluir contrato?')) return
    try {
      await supabase.from('contratos').delete().eq('id', id)
    } catch {}
    salvarLista(contratos.filter(c => c.id !== id))
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
    })
    setModal(true)
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

    const novo: ContratoServico = {
      id: Date.now().toString(),
      numero: form.numero || gerarNumero(contratos),
      data: new Date().toLocaleDateString('pt-BR'),
      validade: new Date(Date.now() + 365 * 86400000).toLocaleDateString('pt-BR'),
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
      status: 'Rascunho',
    }

    await salvarContratoSupabase(novo)
    setContratos(prev => [novo, ...prev])
    setModal(false)
  }

  async function enviarWhatsApp(c: ContratoServico) {
    setEnviando(true)
    const config = JSON.parse(localStorage.getItem('connect_configuracoes') || '{}')
    const empresa = config.nomeEmpresa || 'Empresa'

    const token = (() => {
      try {
        return crypto.randomUUID().replace(/-/g, '')
      } catch {
        return `${Date.now()}${Math.random().toString(36).slice(2)}`
      }
    })()

    const empresaPublica = {
      nome: config.nomeEmpresa || 'LOJA CONNECT',
      telefone: config.telefone || '',
      endereco: config.endereco || '',
      cidadeUf: config.cidadeUf || '',
    }

    try {
      const resp = await fetch('/api/public-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'contrato',
          document_id: String(c.id),
          token,
          payload: { contrato: c, empresaPublica },
        }),
      })
      if (!resp.ok) {
        alert('Não foi possível gerar o link público do contrato. Tente novamente.')
        setEnviando(false)
        return
      }
    } catch {
      alert('Não foi possível gerar o link público do contrato. Verifique sua conexão.')
      setEnviando(false)
      return
    }

    const base = SITE_URL || (typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '')
    const link = `${base}/visualizar/contrato/${encodeURIComponent(String(c.id))}?token=${encodeURIComponent(token)}`

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
    window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`, '_blank')
    setTimeout(() => setEnviando(false), 800)
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
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Novo Contrato</h2>
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
                <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 6 }}>Cláusulas Adicionais (contrato)</label>
                <textarea
                  rows={10}
                  value={form.clausulasExtras || CLAUSULAS_PADRAO}
                  onChange={e => setForm(f => ({ ...f, clausulasExtras: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe3ef', fontSize: 14, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setModal(false)} style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid #dbe3ef', background: '#fff', fontWeight: 900, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvarContrato} style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Salvar Contrato</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
