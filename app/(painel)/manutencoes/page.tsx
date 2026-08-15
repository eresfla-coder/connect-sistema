'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  Wrench,
  X,
} from 'lucide-react'
import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'
import { carregarClientesPainel, type ClientePainel } from '@/lib/clientes-painel'
import {
  calcularInicioAviso,
  calcularProximaManutencao,
  clienteIdComoTexto,
  formatarDataBr,
  mensagemLembreteManutencao,
  mesmoClienteId,
  normalizarTelefoneWhatsapp,
  type EquipamentoCliente,
  type Manutencao,
  type PeriodicidadeTipo,
  type StatusManutencao,
} from '@/lib/manutencoes'
import { supabase } from '@/lib/supabase-browser'

type ManutencaoView = Manutencao & {
  status: StatusManutencao
  diasRestantes: number | null
}

type FormManutencao = {
  id?: string
  manutencao_origem_id?: string
  cliente_id: string
  equipamento_id: string
  titulo: string
  tipo_servico: string
  descricao_servico: string
  data_realizacao: string
  preset: '3' | '6' | '12' | 'personalizada' | 'manual' | 'sem_recorrencia'
  periodicidade_tipo: PeriodicidadeTipo
  periodicidade_valor: string
  proxima_manutencao: string
  dias_antecedencia_aviso: string
  responsavel: string
  valor_servico: string
  observacoes: string
}

const hoje = () => new Date().toISOString().slice(0, 10)

const FORM_INICIAL: FormManutencao = {
  cliente_id: '',
  equipamento_id: '',
  titulo: '',
  tipo_servico: '',
  descricao_servico: '',
  data_realizacao: hoje(),
  preset: '12',
  periodicidade_tipo: 'meses',
  periodicidade_valor: '12',
  proxima_manutencao: '',
  dias_antecedencia_aviso: '30',
  responsavel: '',
  valor_servico: '',
  observacoes: '',
}

const STATUS_UI: Record<StatusManutencao, { label: string; cor: string; fundo: string }> = {
  em_dia: { label: 'Em dia', cor: '#166534', fundo: '#dcfce7' },
  proxima: { label: 'Próxima', cor: '#1d4ed8', fundo: '#dbeafe' },
  vencendo: { label: 'Vencendo', cor: '#9a3412', fundo: '#ffedd5' },
  vencida: { label: 'Vencida', cor: '#b91c1c', fundo: '#fee2e2' },
  realizada: { label: 'Realizada', cor: '#475569', fundo: '#e2e8f0' },
  cancelada: { label: 'Cancelada', cor: '#475569', fundo: '#f1f5f9' },
}

async function tokenSessao() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

async function api(path: string, init?: RequestInit) {
  const token = await tokenSessao()
  if (!token) throw new Error('Sessão inválida. Faça login novamente.')
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Não foi possível concluir a operação.')
  return payload
}

function moeda(valor?: number | null) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function textoDias(item: ManutencaoView) {
  if (item.diasRestantes == null) return 'Sem recorrência'
  if (item.diasRestantes < 0) return `${Math.abs(item.diasRestantes)} dia(s) em atraso`
  if (item.diasRestantes === 0) return 'Vence hoje'
  return `Faltam ${item.diasRestantes} dia(s)`
}

function StatusBadge({ status }: { status: StatusManutencao }) {
  const ui = STATUS_UI[status]
  return <span className="status" style={{ color: ui.cor, background: ui.fundo }}>{ui.label}</span>
}

export default function ManutencoesPage() {
  const [manutencoes, setManutencoes] = useState<ManutencaoView[]>([])
  const [clientes, setClientes] = useState<ClientePainel[]>([])
  const [equipamentos, setEquipamentos] = useState<EquipamentoCliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusManutencao>('todos')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [periodoDe, setPeriodoDe] = useState('')
  const [periodoAte, setPeriodoAte] = useState('')
  const [avisoPersonalizado, setAvisoPersonalizado] = useState(false)
  const [modalForm, setModalForm] = useState(false)
  const [modalEquipamento, setModalEquipamento] = useState(false)
  const [detalhe, setDetalhe] = useState<ManutencaoView | null>(null)
  const [form, setForm] = useState<FormManutencao>(FORM_INICIAL)
  const [equipamentoForm, setEquipamentoForm] = useState({
    cliente_id: '', nome: '', categoria: '', marca: '', modelo: '', numero_serie: '',
    capacidade: '', local_instalacao: '', observacoes: '',
  })

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const [dados, listaClientes, equipamentosPayload] = await Promise.all([
        api('/api/manutencoes'),
        carregarClientesPainel('manutencoes'),
        api('/api/equipamentos-cliente'),
      ])
      setManutencoes(dados.manutencoes || [])
      setClientes(listaClientes)
      setEquipamentos(equipamentosPayload.equipamentos || [])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar dados.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const equipamentosCliente = useMemo(
    () => equipamentos.filter((item) => mesmoClienteId(item.cliente_id, form.cliente_id)),
    [equipamentos, form.cliente_id],
  )

  const proximaPreview = useMemo(() => {
    try {
      const proxima = calcularProximaManutencao({
        dataRealizacao: form.data_realizacao,
        periodicidadeTipo: form.periodicidade_tipo,
        periodicidadeValor: Number(form.periodicidade_valor || 0),
        proximaDataManual: form.proxima_manutencao,
      })
      return {
        proxima,
        inicio: calcularInicioAviso(proxima, Number(form.dias_antecedencia_aviso || 30)),
      }
    } catch {
      return { proxima: null, inicio: null }
    }
  }, [form.data_realizacao, form.periodicidade_tipo, form.periodicidade_valor, form.proxima_manutencao, form.dias_antecedencia_aviso])

  const kpis = useMemo(() => {
    const mes = hoje().slice(0, 7)
    return {
      total: manutencoes.length,
      proximas30: manutencoes.filter((item) => item.diasRestantes != null && item.diasRestantes >= 0 && item.diasRestantes <= 30).length,
      vencendo: manutencoes.filter((item) => item.status === 'vencendo').length,
      vencidas: manutencoes.filter((item) => item.status === 'vencida').length,
      realizadasMes: manutencoes.filter((item) => item.data_realizacao?.startsWith(mes)).length,
    }
  }, [manutencoes])

  const tipos = useMemo(
    () => [...new Set(manutencoes.map((item) => item.tipo_servico).filter(Boolean) as string[])].sort(),
    [manutencoes],
  )

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return manutencoes.filter((item) => {
      const texto = [
        item.cliente?.nome,
        item.equipamento?.nome,
        item.equipamento?.marca,
        item.titulo,
        item.tipo_servico,
      ].join(' ').toLowerCase()
      return (!termo || texto.includes(termo))
        && (filtroStatus === 'todos' || item.status === filtroStatus)
        && (!filtroTipo || item.tipo_servico === filtroTipo)
        && (!periodoDe || String(item.proxima_manutencao || '') >= periodoDe)
        && (!periodoAte || String(item.proxima_manutencao || '') <= periodoAte)
    })
  }, [manutencoes, busca, filtroStatus, filtroTipo, periodoDe, periodoAte])

  const historicoDetalhe = useMemo(() => {
    if (!detalhe) return []
    return manutencoes
      .filter((item) =>
        detalhe.equipamento_id
          ? item.equipamento_id === detalhe.equipamento_id
          : mesmoClienteId(item.cliente_id, detalhe.cliente_id) && item.titulo === detalhe.titulo,
      )
      .sort((a, b) => String(b.data_realizacao).localeCompare(String(a.data_realizacao)))
  }, [detalhe, manutencoes])

  function aplicarPreset(preset: FormManutencao['preset']) {
    if (preset === '3' || preset === '6' || preset === '12') {
      setForm((old) => ({ ...old, preset, periodicidade_tipo: 'meses', periodicidade_valor: preset, proxima_manutencao: '' }))
    } else if (preset === 'sem_recorrencia') {
      setForm((old) => ({ ...old, preset, periodicidade_tipo: 'sem_recorrencia', periodicidade_valor: '', proxima_manutencao: '' }))
    } else if (preset === 'manual') {
      setForm((old) => ({ ...old, preset, periodicidade_tipo: 'manual', periodicidade_valor: '', proxima_manutencao: '' }))
    } else {
      setForm((old) => ({ ...old, preset, periodicidade_tipo: 'meses', periodicidade_valor: '1', proxima_manutencao: '' }))
    }
  }

  function abrirNovo(base?: ManutencaoView) {
    if (base) {
      const tipo = base.periodicidade_tipo
      const valor = String(base.periodicidade_valor || '')
      const preset = tipo === 'meses' && ['3', '6', '12'].includes(valor)
        ? valor as '3' | '6' | '12'
        : tipo === 'manual' ? 'manual'
          : tipo === 'sem_recorrencia' ? 'sem_recorrencia' : 'personalizada'
      setForm({
        ...FORM_INICIAL,
        manutencao_origem_id: base.id,
        cliente_id: clienteIdComoTexto(base.cliente_id),
        equipamento_id: base.equipamento_id || '',
        titulo: base.titulo,
        tipo_servico: base.tipo_servico || '',
        periodicidade_tipo: base.periodicidade_tipo,
        periodicidade_valor: valor,
        dias_antecedencia_aviso: String(base.dias_antecedencia_aviso || 30),
        responsavel: base.responsavel || '',
        preset,
      })
      setAvisoPersonalizado(!['7', '15', '30', '45', '60'].includes(String(base.dias_antecedencia_aviso || 30)))
    } else {
      setForm({ ...FORM_INICIAL, data_realizacao: hoje() })
      setAvisoPersonalizado(false)
    }
    setDetalhe(null)
    setModalForm(true)
  }

  function abrirEditar(item: ManutencaoView) {
    const valor = String(item.periodicidade_valor || '')
    const preset = item.periodicidade_tipo === 'meses' && ['3', '6', '12'].includes(valor)
      ? valor as '3' | '6' | '12'
      : item.periodicidade_tipo === 'manual' ? 'manual'
        : item.periodicidade_tipo === 'sem_recorrencia' ? 'sem_recorrencia' : 'personalizada'
    setForm({
      id: item.id,
      cliente_id: clienteIdComoTexto(item.cliente_id),
      equipamento_id: item.equipamento_id || '',
      titulo: item.titulo,
      tipo_servico: item.tipo_servico || '',
      descricao_servico: item.descricao_servico || '',
      data_realizacao: item.data_realizacao,
      preset,
      periodicidade_tipo: item.periodicidade_tipo,
      periodicidade_valor: valor,
      proxima_manutencao: item.periodicidade_tipo === 'manual' ? item.proxima_manutencao || '' : '',
      dias_antecedencia_aviso: String(item.dias_antecedencia_aviso || 30),
      responsavel: item.responsavel || '',
      valor_servico: item.valor_servico != null ? String(item.valor_servico) : '',
      observacoes: item.observacoes || '',
    })
    setAvisoPersonalizado(!['7', '15', '30', '45', '60'].includes(String(item.dias_antecedencia_aviso || 30)))
    setDetalhe(null)
    setModalForm(true)
  }

  async function salvarManutencao() {
    if (!form.cliente_id || !form.titulo.trim() || !form.data_realizacao) {
      setErro('Informe cliente, título e data da realização.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await api('/api/manutencoes', {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...form,
          valor_servico: form.valor_servico ? Number(String(form.valor_servico).replace(',', '.')) : null,
        }),
      })
      setModalForm(false)
      setSucesso(form.manutencao_origem_id ? 'Novo atendimento registrado. O histórico anterior foi preservado.' : 'Manutenção salva com sucesso.')
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar manutenção.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarEquipamento() {
    if (!equipamentoForm.cliente_id || !equipamentoForm.nome.trim()) {
      setErro('Informe cliente e nome do equipamento.')
      return
    }
    setSalvando(true)
    try {
      const payload = await api('/api/equipamentos-cliente', { method: 'POST', body: JSON.stringify(equipamentoForm) })
      setEquipamentos((old) => [...old, payload.equipamento])
      setForm((old) => ({ ...old, cliente_id: equipamentoForm.cliente_id, equipamento_id: payload.equipamento.id }))
      setModalEquipamento(false)
      setEquipamentoForm({ cliente_id: '', nome: '', categoria: '', marca: '', modelo: '', numero_serie: '', capacidade: '', local_instalacao: '', observacoes: '' })
      setSucesso('Equipamento cadastrado.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao cadastrar equipamento.')
    } finally {
      setSalvando(false)
    }
  }

  async function cancelar(item: ManutencaoView) {
    if (!window.confirm('Cancelar a recorrência desta manutenção? O histórico será preservado.')) return
    try {
      await api('/api/manutencoes', { method: 'PATCH', body: JSON.stringify({ id: item.id, acao: 'cancelar' }) })
      setSucesso('Recorrência cancelada.')
      setDetalhe(null)
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao cancelar recorrência.')
    }
  }

  function whatsapp(item: ManutencaoView) {
    const telefone = normalizarTelefoneWhatsapp(item.cliente?.telefone)
    if (!telefone) {
      setErro('Cliente sem WhatsApp cadastrado.')
      return
    }
    abrirWhatsappUrl(montarUrlWhatsapp(telefone, mensagemLembreteManutencao(item)))
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <span className="eyebrow"><Wrench size={15} /> Manutenção preventiva e recorrente</span>
          <h1>Manutenções</h1>
          <p>Acompanhe ciclos, antecipe contatos e preserve todo o histórico técnico.</p>
        </div>
        <button className="primary" onClick={() => abrirNovo()}><Plus size={18} /> Nova manutenção</button>
      </header>

      {erro && <div className="alert error"><CircleAlert size={18} /> {erro}<button onClick={() => setErro('')}><X size={16} /></button></div>}
      {sucesso && <div className="alert success"><CheckCircle2 size={18} /> {sucesso}<button onClick={() => setSucesso('')}><X size={16} /></button></div>}

      <section className="kpis">
        {[
          ['Cadastradas', kpis.total, '#334155'],
          ['Próximas em 30 dias', kpis.proximas30, '#2563eb'],
          ['Vencendo', kpis.vencendo, '#ea580c'],
          ['Vencidas', kpis.vencidas, '#dc2626'],
          ['Realizadas no mês', kpis.realizadasMes, '#16a34a'],
        ].map(([label, value, color]) => (
          <article className="kpi" key={String(label)}>
            <span>{label}</span><strong style={{ color: String(color) }}>{value}</strong>
          </article>
        ))}
      </section>

      <section className="filters">
        <label className="search"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, equipamento ou serviço" /></label>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}>
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_UI).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Todos os serviços</option>
          {tipos.map((tipo) => <option key={tipo}>{tipo}</option>)}
        </select>
        <input type="date" aria-label="Próxima manutenção de" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} />
        <input type="date" aria-label="Próxima manutenção até" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} />
      </section>

      {carregando ? (
        <div className="empty"><Clock3 className="spin" /> Carregando manutenções...</div>
      ) : lista.length === 0 ? (
        <div className="empty">
          <CalendarClock size={44} />
          <h2>Nenhuma manutenção cadastrada ainda.</h2>
          <p>Registre a primeira manutenção preventiva e o sistema lembrará quando for hora de contatar o cliente novamente.</p>
          <button className="primary" onClick={() => abrirNovo()}><Plus size={18} /> Cadastrar primeira manutenção</button>
        </div>
      ) : (
        <section className="list">
          {lista.map((item) => (
            <article className="maintenance-card" key={item.id}>
              <div className="card-main">
                <div className="title-row"><h3>{item.cliente?.nome || 'Cliente'}</h3><StatusBadge status={item.status} /></div>
                <strong>{item.equipamento?.nome || item.titulo}</strong>
                <span>{item.tipo_servico || item.titulo}</span>
              </div>
              <div className="date-block"><small>Última</small><b>{formatarDataBr(item.data_realizacao)}</b></div>
              <div className="date-block"><small>Próxima</small><b>{formatarDataBr(item.proxima_manutencao)}</b><em>{textoDias(item)}</em></div>
              <div className="actions">
                <button className="whatsapp" onClick={() => whatsapp(item)} title="Abrir WhatsApp"><MessageCircle size={18} /></button>
                <button onClick={() => setDetalhe(item)}>Ver <ChevronRight size={16} /></button>
              </div>
            </article>
          ))}
        </section>
      )}

      {modalForm && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setModalForm(false)}>
          <div className="modal large">
            <div className="modal-head"><div><h2>{form.manutencao_origem_id ? 'Registrar manutenção realizada' : form.id ? 'Editar manutenção' : 'Nova manutenção'}</h2><p>Campos com * são obrigatórios.</p></div><button className="icon" onClick={() => setModalForm(false)}><X /></button></div>
            <div className="form-grid">
              <label>Cliente *<select value={form.cliente_id} onChange={(e) => setForm((old) => ({ ...old, cliente_id: e.target.value, equipamento_id: '' }))}><option value="">Selecione</option>{clientes.map((cliente) => <option key={clienteIdComoTexto(cliente.id)} value={clienteIdComoTexto(cliente.id)}>{cliente.nome}</option>)}</select></label>
              <label>Equipamento/local (opcional)<div className="inline"><select value={form.equipamento_id} onChange={(e) => setForm((old) => ({ ...old, equipamento_id: e.target.value }))}><option value="">Sem equipamento formal</option>{equipamentosCliente.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.local_instalacao ? ` — ${item.local_instalacao}` : ''}</option>)}</select><button className="square" type="button" onClick={() => { setEquipamentoForm((old) => ({ ...old, cliente_id: form.cliente_id })); setModalEquipamento(true) }}><Plus /></button></div></label>
              <label>Título *<input value={form.titulo} onChange={(e) => setForm((old) => ({ ...old, titulo: e.target.value }))} placeholder="Ex.: Limpeza e higienização" /></label>
              <label>Tipo de serviço<input value={form.tipo_servico} onChange={(e) => setForm((old) => ({ ...old, tipo_servico: e.target.value }))} placeholder="Preventiva, revisão, inspeção..." /></label>
              <label>Data da realização *<input type="date" value={form.data_realizacao} onChange={(e) => setForm((old) => ({ ...old, data_realizacao: e.target.value }))} /></label>
              <label>Responsável/técnico<input value={form.responsavel} onChange={(e) => setForm((old) => ({ ...old, responsavel: e.target.value }))} /></label>
              <label className="full">Descrição do serviço<textarea value={form.descricao_servico} onChange={(e) => setForm((old) => ({ ...old, descricao_servico: e.target.value }))} rows={3} /></label>
              <label>Periodicidade<select value={form.preset} onChange={(e) => aplicarPreset(e.target.value as FormManutencao['preset'])}><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option><option value="personalizada">Personalizada</option><option value="manual">Próxima data manual</option><option value="sem_recorrencia">Sem recorrência</option></select></label>
              {form.preset === 'personalizada' && <label>Intervalo<div className="inline"><input type="number" min={1} value={form.periodicidade_valor} onChange={(e) => setForm((old) => ({ ...old, periodicidade_valor: e.target.value }))} /><select value={form.periodicidade_tipo} onChange={(e) => setForm((old) => ({ ...old, periodicidade_tipo: e.target.value as PeriodicidadeTipo }))}><option value="dias">dias</option><option value="meses">meses</option><option value="anos">anos</option></select></div></label>}
              {form.preset === 'manual' && <label>Próxima manutenção *<input type="date" value={form.proxima_manutencao} onChange={(e) => setForm((old) => ({ ...old, proxima_manutencao: e.target.value }))} /></label>}
              <label>Avisar com antecedência<select value={avisoPersonalizado ? 'personalizado' : form.dias_antecedencia_aviso} onChange={(e) => { const custom = e.target.value === 'personalizado'; setAvisoPersonalizado(custom); if (!custom) setForm((old) => ({ ...old, dias_antecedencia_aviso: e.target.value })) }}>{['7', '15', '30', '45', '60'].map((dias) => <option key={dias} value={dias}>{dias} dias</option>)}<option value="personalizado">Personalizado</option></select></label>
              {avisoPersonalizado && <label>Dias de antecedência<input type="number" min={0} max={3650} value={form.dias_antecedencia_aviso} onChange={(e) => setForm((old) => ({ ...old, dias_antecedencia_aviso: e.target.value }))} /></label>}
              <label>Valor do serviço<input inputMode="decimal" value={form.valor_servico} onChange={(e) => setForm((old) => ({ ...old, valor_servico: e.target.value }))} placeholder="0,00" /></label>
              <label className="full">Observações<textarea value={form.observacoes} onChange={(e) => setForm((old) => ({ ...old, observacoes: e.target.value }))} rows={2} /></label>
            </div>
            {form.periodicidade_tipo !== 'sem_recorrencia' && <div className="preview"><CalendarClock size={20} /><div><b>Próxima: {formatarDataBr(proximaPreview.proxima)}</b><span>Avisos a partir de {formatarDataBr(proximaPreview.inicio)}</span></div></div>}
            <div className="modal-actions"><button className="secondary" onClick={() => setModalForm(false)}>Cancelar</button><button className="primary" disabled={salvando} onClick={salvarManutencao}>{salvando ? 'Salvando...' : 'Salvar manutenção'}</button></div>
          </div>
        </div>
      )}

      {modalEquipamento && (
        <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && setModalEquipamento(false)}>
          <div className="modal">
            <div className="modal-head"><div><h2>Novo equipamento/local</h2><p>Somente cliente e identificação são obrigatórios.</p></div><button className="icon" onClick={() => setModalEquipamento(false)}><X /></button></div>
            <div className="form-grid">
              <label>Cliente *<select value={equipamentoForm.cliente_id} onChange={(e) => setEquipamentoForm((old) => ({ ...old, cliente_id: e.target.value }))}><option value="">Selecione</option>{clientes.map((cliente) => <option key={clienteIdComoTexto(cliente.id)} value={clienteIdComoTexto(cliente.id)}>{cliente.nome}</option>)}</select></label>
              <label>Nome/identificação *<input value={equipamentoForm.nome} onChange={(e) => setEquipamentoForm((old) => ({ ...old, nome: e.target.value }))} placeholder="Ex.: Split LG 12.000 BTUs" /></label>
              {(['categoria', 'marca', 'modelo', 'numero_serie', 'capacidade', 'local_instalacao'] as const).map((campo) => <label key={campo}>{campo.replace('_', ' ')}<input value={equipamentoForm[campo]} onChange={(e) => setEquipamentoForm((old) => ({ ...old, [campo]: e.target.value }))} /></label>)}
              <label className="full">Observações<textarea value={equipamentoForm.observacoes} onChange={(e) => setEquipamentoForm((old) => ({ ...old, observacoes: e.target.value }))} /></label>
            </div>
            <div className="modal-actions"><button className="secondary" onClick={() => setModalEquipamento(false)}>Cancelar</button><button className="primary" disabled={salvando} onClick={salvarEquipamento}>Cadastrar equipamento</button></div>
          </div>
        </div>
      )}

      {detalhe && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setDetalhe(null)}>
          <div className="modal large">
            <div className="modal-head"><div><span className="eyebrow"><Settings2 size={14} /> Detalhe da manutenção</span><h2>{detalhe.titulo}</h2></div><button className="icon" onClick={() => setDetalhe(null)}><X /></button></div>
            <div className="detail-grid">
              <section><h3>Cliente</h3><b>{detalhe.cliente?.nome}</b><span>{detalhe.cliente?.telefone || 'Sem telefone'}</span><span>{detalhe.cliente?.endereco || 'Sem endereço'}</span></section>
              <section><h3>Equipamento/local</h3><b>{detalhe.equipamento?.nome || 'Não informado'}</b><span>{[detalhe.equipamento?.marca, detalhe.equipamento?.modelo, detalhe.equipamento?.capacidade].filter(Boolean).join(' • ')}</span><span>{detalhe.equipamento?.local_instalacao}</span></section>
              <section><h3>Manutenção</h3><b>{formatarDataBr(detalhe.data_realizacao)} — {detalhe.tipo_servico || detalhe.titulo}</b><span>{detalhe.responsavel || 'Técnico não informado'}</span><span>{detalhe.valor_servico != null ? moeda(detalhe.valor_servico) : ''}</span></section>
              <section><h3>Recorrência</h3><b>{formatarDataBr(detalhe.proxima_manutencao)}</b><span>Aviso: {detalhe.dias_antecedencia_aviso} dias antes</span><StatusBadge status={detalhe.status} /></section>
            </div>
            <div className="history"><h3>Histórico</h3>{historicoDetalhe.map((item) => <div key={item.id}><b>{formatarDataBr(item.data_realizacao)}</b><span>{item.tipo_servico || item.titulo}{item.descricao_servico ? ` — ${item.descricao_servico}` : ''}</span></div>)}</div>
            <div className="modal-actions wrap">
              <button className="secondary" onClick={() => whatsapp(detalhe)}><MessageCircle size={17} /> WhatsApp</button>
              <button className="secondary" onClick={() => abrirEditar(detalhe)}>Editar</button>
              {detalhe.recorrencia_ativa && !detalhe.cancelada_em && <button className="danger" onClick={() => cancelar(detalhe)}>Cancelar recorrência</button>}
              <button className="primary" onClick={() => abrirNovo(detalhe)}><CheckCircle2 size={17} /> Registrar manutenção realizada</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page{padding:22px;max-width:1380px;margin:0 auto;color:#0f172a}.hero{display:flex;justify-content:space-between;align-items:end;gap:18px;padding:26px;border-radius:24px;background:linear-gradient(135deg,#0f172a,#164e63);color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.18)}.hero h1{font-size:34px;margin:8px 0 4px}.hero p{margin:0;color:#cbd5e1}.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.primary,.secondary,.danger,.actions button,.square,.icon{border:0;cursor:pointer;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:7px}.primary{background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;padding:12px 17px;border-radius:13px;box-shadow:0 10px 24px rgba(34,197,94,.22)}.primary:disabled{opacity:.6}.secondary{background:#e2e8f0;color:#0f172a;padding:11px 15px;border-radius:12px}.danger{background:#fee2e2;color:#b91c1c;padding:11px 15px;border-radius:12px}.alert{margin-top:14px;padding:12px 14px;border-radius:13px;display:flex;align-items:center;gap:8px;font-weight:800}.alert button{margin-left:auto;border:0;background:transparent}.alert.error{background:#fee2e2;color:#991b1b}.alert.success{background:#dcfce7;color:#166534}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}.kpi{padding:17px;background:#fff;border:1px solid #e2e8f0;border-radius:17px;box-shadow:0 7px 20px rgba(15,23,42,.05)}.kpi span{display:block;font-size:12px;font-weight:800;color:#64748b}.kpi strong{display:block;font-size:28px;margin-top:6px}.filters{display:grid;grid-template-columns:minmax(240px,1fr) 170px 190px 150px 150px;gap:10px;background:#fff;padding:12px;border:1px solid #e2e8f0;border-radius:17px;margin-bottom:14px}.filters select,.filters>input,.search{height:44px;border:1px solid #cbd5e1;border-radius:11px;background:#fff}.filters>input{padding:0 9px}.search{display:flex;align-items:center;padding:0 12px;gap:8px}.search input{border:0;outline:0;flex:1;min-width:0}.filters select{padding:0 11px}.list{display:grid;gap:10px}.maintenance-card{display:grid;grid-template-columns:minmax(220px,1.5fr) .7fr .9fr auto;align-items:center;gap:15px;padding:17px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.card-main{display:grid;gap:4px;min-width:0}.title-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.title-row h3{margin:0;font-size:17px}.card-main>strong{overflow:hidden;text-overflow:ellipsis}.card-main>span,.date-block small{color:#64748b;font-size:12px}.date-block{display:grid;gap:3px}.date-block em{font-style:normal;color:#64748b;font-size:11px}.status{display:inline-flex;width:max-content;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:950}.actions{display:flex;gap:7px}.actions button{padding:9px 11px;border-radius:11px;background:#f1f5f9;color:#0f172a}.actions .whatsapp{background:#dcfce7;color:#15803d}.empty{min-height:280px;background:#fff;border:1px dashed #cbd5e1;border-radius:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;color:#64748b;padding:28px}.empty h2{color:#0f172a;margin:0}.empty p{max-width:560px;margin:0}.overlay{position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:2000;display:grid;place-items:center;padding:18px}.overlay.top{z-index:2100}.modal{width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:23px;padding:22px;box-shadow:0 30px 90px rgba(0,0,0,.3)}.modal.large{width:min(940px,100%)}.modal-head{display:flex;justify-content:space-between;gap:15px;margin-bottom:18px}.modal-head h2{margin:3px 0;font-size:24px}.modal-head p{margin:0;color:#64748b}.icon{width:40px;height:40px;border-radius:12px;background:#f1f5f9}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.form-grid label{font-size:12px;font-weight:900;color:#475569;text-transform:capitalize}.form-grid input,.form-grid select,.form-grid textarea{width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #cbd5e1;border-radius:11px;padding:11px 12px;font:inherit;color:#0f172a;background:#fff}.form-grid textarea{resize:vertical}.full{grid-column:1/-1}.inline{display:flex;gap:7px}.inline>*{flex:1}.inline .square{flex:0 0 44px}.square{border-radius:11px;background:#dcfce7;color:#15803d;margin-top:5px}.preview{display:flex;gap:10px;align-items:center;margin-top:14px;padding:13px;border-radius:13px;background:#eff6ff;color:#1e3a8a}.preview div{display:grid}.preview span{font-size:12px}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.modal-actions.wrap{flex-wrap:wrap}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.detail-grid section{display:grid;gap:5px;padding:14px;border:1px solid #e2e8f0;border-radius:14px}.detail-grid h3,.history h3{margin:0 0 4px;font-size:13px;color:#475569;text-transform:uppercase}.detail-grid span{font-size:13px;color:#64748b}.history{margin-top:14px;border:1px solid #e2e8f0;border-radius:14px;padding:14px}.history>div{display:grid;grid-template-columns:120px 1fr;gap:10px;padding:9px 0;border-top:1px solid #f1f5f9}.history span{font-size:13px;color:#475569}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:1100px){.filters{grid-template-columns:1fr 1fr 1fr}}@media(max-width:900px){.page{padding:12px}.hero{align-items:flex-start;flex-direction:column;padding:20px}.hero h1{font-size:28px}.kpis{grid-template-columns:1fr 1fr}.kpi:last-child{grid-column:1/-1}.filters{grid-template-columns:1fr}.maintenance-card{grid-template-columns:1fr 1fr}.card-main{grid-column:1/-1}.actions{justify-content:flex-end}.form-grid,.detail-grid{grid-template-columns:1fr}.full{grid-column:auto}.modal{padding:17px;max-height:94vh}.modal-actions{position:sticky;bottom:-17px;background:#fff;padding:12px 0}.history>div{grid-template-columns:1fr}.overlay{padding:8px}}@media(max-width:520px){.kpis{gap:8px}.kpi{padding:13px}.kpi strong{font-size:23px}.maintenance-card{grid-template-columns:1fr}.actions{justify-content:stretch}.actions button{flex:1}.date-block{grid-template-columns:90px 1fr}.modal-actions>*{flex:1}}
      `}</style>
    </div>
  )
}
