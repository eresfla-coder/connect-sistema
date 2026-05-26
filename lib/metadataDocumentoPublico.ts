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

export type TipoMetadataPublico = 'orcamento' | 'ordem_servico'

function texto(valor: unknown, fallback = '') {
  const s = String(valor ?? '').trim()
  return s || fallback
}

function moeda(valor: unknown) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function buscarDocumentoPublico(
  tipo: TipoMetadataPublico,
  documentoId: string,
  token?: string | null
) {
  const supabase = getSupabaseAdmin()
  let doc: Record<string, unknown> | null = null

  if (token) {
    const { data } = await supabase
      .from('public_documents')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    doc = data as Record<string, unknown> | null
  }

  if (!doc && documentoId) {
    const query =
      tipo === 'ordem_servico'
        ? supabase
            .from('public_documents')
            .select('*')
            .in('tipo', ['ordem_servico', 'os'])
            .eq('documento_id', documentoId)
        : supabase.from('public_documents').select('*').eq('tipo', 'orcamento').eq('documento_id', documentoId)

    const { data } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle()
    doc = data as Record<string, unknown> | null
  }

  return doc
}

async function carregarConfiguracoesEmpresa(userId: string) {
  if (!userId) return null
  try {
    const supabase = getSupabaseAdmin()
    const { data: row } = await supabase
      .from('configuracoes_empresa')
      .select('*')
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
  const doc = await buscarDocumentoPublico(input.tipo, input.documentoId, input.token)
  const payload = (doc?.payload || {}) as Record<string, unknown>
  const ownerId = String(
    doc?.user_id || payload.user_id || payload.owner_user_id || ''
  ).trim()

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

  const tokenDoc = texto(doc?.token || input.token, '')
  const versao = timestampVersaoPublica(
    input.versaoUrl || String(doc?.updated_at || payload.updated_at || Date.now())
  )

  const site = siteUrlPublico()
  const ogImage = tokenDoc
    ? urlLogoOgPublica({ token: tokenDoc, userId: ownerId || undefined, v: versao })
    : ownerId
      ? urlLogoOgPublica({ userId: ownerId, v: versao })
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
    : `${montarUrlPublicaDocumento(input.pathPrefix, input.documentoId, { token: 'public', v: versao }).split('?')[0]}?v=${versao}`

  const metadata: Metadata = {
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

  return metadata
}

async function buscarContratoPublico(documentoId: string, token?: string | null) {
  const supabase = getSupabaseAdmin()
  if (token) {
    const { data } = await supabase
      .from('public_documents')
      .select('*')
      .eq('token', token)
      .eq('document_type', 'contrato')
      .maybeSingle()
    if (data) return data as Record<string, unknown>
    const legado = await supabase
      .from('public_documents')
      .select('*')
      .eq('token', token)
      .eq('tipo', 'contrato')
      .maybeSingle()
    return (legado.data as Record<string, unknown>) || null
  }
  if (!documentoId) return null
  const { data } = await supabase
    .from('public_documents')
    .select('*')
    .eq('document_type', 'contrato')
    .eq('document_id', documentoId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Record<string, unknown>) || null
}

/** Metadata OpenGraph para contrato público (visualizar / impressão). */
export async function buildMetadataContratoPublico(input: {
  documentoId: string
  token?: string | null
  pathPrefix: string
  versaoUrl?: string | null
}): Promise<Metadata> {
  const doc = await buscarContratoPublico(input.documentoId, input.token)
  const payload = (doc?.payload || {}) as Record<string, unknown>
  const contrato = (payload.contrato || {}) as Record<string, unknown>
  const ownerId = String(doc?.user_id || payload.user_id || '').trim()

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

  const tokenDoc = texto(doc?.token || input.token, '')
  const versao = timestampVersaoPublica(
    input.versaoUrl ?? (doc?.updated_at != null ? String(doc.updated_at) : null) ?? Date.now()
  )

  const site = siteUrlPublico()
  const ogImage = tokenDoc
    ? urlLogoOgPublica({ token: tokenDoc, userId: ownerId || undefined, v: versao })
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
  const url = tokenDoc
    ? `${site}${basePath}/${encodeURIComponent(input.documentoId)}?token=${encodeURIComponent(tokenDoc)}&v=${versao}`
    : `${site}${basePath}/${encodeURIComponent(input.documentoId)}?v=${versao}`

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
