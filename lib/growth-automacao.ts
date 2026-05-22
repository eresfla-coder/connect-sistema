import {
  montarMensagemCobranca,
  type PerfilAssinatura,
} from '@/lib/assinatura-cobranca'
import { montarMensagemRenovacao } from '@/lib/financeiro-admin'
import { registrarLogAutomacao } from '@/lib/growth-store'
import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'
import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'

export type TipoAutomacao =
  | 'trial_vencendo'
  | 'cobranca_atrasada'
  | 'renovacao'

export type ResultadoAutomacao = {
  tipo: TipoAutomacao
  cliente: string
  telefone: string
  mensagem: string
  enviado: boolean
}

function mensagemTrialVencendo(resumo: ResumoAssinatura) {
  const dias = resumo.diasParaVencer
  return `Olá ${resumo.nomeCliente}! Seu teste do Connect Sistema termina em ${dias} dia(s) (${resumo.vencimentoFormatado}). Quer ativar o plano completo?`
}

export function listarAutomacoesPendentes(resumos: ResumoAssinatura[]) {
  const fila: ResultadoAutomacao[] = []

  for (const resumo of resumos) {
    const status = String(resumo.perfil.status || '').toLowerCase()

    if (
      status === 'teste' &&
      resumo.diasParaVencer <= 2 &&
      resumo.diasParaVencer >= 0
    ) {
      fila.push({
        tipo: 'trial_vencendo',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: mensagemTrialVencendo(resumo),
        enviado: false,
      })
    }

    if (resumo.grupo === 'atrasado') {
      fila.push({
        tipo: 'cobranca_atrasada',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: montarMensagemCobranca(resumo),
        enviado: false,
      })
    }

    if (resumo.grupo === 'vencendo_hoje' && status !== 'teste') {
      fila.push({
        tipo: 'renovacao',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: montarMensagemRenovacao(resumo),
        enviado: false,
      })
    }
  }

  return fila
}

export function executarAutomacao(
  item: ResultadoAutomacao,
  telefoneSuporte?: string,
) {
  const destino = item.telefone || telefoneSuporte || ''
  if (!destino) {
    registrarLogAutomacao({
      tipo: item.tipo,
      cliente: item.cliente,
      status: 'erro',
    })
    return false
  }

  abrirWhatsAppComTelefone(destino, item.mensagem)
  registrarLogAutomacao({
    tipo: item.tipo,
    cliente: item.cliente,
    status: 'ok',
  })
  return true
}

export function executarTodasAutomacoes(
  resumos: ResumoAssinatura[],
  telefoneSuporte?: string,
  limite = 5,
) {
  const fila = listarAutomacoesPendentes(resumos).slice(0, limite)
  let ok = 0
  for (const item of fila) {
    if (executarAutomacao(item, telefoneSuporte)) ok += 1
  }
  return { total: fila.length, enviados: ok }
}

/** Converte lead em trial: perfil já criado no signup com status teste */
export function perfilFromLead(
  userId: string,
  email: string,
  nome?: string,
): Partial<PerfilAssinatura> {
  return {
    id: userId,
    email,
    nome: nome || email.split('@')[0],
    status: 'teste',
    ativo: true,
  }
}
