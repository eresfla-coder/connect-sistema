import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { urlLogoOgPublica, timestampVersaoPublica, resolverNomeEmpresaPublica } from '@/lib/empresaPublica'
import { configRowSupabaseToPublica, mergeConfigPublicacao } from '@/lib/documentosPublicos'
import {
  CFG_EMPRESA_COLS_PUBLICAS,
  PUBLIC_DOC_COLS_BRANDING,
  montarConfigPublicaBranding,
  respostaPublicaNegada,
  sanitizarRespostaConfigPublica,
  tokenPertenceAoDocumento,
  tokenPublicoValido,
  extrairCfgDoPayload,
} from '@/lib/public-docs-auth'

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

function negar() {
  const { status, body } = respostaPublicaNegada()
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    },
  })
}

/**
 * Branding público de documento.
 * Capability obrigatória: token de public_documents.
 * NÃO resolve por tipo+documentoId sozinhos.
 * NÃO devolve payload do documento.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = tokenPublicoValido(searchParams.get('token') || searchParams.get('p'))
    const tipo = searchParams.get('tipo') || ''
    const documentoId = searchParams.get('documentoId') || searchParams.get('id') || ''

    if (!token) {
      return negar()
    }

    const supabase = getSupabaseAdmin()
    const { data: doc, error: docError } = await supabase
      .from('public_documents')
      .select(PUBLIC_DOC_COLS_BRANDING)
      .eq('token', token)
      .maybeSingle()

    if (docError || !doc) {
      return negar()
    }

    if (
      !tokenPertenceAoDocumento(doc, {
        token,
        tipo: tipo || null,
        documentoId: documentoId || null,
      })
    ) {
      return negar()
    }

    const payload = (doc.payload || {}) as Record<string, unknown>
    const payloadCfg = extrairCfgDoPayload(payload)
    const ownerId = String(
      doc.user_id || payload.user_id || payload.owner_user_id || payloadCfg.user_id || ''
    ).trim()

    let configAtual: Record<string, unknown> = {}
    if (ownerId) {
      const { data: cfg } = await supabase
        .from('configuracoes_empresa')
        .select(CFG_EMPRESA_COLS_PUBLICAS)
        .eq('user_id', ownerId)
        .maybeSingle()

      if (cfg) configAtual = cfg as Record<string, unknown>
    }

    const telefoneAtual = normalizePhone(
      String(configAtual.celular_empresa || configAtual.whatsapp_empresa || configAtual.telefone || '')
    )
    const telefonePayload = normalizePhone(
      String(
        payloadCfg.celularEmpresa ||
          payloadCfg.whatsappEmpresa ||
          payloadCfg.celular ||
          payloadCfg.whatsapp ||
          payloadCfg.telefoneEmpresa ||
          payloadCfg.telefone ||
          ''
      )
    )
    const telefoneFinal = telefoneAtual || telefonePayload
    const versao = timestampVersaoPublica(doc.updated_at || Date.now())
    const tokenDoc = String(doc.token || token)

    const cfgMerged = mergeConfigPublicacao(
      configRowSupabaseToPublica(configAtual),
      payloadCfg,
      {
        empresa_nome: payload.empresa_nome,
        empresa_logo: payload.empresa_logo,
        empresa_telefone: payload.empresa_telefone,
        empresa_email: payload.empresa_email,
        empresa_endereco: payload.empresa_endereco,
      }
    )

    const nomeEmpresa =
      resolverNomeEmpresaPublica(payload, payloadCfg, configAtual) ||
      String(cfgMerged.nomeEmpresa || 'Connect Sistema')

    const empresaLogoOg = urlLogoOgPublica({ token: tokenDoc, v: versao })

    const config = sanitizarRespostaConfigPublica(
      montarConfigPublicaBranding({
        nomeEmpresa,
        cfgMerged: cfgMerged as unknown as Record<string, unknown>,
        configAtual,
        telefoneFinal,
        empresaLogoOg,
      }) as Record<string, unknown>
    )

    return NextResponse.json(
      {
        tipo: doc.tipo,
        documento_id: doc.documento_id,
        found: true,
        config_atualizada: Boolean(configAtual.id),
        config,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        },
      }
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
