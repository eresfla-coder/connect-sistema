'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { exportarClientesExcel } from '@/lib/export-modulos'
import { lerLocalStorageUsuario, obterUserIdPainel, salvarLocalStorageUsuario } from '@/lib/connect-user-storage'
import { registrarLogSistema } from '@/lib/logs-sistema'

type Cliente = {
  id: string
  nome: string
  telefone: string
  cpfCnpj?: string | null
  endereco?: string | null
  bairro?: string | null
  cidade?: string | null
  cep?: string | null
  email?: string | null
  ativo?: boolean | null
}

type FormState = {
  nome: string
  telefone: string
  cpfCnpj: string
  endereco: string
  bairro: string
  cidade: string
  cep: string
  email: string
}

type FiltroRapido = 'todos' | 'com_whatsapp' | 'incompletos' | 'sem_cidade'

const inicial: FormState = {
  nome: '',
  telefone: '',
  cpfCnpj: '',
  endereco: '',
  bairro: '',
  cidade: '',
  cep: '',
  email: '',
}

const CLIENTES_KEY = 'connect_clientes'

function somenteNumeros(valor: string) {
  return String(valor || '').replace(/\D/g, '')
}

function normalizarTelefone(valor: string) {
  const digitos = somenteNumeros(valor)
  if (!digitos) return ''
  if (digitos.length <= 2) return digitos
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  if (digitos.length <= 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
  return `+${digitos.slice(0, 2)} (${digitos.slice(2, 4)}) ${digitos.slice(4, 9)}-${digitos.slice(9, 13)}`
}

function normalizarCliente(item: any): Cliente {
  return {
    id: String(item.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now())),
    nome: String(item.nome || ''),
    telefone: String(item.telefone || item.whatsapp || ''),
    cpfCnpj: String(item.cpfCnpj || item.cpf_cnpj || item.cpf || item.cnpj || ''),
    endereco: String(item.endereco || ''),
    bairro: String(item.bairro || ''),
    cidade: String(item.cidade || ''),
    cep: String(item.cep || ''),
    email: String(item.email || ''),
    ativo: item.ativo !== false,
  }
}

function juntarEndereco(cliente: Cliente) {
  return [cliente.endereco, cliente.bairro, cliente.cidade].filter(Boolean).join(' • ') || 'Endereço não informado'
}

function scoreCadastro(cliente: Cliente) {
  const campos = [cliente.nome, cliente.telefone, cliente.email, cliente.cpfCnpj, cliente.cep, cliente.bairro, cliente.cidade, cliente.endereco]
  const preenchidos = campos.filter((campo) => String(campo || '').trim()).length
  return Math.round((preenchidos / campos.length) * 100)
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return 'CL'
  return `${partes[0]?.[0] || ''}${partes[1]?.[0] || ''}`.toUpperCase()
}

function waLink(cliente: Cliente) {
  const telefone = somenteNumeros(cliente.telefone || '')
  const numero = telefone.length <= 11 ? `55${telefone}` : telefone
  const msg = `Olá ${cliente.nome || 'cliente'}! Aqui é da Connect Sistemas. Estou entrando em contato pelo seu cadastro.`
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
}

export default function ClientesPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(inicial)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todos')
  const [modoLista, setModoLista] = useState<'cards' | 'tabela'>('cards')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    void obterUserIdPainel().then(setUserId)
  }, [])

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  async function carregarClientes() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id || (await obterUserIdPainel())
    if (uid) setUserId(uid)

    let query = supabase.from('clientes').select('*').order('nome', { ascending: true })
    if (uid) query = query.eq('user_id', uid)

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar clientes:', error)
      try {
        const listaLocal = lerLocalStorageUsuario<Cliente[]>(CLIENTES_KEY, uid, [])
        const normalizados = Array.isArray(listaLocal) ? listaLocal.map(normalizarCliente) : []
        setClientes(normalizados)
        if (!selecionadoId && normalizados[0]) setSelecionadoId(normalizados[0].id)
      } catch {
        setClientes([])
      }
      setLoading(false)
      return
    }

    const normalizados = ((data || []) as any[]).map(normalizarCliente)
    setClientes(normalizados)
    if (!selecionadoId && normalizados[0]) setSelecionadoId(normalizados[0].id)
    try { salvarLocalStorageUsuario(CLIENTES_KEY, uid, normalizados) } catch {}
    setLoading(false)
  }

  useEffect(() => { carregarClientes() }, [])

  function novoCliente() {
    setForm(inicial)
    setEditandoId(null)
    setDrawerAberto(true)
  }

  function fecharDrawer() {
    setDrawerAberto(false)
    setEditandoId(null)
    setForm(inicial)
  }

  async function salvarCliente() {
    const nomeTratado = form.nome.trim()
    const telefoneTratado = form.telefone.trim()
    if (!nomeTratado) return alert('Digite o nome do cliente.')
    if (!telefoneTratado) return alert('Digite o telefone do cliente.')

    const telefoneLimpo = somenteNumeros(telefoneTratado)
    const existe = clientes.some((cliente) =>
      cliente.nome.trim().toLowerCase() === nomeTratado.toLowerCase()
      && somenteNumeros(cliente.telefone || '') === telefoneLimpo
      && cliente.id !== editandoId,
    )
    if (existe) return alert('Já existe um cliente com esse nome e telefone.')

    setSaving(true)

    const uid = userId || (await obterUserIdPainel())
    if (!uid) {
      alert('Sessão inválida. Faça login novamente.')
      setSaving(false)
      return
    }

    const enderecoBase = form.endereco.trim()
    const bairro = form.bairro.trim()
    const cidade = form.cidade.trim()

    const payloadCompleto: any = {
      nome: nomeTratado,
      telefone: telefoneTratado,
      cpfCnpj: form.cpfCnpj.trim() || null,
      endereco: enderecoBase || null,
      bairro: bairro || null,
      cidade: cidade || null,
      cep: form.cep.trim() || null,
      email: form.email.trim() || null,
      ativo: true,
      user_id: uid,
    }

    const salvar = (payload: any) => {
      if (editandoId) {
        const { user_id: _omit, ...rest } = payload
        let q = supabase.from('clientes').update(rest).eq('id', editandoId)
        q = q.eq('user_id', uid)
        return q
      }
      return supabase.from('clientes').insert(payload)
    }

    let { error } = await salvar(payloadCompleto)

    if (error && String(error.message || '').toLowerCase().includes('column')) {
      const enderecoComposto = [enderecoBase, bairro, cidade].filter(Boolean).join(' • ')
      const payloadCompat: any = {
        nome: nomeTratado,
        telefone: telefoneTratado,
        cpfCnpj: form.cpfCnpj.trim() || null,
        endereco: enderecoComposto || null,
        cep: form.cep.trim() || null,
        email: form.email.trim() || null,
        ativo: true,
      }
      if (!editandoId) payloadCompat.user_id = uid
      const retry = await salvar(payloadCompat)
      error = retry.error
    }

    if (error) {
      console.error('Erro ao salvar cliente:', error)
      alert(`Erro ao salvar cliente: ${error.message}`)
      setSaving(false)
      return
    }

    await carregarClientes()
    const { data: { session } } = await supabase.auth.getSession()
    void registrarLogSistema(session?.access_token || '', 'alterou_cliente', {
      modulo: 'clientes',
      referencia_id: editandoId || undefined,
    })
    setSaving(false)
    alert(editandoId ? 'Cliente atualizado com sucesso.' : 'Cliente salvo com sucesso.')
    fecharDrawer()
  }

  function editarCliente(cliente: Cliente) {
    setEditandoId(cliente.id)
    setForm({
      nome: cliente.nome || '',
      telefone: cliente.telefone || '',
      cpfCnpj: cliente.cpfCnpj || '',
      endereco: cliente.endereco || '',
      bairro: cliente.bairro || '',
      cidade: cliente.cidade || '',
      cep: cliente.cep || '',
      email: cliente.email || '',
    })
    setDrawerAberto(true)
  }

  async function excluirCliente(id: string) {
    if (!window.confirm('Deseja excluir este cliente?')) return
    const uid = userId || (await obterUserIdPainel())
    if (!uid) return alert('Sessão inválida.')
    let q = supabase.from('clientes').delete().eq('id', id)
    q = q.eq('user_id', uid)
    const { error } = await q
    if (error) return alert(`Erro ao excluir cliente: ${error.message}`)
    await carregarClientes()
    if (editandoId === id) fecharDrawer()
    if (selecionadoId === id) setSelecionadoId(null)
  }

  async function buscarCep() {
    const cep = somenteNumeros(form.cep)
    if (cep.length !== 8) return alert('Digite um CEP com 8 números.')
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (data?.erro) return alert('CEP não encontrado.')
      setForm((old) => ({
        ...old,
        endereco: old.endereco || String(data.logradouro || ''),
        bairro: String(data.bairro || old.bairro || ''),
        cidade: String(data.localidade || old.cidade || ''),
      }))
    } catch {
      alert('Não foi possível consultar o CEP agora.')
    } finally {
      setBuscandoCep(false)
    }
  }

  const clientesAtivos = useMemo(() => clientes.filter((cliente) => cliente.ativo !== false), [clientes])

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    let lista = clientesAtivos

    if (filtroRapido === 'com_whatsapp') lista = lista.filter((cliente) => somenteNumeros(cliente.telefone || '').length >= 10)
    if (filtroRapido === 'incompletos') lista = lista.filter((cliente) => scoreCadastro(cliente) < 70)
    if (filtroRapido === 'sem_cidade') lista = lista.filter((cliente) => !cliente.cidade)

    if (!termo) return lista
    return lista.filter((cliente) => [
      cliente.nome,
      cliente.telefone,
      cliente.email,
      cliente.cpfCnpj,
      cliente.endereco,
      cliente.bairro,
      cliente.cidade,
      cliente.cep,
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(termo)))
  }, [busca, clientesAtivos, filtroRapido])

  const clienteSelecionado = useMemo(() => {
    return clientesAtivos.find((cliente) => cliente.id === selecionadoId) || clientesFiltrados[0] || null
  }, [clientesAtivos, clientesFiltrados, selecionadoId])

  const totalComContato = clientesAtivos.filter((c) => c.telefone || c.email).length
  const totalWhatsapp = clientesAtivos.filter((c) => somenteNumeros(c.telefone || '').length >= 10).length
  const totalIncompletos = clientesAtivos.filter((c) => scoreCadastro(c) < 70).length
  const totalCidades = new Set(clientesAtivos.map((c) => c.cidade).filter(Boolean)).size
  const mediaCadastro = clientesAtivos.length ? Math.round(clientesAtivos.reduce((soma, c) => soma + scoreCadastro(c), 0) / clientesAtivos.length) : 0

  const inputStyle: CSSProperties = {
    width: '100%',
    height: 42,
    borderRadius: 14,
    border: '1px solid #dbe4ef',
    background: '#fff',
    padding: '0 13px',
    fontSize: 13,
    fontWeight: 700,
    outline: 'none',
    boxSizing: 'border-box',
  }
  const labelStyle: CSSProperties = { display: 'block', color: '#475569', fontWeight: 950, fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .6 }
  const btn: CSSProperties = { height: 32, borderRadius: 12, border: '1px solid rgba(96,165,250,.28)', padding: '0 12px', cursor: 'pointer', fontWeight: 950, fontSize: 11, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', lineHeight: 1, whiteSpace: 'nowrap' }
  const btnMiniAzul: CSSProperties = { ...btn, color: '#fff', background: 'linear-gradient(135deg,#2563eb,#1e40af)', borderColor: 'rgba(96,165,250,.55)', boxShadow: '0 9px 20px rgba(37,99,235,.18)' }
  const btnMiniVerde: CSSProperties = { ...btn, color: '#fff', background: 'linear-gradient(135deg,#16a34a,#065f46)', borderColor: 'rgba(34,197,94,.50)', boxShadow: '0 9px 20px rgba(22,163,74,.16)' }
  const btnMiniRoxo: CSSProperties = { ...btn, color: '#fff', background: 'linear-gradient(135deg,#7c3aed,#4c1d95)', borderColor: 'rgba(167,139,250,.55)', boxShadow: '0 9px 20px rgba(124,58,237,.16)' }
  const btnMiniCinza: CSSProperties = { ...btn, color: '#334155', background: 'linear-gradient(180deg,#ffffff,#f8fafc)', borderColor: '#dbe4ef' }
  const btnMiniVermelho: CSSProperties = { ...btn, color: '#fff', background: 'linear-gradient(135deg,#ef4444,#991b1b)', borderColor: 'rgba(248,113,113,.45)', boxShadow: '0 9px 20px rgba(239,68,68,.14)' }

  return (
    <div style={{ maxWidth: 1420, margin: '0 auto', padding: isMobile ? 12 : 24, color: '#0f172a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#2563eb', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1.4 }}>CRM Connect • Cliente 360</div>
          <h1 style={{ margin: '4px 0 0', fontSize: isMobile ? 32 : 46, lineHeight: .98, fontWeight: 950 }}>Cadastro de Clientes</h1>
          <p style={{ margin: '9px 0 0', color: '#64748b', fontWeight: 800 }}>Central premium para vender, cobrar, chamar no WhatsApp e manter dados completos.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
          <button onClick={carregarClientes} style={btnMiniCinza}>Atualizar</button>
          <button onClick={() => exportarClientesExcel(clientesAtivos as unknown as Record<string, unknown>[])} style={btnMiniCinza}>Exportar Excel</button>
          <Link href="/financeiro" style={btnMiniVerde}>Financeiro</Link>
          <button onClick={novoCliente} style={{ ...btnMiniAzul, height: 36, padding: '0 15px' }}>+ Novo cliente</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5,1fr)', gap: 12, marginBottom: 16 }}>
        <Metric title="Clientes ativos" value={String(clientesAtivos.length)} accent="#2563eb" />
        <Metric title="Com WhatsApp" value={String(totalWhatsapp)} accent="#16a34a" />
        <Metric title="Incompletos" value={String(totalIncompletos)} accent="#f97316" />
        <Metric title="Cidades" value={String(totalCidades || 0)} accent="#7c3aed" />
        <Metric title="Qualidade média" value={`${mediaCadastro}%`} accent="#0f172a" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 360px', gap: 14, alignItems: 'start' }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 26, background: 'rgba(255,255,255,.92)', boxShadow: '0 18px 46px rgba(15,23,42,.06)', padding: isMobile ? 12 : 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, WhatsApp, bairro, cidade, documento ou e-mail..." style={{ ...inputStyle, flex: 1, minWidth: 260 }} />
            <button onClick={() => setModoLista('cards')} style={modoLista === 'cards' ? btnMiniAzul : btnMiniCinza}>Cards</button>
            <button onClick={() => setModoLista('tabela')} style={modoLista === 'tabela' ? btnMiniAzul : btnMiniCinza}>Tabela</button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Filtro label="Todos" ativo={filtroRapido === 'todos'} onClick={() => setFiltroRapido('todos')} />
            <Filtro label="Com WhatsApp" ativo={filtroRapido === 'com_whatsapp'} onClick={() => setFiltroRapido('com_whatsapp')} />
            <Filtro label="Incompletos" ativo={filtroRapido === 'incompletos'} onClick={() => setFiltroRapido('incompletos')} />
            <Filtro label="Sem cidade" ativo={filtroRapido === 'sem_cidade'} onClick={() => setFiltroRapido('sem_cidade')} />
          </div>

          {loading ? (
            <div style={{ padding: 22, color: '#64748b', fontWeight: 800 }}>Carregando clientes...</div>
          ) : clientesFiltrados.length === 0 ? (
            <div style={{ padding: 26, border: '1px dashed #cbd5e1', borderRadius: 20, color: '#64748b', background: '#f8fafc' }}>
              <b>Nenhum cliente encontrado.</b>
              <div style={{ marginTop: 5 }}>Cadastre o primeiro cliente ou limpe os filtros para visualizar a lista.</div>
            </div>
          ) : modoLista === 'cards' ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 11 }}>
              {clientesFiltrados.map((cliente) => {
                const score = scoreCadastro(cliente)
                const ativo = clienteSelecionado?.id === cliente.id
                return (
                  <article key={cliente.id} onClick={() => setSelecionadoId(cliente.id)} style={{
                    border: ativo ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    borderRadius: 22,
                    background: ativo ? 'linear-gradient(135deg,#eff6ff,#ffffff)' : '#fff',
                    padding: 13,
                    boxShadow: ativo ? '0 18px 42px rgba(37,99,235,.14)' : '0 10px 24px rgba(15,23,42,.04)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <Avatar nome={cliente.nome} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ fontSize: 15, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cliente.nome}</strong>
                            <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>{cliente.bairro || 'Bairro não informado'} {cliente.cidade ? `• ${cliente.cidade}` : ''}</span>
                          </div>
                          <span style={{ color: score >= 70 ? '#047857' : '#b45309', background: score >= 70 ? '#dcfce7' : '#ffedd5', border: `1px solid ${score >= 70 ? '#86efac' : '#fed7aa'}`, borderRadius: 999, padding: '5px 8px', fontSize: 11, fontWeight: 950 }}>{score}%</span>
                        </div>
                        <div style={{ display: 'grid', gap: 4, marginTop: 9, color: '#475569', fontSize: 12, fontWeight: 800 }}>
                          <span>📲 {normalizarTelefone(cliente.telefone || '') || 'Sem WhatsApp'}</span>
                          <span>📍 {juntarEndereco(cliente)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                          {somenteNumeros(cliente.telefone || '').length >= 10 && <a href={waLink(cliente)} target="_blank" rel="noreferrer" style={btnMiniVerde}>WhatsApp</a>}
                          <Link href={`/clientes/${cliente.id}/financeiro`} style={btnMiniRoxo}>Financeiro</Link>
                          <button onClick={() => editarCliente(cliente)} style={btnMiniAzul}>Editar</button>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="connect-mobile-scroll" data-scroll-hint="true" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Cliente', 'Contato', 'Documento', 'Bairro / Cidade', 'Cadastro', 'Ações'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 5 ? 'right' : 'left', padding: '11px 10px', color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: .8, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map((cliente) => (
                    <tr key={cliente.id} onClick={() => setSelecionadoId(cliente.id)} style={{ cursor: 'pointer', background: clienteSelecionado?.id === cliente.id ? '#eff6ff' : '#fff' }}>
                      <td style={tdStyle}><b>{cliente.nome}</b><div style={{ color: '#64748b', fontSize: 12 }}>#{String(cliente.id).slice(0, 6)}</div></td>
                      <td style={tdStyle}>{normalizarTelefone(cliente.telefone || '') || '-'}<div style={{ color: '#64748b', fontSize: 12 }}>{cliente.email || ''}</div></td>
                      <td style={tdStyle}>{cliente.cpfCnpj || '-'}</td>
                      <td style={tdStyle}><b>{cliente.bairro || '-'}</b><div style={{ color: '#64748b', fontSize: 12 }}>{cliente.cidade || ''}</div></td>
                      <td style={tdStyle}><MiniBar value={scoreCadastro(cliente)} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <Link href={`/clientes/${cliente.id}/financeiro`} style={{ ...btnMiniRoxo, marginRight: 6 }}>R$</Link>
                        <button onClick={() => editarCliente(cliente)} style={{ ...btnMiniAzul, marginRight: 6 }}>Editar</button>
                        <button onClick={() => excluirCliente(cliente.id)} style={btnMiniVermelho}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside style={{ border: '1px solid #e2e8f0', borderRadius: 26, background: 'linear-gradient(180deg,#ffffff,#f8fafc)', boxShadow: '0 18px 46px rgba(15,23,42,.06)', padding: 16, position: isMobile ? 'static' : 'sticky', top: 14 }}>
          {clienteSelecionado ? (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar nome={clienteSelecionado.nome} large />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#2563eb', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1 }}>Cliente selecionado</div>
                  <h2 style={{ margin: '4px 0 0', fontSize: 22, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clienteSelecionado.nome}</h2>
                </div>
              </div>

              <div style={{ marginTop: 15, padding: 12, borderRadius: 18, border: '1px solid #e2e8f0', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <b style={{ fontSize: 12, color: '#475569' }}>Qualidade do cadastro</b>
                  <b>{scoreCadastro(clienteSelecionado)}%</b>
                </div>
                <MiniBar value={scoreCadastro(clienteSelecionado)} />
              </div>

              <Info label="WhatsApp" value={normalizarTelefone(clienteSelecionado.telefone || '') || 'Não informado'} />
              <Info label="E-mail" value={clienteSelecionado.email || 'Não informado'} />
              <Info label="Documento" value={clienteSelecionado.cpfCnpj || 'Não informado'} />
              <Info label="Endereço" value={juntarEndereco(clienteSelecionado)} />

              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {somenteNumeros(clienteSelecionado.telefone || '').length >= 10 && <a href={waLink(clienteSelecionado)} target="_blank" rel="noreferrer" style={{ ...btnMiniVerde, height: 38 }}>Chamar no WhatsApp</a>}
                <Link href={`/clientes/${clienteSelecionado.id}/financeiro`} style={{ ...btnMiniRoxo, height: 38 }}>Ver financeiro do cliente</Link>
                <button onClick={() => editarCliente(clienteSelecionado)} style={{ ...btnMiniAzul, height: 38 }}>Editar cadastro</button>
                <button onClick={() => excluirCliente(clienteSelecionado.id)} style={{ ...btnMiniVermelho, height: 38 }}>Excluir cliente</button>
              </div>
            </>
          ) : (
            <div style={{ color: '#64748b', fontWeight: 800 }}>Selecione um cliente para ver ações rápidas.</div>
          )}
        </aside>
      </div>

      {drawerAberto && <div onClick={fecharDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(7px)', zIndex: 900 }} />}
      <aside style={drawerAberto ? {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: isMobile ? 'calc(100vw - 18px)' : 620,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: isMobile ? 'calc(100vh - 18px)' : 'calc(100vh - 48px)',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: isMobile ? 22 : 30,
        boxShadow: '0 34px 90px rgba(15,23,42,.30)',
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
      } : { display: 'none' }}>
        <div style={{ padding: isMobile ? '14px 14px 10px' : '18px 22px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', background: 'linear-gradient(135deg,#ffffff,#eff6ff)' }}>
          <div>
            <div style={{ color: '#2563eb', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1 }}>Cadastro rápido premium</div>
            <h2 style={{ margin: '4px 0 0', fontSize: isMobile ? 23 : 28, lineHeight: 1 }}>{editandoId ? 'Editar cliente' : 'Novo cliente'}</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 800, fontSize: 13 }}>Nome e WhatsApp são obrigatórios. CEP pode preencher endereço automaticamente.</p>
          </div>
          <button onClick={fecharDrawer} style={{ ...btnMiniCinza, minWidth: 70 }}>Fechar</button>
        </div>

        <div style={{ padding: isMobile ? 14 : 17, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 11 }}>
            <Field label="Nome" value={form.nome} onChange={(v) => setForm((old) => ({ ...old, nome: v }))} style={inputStyle} labelStyle={labelStyle} wide />
            <Field label="Telefone / WhatsApp" value={form.telefone} onChange={(v) => setForm((old) => ({ ...old, telefone: normalizarTelefone(v) }))} style={inputStyle} labelStyle={labelStyle} />
            <Field label="CPF / CNPJ" value={form.cpfCnpj} onChange={(v) => setForm((old) => ({ ...old, cpfCnpj: v }))} style={inputStyle} labelStyle={labelStyle} />
            <Field label="E-mail" value={form.email} onChange={(v) => setForm((old) => ({ ...old, email: v }))} style={inputStyle} labelStyle={labelStyle} />
            <label>
              <span style={labelStyle}>CEP</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={form.cep} onChange={(e) => setForm((old) => ({ ...old, cep: e.target.value }))} style={inputStyle} />
                <button type="button" onClick={buscarCep} disabled={buscandoCep} style={{ ...btnMiniCinza, height: 42, minWidth: 86 }}>{buscandoCep ? 'Buscando' : 'Buscar'}</button>
              </div>
            </label>
            <Field label="Bairro" value={form.bairro} onChange={(v) => setForm((old) => ({ ...old, bairro: v }))} style={inputStyle} labelStyle={labelStyle} />
            <Field label="Cidade" value={form.cidade} onChange={(v) => setForm((old) => ({ ...old, cidade: v }))} style={inputStyle} labelStyle={labelStyle} />
            <Field label="Endereço" value={form.endereco} onChange={(v) => setForm((old) => ({ ...old, endereco: v }))} style={inputStyle} labelStyle={labelStyle} wide />
          </div>
        </div>

        <div style={{ background: '#fff', padding: isMobile ? '12px 14px calc(14px + env(safe-area-inset-bottom))' : '12px 17px 17px', display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #eef2f7', flexShrink: 0, boxShadow: '0 -10px 22px rgba(15,23,42,.05)' }}>
          <button onClick={fecharDrawer} style={{ ...btnMiniCinza, minWidth: 82 }}>Cancelar</button>
          <button onClick={salvarCliente} disabled={saving} style={{ ...btnMiniAzul, minWidth: 126 }}>{saving ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar cliente'}</button>
        </div>
      </aside>
    </div>
  )
}

const tdStyle: CSSProperties = {
  padding: '11px 10px',
  borderBottom: '1px solid #eef2f7',
  verticalAlign: 'middle',
  fontSize: 13,
}

function Metric({ title, value, accent }: { title: string, value: string, accent: string }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: 14, boxShadow: '0 12px 30px rgba(15,23,42,.04)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 5, background: accent }} />
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: .8 }}>{title}</div>
      <div style={{ marginTop: 7, fontSize: 28, fontWeight: 950, lineHeight: 1, color: accent }}>{value}</div>
    </div>
  )
}

function Field({ label, value, onChange, style, labelStyle, wide = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  style: CSSProperties
  labelStyle: CSSProperties
  wide?: boolean
}) {
  return (
    <label style={{ gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={labelStyle}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={style} />
    </label>
  )
}

function Avatar({ nome, large = false }: { nome: string, large?: boolean }) {
  return (
    <div style={{ width: large ? 58 : 46, height: large ? 58 : 46, borderRadius: 18, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 950, boxShadow: '0 14px 30px rgba(37,99,235,.20)', flexShrink: 0 }}>
      {iniciais(nome)}
    </div>
  )
}

function MiniBar({ value }: { value: number }) {
  const cor = value >= 70 ? '#16a34a' : value >= 45 ? '#f97316' : '#ef4444'
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(4, Math.min(100, value))}%`, height: '100%', background: cor, borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, fontWeight: 950, color: cor }}>{value}% completo</div>
    </div>
  )
}

function Info({ label, value }: { label: string, value: string }) {
  return (
    <div style={{ marginTop: 10, padding: '10px 11px', borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase', letterSpacing: .7 }}>{label}</div>
      <div style={{ marginTop: 3, color: '#0f172a', fontSize: 13, fontWeight: 850, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function Filtro({ label, ativo, onClick }: { label: string, ativo: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      height: 30,
      borderRadius: 999,
      border: ativo ? '1px solid #2563eb' : '1px solid #dbe4ef',
      background: ativo ? '#eff6ff' : '#fff',
      color: ativo ? '#1d4ed8' : '#475569',
      padding: '0 12px',
      fontWeight: 950,
      fontSize: 11,
      cursor: 'pointer',
      boxShadow: ativo ? '0 8px 18px rgba(37,99,235,.12)' : 'none',
    }}>{label}</button>
  )
}
