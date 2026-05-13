'use client'

import { useMemo, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Cliente = {
  id: number
  supabaseId?: string
  nome: string
  telefone: string
  whatsapp?: string
  cpfCnpj: string
  cpf?: string
  cnpj?: string
  endereco: string
  cep: string
  email: string
  tipoPessoa?: 'PF' | 'PJ'
  ativo?: boolean
}

type ClienteSupabase = {
  id: string
  local_id?: string | null
  nome?: string | null
  telefone?: string | null
  whatsapp?: string | null
  email?: string | null
  cpf_cnpj?: string | null
  cpf?: string | null
  cnpj?: string | null
  endereco?: string | null
  cep?: string | null
  ativo?: boolean | null
}

const CLIENTES_KEY = 'connect_clientes'
const CLIENTES_EXCLUSOES_PENDENTES_KEY = 'connect_clientes_exclusoes_pendentes'

const CLIENTES_INICIAIS: Cliente[] = [
  {
    id: 1,
    nome: 'ERIC DAMASCENO',
    telefone: '84992181399',
    cpfCnpj: '000.000.000-00',
    endereco: 'GILBERTO ROBERTO, 243',
    cep: '59157300',
    email: 'LOJACONNECT@HOTMAIL.COM',
    ativo: true,
  },
  {
    id: 2,
    nome: 'MARIA SILVA',
    telefone: '84999998888',
    cpfCnpj: '111.111.111-11',
    endereco: 'RUA DAS FLORES, 120',
    cep: '59000000',
    email: 'MARIA@EMAIL.COM',
    ativo: true,
  },
]

function gerarIdNumerico(texto?: string | null) {
  const valor = String(texto || '')
  if (!valor) return Date.now()

  let hash = 0
  for (let i = 0; i < valor.length; i += 1) {
    hash = (hash * 31 + valor.charCodeAt(i)) % 2147483647
  }

  return hash || Date.now()
}

function normalizarClienteLocal(item: any, index: number): Cliente {
  const cpfCnpj = String(item?.cpfCnpj || item?.cpf_cnpj || item?.documento || item?.cpf || item?.cnpj || '')
  const idNumerico = Number(item?.id)
  const id = Number.isFinite(idNumerico) && idNumerico > 0
    ? idNumerico
    : gerarIdNumerico(item?.local_id || item?.supabaseId || item?.id || `${Date.now()}-${index}`)

  return {
    id,
    supabaseId: item?.supabaseId ? String(item.supabaseId) : undefined,
    nome: String(item?.nome || ''),
    telefone: String(item?.telefone || item?.whatsapp || ''),
    whatsapp: String(item?.whatsapp || item?.telefone || ''),
    cpfCnpj,
    cpf: String(item?.cpf || ''),
    cnpj: String(item?.cnpj || ''),
    endereco: String(item?.endereco || ''),
    cep: String(item?.cep || ''),
    email: String(item?.email || ''),
    tipoPessoa: item?.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
    ativo: item?.ativo !== false,
  }
}

function normalizarClienteSupabase(item: ClienteSupabase): Cliente {
  const localId = item.local_id || ''
  const idNumerico = Number(localId)
  const cpfCnpj = String(item.cpf_cnpj || item.cpf || item.cnpj || '')

  return {
    id: Number.isFinite(idNumerico) && idNumerico > 0 ? idNumerico : gerarIdNumerico(item.id),
    supabaseId: item.id,
    nome: String(item.nome || ''),
    telefone: String(item.telefone || item.whatsapp || ''),
    whatsapp: String(item.whatsapp || item.telefone || ''),
    cpfCnpj,
    cpf: String(item.cpf || ''),
    cnpj: String(item.cnpj || ''),
    endereco: String(item.endereco || ''),
    cep: String(item.cep || ''),
    email: String(item.email || ''),
    tipoPessoa: item.cnpj ? 'PJ' : 'PF',
    ativo: item.ativo !== false,
  }
}

function carregarCacheClientes() {
  try {
    const salvo = localStorage.getItem(CLIENTES_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    if (!Array.isArray(lista)) return []
    return lista.map(normalizarClienteLocal).filter((cliente) => Boolean(cliente.nome))
  } catch {
    return []
  }
}

function salvarCacheClientes(lista: Cliente[]) {
  localStorage.setItem(CLIENTES_KEY, JSON.stringify(lista))
}

function carregarExclusoesPendentes(): Cliente[] {
  try {
    const salvo = localStorage.getItem(CLIENTES_EXCLUSOES_PENDENTES_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    if (!Array.isArray(lista)) return []
    return lista.map(normalizarClienteLocal)
  } catch {
    return []
  }
}

function salvarExclusoesPendentes(lista: Cliente[]) {
  localStorage.setItem(CLIENTES_EXCLUSOES_PENDENTES_KEY, JSON.stringify(lista))
}

function adicionarExclusaoPendente(cliente: Cliente) {
  const pendentes = carregarExclusoesPendentes()
  const jaExiste = pendentes.some(
    (item) =>
      item.supabaseId === cliente.supabaseId ||
      String(item.id) === String(cliente.id)
  )

  if (!jaExiste) {
    salvarExclusoesPendentes([cliente, ...pendentes])
  }
}

async function obterUsuarioId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.id) {
    throw new Error('Usuário Supabase não identificado.')
  }

  return data.user.id
}

function clienteParaSupabase(cliente: Cliente, userId: string) {
  return {
    id: cliente.supabaseId,
    user_id: userId,
    local_id: String(cliente.id),
    nome: cliente.nome,
    telefone: cliente.telefone,
    whatsapp: cliente.whatsapp || cliente.telefone,
    email: cliente.email || null,
    cpf_cnpj: cliente.cpfCnpj || cliente.cpf || cliente.cnpj || null,
    cpf: cliente.cpf || null,
    cnpj: cliente.cnpj || null,
    endereco: cliente.endereco || null,
    cep: cliente.cep || null,
    ativo: cliente.ativo !== false,
  }
}

async function listarClientesSupabase() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, local_id, nome, telefone, whatsapp, email, cpf_cnpj, cpf, cnpj, endereco, cep, ativo')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw error
  return (data || []).map(normalizarClienteSupabase)
}

async function migrarClientesLocais(lista: Cliente[], userId: string) {
  const registros = lista
    .filter((cliente) => cliente.nome.trim() && cliente.telefone.trim())
    .map((cliente) => clienteParaSupabase(cliente, userId))

  if (registros.length === 0) return []

  const { data, error } = await supabase
    .from('clientes')
    .upsert(registros, { onConflict: 'user_id,local_id' })
    .select('id, local_id, nome, telefone, whatsapp, email, cpf_cnpj, cpf, cnpj, endereco, cep, ativo')

  if (error) throw error
  return (data || []).map(normalizarClienteSupabase)
}

async function sincronizarExclusoesPendentes(userId: string) {
  const pendentes = carregarExclusoesPendentes()
  if (pendentes.length === 0) return

  const aindaPendentes: Cliente[] = []

  for (const cliente of pendentes) {
    try {
      const query = supabase.from('clientes').delete()

      const { error } = cliente.supabaseId
        ? await query.eq('id', cliente.supabaseId)
        : await query.eq('user_id', userId).eq('local_id', String(cliente.id))

      if (error) throw error
    } catch {
      aindaPendentes.push(cliente)
    }
  }

  salvarExclusoesPendentes(aindaPendentes)
}

async function salvarClienteSupabase(cliente: Cliente, userId: string) {
  const registro = clienteParaSupabase(cliente, userId)

  if (cliente.supabaseId) {
    const { data, error } = await supabase
      .from('clientes')
      .update({
        nome: registro.nome,
        telefone: registro.telefone,
        whatsapp: registro.whatsapp,
        email: registro.email,
        cpf_cnpj: registro.cpf_cnpj,
        cpf: registro.cpf,
        cnpj: registro.cnpj,
        endereco: registro.endereco,
        cep: registro.cep,
        ativo: registro.ativo,
      })
      .eq('id', cliente.supabaseId)
      .select('id, local_id, nome, telefone, whatsapp, email, cpf_cnpj, cpf, cnpj, endereco, cep, ativo')
      .single()

    if (error) throw error
    return normalizarClienteSupabase(data)
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert(registro)
    .select('id, local_id, nome, telefone, whatsapp, email, cpf_cnpj, cpf, cnpj, endereco, cep, ativo')
    .single()

  if (error) throw error
  return normalizarClienteSupabase(data)
}

export default function ClientesPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [endereco, setEndereco] = useState('')
  const [cep, setCep] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    let cancelado = false

    async function carregarClientes() {
      const cache = carregarCacheClientes()
      if (cache.length > 0) {
        setClientes(cache)
      }

      try {
        const userId = await obterUsuarioId()

        await sincronizarExclusoesPendentes(userId)

        if (cache.length > 0) {
          await migrarClientesLocais(cache, userId)
        }

        const remotos = await listarClientesSupabase()
        if (cancelado) return

        salvarLista(remotos)
      } catch (error) {
        console.error('Erro ao sincronizar clientes com Supabase:', error)
        if (cancelado) return

        if (cache.length > 0) {
          salvarLista(cache)
        } else {
          salvarLista(CLIENTES_INICIAIS)
        }
      }
    }

    carregarClientes()

    return () => {
      cancelado = true
    }
  }, [])

  function salvarLista(lista: Cliente[]) {
    setClientes(lista)
    salvarCacheClientes(lista)
  }

  function limparFormulario() {
    setNome('')
    setTelefone('')
    setCpfCnpj('')
    setEndereco('')
    setCep('')
    setEmail('')
    setEditandoId(null)
  }

  async function salvarCliente() {
    const nomeTratado = nome.trim()
    const telefoneTratado = telefone.trim()
    const cpfCnpjTratado = cpfCnpj.trim()
    const documentoNumeros = cpfCnpjTratado.replace(/\D/g, '')
    const cpf = documentoNumeros.length <= 11 ? cpfCnpjTratado : ''
    const cnpj = documentoNumeros.length > 11 ? cpfCnpjTratado : ''

    if (!nomeTratado) {
      alert('Digite o nome do cliente.')
      return
    }

    if (!telefoneTratado) {
      alert('Digite o telefone do cliente.')
      return
    }

    const existe = clientes.some(
      (cliente) =>
        cliente.nome.trim().toLowerCase() === nomeTratado.toLowerCase() &&
        cliente.telefone.trim() === telefoneTratado &&
        cliente.id !== editandoId,
    )

    if (existe) {
      alert('Já existe um cliente com esse nome e telefone.')
      return
    }

    if (editandoId !== null) {
      const atual = clientes.find((cliente) => cliente.id === editandoId)
      if (!atual) return

      const clienteAtualizado: Cliente = {
        ...atual,
        nome: nomeTratado,
        telefone: telefoneTratado,
        whatsapp: telefoneTratado,
        cpfCnpj: cpfCnpjTratado,
        cpf,
        cnpj,
        endereco: endereco.trim(),
        cep: cep.trim(),
        email: email.trim(),
        tipoPessoa: cnpj ? 'PJ' : 'PF',
        ativo: true,
      }

      const atualizada = clientes.map((cliente) =>
        cliente.id === editandoId ? clienteAtualizado : cliente,
      )

      try {
        const userId = await obterUsuarioId()
        const salvo = await salvarClienteSupabase(clienteAtualizado, userId)
        salvarLista(clientes.map((cliente) => (cliente.id === editandoId ? salvo : cliente)))
        alert('Cliente atualizado com sucesso.')
      } catch (error) {
        console.error('Erro ao atualizar cliente no Supabase:', error)
        salvarLista(atualizada)
        alert('Cliente atualizado no cache local. A sincronização será tentada novamente depois.')
      }
    } else {
      const novo: Cliente = {
        id: Date.now(),
        nome: nomeTratado,
        telefone: telefoneTratado,
        whatsapp: telefoneTratado,
        cpfCnpj: cpfCnpjTratado,
        cpf,
        cnpj,
        endereco: endereco.trim(),
        cep: cep.trim(),
        email: email.trim(),
        tipoPessoa: cnpj ? 'PJ' : 'PF',
        ativo: true,
      }

      try {
        const userId = await obterUsuarioId()
        const salvo = await salvarClienteSupabase(novo, userId)
        salvarLista([salvo, ...clientes])
        alert('Cliente salvo com sucesso.')
      } catch (error) {
        console.error('Erro ao salvar cliente no Supabase:', error)
        salvarLista([novo, ...clientes])
        alert('Cliente salvo no cache local. A sincronização será tentada novamente depois.')
      }
    }

    limparFormulario()
  }

  function editarCliente(cliente: Cliente) {
    setEditandoId(cliente.id)
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setCpfCnpj(cliente.cpfCnpj)
    setEndereco(cliente.endereco)
    setCep(cliente.cep)
    setEmail(cliente.email)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluirCliente(id: number) {
    const confirmar = window.confirm('Deseja excluir este cliente?')
    if (!confirmar) return

    const clienteExcluir = clientes.find((cliente) => cliente.id === id)
    const atualizada = clientes.filter((cliente) => cliente.id !== id)

    try {
      if (clienteExcluir?.supabaseId) {
        const { error } = await supabase
          .from('clientes')
          .delete()
          .eq('id', clienteExcluir.supabaseId)

        if (error) throw error
      } else if (clienteExcluir) {
        const userId = await obterUsuarioId()
        const { error } = await supabase
          .from('clientes')
          .delete()
          .eq('user_id', userId)
          .eq('local_id', String(clienteExcluir.id))

        if (error) throw error
      }

      salvarLista(atualizada)
    } catch (error) {
      console.error('Erro ao excluir cliente no Supabase:', error)
      if (clienteExcluir) {
        adicionarExclusaoPendente(clienteExcluir)
      }
      salvarLista(atualizada)
      alert('Cliente removido do cache local. A exclusão no Supabase será tentada novamente depois.')
    }

    if (editandoId === id) {
      limparFormulario()
    }
  }

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    const ativos = clientes.filter((cliente) => cliente.ativo !== false)

    if (!termo) return ativos

    return ativos.filter((cliente) => {
      return (
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.telefone.toLowerCase().includes(termo) ||
        cliente.email.toLowerCase().includes(termo) ||
        cliente.cpfCnpj.toLowerCase().includes(termo)
      )
    })
  }, [busca, clientes])

  const containerStyle: React.CSSProperties = {
    maxWidth: 1180,
    margin: '0 auto',
    padding: isMobile ? 12 : 18,
    boxSizing: 'border-box',
  }

  const panelStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(12,18,40,0.96), rgba(9,14,34,0.96))',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
    overflow: 'hidden',
  }

  const sectionTitleStyle: React.CSSProperties = {
    color: '#f8fafc',
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#f8fafc',
    fontWeight: 800,
    fontSize: 13,
    marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 42,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: '#ffffff',
    padding: '0 12px',
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  }

  const buttonStyle: React.CSSProperties = {
    height: 42,
    border: 'none',
    borderRadius: 10,
    padding: '0 16px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 14,
  }

  return (
    <div style={containerStyle}>
      <div
        style={{
          marginBottom: 14,
          textAlign: 'center',
          color: '#f8fafc',
          fontSize: isMobile ? 28 : 32,
          fontWeight: 900,
          letterSpacing: 0.5,
        }}
      >
        Cadastro de Clientes
      </div>

      <div style={panelStyle}>
        <div
          style={{
            padding: 14,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05))',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              style={{
                ...buttonStyle,
                background: '#f3f4f6',
                color: '#111827',
              }}
              onClick={limparFormulario}
            >
              {editandoId !== null ? 'Cancelar edição' : 'Cadastrar'}
            </button>

            <div
              style={{
                flex: 1,
                minWidth: 260,
              }}
            >
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar por nome, telefone, email ou CPF/CNPJ"
                style={inputStyle}
              />
            </div>

            <button
              style={{
                ...buttonStyle,
                background: 'linear-gradient(90deg, #f97316, #fb923c)',
                color: '#fff',
              }}
            >
              Buscar
            </button>
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={sectionTitleStyle}>{editandoId !== null ? 'Editar cliente' : 'Novo cliente'}</div>

          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 1fr' : '1.4fr 1fr',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>Nome</label>
              <input
                style={inputStyle}
                placeholder="Digite o nome do cliente"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Telefone</label>
              <input
                style={inputStyle}
                placeholder="Digite o telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>CPF/CNPJ</label>
              <input
                style={inputStyle}
                placeholder="Digite o CPF ou CNPJ"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>CEP</label>
              <input
                style={inputStyle}
                placeholder="Digite o CEP"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Endereço</label>
              <input
                style={inputStyle}
                placeholder="Digite o endereço"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>E-mail</label>
              <input
                style={inputStyle}
                placeholder="Digite o e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              style={{
                ...buttonStyle,
                background: '#1f2937',
                color: '#fff',
              }}
              onClick={limparFormulario}
            >
              Limpar
            </button>

            <button
              style={{
                ...buttonStyle,
                minWidth: 180,
                background: 'linear-gradient(90deg, #16a34a, #22c55e)',
                color: '#fff',
                boxShadow: '0 10px 20px rgba(34,197,94,0.24)',
              }}
              onClick={salvarCliente}
            >
              {editandoId !== null ? 'Atualizar cliente' : 'Salvar cliente'}
            </button>
          </div>
        </div>

        <div style={{ padding: 0 }}>
          <div
            style={{
              overflowX: 'auto',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div
              style={{
                minWidth: isMobile ? 1080 : 'auto',
                display: 'grid',
                gridTemplateColumns: isMobile ? '180px 140px 140px 180px 120px 180px 150px' : '1.6fr 1fr 1fr 1.4fr 0.9fr 1.3fr auto',
                gap: 0,
                background: 'linear-gradient(90deg, #f97316, #fb923c)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 13,
                textTransform: 'uppercase',
              }}
            >
            <div style={{ padding: '12px 10px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>Nome</div>
            <div style={{ padding: '12px 10px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>CPF/CNPJ</div>
            <div style={{ padding: '12px 10px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>Telefone</div>
            <div style={{ padding: '12px 10px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>Endereço</div>
            <div style={{ padding: '12px 10px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>CEP</div>
            <div style={{ padding: '12px 10px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>E-mail</div>
            <div style={{ padding: '12px 10px' }}>Ações</div>
            </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                maxHeight: 420,
                overflow: 'auto',
              }}
            >
              {clientesFiltrados.length === 0 ? (
              <div
                style={{
                  padding: 22,
                  color: '#f8fafc',
                  fontWeight: 700,
                }}
              >
                Nenhum cliente encontrado.
              </div>
            ) : (
              clientesFiltrados.map((cliente, index) => (
                <div
                  key={cliente.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '180px 140px 140px 180px 120px 180px 150px' : '1.6fr 1fr 1fr 1.4fr 0.9fr 1.3fr auto',
                    gap: 0,
                    color: '#f8fafc',
                    fontSize: 13,
                    background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ padding: '12px 10px' }}>{cliente.nome}</div>
                  <div style={{ padding: '12px 10px' }}>{cliente.cpfCnpj}</div>
                  <div style={{ padding: '12px 10px' }}>{cliente.telefone}</div>
                  <div style={{ padding: '12px 10px' }}>{cliente.endereco}</div>
                  <div style={{ padding: '12px 10px' }}>{cliente.cep}</div>
                  <div style={{ padding: '12px 10px' }}>{cliente.email}</div>
                  <div
                    style={{
                      padding: '8px 10px',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <button
                      style={{
                        ...buttonStyle,
                        height: 34,
                        padding: '0 12px',
                        background: '#2563eb',
                        color: '#fff',
                      }}
                      onClick={() => editarCliente(cliente)}
                    >
                      Editar
                    </button>

                    <button
                      style={{
                        ...buttonStyle,
                        height: 34,
                        padding: '0 12px',
                        background: '#dc2626',
                        color: '#fff',
                      }}
                      onClick={() => excluirCliente(cliente.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))
            )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              padding: '10px 14px',
              color: '#f8fafc',
              background: 'rgba(255,255,255,0.03)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <div>Total de clientes: {clientesFiltrados.length}</div>
            <div>1–{clientesFiltrados.length} de {clientesFiltrados.length}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
