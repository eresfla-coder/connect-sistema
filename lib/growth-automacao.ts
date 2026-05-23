import {
  montarMensagemCobranca,
  type PerfilAssinatura,
} from '@/lib/assinatura-cobranca'
import { montarMensagemRenovacao } from '@/lib/financeiro-admin'
import { registrarLogAutomacao } from '@/lib/growth-store'
import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'
import type { ResumoAssinatura } from '@/lib/assinatura-cobranca'

export type TipoAutomacao =
  | 'trial_iniciado'
  | 'trial_3_dias'
  | 'trial_vencendo'
  | 'trial_vencido'
  | 'cobranca_atrasada'
  | 'renovacao'
  | 'renovacao_confirmada'
  | 'boas_vindas'

export type ResultadoAutomacao = {
  tipo: TipoAutomacao
  cliente: string
  telefone: string
  mensagem: string
  enviado: boolean
}

export const ROTULO_AUTOMACAO: Record<TipoAutomacao, string> = {
  trial_iniciado: 'Trial iniciado',
  trial_3_dias: 'Faltam 3 dias',
  trial_vencendo: 'Trial vencendo',
  trial_vencido: 'Trial vencido',
  cobranca_atrasada: 'Cobrança atrasada',
  renovacao: 'Renovação',
  renovacao_confirmada: 'Renovação confirmada',
  boas_vindas: 'Boas-vindas premium',
}

function msgTrialIniciado(resumo: ResumoAssinatura) {
  return `Olá ${resumo.nomeCliente}! 🎉 Seu teste grátis do Connect Sistema começou. Crie seu primeiro orçamento e envie pelo WhatsApp em minutos.`
}

function msgTrial3Dias(resumo: ResumoAssinatura) {
  return `Olá ${resumo.nomeCliente}! Faltam 3 dias para o fim do seu teste (${resumo.vencimentoFormatado}). Quer garantir o plano Profissional sem perder seus dados?`
}

function msgTrialVencendo(resumo: ResumoAssinatura) {
  const dias = resumo.diasParaVencer
  return `Olá ${resumo.nomeCliente}! Seu teste termina em ${dias} dia(s) (${resumo.vencimentoFormatado}). Ative o plano completo e continue vendendo.`
}

function msgTrialVencido(resumo: ResumoAssinatura) {
  return `Olá ${resumo.nomeCliente}! Seu teste do Connect Sistema encerrou. Renove agora para liberar orçamentos, OS e cobrança novamente.`
}

function msgBoasVindas(resumo: ResumoAssinatura) {
  return `Bem-vindo(a) ${resumo.nomeCliente}! ✨ Sua conta premium Connect está ativa. Suporte dedicado pelo WhatsApp quando precisar.`
}

function msgRenovacaoConfirmada(resumo: ResumoAssinatura) {
  return `Olá ${resumo.nomeCliente}! Confirmamos sua renovação do Connect Sistema. Obrigado pela confiança — vamos escalar suas vendas juntos!`
}

export function listarAutomacoesPendentes(resumos: ResumoAssinatura[]) {
  const fila: ResultadoAutomacao[] = []

  for (const resumo of resumos) {
    const status = String(resumo.perfil.status || '').toLowerCase()
    const dias = resumo.diasParaVencer

    if (status === 'teste' && dias >= 6) {
      fila.push({
        tipo: 'trial_iniciado',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: msgTrialIniciado(resumo),
        enviado: false,
      })
    }

    if (status === 'teste' && dias === 3) {
      fila.push({
        tipo: 'trial_3_dias',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: msgTrial3Dias(resumo),
        enviado: false,
      })
    }

    if (status === 'teste' && dias <= 2 && dias >= 0) {
      fila.push({
        tipo: 'trial_vencendo',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: msgTrialVencendo(resumo),
        enviado: false,
      })
    }

    if (status === 'teste' && dias < 0) {
      fila.push({
        tipo: 'trial_vencido',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: msgTrialVencido(resumo),
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

    if (resumo.grupo === 'vencendo_hoje' && status === 'ativo') {
      fila.push({
        tipo: 'renovacao_confirmada',
        cliente: resumo.nomeCliente,
        telefone: resumo.telefone,
        mensagem: msgRenovacaoConfirmada(resumo),
        enviado: false,
      })
    }
  }

  const vistos = new Set<string>()
  return fila.filter((item) => {
    const chave = `${item.tipo}-${item.cliente}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
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
