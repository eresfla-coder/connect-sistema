/**
 * Formas de pagamento do painel — formato canônico e sync sem sobrescrever às cegas.
 * Chave: connect_formas_pagamento (localStorage + connect_storage por user_id).
 */
import { OPCOES_PAGAMENTO_ORCAMENTO } from './orcamento-pagamento.ts'

export const FORMAS_PAGAMENTO_KEY = 'connect_formas_pagamento'
export const FORMAS_PAGAMENTO_EVENTO = 'connect-formas-pagamento-change'

export type FormaPagamentoCadastro = {
  id: number
  nome: string
  ativo: boolean
  /** Tombstone de sync: permanece no storage para não ressuscitar após exclusão. */
  excluido?: boolean
  atualizadoEm?: number
}

export const FORMAS_PAGAMENTO_PADRAO: readonly string[] = [
  'PIX',
  'DINHEIRO',
  'CARTÃO CRÉDITO',
  'CARTÃO CRÉDITO PARCELADO',
  'CARTÃO DÉBITO',
]

export function nomeFormaChave(nome: string) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function agora() {
  return Date.now()
}

function idEstavelDeNome(nome: string) {
  const chave = nomeFormaChave(nome)
  let hash = 0
  for (let i = 0; i < chave.length; i += 1) {
    hash = (hash << 5) - hash + chave.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

export function normalizarFormaPagamento(item: unknown, index = 0): FormaPagamentoCadastro | null {
  if (typeof item === 'string') {
    const nome = item.trim()
    if (!nome) return null
    return { id: idEstavelDeNome(nome), nome, ativo: true, excluido: false, atualizadoEm: 0 }
  }
  if (!item || typeof item !== 'object') return null
  const obj = item as Record<string, unknown>
  const nome = String(obj.nome ?? obj.label ?? obj.name ?? '').trim()
  if (!nome) return null
  const idBruto = Number(obj.id)
  const id = Number.isFinite(idBruto) && idBruto > 0 ? idBruto : idEstavelDeNome(nome)
  const excluido = obj.excluido === true || obj.deleted === true || obj.removido === true
  const ativo = excluido ? false : obj.ativo === false || obj.active === false ? false : true
  const atualizadoBruto = Number(obj.atualizadoEm ?? obj.updated_at ?? obj.updatedAt ?? 0)
  const atualizadoEm = Number.isFinite(atualizadoBruto) && atualizadoBruto > 0 ? atualizadoBruto : 0
  return { id, nome, ativo, excluido, atualizadoEm }
}

/** Last-write-wins por nome. Em empate de timestamp, a entrada aplicada por último vence (inclui ativo/excluido). */
export function escolherFormaMaisRecente(atual: FormaPagamentoCadastro, candidata: FormaPagamentoCadastro): FormaPagamentoCadastro {
  const tAtual = atual.atualizadoEm || 0
  const tNova = candidata.atualizadoEm || 0
  if (tNova > tAtual) return { ...candidata, id: atual.id || candidata.id }
  if (tNova < tAtual) return atual
  // Empate: candidata (lado aplicado por último) vence por completo — permite reativar e excluir.
  return { ...candidata, id: atual.id || candidata.id, atualizadoEm: tNova }
}

export function normalizarListaFormasPagamento(lista: unknown): FormaPagamentoCadastro[] {
  if (!Array.isArray(lista)) return []
  const porNome = new Map<string, FormaPagamentoCadastro>()
  lista.forEach((item, index) => {
    const forma = normalizarFormaPagamento(item, index)
    if (!forma) return
    const chave = nomeFormaChave(forma.nome)
    const atual = porNome.get(chave)
    porNome.set(chave, atual ? escolherFormaMaisRecente(atual, forma) : forma)
  })
  return Array.from(porNome.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Une local e nuvem por nome (case-insensitive).
 * Last-write-wins em ativo/excluido/nome. Tombstones (excluido) impedem ressuscitar após exclusão.
 */
export function mesclarFormasPagamento(local: unknown, nuvem: unknown): FormaPagamentoCadastro[] {
  const mapa = new Map<string, FormaPagamentoCadastro>()
  const aplicar = (lista: FormaPagamentoCadastro[]) => {
    for (const forma of lista) {
      const chave = nomeFormaChave(forma.nome)
      const atual = mapa.get(chave)
      mapa.set(chave, atual ? escolherFormaMaisRecente(atual, forma) : forma)
    }
  }
  // Nuvem primeiro; local por último → em empate o local vence (ação do aparelho atual).
  aplicar(normalizarListaFormasPagamento(nuvem))
  aplicar(normalizarListaFormasPagamento(local))
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function formasVisiveis(lista: FormaPagamentoCadastro[]): FormaPagamentoCadastro[] {
  return lista.filter((f) => f.excluido !== true)
}

export function nomesFormasAtivas(lista: FormaPagamentoCadastro[]): string[] {
  return formasVisiveis(lista).filter((f) => f.ativo !== false).map((f) => f.nome)
}

/** Marca exclusão como tombstone (não remove do array de sync). */
export function marcarFormaExcluida(lista: FormaPagamentoCadastro[], idOuNome: number | string): FormaPagamentoCadastro[] {
  const agoraTs = agora()
  const alvoNome = typeof idOuNome === 'string' ? nomeFormaChave(idOuNome) : null
  return lista.map((item) => {
    const bate = typeof idOuNome === 'number' ? item.id === idOuNome : nomeFormaChave(item.nome) === alvoNome
    if (!bate) return item
    return { ...item, excluido: true, ativo: false, atualizadoEm: agoraTs }
  })
}

/** Alterna ativo sem tocar nos demais timestamps (evita corrida que apaga edições remotas). */
export function alternarFormaAtiva(lista: FormaPagamentoCadastro[], id: number): FormaPagamentoCadastro[] {
  const agoraTs = agora()
  return lista.map((item) =>
    item.id === id && item.excluido !== true
      ? { ...item, ativo: !item.ativo, atualizadoEm: agoraTs }
      : item,
  )
}

export function upsertFormaPagamento(
  lista: FormaPagamentoCadastro[],
  entrada: { id?: number; nome: string; ativo?: boolean },
): FormaPagamentoCadastro[] {
  const agoraTs = agora()
  const nome = entrada.nome.trim()
  if (!nome) return lista
  const chave = nomeFormaChave(nome)
  const existente = lista.find((f) => (entrada.id != null ? f.id === entrada.id : nomeFormaChave(f.nome) === chave))
  if (existente) {
    return lista.map((f) =>
      f.id === existente.id
        ? {
            ...f,
            nome,
            ativo: entrada.ativo !== undefined ? entrada.ativo : f.excluido ? false : f.ativo,
            excluido: false,
            atualizadoEm: agoraTs,
          }
        : f,
    )
  }
  return [{ id: entrada.id || agoraTs, nome, ativo: entrada.ativo !== false, excluido: false, atualizadoEm: agoraTs }, ...lista]
}

export function lerFormasPagamentoLocal(): FormaPagamentoCadastro[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FORMAS_PAGAMENTO_KEY)
    if (!raw) return []
    return normalizarListaFormasPagamento(JSON.parse(raw))
  } catch {
    return []
  }
}

export function gravarFormasPagamentoLocal(lista: FormaPagamentoCadastro[], opts?: { emitirEvento?: boolean }) {
  if (typeof window === 'undefined') return
  const normalizada = normalizarListaFormasPagamento(lista)
  window.localStorage.setItem(FORMAS_PAGAMENTO_KEY, JSON.stringify(normalizada))
  if (opts?.emitirEvento !== false) {
    try {
      window.dispatchEvent(new Event(FORMAS_PAGAMENTO_EVENTO))
      window.dispatchEvent(new Event('connect-data-change'))
    } catch {}
  }
  return normalizada
}

export function garantirFormasPagamentoLocais(): FormaPagamentoCadastro[] {
  const existentes = lerFormasPagamentoLocal()
  if (existentes.length > 0) return existentes
  const iniciais = FORMAS_PAGAMENTO_PADRAO.map((nome, index) => ({
    id: idEstavelDeNome(nome) + index,
    nome,
    ativo: true,
    atualizadoEm: 0,
  }))
  gravarFormasPagamentoLocal(iniciais, { emitirEvento: false })
  return iniciais
}

export type OpcaoPagamentoOrcamento = { id: string; label: string; icon: string }

/** Opções do formulário: ativas cadastradas + selecionadas (mesmo inativas/removidas) + fallback fixo. */
export function opcoesFormasPagamentoOrcamento(
  cadastradas: FormaPagamentoCadastro[],
  selecionadas: string[] = [],
): OpcaoPagamentoOrcamento[] {
  const resultado: OpcaoPagamentoOrcamento[] = []
  const vistos = new Set<string>()

  const adicionar = (label: string, icon = '💳', id?: string) => {
    const nome = String(label || '').trim()
    if (!nome) return
    const chave = nomeFormaChave(nome)
    if (vistos.has(chave)) return
    vistos.add(chave)
    resultado.push({ id: id || `forma-${chave}`, label: nome, icon })
  }

  const ativas = formasVisiveis(cadastradas).filter((f) => f.ativo !== false)
  if (ativas.length > 0) {
    for (const forma of ativas) {
      adicionar(forma.nome, iconePorNome(forma.nome), `cad-${forma.id}`)
    }
  } else {
    for (const opcao of OPCOES_PAGAMENTO_ORCAMENTO) {
      adicionar(opcao.label, opcao.icon, opcao.id)
    }
  }

  for (const sel of selecionadas) {
    adicionar(sel, iconePorNome(sel))
  }

  return resultado
}

function iconePorNome(nome: string) {
  const valor = nomeFormaChave(nome)
  if (valor.includes('pix')) return '📲'
  if (valor.includes('boleto')) return '🧾'
  if (valor.includes('parcel')) return '📅'
  if (valor.includes('dinheiro')) return '💵'
  if (valor.includes('personal')) return '✏️'
  if (valor.includes('credito') || valor.includes('debito') || valor.includes('cartao')) return '💳'
  return '💳'
}

export async function obterTokenFormasPagamento(): Promise<string> {
  try {
    const { supabase } = await import('@/lib/supabase-browser')
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  } catch {
    return ''
  }
}

export type ResultadoSyncFormas = {
  ok: boolean
  lista: FormaPagamentoCadastro[]
  origem: 'local' | 'mesclado' | 'nuvem'
  mensagem?: string
}

/** Carrega nuvem, mescla com local e grava local. Não envia PUT. */
export async function sincronizarFormasPagamentoDaNuvem(token?: string): Promise<ResultadoSyncFormas> {
  const local = lerFormasPagamentoLocal()
  const bearer = token || (await obterTokenFormasPagamento())
  if (!bearer) {
    return { ok: false, lista: local.length ? local : garantirFormasPagamentoLocais(), origem: 'local', mensagem: 'Sessão ausente.' }
  }

  try {
    const resposta = await fetch('/api/connect-storage', {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${bearer}` },
    })
    if (!resposta.ok) {
      return { ok: false, lista: local.length ? local : garantirFormasPagamentoLocais(), origem: 'local', mensagem: 'Falha ao ler nuvem.' }
    }
    const json = await resposta.json().catch(() => null)
    const nuvem = json?.ok ? json?.data?.[FORMAS_PAGAMENTO_KEY] : undefined
    if (nuvem === undefined || nuvem === null) {
      return { ok: true, lista: local.length ? local : garantirFormasPagamentoLocais(), origem: 'local' }
    }
    const mesclada = mesclarFormasPagamento(local, nuvem)
    gravarFormasPagamentoLocal(mesclada)
    return { ok: true, lista: mesclada, origem: 'mesclado' }
  } catch {
    return { ok: false, lista: local.length ? local : garantirFormasPagamentoLocais(), origem: 'local', mensagem: 'Erro de rede.' }
  }
}

/**
 * Persiste lista local e tenta sync: GET → merge → PUT.
 * Se a nuvem estiver inacessível, mantém só o local (sem apagar remoto).
 */
export async function salvarFormasPagamentoComSync(
  lista: FormaPagamentoCadastro[],
  opts?: { token?: string },
): Promise<ResultadoSyncFormas> {
  // Não rebater timestamp de itens inalterados: só normaliza. Quem mudou já veio com atualizadoEm.
  const comTimestamp = normalizarListaFormasPagamento(lista)
  gravarFormasPagamentoLocal(comTimestamp)

  const bearer = opts?.token || (await obterTokenFormasPagamento())
  if (!bearer) {
    return { ok: true, lista: comTimestamp, origem: 'local', mensagem: 'Salvo neste aparelho. Sem sessão para sincronizar.' }
  }

  try {
    const leitura = await fetch('/api/connect-storage', {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${bearer}` },
    })
    if (!leitura.ok) {
      return { ok: true, lista: comTimestamp, origem: 'local', mensagem: 'Salvo neste aparelho. Nuvem indisponível.' }
    }
    const json = await leitura.json().catch(() => null)
    const nuvem = json?.ok ? json?.data?.[FORMAS_PAGAMENTO_KEY] : undefined
    const mesclada = mesclarFormasPagamento(comTimestamp, nuvem)
    gravarFormasPagamentoLocal(mesclada)

    const gravacao = await fetch('/api/connect-storage', {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { [FORMAS_PAGAMENTO_KEY]: mesclada } }),
    })
    if (!gravacao.ok) {
      return { ok: true, lista: mesclada, origem: 'mesclado', mensagem: 'Salvo neste aparelho. Falha ao enviar à nuvem.' }
    }
    return { ok: true, lista: mesclada, origem: 'mesclado' }
  } catch {
    return { ok: true, lista: comTimestamp, origem: 'local', mensagem: 'Salvo neste aparelho. Erro de rede na sincronização.' }
  }
}
