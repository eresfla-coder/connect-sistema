import type { Metadata } from 'next'
import {
  CONNECT_OG_FALLBACK_NAME,
  mergeConfigDocumentoPublico,
  montarUrlPublicaDocumento,
  resolverNomeEmpresaPublica,
  siteUrlPublico,
  timestampVersaoPublica,
  urlLogoOgPublica,
} from '@/lib/empresaPublica'
import { configRowSupabaseToPublica } from '@/lib/documentosPublicos'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  CFG_EMPRESA_COLS_PUBLICAS,
  PUBLIC_DOC_COLS_METADATA,
  tokenPublicoValido,
} from '@/lib/public-docs-auth'

export type TipoMetadataPublico = 'orcamento' | 'ordem_servico'

function texto(valor: unknown, fallback = '') {
  const s = String(valor ?? '').trim()
  return s || fallback
}

function moeda(valor: unknown) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function metadataGenerica(input: {
  tipo: TipoMetadataPublico
  documentoId: string
  pathPrefix: string
  versaoUrl?: string | null
}): Metadata {
  const site = siteUrlPublico()
  const versao = timestampVersaoPublica(input.versaoUrl || Date.now())
  const rotulo = input.tipo === 'ordem_servico' ? 'Ordem de serviço' : 'Orçamento'
  const titulo = `${rotulo} — ${CONNECT_OG_FALLBACK_NAME}`
  const description = `${rotulo} compartilhado via Connect Sistema`
  const url = `${site}${input.pathPrefix}/${encodeURIComponent(input.documentoId)}?v=${versao}`
  const ogImage = `${site}/logo-connect.png?v=${versao}`

  return {
    title: { absolute: titulo },
    description,
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      url,
      siteName: CONNECT_OG_FALLBACK_NAME,
      title: titulo,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: CONNECT_OG_FALLBACK_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: description.slice(0, 200),
      images: [ogImage],
    },
  }
}

/**
 * Resolve documento público somente por token (capability).
 * NÃO busca por documentoId sozinho — evita vazamento OG sem link completo.
 */
async function buscarDocumentoPublicoPorToken(
  tipo: TipoMetadataPublico,
  token: string
) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('public_documents')
    .select(PUBLIC_DOC_COLS_METADATA)
    .eq('token', token)
    .maybeSingle()

  if (!data) return null

  const tipoDoc = String(data.tipo || '').toLowerCase()
  if (tipo === 'ordem_servico') {
    if (tipoDoc !== 'ordem_servico' && tipoDoc !== 'os') return null
  } else if (tipoDoc !== 'orcamento') {
    return null
  }

  return data as Record<string, unknown>
}

async function carregarConfiguracoesEmpresa(userId: string) {
  if (!userId) return null
  try {
    const supabase = getSupabaseAdmin()
    const { data: row } = await supabase
      .from('configuracoes_empresa')
      .select(CFG_EMPRESA_COLS_PUBLICAS)
      .eq('user_id', userId)
      .maybeSingle()
    return row as Record<string, unknown> | null
  } catch {
    return null
  }
}

export async function buildMetadataDocumentoPublico(input: {
  tipo: TipoMetadataPublico
  documentoId: string
  token?: string | null
  pathPrefix: string
  versaoUrl?: string | null
}): Promise<Metadata> {
  const token = tokenPublicoValido(input.token)
  if (!token) {
    return metadataGenerica(input)
  }

  const doc = await buscarDocumentoPublicoPorToken(input.tipo, token)
  if (!doc) {
    return metadataGenerica(input)
  }

  // Token de outro documento → metadados genéricos (sem enumeração)
  const docId = String(doc.documento_id ?? '').trim()
  if (docId && input.documentoId && docId !== String(input.documentoId)) {
    return metadataGenerica(input)
  }

  const payload = (doc.payload || {}) as Record<string, unknown>
  const ownerId = String(doc.user_id || payload.user_id || payload.owner_user_id || '').trim()

  const rowCfg = ownerId ? await carregarConfiguracoesEmpresa(ownerId) : null
  let cfg = mergeConfigDocumentoPublico(doc, payload)
  if (rowCfg) {
    cfg = mergeConfigDocumentoPublico(doc, {
      ...payload,
      ...configRowSupabaseToPublica(rowCfg),
    })
  }

  const empresaNome =
    resolverNomeEmpresaPublica(payload, cfg as unknown as Record<string, unknown>, rowCfg || undefined) ||
    texto(cfg.nomeEmpresa) ||
    CONNECT_OG_FALLBACK_NAME

  const tokenDoc = texto(doc.token || token, '')
  const versao = timestampVersaoPublica(
    input.versaoUrl || String(doc.updated_at || payload.updated_at || Date.now())
  )

  const site = siteUrlPublico()
  const ogImage = tokenDoc
    ? urlLogoOgPublica({ token: tokenDoc, v: versao })
    : `${site}/logo-connect.png?v=${versao}`

  const ehProposta =
    input.tipo === 'orcamento' &&
    String(payload.tipoDocumento || '').toLowerCase() === 'proposta_comercial'

  const rotulo =
    input.tipo === 'ordem_servico' ? 'Ordem de serviço' : ehProposta ? 'Proposta comercial' : 'Orçamento'

  const numero = texto(payload.numero || payload.n, `#${input.documentoId}`)
  const cliente =
    input.tipo === 'ordem_servico'
      ? texto(payload.cliente, '')
      : texto((payload.cliente as { nome?: string })?.nome || payload.cliente, '')

  const equipamento = input.tipo === 'ordem_servico' ? texto(payload.equipamento, '') : ''
  const valor =
    input.tipo === 'ordem_servico'
      ? moeda(payload.valor)
      : moeda(payload.total ?? payload.tt)

  const titulo = `${rotulo} ${numero} — ${cliente || empresaNome}`

  const descPartes: string[] = []
  descPartes.push(`${rotulo} ${numero} · ${empresaNome}`)
  if (cliente) descPartes.push(`Cliente: ${cliente}`)
  if (equipamento) descPartes.push(`Equipamento: ${equipamento}`)
  if (valor && valor !== 'R$ 0,00') descPartes.push(`Valor: ${valor}`)
  const tel = texto(payload.empresa_telefone || cfg.telefone)
  if (tel) descPartes.push(`Tel: ${tel}`)

  const description = descPartes.join(' · ').slice(0, 300)

  const url = tokenDoc
    ? montarUrlPublicaDocumento(input.pathPrefix, input.documentoId, {
        token: tokenDoc,
        preview: input.pathPrefix.includes('impressao'),
        v: versao,
      })
    : `${site}${input.pathPrefix}/${encodeURIComponent(input.documentoId)}?v=${versao}`

  return {
    title: { absolute: titulo },
    description,
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      url,
      siteName: empresaNome,
      title: titulo,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `Logo ${empresaNome}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: description.slice(0, 200),
      images: [ogImage],
    },
  }
}

async function buscarContratoPublicoPorToken(token: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('public_documents')
    .select(PUBLIC_DOC_COLS_METADATA)
    .eq('token', token)
    .maybeSingle()

  if (!data) return null

  const tipo = String(data.tipo || data.document_type || '').toLowerCase()
  if (tipo !== 'contrato') return null
  return data as Record<string, unknown>
}

/** Metadata OpenGraph para contrato público (visualizar / impressão). */
export async function buildMetadataContratoPublico(input: {
  documentoId: string
  token?: string | null
  pathPrefix: string
  versaoUrl?: string | null
}): Promise<Metadata> {
  const token = tokenPublicoValido(input.token)
  const site = siteUrlPublico()
  const versaoFallback = timestampVersaoPublica(input.versaoUrl || Date.now())

  if (!token) {
    const titulo = `Contrato — ${CONNECT_OG_FALLBACK_NAME}`
    const description = 'Contrato compartilhado via Connect Sistema'
    const ogImage = `${site}/logo-connect.png?v=${versaoFallback}`
    return {
      title: { absolute: titulo },
      description,
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        url: `${site}${input.pathPrefix}/${encodeURIComponent(input.documentoId)}?v=${versaoFallback}`,
        siteName: CONNECT_OG_FALLBACK_NAME,
        title: titulo,
        description,
        images: [{ url: ogImage, width: 1200, height: 630, alt: CONNECT_OG_FALLBACK_NAME }],
      },
      twitter: {
        card: 'summary_large_image',
        title: titulo,
        description,
        images: [ogImage],
      },
    }
  }

  const doc = await buscarContratoPublicoPorToken(token)
  if (!doc) {
    return buildMetadataContratoPublico({ ...input, token: null })
  }

  const docId = String(doc.documento_id ?? doc.document_id ?? '').trim()
  if (docId && input.documentoId && docId !== String(input.documentoId)) {
    return buildMetadataContratoPublico({ ...input, token: null })
  }

  const payload = (doc.payload || {}) as Record<string, unknown>
  const contrato = (payload.contrato || {}) as Record<string, unknown>
  const ownerId = String(doc.user_id || payload.user_id || '').trim()

  const rowCfg = ownerId ? await carregarConfiguracoesEmpresa(ownerId) : null
  let cfg = mergeConfigDocumentoPublico(doc, payload)
  if (rowCfg) {
    cfg = mergeConfigDocumentoPublico(doc, {
      ...payload,
      ...configRowSupabaseToPublica(rowCfg),
    })
  }

  const empresaNome =
    resolverNomeEmpresaPublica(payload, payload.empresaPublica as Record<string, unknown>, cfg as unknown as Record<string, unknown>) ||
    texto((payload.empresaPublica as Record<string, unknown>)?.nome) ||
    CONNECT_OG_FALLBACK_NAME

  const tokenDoc = texto(doc.token || token, '')
  const versao = timestampVersaoPublica(
    input.versaoUrl ?? (doc.updated_at != null ? String(doc.updated_at) : null) ?? Date.now()
  )

  const ogImage = tokenDoc
    ? urlLogoOgPublica({ token: tokenDoc, v: versao })
    : `${site}/logo-connect.png?v=${versao}`

  const numero = texto(contrato.numero, `#${input.documentoId}`)
  const cliente = texto((contrato.cliente as { nome?: string })?.nome || contrato.cliente, '')
  const servico = texto(contrato.descricaoServico, '').slice(0, 80)
  const valor = moeda(contrato.valorTotal)

  const titulo = `Contrato ${numero} — ${cliente || empresaNome}`

  const descPartes = [`Contrato de prestação de serviço ${numero} · ${empresaNome}`]
  if (cliente) descPartes.push(`Cliente: ${cliente}`)
  if (servico) descPartes.push(servico)
  if (valor !== 'R$ 0,00') descPartes.push(`Valor: ${valor}`)

  const description = descPartes.join(' · ').slice(0, 300)
  const basePath = input.pathPrefix.replace(/\/$/, '')
  const url = `${site}${basePath}/${encodeURIComponent(input.documentoId)}?token=${encodeURIComponent(tokenDoc)}&v=${versao}`

  return {
    title: { absolute: titulo },
    description,
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      url,
      siteName: empresaNome,
      title: titulo,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `Logo ${empresaNome}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: description.slice(0, 200),
      images: [ogImage],
    },
  }
}
