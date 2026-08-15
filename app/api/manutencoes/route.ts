import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/api-auth'
import {
  calcularInicioAviso,
  calcularProximaManutencao,
  calcularStatusManutencao,
  clienteIdComoTexto,
  normalizarClienteId,
  planejarNovoCiclo,
  type Manutencao,
  type PeriodicidadeTipo,
} from '@/lib/manutencoes'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PERIODICIDADES = new Set<PeriodicidadeTipo>(['sem_recorrencia', 'dias', 'meses', 'anos', 'manual'])

function texto(valor: unknown, limite = 1000) {
  return String(valor || '').trim().slice(0, limite) || null
}

function dataValida(valor: unknown) {
  const data = String(valor || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : ''
}

async function validarRelacoes(userId: string, clienteId: number, equipamentoId?: string | null) {
  const supabase = getSupabaseAdmin()
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', clienteId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!cliente) throw new Error('Cliente inválido.')

  if (equipamentoId) {
    const { data: equipamento } = await supabase
      .from('equipamentos_cliente')
      .select('id')
      .eq('id', equipamentoId)
      .eq('cliente_id', clienteId)
      .eq('user_id', userId)
      .eq('ativo', true)
      .maybeSingle()
    if (!equipamento) throw new Error('Equipamento inválido para este cliente.')
  }
}

async function enriquecer(userId: string, manutencoes: Record<string, any>[]) {
  const supabase = getSupabaseAdmin()
  const clienteIds = [...new Set(
    manutencoes
      .map((item) => normalizarClienteId(item.cliente_id))
      .filter((id): id is number => id != null),
  )]
  const equipamentoIds = [...new Set(manutencoes.map((item) => item.equipamento_id).filter(Boolean))]

  const [{ data: clientes }, { data: equipamentos }] = await Promise.all([
    clienteIds.length
      ? supabase.from('clientes').select('id,nome,telefone,endereco').eq('user_id', userId).in('id', clienteIds)
      : Promise.resolve({ data: [] }),
    equipamentoIds.length
      ? supabase.from('equipamentos_cliente').select('*').eq('user_id', userId).in('id', equipamentoIds)
      : Promise.resolve({ data: [] }),
  ])

  const clientesPorId = new Map(
    (clientes || []).map((item: any) => [clienteIdComoTexto(item.id), item]),
  )
  const equipamentosPorId = new Map((equipamentos || []).map((item: any) => [String(item.id), item]))
  return manutencoes.map((item) => ({
    ...item,
    cliente: clientesPorId.get(clienteIdComoTexto(item.cliente_id)) || null,
    equipamento: item.equipamento_id ? equipamentosPorId.get(String(item.equipamento_id)) || null : null,
    ...calcularStatusManutencao(item as Manutencao),
  }))
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const supabase = getSupabaseAdmin()
    const limite = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 200)))
    const urgentes = request.nextUrl.searchParams.get('urgentes') === '1'
    const clienteIdParam = request.nextUrl.searchParams.get('cliente_id')
    const equipamentoId = request.nextUrl.searchParams.get('equipamento_id')
    const clienteId = normalizarClienteId(clienteIdParam)

    let query = supabase
      .from('manutencoes')
      .select('*')
      .eq('user_id', user.id)
      .order(urgentes ? 'proxima_manutencao' : 'data_realizacao', { ascending: urgentes })
      .limit(limite)
    if (urgentes) {
      query = query.eq('recorrencia_ativa', true).is('cancelada_em', null).not('proxima_manutencao', 'is', null)
    }
    if (clienteId != null) query = query.eq('cliente_id', clienteId)
    if (equipamentoId) query = query.eq('equipamento_id', equipamentoId)

    const { data, error } = await query
    if (error) throw error
    const manutencoes = await enriquecer(user.id, (data || []) as Record<string, any>[])
    return NextResponse.json({ ok: true, manutencoes })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar manutenções.'
    const status = message.includes('Sessão') ? 401 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const body = await request.json()
    const clienteId = normalizarClienteId(body.cliente_id)
    const equipamentoId = String(body.equipamento_id || '').trim() || null
    const titulo = String(body.titulo || '').trim()
    const dataRealizacao = dataValida(body.data_realizacao)
    const periodicidadeTipo = String(body.periodicidade_tipo || 'sem_recorrencia') as PeriodicidadeTipo
    const periodicidadeValor = Number(body.periodicidade_valor || 0) || null
    const diasAntecedencia = Math.min(3650, Math.max(0, Number(body.dias_antecedencia_aviso ?? 30)))
    const origemId = String(body.manutencao_origem_id || '').trim() || null

    if (clienteId == null || !titulo || !dataRealizacao || !PERIODICIDADES.has(periodicidadeTipo)) {
      return NextResponse.json({ ok: false, error: 'Cliente, título, data e periodicidade são obrigatórios.' }, { status: 400 })
    }
    await validarRelacoes(user.id, clienteId, equipamentoId)

    const proximaManutencao = calcularProximaManutencao({
      dataRealizacao,
      periodicidadeTipo,
      periodicidadeValor,
      proximaDataManual: dataValida(body.proxima_manutencao) || null,
    })
    const payload = {
      user_id: user.id,
      cliente_id: clienteId,
      equipamento_id: equipamentoId,
      manutencao_origem_id: origemId,
      titulo: titulo.slice(0, 200),
      tipo_servico: texto(body.tipo_servico, 150),
      descricao_servico: texto(body.descricao_servico, 3000),
      data_realizacao: dataRealizacao,
      periodicidade_tipo: periodicidadeTipo,
      periodicidade_valor: periodicidadeValor,
      proxima_manutencao: proximaManutencao,
      dias_antecedencia_aviso: diasAntecedencia,
      data_inicio_aviso: calcularInicioAviso(proximaManutencao, diasAntecedencia),
      responsavel: texto(body.responsavel, 150),
      valor_servico: body.valor_servico === '' || body.valor_servico == null ? null : Math.max(0, Number(body.valor_servico)),
      observacoes: texto(body.observacoes, 3000),
      recorrencia_ativa: periodicidadeTipo !== 'sem_recorrencia',
    }

    const supabase = getSupabaseAdmin()
    if (origemId) {
      const { data: origem } = await supabase
        .from('manutencoes')
        .select('id')
        .eq('id', origemId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!origem) return NextResponse.json({ ok: false, error: 'Manutenção anterior inválida.' }, { status: 403 })
    }

    const { data, error } = await supabase.from('manutencoes').insert(payload).select('*').single()
    if (error) throw error

    if (origemId) {
      const ciclo = planejarNovoCiclo(origemId)
      const { error: origemError } = await supabase
        .from('manutencoes')
        .update(ciclo.atualizacaoAnterior)
        .eq('id', origemId)
        .eq('user_id', user.id)
      if (origemError) {
        await supabase.from('manutencoes').delete().eq('id', data.id).eq('user_id', user.id)
        throw origemError
      }
    }

    const [manutencao] = await enriquecer(user.id, [data])
    return NextResponse.json({ ok: true, manutencao }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar manutenção.'
    const status = message.includes('Sessão') ? 401 : message.includes('inválid') ? 400 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const body = await request.json()
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Manutenção não informada.' }, { status: 400 })
    const supabase = getSupabaseAdmin()

    if (body.acao === 'cancelar') {
      const { data, error } = await supabase
        .from('manutencoes')
        .update({ recorrencia_ativa: false, cancelada_em: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ ok: false, error: 'Manutenção não encontrada.' }, { status: 404 })
      return NextResponse.json({ ok: true, manutencao: data })
    }

    const { data: atual } = await supabase.from('manutencoes').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (!atual) return NextResponse.json({ ok: false, error: 'Manutenção não encontrada.' }, { status: 404 })

    const clienteId = normalizarClienteId(body.cliente_id ?? atual.cliente_id)
    const equipamentoId = String(body.equipamento_id ?? atual.equipamento_id ?? '').trim() || null
    if (clienteId == null) return NextResponse.json({ ok: false, error: 'Cliente inválido.' }, { status: 400 })
    await validarRelacoes(user.id, clienteId, equipamentoId)
    const periodicidadeTipo = String(body.periodicidade_tipo ?? atual.periodicidade_tipo) as PeriodicidadeTipo
    const dataRealizacao = dataValida(body.data_realizacao ?? atual.data_realizacao)
    const periodicidadeValor = Number(body.periodicidade_valor ?? atual.periodicidade_valor ?? 0) || null
    const diasAntecedencia = Number(body.dias_antecedencia_aviso ?? atual.dias_antecedencia_aviso ?? 30)
    const proximaManutencao = calcularProximaManutencao({
      dataRealizacao,
      periodicidadeTipo,
      periodicidadeValor,
      proximaDataManual: dataValida(body.proxima_manutencao ?? atual.proxima_manutencao) || null,
    })

    const updates = {
      cliente_id: clienteId,
      equipamento_id: equipamentoId,
      titulo: String(body.titulo ?? atual.titulo).trim().slice(0, 200),
      tipo_servico: texto(body.tipo_servico ?? atual.tipo_servico, 150),
      descricao_servico: texto(body.descricao_servico ?? atual.descricao_servico, 3000),
      data_realizacao: dataRealizacao,
      periodicidade_tipo: periodicidadeTipo,
      periodicidade_valor: periodicidadeValor,
      proxima_manutencao: proximaManutencao,
      dias_antecedencia_aviso: diasAntecedencia,
      data_inicio_aviso: calcularInicioAviso(proximaManutencao, diasAntecedencia),
      responsavel: texto(body.responsavel ?? atual.responsavel, 150),
      valor_servico: body.valor_servico === '' ? null : Number(body.valor_servico ?? atual.valor_servico ?? 0),
      observacoes: texto(body.observacoes ?? atual.observacoes, 3000),
      recorrencia_ativa: periodicidadeTipo !== 'sem_recorrencia',
    }
    const { data, error } = await supabase
      .from('manutencoes')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single()
    if (error) throw error
    const [manutencao] = await enriquecer(user.id, [data])
    return NextResponse.json({ ok: true, manutencao })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar manutenção.'
    const status = message.includes('Sessão') ? 401 : message.includes('inválid') ? 400 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
