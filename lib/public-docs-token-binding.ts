/**
 * Vínculo token ↔ publicação ↔ documento em /api/public-docs.
 * A publicação resolvida é a fonte canônica de tipo, id e owner — nunca o body.
 */

export type PublicacaoVinculo = {
  id?: unknown
  token?: unknown
  document_type?: unknown
  document_id?: unknown
  tipo?: unknown
  documento_id?: unknown
  user_id?: unknown
}

function texto(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

export function normalizarTipoDocumentoPublico(raw: unknown): string {
  const t = texto(raw).toLowerCase()
  if (t === 'os' || t === 'ordem_servico') return 'ordem_servico'
  return t
}

/**
 * document_id igual ao id da própria linha é artefato do backfill legado das colunas novas:
 * não identifica documento. Só esse padrão exato é tratado como ausente.
 */
function documentIdEhArtefatoLegado(pub: PublicacaoVinculo): boolean {
  const idLinha = texto(pub.id)
  return Boolean(idLinha) && texto(pub.document_id) === idLinha
}

/**
 * Tipo e id canônicos da publicação (colunas novas e legadas).
 * null se ausentes ou se as colunas novas e legadas divergirem entre si.
 */
export function documentoCanonicoDaPublicacao(
  pub: PublicacaoVinculo | null | undefined,
): { tipo: string; documentoId: string } | null {
  if (!pub) return null
  const tipos = [pub.document_type, pub.tipo].map(normalizarTipoDocumentoPublico).filter(Boolean)
  const ids = [documentIdEhArtefatoLegado(pub) ? '' : pub.document_id, pub.documento_id]
    .map(texto)
    .filter(Boolean)
  if (!tipos.length || !ids.length) return null
  if (tipos.some((t) => t !== tipos[0]) || ids.some((i) => i !== ids[0])) return null
  return { tipo: tipos[0], documentoId: ids[0] }
}

/** Token + tipo + id devem pertencer à MESMA publicação. */
export function publicacaoCorrespondeAoPedido(
  pub: PublicacaoVinculo | null | undefined,
  pedido: { token: unknown; tipo: unknown; documentoId: unknown },
): boolean {
  const token = texto(pedido.token)
  if (!pub || !token || texto(pub.token) !== token) return false
  const canonico = documentoCanonicoDaPublicacao(pub)
  if (!canonico) return false
  return (
    canonico.tipo === normalizarTipoDocumentoPublico(pedido.tipo) &&
    canonico.documentoId === texto(pedido.documentoId)
  )
}

export type AlvoPublicacaoPost =
  | {
      ok: true
      tipo: string
      documentoId: string
      userId: string
      podeAtualizarStatusContrato: boolean
    }
  | { ok: false; status: 401 | 403 | 503; error: string }

/**
 * Resolve o alvo canônico do POST antes de qualquer escrita.
 * - Busca da publicação existente inconclusiva (timeout): falha fechado.
 * - Com publicação existente: tipo/id/owner vêm dela; body divergente é recusado.
 * - Sem Bearer: owner = owner da publicação (body.user_id / payload.user_id ignorados).
 * - Com Bearer: só o owner registrado muta; publicação existente sem owner não é apropriada.
 * - Sem publicação existente: só o emitente autenticado cria, owner = Bearer.
 */
export function resolverAlvoPublicacaoPost(input: {
  existente: PublicacaoVinculo | null | undefined
  tipoPedido: unknown
  documentoIdPedido: unknown
  userIdBearer: unknown
  tokenConfere: boolean
  buscaConclusiva: boolean
}): AlvoPublicacaoPost {
  const userIdBearer = texto(input.userIdBearer)
  const tipoPedido = normalizarTipoDocumentoPublico(input.tipoPedido)
  const documentoIdPedido = texto(input.documentoIdPedido)

  if (input.buscaConclusiva !== true) {
    return {
      ok: false,
      status: 503,
      error: 'Não foi possível confirmar a publicação existente. Tente novamente em instantes.',
    }
  }

  if (!userIdBearer && (!input.existente || !input.tokenConfere)) {
    return { ok: false, status: 401, error: 'Não autorizado.' }
  }

  if (!input.existente) {
    return {
      ok: true,
      tipo: tipoPedido,
      documentoId: documentoIdPedido,
      userId: userIdBearer,
      podeAtualizarStatusContrato: false,
    }
  }

  const canonico = documentoCanonicoDaPublicacao(input.existente)
  if (!canonico || canonico.tipo !== tipoPedido || canonico.documentoId !== documentoIdPedido) {
    return { ok: false, status: 403, error: 'Token não corresponde ao documento informado.' }
  }

  const owner = texto(input.existente.user_id)
  if (userIdBearer && !owner) {
    return {
      ok: false,
      status: 403,
      error: 'Publicação legada sem proprietário registrado; não é possível alterá-la automaticamente.',
    }
  }
  if (userIdBearer && owner !== userIdBearer) {
    return { ok: false, status: 403, error: 'Documento pertence a outro usuário.' }
  }

  return {
    ok: true,
    tipo: canonico.tipo,
    documentoId: canonico.documentoId,
    userId: owner,
    podeAtualizarStatusContrato: canonico.tipo === 'contrato',
  }
}

export const ERRO_OWNERSHIP_PUBLICACAO = 'PUBLIC_DOCS_OWNERSHIP'

export type FiltroPublicacao =
  | { coluna: string; op: 'eq'; valor: string }
  | { coluna: string; op: 'in'; valor: string[] }
  | { coluna: string; op: 'is_null' }

type ErroDb = { code?: string; message?: string } | null

export type ExecutorPublicacao = {
  inserir: (linha: Record<string, unknown>) => Promise<{ error: ErroDb }>
  atualizar: (
    linha: Record<string, unknown>,
    filtros: FiltroPublicacao[],
  ) => Promise<{ error: ErroDb; linhasAfetadas: number }>
}

/**
 * UPDATEs permitidos após conflito 23505: sempre restritos ao owner autenticado
 * e ao documento canônico. Token sozinho nunca é alvo. Sem owner: nenhum alvo.
 */
export function alvosUpdateAposConflito(input: {
  owner: unknown
  tipo: unknown
  documentoId: unknown
}): FiltroPublicacao[][] {
  const owner = texto(input.owner)
  const tipo = normalizarTipoDocumentoPublico(input.tipo)
  const documentoId = texto(input.documentoId)
  if (!owner || !tipo || !documentoId) return []

  const porOwner: FiltroPublicacao = { coluna: 'user_id', op: 'eq', valor: owner }
  const legado: FiltroPublicacao =
    tipo === 'ordem_servico'
      ? { coluna: 'tipo', op: 'in', valor: ['ordem_servico', 'os'] }
      : { coluna: 'tipo', op: 'eq', valor: tipo }

  return [
    [
      { coluna: 'document_type', op: 'eq', valor: tipo },
      { coluna: 'document_id', op: 'eq', valor: documentoId },
      porOwner,
    ],
    [legado, { coluna: 'documento_id', op: 'eq', valor: documentoId }, porOwner],
  ]
}

/**
 * Grava a publicação sem permitir mutation cross-tenant nem apropriação de linha sem owner.
 * - Existente com owner: UPDATE por token + owner registrado; linha não pode trocar de owner.
 * - Existente sem owner (só fluxo público por token): UPDATE por token + user_id nulo; linha não ganha owner.
 * - Nova: INSERT; em 23505, só UPDATE restrito ao owner autenticado + documento canônico.
 * UPDATE que não afeta nenhuma linha = ownership não comprovado → erro.
 */
export async function salvarPublicacaoComOwnership(input: {
  existente: PublicacaoVinculo | null | undefined
  linha: Record<string, unknown>
  ownerAutenticado: unknown
  tipo: unknown
  documentoId: unknown
  executor: ExecutorPublicacao
}): Promise<{ error: ErroDb }> {
  const erroOwnership = {
    code: ERRO_OWNERSHIP_PUBLICACAO,
    message: 'Não foi possível confirmar a propriedade da publicação.',
  }
  const ownerLinha = texto(input.linha.user_id)

  if (input.existente) {
    const token = texto(input.existente.token)
    const ownerRegistrado = texto(input.existente.user_id)
    if (!token || ownerLinha !== ownerRegistrado) return { error: erroOwnership }

    const filtros: FiltroPublicacao[] = [
      { coluna: 'token', op: 'eq', valor: token },
      ownerRegistrado
        ? { coluna: 'user_id', op: 'eq', valor: ownerRegistrado }
        : { coluna: 'user_id', op: 'is_null' },
    ]
    const r = await input.executor.atualizar(input.linha, filtros)
    if (r.error) return { error: r.error }
    return r.linhasAfetadas > 0 ? { error: null } : { error: erroOwnership }
  }

  const owner = texto(input.ownerAutenticado)
  if (!owner || ownerLinha !== owner) return { error: erroOwnership }

  const insercao = await input.executor.inserir(input.linha)
  if (!insercao.error) return { error: null }
  if (insercao.error.code !== '23505') return { error: insercao.error }

  for (const filtros of alvosUpdateAposConflito({ owner, tipo: input.tipo, documentoId: input.documentoId })) {
    const r = await input.executor.atualizar(input.linha, filtros)
    if (!r.error && r.linhasAfetadas > 0) return { error: null }
  }
  return { error: erroOwnership }
}
