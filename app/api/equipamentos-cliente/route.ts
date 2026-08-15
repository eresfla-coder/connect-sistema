import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/api-auth'
import { normalizarClienteId } from '@/lib/manutencoes'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function texto(valor: unknown, limite = 300) {
  return String(valor || '').trim().slice(0, limite) || null
}

async function validarCliente(userId: string, clienteId: number) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', clienteId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data?.id)
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const clienteId = normalizarClienteId(request.nextUrl.searchParams.get('cliente_id'))
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('equipamentos_cliente')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .order('nome')
    if (clienteId != null) query = query.eq('cliente_id', clienteId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ ok: true, equipamentos: data || [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar equipamentos.'
    const status = message.includes('Sessão') ? 401 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const body = await request.json()
    const clienteId = normalizarClienteId(body.cliente_id)
    const nome = String(body.nome || '').trim()
    if (clienteId == null || !nome) {
      return NextResponse.json({ ok: false, error: 'Cliente e nome do equipamento são obrigatórios.' }, { status: 400 })
    }
    if (!(await validarCliente(user.id, clienteId))) {
      return NextResponse.json({ ok: false, error: 'Cliente inválido.' }, { status: 403 })
    }

    const payload = {
      user_id: user.id,
      cliente_id: clienteId,
      nome: nome.slice(0, 200),
      categoria: texto(body.categoria, 120),
      marca: texto(body.marca, 120),
      modelo: texto(body.modelo, 120),
      numero_serie: texto(body.numero_serie, 120),
      capacidade: texto(body.capacidade, 120),
      patrimonio: texto(body.patrimonio, 120),
      local_instalacao: texto(body.local_instalacao, 200),
      descricao: texto(body.descricao, 1000),
      observacoes: texto(body.observacoes, 2000),
      ativo: true,
    }
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.from('equipamentos_cliente').insert(payload).select('*').single()
    if (error) throw error
    return NextResponse.json({ ok: true, equipamento: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar equipamento.'
    const status = message.includes('Sessão') ? 401 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const body = await request.json()
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'Equipamento não informado.' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    for (const campo of [
      'nome', 'categoria', 'marca', 'modelo', 'numero_serie', 'capacidade',
      'patrimonio', 'local_instalacao', 'descricao', 'observacoes',
    ]) {
      if (Object.prototype.hasOwnProperty.call(body, campo)) updates[campo] = texto(body[campo], campo === 'observacoes' ? 2000 : 300)
    }
    if (typeof body.ativo === 'boolean') updates.ativo = body.ativo

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('equipamentos_cliente')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ ok: false, error: 'Equipamento não encontrado.' }, { status: 404 })
    return NextResponse.json({ ok: true, equipamento: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar equipamento.'
    const status = message.includes('Sessão') ? 401 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
