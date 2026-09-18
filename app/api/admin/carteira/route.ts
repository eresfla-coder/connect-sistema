import { NextResponse } from 'next/server'
import {
  acessoConnectDoVinculo,
  avaliarSistemaParaContratacao,
  deveCriarAuthConnect,
  deveLimparAdminClienteRecemCriado,
  filtrarItensCarteiraOficial,
  normalizarEmailAdmin,
  validarAcessoPorOrigem,
  validarCriarAcessoComOrigem,
  validarIdsAcessoConnect,
  type AdminListaItem,
  type OrigemSistemaAdmin,
  type StatusVinculoAdmin,
} from '@/lib/admin-carteira'
import {
  camposIniciaisVinculoComercial,
  dataCalendarioLocal,
  normalizarStatusInicial,
  type StatusInicialComercial,
} from '@/lib/admin-ciclo-comercial'
import {
  COLS_ADMIN_CLIENTE,
  COLS_ADMIN_VINCULO,
  logAdminApiError,
  respostaErroPostgresAmigavel,
  statusAuthAdmin,
} from '@/lib/admin-api-errors'
import {
  deveChamarCreateUserAuthParaOrigem,
  deveGerarSenhaParaOrigem,
  deveLimparAuthRecemCriado,
  montarConviteClienteAdmin,
  resolverCriarAcesso,
  type ModoCriacaoClienteAdmin,
} from '@/lib/admin-criar-acesso'
import { requireAdminFromRequest } from '@/lib/api-auth'
import {
  probeAdminTables,
  respostaAdminTablesNotReady,
  respostaAdminTablesProbeError,
} from '@/lib/admin-tables'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BodyCadastro = {
  email?: string
  nome?: string
  nome_empresa?: string
  telefone?: string
  documento?: string
  observacoes?: string
  sistema_id?: string
  status?: StatusVinculoAdmin | StatusInicialComercial
  /** @deprecated ADMIN.3.1 — preferir status (ativo|trial|bloqueado) */
  tipo?: 'trial' | 'ativo'
  valor?: string | number
  dia_vencimento?: number | string
  data_vencimento?: string
  dias_trial?: number | string
  criar_acesso?: boolean
}

function normalizarTelefone(value?: string) {
  return String(value || '').replace(/\D/g, '')
}

function parseValor(value?: string | number) {
  const numero = Number(String(value ?? '0').replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

function senhaTemporaria() {
  const aleatorio = Math.random().toString(36).slice(2, 6)
  const final = Date.now().toString().slice(-4)
  return `Connect@${aleatorio}${final}`
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
}

async function gateTablesForWrite() {
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

    const url = new URL(req.url)
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase()

    const probe = await probeAdminTables()
    if (probe.status === 'error') {
      const r = respostaAdminTablesProbeError(probe)
      return NextResponse.json(r.body, { status: r.status })
    }

    const tablesReady = probe.status === 'ready'
    if (!tablesReady) {
      const r = respostaAdminTablesNotReady()
      return NextResponse.json(
        { ...r.body, dualRead: false, tablesReady: false, total: 0, itens: [] },
        { status: r.status },
      )
    }

    // ADMIN.2.5 — fonte oficial: somente admin_*. Sem dual-read de public.perfis.
    const itens: AdminListaItem[] = []
    const { data: clientesAdmin, error } = await supabaseAdmin
      .from('admin_clientes')
      .select(
        `
          id,nome,nome_empresa,email,telefone,documento,observacoes,ativo,created_at,updated_at,
          vinculos:admin_cliente_sistemas(
            id,status,valor,dia_vencimento,data_vencimento,inicio,fim_trial,observacoes,
            status_pagamento,ultimo_pagamento,acesso_connect,auth_user_id,perfil_id,
            sistema:admin_sistemas(id,slug,nome,origem,ativo)
          )
        `,
      )
      .order('created_at', { ascending: false })

    if (error) {
      logAdminApiError('carteira GET admin', error)
      const r = respostaErroPostgresAmigavel(error)
      return NextResponse.json(r.body, { status: r.status })
    }

    for (const c of clientesAdmin || []) {
      const vinculos = Array.isArray((c as { vinculos?: unknown }).vinculos)
        ? ((c as { vinculos: Array<Record<string, unknown>> }).vinculos)
        : []

      const sistemas = vinculos.map((v) => {
        const sistema = (v.sistema || {}) as Record<string, unknown>
        const origemRaw = String(sistema.origem || 'terceiro')
        const origem: OrigemSistemaAdmin = origemRaw === 'connect' ? 'connect' : 'terceiro'
        return {
          vinculo_id: String(v.id || ''),
          sistema_id: sistema.id ? String(sistema.id) : null,
          nome: String(sistema.nome || 'Sistema'),
          origem,
          status: (v.status as string) || null,
          valor: v.valor != null ? Number(v.valor) : null,
          data_vencimento: v.data_vencimento ? String(v.data_vencimento) : null,
          dia_vencimento: v.dia_vencimento != null ? Number(v.dia_vencimento) : null,
          status_pagamento: v.status_pagamento ? String(v.status_pagamento) : null,
          acesso_connect: Boolean(v.acesso_connect),
          auth_user_id: v.auth_user_id ? String(v.auth_user_id) : null,
          perfil_id: v.perfil_id ? String(v.perfil_id) : null,
          legado_texto: false,
          sistema_cliente_legado: null as string | null,
        }
      })

      const prim = sistemas[0]
      const primRaw = vinculos[0] || {}
      const authIds = sistemas.map((s) => s.auth_user_id).filter(Boolean) as string[]
      itens.push({
        fonte: 'admin',
        id: String((c as { id: string }).id),
        admin_cliente_id: String((c as { id: string }).id),
        nome: (c as { nome?: string | null }).nome || null,
        nome_empresa: (c as { nome_empresa?: string | null }).nome_empresa || null,
        email: (c as { email?: string | null }).email || null,
        telefone: (c as { telefone?: string | null }).telefone || null,
        observacoes: (c as { observacoes?: string | null }).observacoes || null,
        ativo: (c as { ativo?: boolean }).ativo !== false,
        legado: false,
        status: prim?.status || null,
        valor_plano: prim?.valor ?? null,
        vencimento: prim?.data_vencimento || null,
        status_pagamento: primRaw.status_pagamento ? String(primRaw.status_pagamento) : null,
        ultimo_pagamento: primRaw.ultimo_pagamento ? String(primRaw.ultimo_pagamento) : null,
        data_criacao: (c as { created_at?: string | null }).created_at || null,
        sistemas,
        auth_user_id: authIds[0] || null,
        perfil_id: sistemas.find((s) => s.perfil_id)?.perfil_id || null,
        pode_reset_senha: authIds.length > 0,
      })
    }

    const oficiais = filtrarItensCarteiraOficial(itens)
    const filtrados = q
      ? oficiais.filter((item) => {
          const blob = [
            item.nome,
            item.nome_empresa,
            item.email,
            item.telefone,
            ...(item.sistemas || []).map((s) => s.nome),
          ]
            .join(' ')
            .toLowerCase()
          return blob.includes(q)
        })
      : oficiais

    return NextResponse.json({
      ok: true,
      tablesReady: true,
      dualRead: false,
      fonte: 'admin_carteira',
      total: filtrados.length,
      itens: filtrados,
    })
  } catch (error: unknown) {
    logAdminApiError('carteira GET', error)
    return NextResponse.json(
      { ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' },
      { status: statusAuthAdmin(error) },
    )
  }
}

export async function POST(req: Request) {
  let adminClienteId: string | null = null
  let adminClienteRecemCriadoNestaRequest = false
  let authUserId: string | null = null
  let authRecemCriadoNestaRequest = false
  let vinculoPersistido = false

  try {
    await requireAdminFromRequest(req)
    const blocked = await gateTablesForWrite()
    if (blocked) return blocked

    const body = (await req.json()) as BodyCadastro
    const email = normalizarEmailAdmin(body.email)
    const nomeEmpresa = String(body.nome_empresa || body.nome || '').trim()
    const nome = String(body.nome || nomeEmpresa || '').trim()
    const telefone = normalizarTelefone(body.telefone)
    const documento = String(body.documento || '').trim() || null
    const observacoes = String(body.observacoes || '').trim() || null
    const sistemaId = String(body.sistema_id || '').trim()
    const criarAcessoPedido = resolverCriarAcesso(body.criar_acesso)
    // ADMIN.3.1 — status inicial (ativo|trial|bloqueado). Compat: tipo legado → status.
    const statusInicial = normalizarStatusInicial(
      body.status || (body.tipo === 'ativo' ? 'ativo' : body.tipo === 'trial' ? 'trial' : 'trial'),
    )
    const valor = parseValor(body.valor)

    if (!email) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Informe o e-mail do cliente.' }, { status: 400 })
    }
    if (!sistemaId) {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Selecione o sistema contratado.' }, { status: 400 })
    }

    let camposComerciais
    try {
      camposComerciais = camposIniciaisVinculoComercial({
        statusInicial,
        hoje: dataCalendarioLocal(),
        diaVencimento: body.dia_vencimento != null && body.dia_vencimento !== '' ? Number(body.dia_vencimento) : null,
        diasTrial: body.dias_trial != null && body.dias_trial !== '' ? Number(body.dias_trial) : 7,
        dataVencimentoOverride: body.data_vencimento || null,
      })
    } catch (e: unknown) {
      return NextResponse.json(
        {
          ok: false,
          code: 'ADMIN_VALIDATION',
          error: e instanceof Error ? e.message : 'Dados comerciais inválidos.',
        },
        { status: 400 },
      )
    }

    const statusVinculo = camposComerciais.status as StatusVinculoAdmin
    const dataVencimento = camposComerciais.data_vencimento
    const fimTrial = camposComerciais.fim_trial
    const ultimoPagamento = camposComerciais.ultimo_pagamento
    const diaVencimento = camposComerciais.dia_vencimento
    const statusPagamento = camposComerciais.status_pagamento

    const { data: sistema, error: sistemaError } = await supabaseAdmin
      .from('admin_sistemas')
      .select('id,nome,origem,ativo')
      .eq('id', sistemaId)
      .maybeSingle()

    if (sistemaError) {
      logAdminApiError('carteira POST sistema', sistemaError)
      const r = respostaErroPostgresAmigavel(sistemaError)
      return NextResponse.json(r.body, { status: r.status })
    }

    const sistemaOk = avaliarSistemaParaContratacao(sistema)
    if (sistemaOk.ok === false) {
      const status = sistemaOk.code === 'ADMIN_NOT_FOUND' ? 404 : 422
      return NextResponse.json(
        { ok: false, code: sistemaOk.code, error: sistemaOk.error },
        { status },
      )
    }

    const origem = String(sistema!.origem) as OrigemSistemaAdmin
    if (origem !== 'connect' && origem !== 'terceiro') {
      return NextResponse.json({ ok: false, code: 'ADMIN_VALIDATION', error: 'Origem do sistema inválida.' }, { status: 400 })
    }

    // Rejeitar combinação inválida ANTES de qualquer createUser / escrita Auth
    const criarAcessoCheck = validarCriarAcessoComOrigem({
      origem,
      criarAcesso: criarAcessoPedido,
    })
    if (criarAcessoCheck.ok === false) {
      return NextResponse.json(
        { ok: false, code: criarAcessoCheck.code, error: criarAcessoCheck.error },
        { status: 422 },
      )
    }

    const criarAcesso = origem === 'terceiro' ? false : criarAcessoPedido
    const acessoConnect = acessoConnectDoVinculo({ origem, criarAcesso })
    const validacaoOrigem = validarAcessoPorOrigem({ origem, acessoConnect })
    if (validacaoOrigem.ok === false) {
      return NextResponse.json(
        { ok: false, code: validacaoOrigem.code, error: validacaoOrigem.error },
        { status: 422 },
      )
    }

    // IDs ainda null neste ponto; true só após Auth — validamos o estado final abaixo
    if (!acessoConnect) {
      const idsOk = validarIdsAcessoConnect({ acessoConnect: false, authUserId: null, perfilId: null })
      if (idsOk.ok === false) {
        return NextResponse.json({ ok: false, code: idsOk.code, error: idsOk.error }, { status: 422 })
      }
    }

    // 1) admin_cliente
    {
      const { data: existente } = await supabaseAdmin
        .from('admin_clientes')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (existente?.id) {
        adminClienteId = String(existente.id)
        adminClienteRecemCriadoNestaRequest = false
        await supabaseAdmin
          .from('admin_clientes')
          .update({
            nome: nome || null,
            nome_empresa: nomeEmpresa || null,
            telefone: telefone || null,
            documento,
            observacoes,
            ativo: true,
          })
          .eq('id', adminClienteId)
      } else {
        const { data: criado, error: createCliErr } = await supabaseAdmin
          .from('admin_clientes')
          .insert([
            {
              nome: nome || null,
              nome_empresa: nomeEmpresa || null,
              email,
              telefone: telefone || null,
              documento,
              observacoes,
              ativo: true,
            },
          ])
          .select('id')
          .maybeSingle()

        if (createCliErr || !criado?.id) {
          logAdminApiError('carteira POST cliente', createCliErr)
          const r = respostaErroPostgresAmigavel(createCliErr)
          return NextResponse.json(r.body, { status: r.status })
        }
        adminClienteId = String(criado.id)
        adminClienteRecemCriadoNestaRequest = true
      }
    }

    // 2) Auth + perfis
    let perfilId: string | null = null
    let mode: ModoCriacaoClienteAdmin = 'admin_only'
    let senhaInicial: string | null = null
    const precisaAuth = deveChamarCreateUserAuthParaOrigem({ origem, criarAcesso })

    if (precisaAuth && deveCriarAuthConnect({ origem, criarAcesso })) {
      senhaInicial = deveGerarSenhaParaOrigem({ origem, criarAcesso }) ? senhaTemporaria() : null
      if (!senhaInicial) {
        await compensarFalha({
          adminClienteId,
          adminClienteRecemCriadoNestaRequest,
          authUserId,
          authRecemCriadoNestaRequest,
          vinculoPersistido,
        })
        return NextResponse.json(
          { ok: false, code: 'ADMIN_VALIDATION', error: 'Senha temporária obrigatória para criar Auth.' },
          { status: 400 },
        )
      }

      const createResult = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senhaInicial,
        email_confirm: true,
      })

      if (createResult.error) {
        const { data: perfilExistente } = await supabaseAdmin
          .from('perfis')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (!perfilExistente?.id) {
          logAdminApiError('carteira POST createUser', createResult.error)
          await compensarFalha({
            adminClienteId,
            adminClienteRecemCriadoNestaRequest,
            authUserId: null,
            authRecemCriadoNestaRequest: false,
            vinculoPersistido: false,
          })
          return NextResponse.json(
            { ok: false, code: 'ADMIN_AUTH_CREATE', error: 'Não foi possível criar o acesso Connect para este e-mail.' },
            { status: 400 },
          )
        }

        authUserId = String(perfilExistente.id)
        perfilId = authUserId
        mode = 'existing'
        authRecemCriadoNestaRequest = false
        senhaInicial = null
      } else {
        authUserId = createResult.data.user?.id || null
        authRecemCriadoNestaRequest = Boolean(authUserId)
        mode = 'created'
      }

      if (!authUserId) {
        await compensarFalha({
          adminClienteId,
          adminClienteRecemCriadoNestaRequest,
          authUserId: null,
          authRecemCriadoNestaRequest: false,
          vinculoPersistido: false,
        })
        return NextResponse.json(
          { ok: false, code: 'ADMIN_AUTH_CREATE', error: 'Não foi possível criar o usuário Auth.' },
          { status: 400 },
        )
      }

      perfilId = authUserId

      const idsOk = validarIdsAcessoConnect({
        acessoConnect: true,
        authUserId,
        perfilId,
      })
      if (idsOk.ok === false) {
        await compensarFalha({
          adminClienteId,
          adminClienteRecemCriadoNestaRequest,
          authUserId,
          authRecemCriadoNestaRequest,
          vinculoPersistido: false,
        })
        return NextResponse.json({ ok: false, code: idsOk.code, error: idsOk.error }, { status: 422 })
      }

      const perfil = {
        id: authUserId,
        email,
        nome_empresa: nomeEmpresa || null,
        telefone: telefone || null,
        valor_plano: valor,
        status: statusVinculo === 'trial' ? 'trial' : statusVinculo === 'bloqueado' ? 'bloqueado' : 'ativo',
        ativo: statusVinculo !== 'bloqueado',
        vencimento: dataVencimento,
        status_pagamento: statusPagamento,
        ultimo_pagamento: ultimoPagamento,
        sistema_cliente: String(sistema.nome || 'Connect Sistema'),
        observacoes,
      }

      let upsertError = (await supabaseAdmin.from('perfis').upsert([perfil], { onConflict: 'id' })).error
      if (upsertError) {
        const msg = String(upsertError.message || '').toLowerCase()
        if (msg.includes('sistema_cliente') || msg.includes('observacoes') || msg.includes('column')) {
          const fallback = { ...perfil } as Record<string, unknown>
          if (msg.includes('sistema_cliente')) delete fallback.sistema_cliente
          if (msg.includes('observacoes')) delete fallback.observacoes
          upsertError = (await supabaseAdmin.from('perfis').upsert([fallback], { onConflict: 'id' })).error
        }
      }

      if (upsertError) {
        logAdminApiError('carteira POST perfil', upsertError)
        await compensarFalha({
          adminClienteId,
          adminClienteRecemCriadoNestaRequest,
          authUserId,
          authRecemCriadoNestaRequest,
          vinculoPersistido: false,
        })
        return NextResponse.json(
          { ok: false, code: 'ADMIN_PERFIL_FAIL', error: 'Não foi possível salvar o perfil Connect.' },
          { status: 400 },
        )
      }
    }

    // 3) vínculo
    const vinculoPayload = {
      cliente_id: adminClienteId,
      sistema_id: sistemaId,
      status: statusVinculo,
      valor,
      dia_vencimento: diaVencimento,
      data_vencimento: dataVencimento,
      inicio: camposComerciais.inicio,
      fim_trial: fimTrial,
      observacoes,
      status_pagamento: statusPagamento,
      ultimo_pagamento: ultimoPagamento,
      acesso_connect: acessoConnect,
      auth_user_id: authUserId,
      perfil_id: perfilId,
    }

    const finalIds = validarIdsAcessoConnect({
      acessoConnect,
      authUserId,
      perfilId,
    })
    if (finalIds.ok === false) {
      await compensarFalha({
        adminClienteId,
        adminClienteRecemCriadoNestaRequest,
        authUserId,
        authRecemCriadoNestaRequest,
        vinculoPersistido: false,
      })
      return NextResponse.json({ ok: false, code: finalIds.code, error: finalIds.error }, { status: 422 })
    }

    const { data: vinculo, error: vinculoError } = await supabaseAdmin
      .from('admin_cliente_sistemas')
      .upsert([vinculoPayload], { onConflict: 'cliente_id,sistema_id' })
      .select(COLS_ADMIN_VINCULO)
      .maybeSingle()

    if (vinculoError) {
      logAdminApiError('carteira POST vinculo', vinculoError)
      await compensarFalha({
        adminClienteId,
        adminClienteRecemCriadoNestaRequest,
        authUserId,
        authRecemCriadoNestaRequest,
        vinculoPersistido: false,
      })
      const r = respostaErroPostgresAmigavel(vinculoError)
      return NextResponse.json(r.body, { status: r.status })
    }

    vinculoPersistido = true

    const accessLink = precisaAuth ? `${siteUrl()}/login` : ''
    const inviteText = montarConviteClienteAdmin({
      mode,
      nomeSaudacao: nomeEmpresa || email,
      email,
      sistemaCliente: String(sistema.nome || 'Sistema'),
      valorPlano: valor,
      vencimento: dataVencimento,
      accessLink: accessLink || siteUrl(),
      senhaInicial: mode === 'created' ? senhaInicial : null,
    })

    const whatsappUrl = telefone
      ? `https://wa.me/55${telefone.replace(/^55/, '')}?text=${encodeURIComponent(inviteText)}`
      : ''

    return NextResponse.json({
      ok: true,
      mode,
      criar_acesso: acessoConnect,
      origem,
      authUserCreated: authRecemCriadoNestaRequest,
      perfilCreated: Boolean(perfilId && authRecemCriadoNestaRequest),
      accessLink,
      temporaryPassword: mode === 'created' ? senhaInicial : null,
      inviteText,
      whatsappUrl,
      admin_cliente_id: adminClienteId,
      vinculo,
      sistema: { id: sistema.id, nome: sistema.nome, origem: sistema.origem, ativo: sistema.ativo },
    })
  } catch (error: unknown) {
    logAdminApiError('carteira POST', error)
    await compensarFalha({
      adminClienteId,
      adminClienteRecemCriadoNestaRequest,
      authUserId,
      authRecemCriadoNestaRequest,
      vinculoPersistido,
    })
    return NextResponse.json(
      { ok: false, code: 'ADMIN_AUTH', error: 'Não autorizado.' },
      { status: statusAuthAdmin(error) },
    )
  }
}

async function compensarFalha(params: {
  adminClienteId: string | null
  adminClienteRecemCriadoNestaRequest: boolean
  authUserId: string | null
  authRecemCriadoNestaRequest: boolean
  vinculoPersistido: boolean
}) {
  if (
    deveLimparAuthRecemCriado({
      authRecemCriadoNestaRequest: params.authRecemCriadoNestaRequest,
      falhaPosterior: true,
    }) &&
    params.authUserId
  ) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(params.authUserId)
    } catch (cleanupErr) {
      console.warn('[ADMIN CARTEIRA] cleanup auth:', cleanupErr)
    }
  }

  if (
    deveLimparAdminClienteRecemCriado({
      adminClienteRecemCriadoNestaRequest: params.adminClienteRecemCriadoNestaRequest,
      falhaPosterior: true,
      vinculoPersistido: params.vinculoPersistido,
    }) &&
    params.adminClienteId
  ) {
    try {
      const { count } = await supabaseAdmin
        .from('admin_cliente_sistemas')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', params.adminClienteId)

      if (!count) {
        await supabaseAdmin.from('admin_clientes').delete().eq('id', params.adminClienteId)
      }
    } catch (cleanupErr) {
      console.warn('[ADMIN CARTEIRA] cleanup admin_cliente:', cleanupErr)
    }
  }
}
