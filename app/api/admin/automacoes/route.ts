import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PerfilAutomacao = {
  id: string
  email: string | null
  nome_empresa: string | null
  telefone: string | null
  status: string | null
  ativo: boolean | null
  vencimento: string | null
  valor_plano: number | null
  sistema_cliente: string | null
}

function diasAte(data?: string | null) {
  if (!data) return null
  const parsed = new Date(data)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.ceil((parsed.getTime() - Date.now()) / 86400000)
}

function whatsappMensagem(cliente: PerfilAutomacao, tipo: 'trial' | 'vencendo' | 'vencido' | 'renovacao') {
  const nome = cliente.nome_empresa || cliente.email || 'cliente'
  const sistema = cliente.sistema_cliente || 'Connect Sistema'
  const valor = Number(cliente.valor_plano || 49.9).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const vencimento = cliente.vencimento ? new Date(cliente.vencimento).toLocaleDateString('pt-BR') : '-'

  if (tipo === 'trial') {
    return `Olá, ${nome}!\n\nSeu teste do ${sistema} está acabando. Para continuar usando orçamento, OS, financeiro e aprovações digitais sem interrupção, escolha o plano mensal ou anual.\n\nVencimento: ${vencimento}\n\n— Connect Sistema`
  }

  if (tipo === 'vencido') {
    return `Olá, ${nome}!\n\nSua assinatura do ${sistema} venceu em ${vencimento}. Para liberar o acesso novamente, regularize a renovação.\n\nValor de referência: ${valor}\n\n— Connect Sistema`
  }

  if (tipo === 'renovacao') {
    return `Olá, ${nome}!\n\nJá deixei sua renovação do ${sistema} separada. O plano anual é o melhor custo-benefício para manter o sistema ativo o ano inteiro.\n\n— Connect Sistema`
  }

  return `Olá, ${nome}!\n\nSua assinatura do ${sistema} vence em breve.\nVencimento: ${vencimento}\nValor: ${valor}\n\nSe quiser, já podemos renovar para evitar bloqueio.\n\n— Connect Sistema`
}

function montarItem(cliente: PerfilAutomacao, tipo: 'trial' | 'vencendo' | 'vencido' | 'renovacao') {
  return {
    id: cliente.id,
    nome: cliente.nome_empresa || cliente.email || 'Cliente',
    email: cliente.email,
    telefone: cliente.telefone,
    status: cliente.status,
    vencimento: cliente.vencimento,
    dias: diasAte(cliente.vencimento),
    mensagem: whatsappMensagem(cliente, tipo),
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request)

    const { data, error } = await supabaseAdmin
      .from('perfis')
      .select('id,email,nome_empresa,telefone,status,ativo,vencimento,valor_plano,sistema_cliente')
      .order('vencimento', { ascending: true })

    if (error) throw error

    const clientes = ((data || []) as PerfilAutomacao[]).filter((cliente) => cliente.ativo !== false)
    const trialAcabando = clientes
      .filter((cliente) => String(cliente.status || '').toLowerCase() === 'trial')
      .filter((cliente) => {
        const dias = diasAte(cliente.vencimento)
        return dias !== null && dias >= 0 && dias <= 3
      })
      .map((cliente) => montarItem(cliente, 'trial'))

    const vencendo = clientes
      .filter((cliente) => String(cliente.status || '').toLowerCase() !== 'trial')
      .filter((cliente) => {
        const dias = diasAte(cliente.vencimento)
        return dias !== null && dias >= 0 && dias <= 7
      })
      .map((cliente) => montarItem(cliente, 'vencendo'))

    const vencidos = clientes
      .filter((cliente) => {
        const dias = diasAte(cliente.vencimento)
        return dias !== null && dias < 0
      })
      .map((cliente) => montarItem(cliente, 'vencido'))

    return NextResponse.json({
      ok: true,
      geradoEm: new Date().toISOString(),
      trialAcabando,
      vencendo,
      vencidos,
      renovacao: clientes.slice(0, 20).map((cliente) => montarItem(cliente, 'renovacao')),
    })
  } catch (error: any) {
    const status = error?.message === 'Acesso negado.' || error?.message === 'Sessão ausente.' || error?.message === 'Sessão inválida.' ? 403 : 500
    console.error('ADMIN_AUTOMACOES_ERROR', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'Não foi possível preparar automações.' },
      { status },
    )
  }
}
