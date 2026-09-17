import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import {
  MSG_ORIGEM_FLIP_BLOQUEADO,
  CODIGO_ORIGEM_FLIP_BLOQUEADO,
  normalizarOrigemSistema,
  podeAlterarOrigemConnectParaTerceiro,
  slugifySistemaNome,
  vinculoTemAcessoConnectIncompativelComTerceiro,
  type OrigemSistemaAdmin,
} from '@/lib/admin-carteira'
import {
  COLS_ADMIN_SISTEMA,
  logAdminApiError,
  respostaErroPostgresAmigavel,
  statusAuthAdmin,
} from '@/lib/admin-api-errors'
import {
  probeAdminTables,
  respostaAdminTablesNotReady,
  respostaAdminTablesProbeError,
} from '@/lib/admin-tables'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BodySistema = {
  id?: string
  nome?: string
  slug?: string
  origem?: string
  descricao?: string
  url?: string
  ativo?: boolean
}

async function gateTables() {
  const probe = await probeAdminTables()
  if (probe.status === 'ready') return null
  if (probe.status === 'missing') {
    const r = respostaAdminTablesNotReady()
    return NextResponse.json(r.body, { status: r.status })
  }
  const r = respostaAdminTablesProbeError(probe)
  return NextResponse.json(r.body, { status: r.status })
}

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) {
      const body = await blocked.clone().json().catch(() => ({}))
      return NextResponse.json({ ...body, sistemas: [] }, { status: blocked.status })
    }

    const url = new URL(req.url)
    const onlyAtivos = url.searchParams.get('ativos') === '1'

    let query = supabaseAdmin
      .from('admin_sistemas')
      .select(COLS_ADMIN_SISTEMA)
      .order('nome', { ascending: true })

    if (onlyAtivos) query = query.eq('ativo', true)

    const { data, error } = await query
    if (error) {
      logAdminApiError('sistemas GET', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }

    return NextResponse.json({ ok: true, tablesReady: true, sistemas: data || [] })
  } catch (error: unknown) {
    logAdminApiError('sistemas GET auth', error)
    return NextResponse.json(
      { ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' },
      { status: statusAuthAdmin(error) },
    )
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const body = (await req.json()) as BodySistema
    const nome = String(body.nome || '').trim()
    const origem = normalizarOrigemSistema(body.origem)
    const slug = String(body.slug || slugifySistemaNome(nome) || '').trim().toLowerCase()
    const descricao = String(body.descricao || '').trim() || null
    const urlSistema = String(body.url || '').trim() || null
    const ativo = body.ativo !== false

    if (!nome) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Informe o nome do sistema.' }, { status: 400 })
    }
    if (!origem) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Origem inválida. Use connect ou terceiro.' }, { status: 400 })
    }
    if (!slug) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Não foi possível gerar o slug do sistema.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('admin_sistemas')
      .insert([{ nome, slug, origem, descricao, url: urlSistema, ativo }])
      .select(COLS_ADMIN_SISTEMA)
      .maybeSingle()

    if (error) {
      logAdminApiError('sistemas POST', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }

    return NextResponse.json({ ok: true, sistema: data })
  } catch (error: unknown) {
    logAdminApiError('sistemas POST', error)
    return NextResponse.json(
      { ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' },
      { status: statusAuthAdmin(error) },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTables()
    if (blocked) return blocked

    const body = (await req.json()) as BodySistema
    const id = String(body.id || '').trim()
    if (!id) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'ID do sistema não informado.' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (body.nome !== undefined) updates.nome = String(body.nome || '').trim()
    if (body.descricao !== undefined) updates.descricao = String(body.descricao || '').trim() || null
    if (body.url !== undefined) updates.url = String(body.url || '').trim() || null
    if (body.ativo !== undefined) updates.ativo = Boolean(body.ativo)
    if (body.slug !== undefined) updates.slug = String(body.slug || '').trim().toLowerCase()

    let origemNova: OrigemSistemaAdmin | null = null
    if (body.origem !== undefined) {
      origemNova = normalizarOrigemSistema(body.origem)
      if (!origemNova) {
        return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Origem inválida.' }, { status: 400 })
      }
      updates.origem = origemNova
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Nenhum dado para atualizar.' }, { status: 400 })
    }

    if (origemNova) {
      const { data: atual } = await supabaseAdmin
        .from('admin_sistemas')
        .select('id,origem')
        .eq('id', id)
        .maybeSingle()

      const origemAtual = normalizarOrigemSistema(atual?.origem) || 'connect'
      if (origemAtual === 'connect' && origemNova === 'terceiro') {
        const { data: vinculos } = await supabaseAdmin
          .from('admin_cliente_sistemas')
          .select('acesso_connect,auth_user_id,perfil_id')
          .eq('sistema_id', id)

        const temAcesso = (vinculos || []).some((v) =>
          vinculoTemAcessoConnectIncompativelComTerceiro(v as {
            acesso_connect?: boolean | null
            auth_user_id?: string | null
            perfil_id?: string | null
          }),
        )

        const guard = podeAlterarOrigemConnectParaTerceiro({
          origemAtual,
          origemNova,
          vinculosComAcesso: temAcesso,
        })
        if (guard.ok === false) {
          return NextResponse.json(
            { ok: false, code: CODIGO_ORIGEM_FLIP_BLOQUEADO, error: MSG_ORIGEM_FLIP_BLOQUEADO },
            { status: 422 },
          )
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('admin_sistemas')
      .update(updates)
      .eq('id', id)
      .select(COLS_ADMIN_SISTEMA)
      .maybeSingle()

    if (error) {
      logAdminApiError('sistemas PATCH', error)
      const r = respostaErroPostgresAmigavel(error)
      // Mensagem amigável específica se trigger DB bloquear
      if (String(error.message || '').toLowerCase().includes('connect')) {
        return NextResponse.json(
          { ok: false, code: CODIGO_ORIGEM_FLIP_BLOQUEADO, error: MSG_ORIGEM_FLIP_BLOQUEADO },
          { status: 422 },
        )
      }
      return NextResponse.json(r.body, { status: r.status })
    }

    return NextResponse.json({ ok: true, sistema: data })
  } catch (error: unknown) {
    logAdminApiError('sistemas PATCH', error)
    return NextResponse.json(
      { ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' },
      { status: statusAuthAdmin(error) },
    )
  }
}
