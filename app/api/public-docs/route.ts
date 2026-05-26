import { NextRequest, NextResponse } from 'next/server'
import { configRowSupabaseToPublica, mergeConfigPublicacao } from '@/lib/documentosPublicos'
import { camposEmpresaNoPayload, enriquecerPayloadDocumentoPublico, timestampVersaoPublica } from '@/lib/empresaPublica'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIPOS_PUBLICOS = new Set(['orcamento', 'ordem_servico', 'recibo', 'contrato', 'os'])

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
  const porColunasNovas = await supabaseAdmin
    .from('public_documents')
    .select('*')
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (porColunasNovas.data || !porColunasNovas.error) {
    return porColunasNovas
  }

  if (documentType === 'ordem_servico') {
    return supabaseAdmin
      .from('public_documents')
      .select('*')
      .in('tipo', ['ordem_servico', 'os'])
      .eq('documento_id', documentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  return supabaseAdmin
    .from('public_documents')
    .select('*')
    .eq('tipo', documentType)
    .eq('documento_id', documentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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

async function userIdDoToken(
  req: NextRequest,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
) {
  try {
    const token = getBearerToken(req)
    if (!token) return ''

    const { data, error } = await supabaseAdmin.auth.getUser(token)

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

    if (documentType === 'ordem_servico' && documentId) {
      let result

      if (token) {
        result = await supabaseAdmin
          .from('public_documents')
          .select('*')
          .eq('documento_id', documentId)
          .eq('token', token)
          .in('tipo', ['ordem_servico', 'os'])
          .maybeSingle()
      } else {
        result = await supabaseAdmin
          .from('public_documents')
          .select('*')
          .eq('documento_id', documentId)
          .in('tipo', ['ordem_servico', 'os'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
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
      if (!token) {
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

      if (token) {
        result = await supabaseAdmin
          .from('public_documents')
          .select('*')
          .eq('tipo', 'orcamento')
          .eq('documento_id', documentId)
          .eq('token', token)
          .maybeSingle()
      } else {
        result = await supabaseAdmin
          .from('public_documents')
          .select('*')
          .eq('tipo', 'orcamento')
          .eq('documento_id', documentId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
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

    const { data, error } = await legadoQuery
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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

    if (tokenRecebido) {
      const buscaPorToken = await supabaseAdmin
        .from('public_documents')
        .select('*')
        .eq('token', tokenRecebido)
        .maybeSingle()

      existente = buscaPorToken.data
      erroBusca = buscaPorToken.error
    }

    if (!existente && !erroBusca) {
      const buscaPorDocumento = await buscarPublicDocumentPorTipoId(supabaseAdmin, tipo, documentoId)
      existente = buscaPorDocumento.data
      erroBusca = buscaPorDocumento.error
    }

    if (erroBusca) {
      console.error('[BUSCA_EXISTENTE]', erroBusca)
      return erroApi(erroBusca)
    }

    const token = String(
      existente?.token ||
      tokenRecebido ||
      gerarToken()
    ).trim()

    const userIdToken = await userIdDoToken(req, supabaseAdmin)

    const userId = String(
      body?.user_id ||
      payloadRecebido?.user_id ||
      payloadRecebido?.owner_user_id ||
      userIdToken ||
      existente?.user_id ||
      ''
    ).trim()

    let configEmpresaPublica: ReturnType<typeof mergeConfigPublicacao> | null = null

    if (userId) {
      const { data: rowCfg } = await supabaseAdmin
        .from('configuracoes_empresa')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (rowCfg) {
        configEmpresaPublica = mergeConfigPublicacao(
          payloadRecebido?.config,
          payloadRecebido?.cfg,
          configRowSupabaseToPublica(rowCfg as Record<string, unknown>)
        )
      }
    }

    if (!configEmpresaPublica) {
      configEmpresaPublica = mergeConfigPublicacao(payloadRecebido?.config, payloadRecebido?.cfg)
    }

    const versao = timestampVersaoPublica(existente?.updated_at || Date.now())
    const empresaCampos = camposEmpresaNoPayload(configEmpresaPublica, {
      token,
      userId: userId || undefined,
      v: versao,
    })

    const payload = enriquecerPayloadDocumentoPublico(
      {
        ...(existente?.payload || {}),
        ...payloadRecebido,
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
        console.warn('[INSERT_PUBLIC_DOCS] Conflito único, tentando update', { tipo, documentoId })

        const porToken = token
          ? await supabaseAdmin.from('public_documents').update(dadosSalvar).eq('token', token)
          : { error: null }

        if (!porToken.error) return porToken

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

    const { error: erroSalvar } = await salvarPublicDocument()

    if (erroSalvar) {
      console.error('[SALVAR_PUBLIC_DOCS]', {
        code: erroSalvar.code,
        message: erroSalvar.message,
        details: erroSalvar.details,
        hint: erroSalvar.hint,
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
    return erroApi(error)
  }
}