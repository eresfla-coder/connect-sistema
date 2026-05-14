import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    const documentType = String(url.searchParams.get('document_type') || '').trim()
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

    if (tipoLegado === 'os') {
      return NextResponse.json(
        { success: false, error: 'Use document_type=ordem_servico e document_id.' },
        { status: 404 }
      )
    }

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

    const tipo = tipoLegado
    const documentoId = documentoIdLegado

    if (!tipo || !documentoId) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('public_documents')
      .select('*')
      .eq('tipo', tipo)
      .eq('documento_id', documentoId)
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
    const supabaseAdmin = getSupabaseAdmin()
    const body = await req.json()

    const documentTypeRaw = String(body?.document_type || body?.tipo || '').trim()
    const payloadRecebido = body?.payload || null

    const documentoId = String(
      body?.document_id ||
      body?.documentoId ||
      payloadRecebido?.id ||
      payloadRecebido?.i ||
      ''
    ).trim()

    const tipo =
      documentTypeRaw === 'os' || documentTypeRaw === 'ordem_servico'
        ? 'ordem_servico'
        : documentTypeRaw

    if (!tipo || !payloadRecebido || !documentoId || documentoId === 'NaN') {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos para publicar documento.' },
        { status: 400 }
      )
    }

    const tokenRecebido = String(body?.token || '').trim()

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
      const buscaPorDocumento = await supabaseAdmin
        .from('public_documents')
        .select('*')
        .eq('tipo', tipo)
        .eq('documento_id', documentoId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

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

    const payload = {
      ...(existente?.payload || {}),
      ...payloadRecebido,
      token,
      user_id: userId || null,
      owner_user_id: userId || null,
    }

    const dadosSalvar = {
      token,
      tipo,
      documento_id: documentoId,
      payload,
      updated_at: new Date().toISOString(),
      ...(userId ? { user_id: userId } : {}),
    }

    if (existente?.token) {
      const { error } = await supabaseAdmin
        .from('public_documents')
        .update(dadosSalvar)
        .eq('token', existente.token)

      if (error) {
        console.error('[UPDATE_PUBLIC_DOCS]', error)
        return erroApi(error)
      }
    } else {
      const { error } = await supabaseAdmin
        .from('public_documents')
        .insert(dadosSalvar)

      if (error) {
        console.error('[INSERT_PUBLIC_DOCS]', error)
        return erroApi(error)
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
    })
  } catch (error) {
    return erroApi(error)
  }
}