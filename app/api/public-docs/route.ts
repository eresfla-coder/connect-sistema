import { NextRequest, NextResponse } from 'next/server'
import { configRowSupabaseToPublica, mergeConfigPublicacao } from '@/lib/documentosPublicos'
import { camposEmpresaNoPayload, enriquecerPayloadDocumentoPublico, timestampVersaoPublica } from '@/lib/empresaPublica'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { withTimeout } from '@/lib/fetch-with-timeout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIPOS_PUBLICOS = new Set(['orcamento', 'ordem_servico', 'recibo', 'contrato', 'os'])
const PUBLIC_DOCS_ROW_COLS =
  'token,document_type,document_id,documento_id,tipo,user_id,payload,updated_at,created_at'
const PUBLIC_DOCS_POST_BUDGET_MS = 8000
const PUBLIC_DOCS_QUERY_TIMEOUT_MS = 3000
const PUBLIC_DOCS_CONFIG_TIMEOUT_MS = 2000
const CFG_EMPRESA_COLS =
  'user_id,nome_empresa,telefone,celular_empresa,whatsapp_empresa,email,endereco,cidade_uf,responsavel,logo_url,cor_primaria,cor_secundaria,updated_at'

class PublicDocsTimeoutError extends Error {
  constructor(message = 'Publicação demorou demais. Tente novamente em instantes.') {
    super(message)
    this.name = 'PublicDocsTimeoutError'
  }
}

function criarDeadlinePost() {
  const limite = Date.now() + PUBLIC_DOCS_POST_BUDGET_MS
  return () => {
    if (Date.now() > limite) throw new PublicDocsTimeoutError()
  }
}

function normalizarTipoPublico(documentTypeRaw: string) {
  const raw = String(documentTypeRaw || '').trim().toLowerCase()
  if (raw === 'os' || raw === 'ordem_servico') return 'ordem_servico'
  return raw
}

function linhaPublicDocument(
  documentType: string,
  documentId: string,
  token: string,
  payload: Record<string, unknown>,
  extras?: { user_id?: string }
) {
  return {
    token,
    document_type: documentType,
    document_id: documentId,
    payload,
    updated_at: new Date().toISOString(),
    tipo: documentType,
    documento_id: documentId,
    ...(extras?.user_id ? { user_id: extras.user_id } : {}),
  }
}

async function buscarPublicDocumentPorTipoId(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  documentType: string,
  documentId: string
) {
  const porColunasNovas = await withTimeout(
    supabaseAdmin
      .from('public_documents')
      .select(PUBLIC_DOCS_ROW_COLS)
      .eq('document_type', documentType)
      .eq('document_id', documentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    PUBLIC_DOCS_QUERY_TIMEOUT_MS,
    () => ({ data: null, error: { message: 'timeout' } }),
  )

  if (porColunasNovas.data || !porColunasNovas.error) {
    return porColunasNovas
  }

  if (documentType === 'ordem_servico') {
    return withTimeout(
      supabaseAdmin
        .from('public_documents')
        .select(PUBLIC_DOCS_ROW_COLS)
        .in('tipo', ['ordem_servico', 'os'])
        .eq('documento_id', documentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      PUBLIC_DOCS_QUERY_TIMEOUT_MS,
      () => ({ data: null, error: { message: 'timeout' } }),
    )
  }

  return withTimeout(
    supabaseAdmin
      .from('public_documents')
      .select(PUBLIC_DOCS_ROW_COLS)
      .eq('tipo', documentType)
      .eq('documento_id', documentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    PUBLIC_DOCS_QUERY_TIMEOUT_MS,
    () => ({ data: null, error: { message: 'timeout' } }),
  )
}

function gerarToken() {
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)

  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function erroApi(error: unknown, status = 500) {
  console.error('[PUBLIC_DOCS_API]', error)

  let message = 'Erro interno.'

  if (error instanceof Error) message = error.message
  else if (typeof error === 'string') message = error
  else if (typeof error === 'object' && error !== null) message = JSON.stringify(error)

  return NextResponse.json(
    { success: false, error: message },
    { status }
  )
}

function getBearerToken(req: NextRequest) {
  const authHeader =
    req.headers.get('authorization') ||
    req.headers.get('Authorization') ||
    ''

  const [type, token] = authHeader.split(' ')

  if (String(type || '').toLowerCase() !== 'bearer') return ''

  return String(token || '').trim()
}

function tokenFormatoValido(token: string) {
  const t = String(token || '').trim()
  return t.length >= 16 && /^[a-f0-9]+$/i.test(t)
}

function payloadIndicaAprovacaoPublica(payload: unknown) {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  const status = String(p.status || '').toLowerCase()
  if (/aprov|cancel|recus/.test(status)) return true
  if (p.aprovacaoDigital || p.assinaturaDigital) return true
  if (typeof p.aprovado === 'boolean') return true
  const assinatura = p.assinatura as Record<string, unknown> | undefined
  if (assinatura?.status === 'assinado' || p.assinado === true) return true
  return false
}

function mesclarPayloadAprovacaoPublica(
  base: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
) {
  const anterior = base && typeof base === 'object' ? base : {}
  return {
    ...anterior,
    status: incoming.status ?? anterior.status,
    aprovado: incoming.aprovado ?? anterior.aprovado,
    aprovadoEm: incoming.aprovadoEm ?? anterior.aprovadoEm,
    aprovacaoDigital: incoming.aprovacaoDigital ?? anterior.aprovacaoDigital,
    assinaturaDigital: incoming.assinaturaDigital ?? anterior.assinaturaDigital,
    assinatura: incoming.assinatura ?? anterior.assinatura,
    assinado: incoming.assinado ?? anterior.assinado,
    atualizadoEm: incoming.atualizadoEm ?? anterior.atualizadoEm,
  }
}

async function buscarDocumentoOwner(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  documentType: string,
  documentId: string,
  userId: string,
) {
  const base = await supabaseAdmin
    .from('public_documents')
    .select('*')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .eq('document_type', documentType)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (base.data || base.error) return base

  if (documentType === 'ordem_servico') {
    return supabaseAdmin
      .from('public_documents')
      .select('*')
      .eq('user_id', userId)
      .eq('documento_id', documentId)
      .in('tipo', ['ordem_servico', 'os'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  return supabaseAdmin
    .from('public_documents')
    .select('*')
    .eq('user_id', userId)
    .eq('tipo', documentType)
    .eq('documento_id', documentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

async function userIdDoToken(
  req: NextRequest,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
) {
  try {
    const token = getBearerToken(req)
    if (!token) return ''

    const { data, error } = await withTimeout(
      supabaseAdmin.auth.getUser(token),
      PUBLIC_DOCS_QUERY_TIMEOUT_MS,
      () => ({ data: { user: null }, error: { message: 'timeout' } }),
    )

    if (error) {
      console.error('[SUPABASE_AUTH]', error)
      return ''
    }

    return data.user?.id || ''
  } catch (error) {
    console.error('[TOKEN_USER_ERROR]', error)
    return ''
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const url = new URL(req.url)

    const tipoLegadoEarly = String(url.searchParams.get('tipo') || '').trim().toLowerCase()
    const documentType = String(
      url.searchParams.get('document_type') ||
      (tipoLegadoEarly === 'os' ? 'ordem_servico' : '')
    ).trim()
    const documentId = String(
      url.searchParams.get('document_id') ||
      url.searchParams.get('documentoId') ||
      url.searchParams.get('id') ||
      ''
    ).trim()
    const token = String(url.searchParams.get('token') || url.searchParams.get('p') || '').trim()
    const tipoLegado = String(url.searchParams.get('tipo') || '').trim()
    const documentoIdLegado = String(
      url.searchParams.get('documentoId') ||
      url.searchParams.get('id') ||
      ''
    ).trim()

    const userIdOwner = await userIdDoToken(req, supabaseAdmin)

    if (documentType === 'ordem_servico' && documentId) {
      let result

      if (token && tokenFormatoValido(token)) {
        result = await supabaseAdmin
          .from('public_documents')
          .select('*')
          .eq('documento_id', documentId)
          .eq('token', token)
          .in('tipo', ['ordem_servico', 'os'])
          .maybeSingle()
      } else if (userIdOwner) {
        result = await buscarDocumentoOwner(supabaseAdmin, 'ordem_servico', documentId, userIdOwner)
      } else {
        return NextResponse.json(
          { success: false, error: 'Token obrigatório para acessar este documento.' },
          { status: 401 },
        )
      }

      const { data, error } = result

      if (error) {
        console.error('[PUBLIC_DOCS_GET]', error)
        return erroApi(error)
      }

      if (!data) {
        return NextResponse.json(
          { success: false, error: 'Documento não encontrado.' },
          { status: 404 }
        )
      }

      return NextResponse.json(data)
    }

    if ((documentType === 'contrato' || documentType === 'recibo') && documentId) {
      if (!token || !tokenFormatoValido(token)) {
        return NextResponse.json(
          { success: false, error: 'Link inválido ou incompleto. Peça um novo link ao emitente.' },
          { status: 400 }
        )
      }

      let data: Record<string, unknown> | null = null
      let error: { message?: string } | null = null

      const porNovasColunas = await supabaseAdmin
        .from('public_documents')
        .select('*')
        .eq('document_type', documentType)
        .eq('document_id', documentId)
        .eq('token', token)
        .maybeSingle()

      data = porNovasColunas.data
      error = porNovasColunas.error

      if (!data && !error) {
        const porLegado = await supabaseAdmin
          .from('public_documents')
          .select('*')
          .eq('tipo', documentType)
          .eq('documento_id', documentId)
          .eq('token', token)
          .maybeSingle()
        data = porLegado.data
        error = porLegado.error
      }

      if (error) {
        console.error('[PUBLIC_DOCS_GET]', error)
        return erroApi(error)
      }

      if (!data) {
        return NextResponse.json(
          { success: false, error: 'Documento não encontrado ou link expirado.' },
          { status: 404 }
        )
      }

      return NextResponse.json(data)
    }

    if (documentType === 'orcamento' && documentId) {
      let result

      if (token && tokenFormatoValido(token)) {
        result = await supabaseAdmin
          .from('public_documents')
          .select('*')
          .eq('tipo', 'orcamento')
          .eq('documento_id', documentId)
          .eq('token', token)
          .maybeSingle()
      } else if (userIdOwner) {
        result = await buscarDocumentoOwner(supabaseAdmin, 'orcamento', documentId, userIdOwner)
      } else {
        return NextResponse.json(
          { success: false, error: 'Token obrigatório para acessar este documento.' },
          { status: 401 },
        )
      }

      const { data, error } = result

      if (error) {
        console.error('[PUBLIC_DOCS_GET]', error)
        return erroApi(error)
      }

      if (!data) {
        return NextResponse.json(
          { success: false, error: 'Documento não encontrado.' },
          { status: 404 }
        )
      }

      return NextResponse.json(data)
    }

    const tipo = tipoLegado
    const documentoId = documentoIdLegado

    if (!tipo || !documentoId) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos.' },
        { status: 400 }
      )
    }

    if (!token || !tokenFormatoValido(token)) {
      if (!userIdOwner) {
        return NextResponse.json(
          { success: false, error: 'Token obrigatório para acessar este documento.' },
          { status: 401 },
        )
      }
      const tipoNorm = normalizarTipoPublico(tipo)
      const ownerResult = await buscarDocumentoOwner(supabaseAdmin, tipoNorm, documentoId, userIdOwner)
      if (ownerResult.error) return erroApi(ownerResult.error)
      if (!ownerResult.data) {
        return NextResponse.json({ success: false, error: 'Documento não encontrado.' }, { status: 404 })
      }
      return NextResponse.json(ownerResult.data)
    }

    const legadoQuery =
      tipo === 'ordem_servico' || tipo === 'os'
        ? supabaseAdmin
            .from('public_documents')
            .select('*')
            .in('tipo', ['ordem_servico', 'os'])
            .eq('documento_id', documentoId)
        : supabaseAdmin
            .from('public_documents')
            .select('*')
            .eq('tipo', tipo)
            .eq('documento_id', documentoId)
            .eq('token', token)

    const { data, error } = await legadoQuery.maybeSingle()

    if (error) {
      console.error('[PUBLIC_DOCS_GET]', error)
      return erroApi(error)
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Documento não encontrado.' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    return erroApi(error)
  }
}

export async function POST(req: NextRequest) {
  const verificarTempo = criarDeadlinePost()

  try {
    let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (configError) {
      console.error('[PUBLIC_DOCS_POST] Configuração Supabase:', configError)
      return erroApi(configError)
    }

    const body = await req.json()

    const documentTypeRaw = String(body?.document_type || body?.tipo || '').trim()
    const documentType = normalizarTipoPublico(documentTypeRaw)
    const payloadRecebido = body?.payload ?? body?.snapshot ?? null

    const tokenRecebido = String(body?.token || '').trim()

    const documentIdReciboContrato = String(body?.document_id || '').trim()

    let documentoId = ''

    if (documentType === 'recibo' || documentType === 'contrato') {
      if (!documentTypeRaw || !documentIdReciboContrato || !tokenRecebido) {
        return NextResponse.json(
          {
            success: false,
            error: 'document_type, document_id e token são obrigatórios.',
          },
          { status: 400 }
        )
      }
      documentoId = documentIdReciboContrato
    } else {
      documentoId = String(
        body?.document_id ||
        body?.documentoId ||
        payloadRecebido?.id ||
        payloadRecebido?.i ||
        ''
      ).trim()
    }

    const tipo = documentType

    if (!tipo || !TIPOS_PUBLICOS.has(tipo)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de documento inválido: "${documentTypeRaw || tipo}". Use: orcamento, ordem_servico, recibo ou contrato.`,
        },
        { status: 400 }
      )
    }

    if (!payloadRecebido || !documentoId || documentoId === 'NaN') {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos para publicar documento.' },
        { status: 400 }
      )
    }

    if (tipo === 'recibo' && (!tokenRecebido || !documentoId)) {
      return NextResponse.json(
        { success: false, error: 'document_type, document_id e token são obrigatórios.' },
        { status: 400 }
      )
    }

    let existente: any = null
    let erroBusca: any = null

    const userIdBearerPromise = userIdDoToken(req, supabaseAdmin)

    if (tokenRecebido) {
      const buscaPorToken = await withTimeout(
        supabaseAdmin
          .from('public_documents')
          .select(PUBLIC_DOCS_ROW_COLS)
          .eq('token', tokenRecebido)
          .maybeSingle(),
        PUBLIC_DOCS_QUERY_TIMEOUT_MS,
        () => ({ data: null, error: { message: 'timeout' } }),
      )

      existente = buscaPorToken.data
      erroBusca = buscaPorToken.error
    }

    if (!existente && !erroBusca) {
      const buscaPorDocumento = await buscarPublicDocumentPorTipoId(supabaseAdmin, tipo, documentoId)
      existente = buscaPorDocumento.data
      erroBusca = buscaPorDocumento.error
    }

    if (erroBusca && erroBusca.message !== 'timeout') {
      console.error('[BUSCA_EXISTENTE]', erroBusca)
      return erroApi(erroBusca)
    }

    verificarTempo()
    const userIdBearer = await userIdBearerPromise
    const isAprovacaoPublica = payloadIndicaAprovacaoPublica(payloadRecebido)
    const tokenConfere = Boolean(
      tokenRecebido &&
      existente?.token &&
      String(existente.token) === tokenRecebido &&
      tokenFormatoValido(tokenRecebido),
    )

    if (!existente && !userIdBearer) {
      return NextResponse.json(
        { success: false, error: 'Publicação exige autenticação do emitente.' },
        { status: 401 },
      )
    }

    if (!userIdBearer) {
      if (!tokenConfere || !existente) {
        return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
      }
      if (!isAprovacaoPublica) {
        return NextResponse.json(
          { success: false, error: 'Alteração não permitida sem autenticação do emitente.' },
          { status: 403 },
        )
      }
    }

    if (userIdBearer && existente?.user_id && String(existente.user_id) !== userIdBearer) {
      return NextResponse.json({ success: false, error: 'Documento pertence a outro usuário.' }, { status: 403 })
    }

    const payloadParaMerge =
      !userIdBearer && existente?.payload && isAprovacaoPublica
        ? mesclarPayloadAprovacaoPublica(existente.payload as Record<string, unknown>, payloadRecebido as Record<string, unknown>)
        : payloadRecebido

    const token = String(
      existente?.token ||
      tokenRecebido ||
      gerarToken()
    ).trim()

    const userIdToken = userIdBearer

    const userId = String(
      userIdBearer ||
      existente?.user_id ||
      body?.user_id ||
      payloadRecebido?.user_id ||
      payloadRecebido?.owner_user_id ||
      ''
    ).trim()

    let configEmpresaPublica: ReturnType<typeof mergeConfigPublicacao> | null = mergeConfigPublicacao(
      payloadRecebido?.config,
      payloadRecebido?.cfg,
    )

    if (userId) {
      const { data: rowCfg } = await withTimeout(
        supabaseAdmin.from('configuracoes_empresa').select(CFG_EMPRESA_COLS).eq('user_id', userId).maybeSingle(),
        PUBLIC_DOCS_CONFIG_TIMEOUT_MS,
        () => ({ data: null, error: null }),
      )

      if (rowCfg) {
        configEmpresaPublica = mergeConfigPublicacao(
          payloadRecebido?.config,
          payloadRecebido?.cfg,
          configRowSupabaseToPublica(rowCfg as Record<string, unknown>),
        )
      }
    }

    verificarTempo()

    const versao = timestampVersaoPublica(existente?.updated_at || Date.now())
    const empresaCampos = camposEmpresaNoPayload(configEmpresaPublica, {
      token,
      userId: userId || undefined,
      v: versao,
    })

    const payload = enriquecerPayloadDocumentoPublico(
      {
        ...(existente?.payload || {}),
        ...payloadParaMerge,
        ...empresaCampos,
      },
      configEmpresaPublica,
      { token, userId: userId || undefined, v: versao }
    )

    const dadosSalvar = linhaPublicDocument(tipo, documentoId, token, payload, userId ? { user_id: userId } : undefined)
    dadosSalvar.updated_at = new Date().toISOString()

    if (process.env.NODE_ENV === 'development') {
      console.error('[PUBLIC_DOCS_POST] row', dadosSalvar)
    }

    async function salvarPublicDocument() {
      if (existente?.token) {
        return supabaseAdmin
          .from('public_documents')
          .update(dadosSalvar)
          .eq('token', existente.token)
      }

      const insertResult = await supabaseAdmin.from('public_documents').insert(dadosSalvar)

      if (!insertResult.error) return insertResult

      if (insertResult.error?.code === '23505') {
        console.warn('[INSERT_PUBLIC_DOCS] Conflito único, tentando update idempotente', { tipo, documentoId })

        if (token) {
          const porToken = await supabaseAdmin.from('public_documents').update(dadosSalvar).eq('token', token)
          if (!porToken.error) return porToken
        }

        const porNovasColunas = await supabaseAdmin
          .from('public_documents')
          .update(dadosSalvar)
          .eq('document_type', tipo)
          .eq('document_id', documentoId)

        if (!porNovasColunas.error) return porNovasColunas

        if (tipo === 'ordem_servico') {
          return supabaseAdmin
            .from('public_documents')
            .update(dadosSalvar)
            .in('tipo', ['ordem_servico', 'os'])
            .eq('documento_id', documentoId)
        }

        return supabaseAdmin
          .from('public_documents')
          .update(dadosSalvar)
          .eq('tipo', tipo)
          .eq('documento_id', documentoId)
      }

      return insertResult
    }

    verificarTempo()
    const { error: erroSalvar } = await withTimeout(
      salvarPublicDocument(),
      PUBLIC_DOCS_QUERY_TIMEOUT_MS,
      () => ({ error: { message: 'timeout ao salvar documento público' } }),
    )

    if (erroSalvar) {
      console.error('[SALVAR_PUBLIC_DOCS]', {
        message: erroSalvar.message,
        tipo,
        documento_id: documentoId,
      })
      return erroApi(erroSalvar)
    }

    if (tipo === 'contrato') {
      const assinaturaPayload = (payload as Record<string, unknown>)?.assinatura as Record<string, unknown> | undefined
      const assinado =
        assinaturaPayload?.status === 'assinado' ||
        (payload as Record<string, unknown>)?.assinado === true
      if (assinado) {
        const { error: errContrato } = await supabaseAdmin
          .from('contratos')
          .update({ status: 'Assinado' })
          .eq('id', documentoId)
        if (errContrato) {
          console.warn('[PUBLIC_DOCS_POST] contrato status:', errContrato.message)
        }
      }
    }

    return NextResponse.json({
      success: true,
      token,
      tipo,
      document_type: tipo,
      documentoId,
      document_id: documentoId,
      user_id: userId || null,
      updated_at: dadosSalvar.updated_at,
      empresa_nome: payload.empresa_nome,
      empresa_logo_og: payload.empresa_logo_og,
    })
  } catch (error) {
    if (error instanceof PublicDocsTimeoutError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 })
    }
    return erroApi(error)
  }
}