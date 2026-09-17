import { NextRequest, NextResponse } from 'next/server'
import { siteUrlPublico } from '@/lib/empresaPublica'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { tokenPublicoValido } from '@/lib/public-docs-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK = '/logo-connect.png'

function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  try {
    const buffer = Buffer.from(match[2], 'base64')
    return { contentType: match[1], buffer }
  } catch {
    return null
  }
}

/**
 * Logo OG via capability (token de public_documents).
 * userId sozinho NÃO autoriza — evita enumeração.
 * Uma consulta ao documento; fallback de configuracoes_empresa só se o token for válido.
 */
async function carregarLogoPorToken(token: string) {
  const supabase = getSupabaseAdmin()
  const { data: doc } = await supabase
    .from('public_documents')
    .select('user_id,payload,updated_at')
    .eq('token', token)
    .maybeSingle()

  if (!doc) return { logo: '', updatedAt: null as string | null }

  const payload = (doc.payload || {}) as Record<string, unknown>
  const userId = String(doc.user_id || payload.user_id || payload.owner_user_id || '').trim()

  let logo = String(
    payload.empresa_logo ||
      payload.empresa_logo_og ||
      (payload.config as Record<string, unknown>)?.logoUrl ||
      (payload.cfg as Record<string, unknown>)?.logoUrl ||
      ''
  ).trim()

  if ((!logo || logo === FALLBACK) && userId) {
    const { data: cfg } = await supabase
      .from('configuracoes_empresa')
      .select('logo_url,updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (cfg?.logo_url) logo = String(cfg.logo_url)
  }

  return { logo, updatedAt: doc.updated_at || null }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = tokenPublicoValido(searchParams.get('token') || searchParams.get('p') || '')
    const v = searchParams.get('v') || String(Date.now())
    const base = siteUrlPublico()

    // Sem token válido → logo padrão (sem enumerar userId)
    if (!token) {
      return NextResponse.redirect(`${base}${FALLBACK}?v=${encodeURIComponent(v)}`, 302)
    }

    const dados = await carregarLogoPorToken(token)
    const logo = dados.logo

    if (!logo || logo === FALLBACK) {
      return NextResponse.redirect(`${base}${FALLBACK}?v=${encodeURIComponent(v)}`, 302)
    }

    if (logo.startsWith('data:image')) {
      const parsed = parseDataUrl(logo)
      if (parsed) {
        return new NextResponse(parsed.buffer, {
          status: 200,
          headers: {
            'Content-Type': parsed.contentType,
            'Cache-Control': 'public, max-age=300, s-maxage=300',
          },
        })
      }
    }

    if (logo.startsWith('http://') || logo.startsWith('https://')) {
      const sep = logo.includes('?') ? '&' : '?'
      return NextResponse.redirect(`${logo}${sep}v=${encodeURIComponent(v)}`, 302)
    }

    const relativa = logo.startsWith('/') ? logo : `/${logo}`
    return NextResponse.redirect(`${base}${relativa}?v=${encodeURIComponent(v)}`, 302)
  } catch (e) {
    console.error('[OG_EMPRESA_LOGO]', e)
    const base = siteUrlPublico()
    return NextResponse.redirect(`${base}${FALLBACK}`, 302)
  }
}
