/**
 * ADMIN.3.11 — matriz do menu Ações da carteira (UX only).
 * Não altera regras comerciais backend.
 *
 * TODO(multissistema): UI futura deve permitir selecionar o vínculo
 * antes de ações por sistema e "Remover apenas este sistema".
 * Hoje o card opera sobre vinculoPrincipal.
 */

import {
  labelAcaoMarcarPago,
  pagamentoJaConfirmado,
  podeAcionarMarcarPago,
} from './admin-ciclo-comercial.ts'

export type OrigemMenuCarteira = 'connect' | 'terceiro'

export type AcaoMenuCarteiraId =
  | 'editar'
  | 'reset_senha'
  | 'marcar_pago'
  | 'renovar'
  | 'bloquear'
  | 'desbloquear'
  | 'oferta_upgrade'
  | 'backups'
  | 'excluir'

export type ItemMenuCarteira = {
  id: AcaoMenuCarteiraId
  label: string
  disabled: boolean
  title?: string
  variant?: 'default' | 'danger' | 'delete'
}

export const LABEL_EXCLUIR_CLIENTE_CARTEIRA = 'Excluir cliente da carteira'

export const TEXTO_CONFIRMACAO_EXCLUIR_CARTEIRA =
  'Esta ação removerá o cliente da carteira comercial e todos os sistemas vinculados a ele. Esta ação não exclui automaticamente o usuário/login do Connect.'

export function normalizarOrigemMenu(origem?: string | null): OrigemMenuCarteira {
  return String(origem || '').toLowerCase() === 'connect' ? 'connect' : 'terceiro'
}

export function normalizarStatusVinculoMenu(status?: string | null): string {
  const s = String(status || '').toLowerCase().trim()
  if (s === 'teste') return 'trial'
  return s
}

/** Identidade Connect necessária para reset/backups. */
export function temIdentidadeConnectOperavel(params: {
  acessoConnect?: boolean
  perfilId?: string | null
  authUserId?: string | null
  podeResetSenha?: boolean
}): boolean {
  if (params.acessoConnect !== true) return false
  if (params.podeResetSenha === true) return true
  return Boolean(params.perfilId || params.authUserId)
}

/**
 * Lista ordenada de ações do menu conforme origem/status/pagamento/acesso.
 * Não inclui Trial 7 dias (atalho legado removido).
 * Não inclui item informativo "Sem login Connect".
 */
export function resolverAcoesMenuCarteira(params: {
  origem?: string | null
  statusVinculo?: string | null
  statusPagamento?: string | null
  acessoConnect?: boolean
  perfilId?: string | null
  authUserId?: string | null
  podeResetSenha?: boolean
  processando?: boolean
  permanente?: boolean
}): ItemMenuCarteira[] {
  const origem = normalizarOrigemMenu(params.origem)
  const status = normalizarStatusVinculoMenu(params.statusVinculo)
  const processando = params.processando === true
  const permanente = params.permanente === true
  const acesso = params.acessoConnect === true
  const identidade = temIdentidadeConnectOperavel({
    acessoConnect: acesso,
    perfilId: params.perfilId,
    authUserId: params.authUserId,
    podeResetSenha: params.podeResetSenha,
  })

  const itens: ItemMenuCarteira[] = []

  itens.push({
    id: 'editar',
    label: 'Editar cliente',
    disabled: processando,
  })

  if (origem === 'connect' && identidade) {
    itens.push({
      id: 'reset_senha',
      label: 'Resetar senha / WhatsApp',
      disabled: processando,
    })
  }

  const bloqueado = status === 'bloqueado'

  if (!bloqueado && !permanente) {
    const jaPago = pagamentoJaConfirmado(params.statusPagamento)
    const podeMarcar = podeAcionarMarcarPago({
      statusPagamento: params.statusPagamento,
      processando,
    })
    itens.push({
      id: 'marcar_pago',
      label: labelAcaoMarcarPago({
        statusPagamento: params.statusPagamento,
        processando,
      }),
      disabled: !podeMarcar || permanente,
      title: jaPago ? 'Pagamento já confirmado' : undefined,
    })
  }

  if (status === 'ativo' && !permanente) {
    itens.push({
      id: 'renovar',
      label: 'Renovar ciclo',
      disabled: processando,
    })
  }

  // Bloquear XOR Desbloquear — nunca juntos
  if (!permanente) {
    if (bloqueado) {
      itens.push({
        id: 'desbloquear',
        label: 'Desbloquear / Ativar',
        disabled: processando,
      })
    } else if (status === 'ativo' || status === 'trial' || !status) {
      itens.push({
        id: 'bloquear',
        label: 'Bloquear',
        disabled: processando,
        variant: 'danger',
      })
    }
  }

  // Oferta upgrade: só Connect (copy comercial do produto próprio)
  if (origem === 'connect') {
    itens.push({
      id: 'oferta_upgrade',
      label: 'Oferta upgrade',
      disabled: processando,
    })
  }

  // Backups: Connect com identidade operacional
  if (origem === 'connect' && identidade) {
    itens.push({
      id: 'backups',
      label: 'Backups do cliente',
      disabled: processando,
    })
  }

  itens.push({
    id: 'excluir',
    label: LABEL_EXCLUIR_CLIENTE_CARTEIRA,
    disabled: processando,
    variant: 'delete',
  })

  return itens
}

export function menuTemAcao(itens: ItemMenuCarteira[], id: AcaoMenuCarteiraId): boolean {
  return itens.some((i) => i.id === id)
}

export function menuAcaoDisabled(itens: ItemMenuCarteira[], id: AcaoMenuCarteiraId): boolean {
  const item = itens.find((i) => i.id === id)
  return item ? item.disabled : true
}
