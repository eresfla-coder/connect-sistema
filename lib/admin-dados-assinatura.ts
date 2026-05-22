import { supabase } from '@/lib/supabase'
import {
  colunasPerfisCobranca,
  colunasPerfisCobrancaMinimas,
  montarResumoAssinatura,
  perfilEhAdminConnect,
  type PerfilAssinatura,
  type ResumoAssinatura,
} from '@/lib/assinatura-cobranca'

export type PagamentoAdmin = {
  id?: string
  perfil_id?: string | null
  user_id?: string | null
  assinatura_id?: string | null
  valor?: number | string | null
  status?: string | null
  pago_em?: string | null
  data_pagamento?: string | null
  created_at?: string | null
  mes_referencia?: string | null
}

export type AssinaturaAdmin = {
  id?: string
  perfil_id?: string | null
  user_id?: string | null
  valor?: number | string | null
  mensalidade?: number | string | null
  status?: string | null
  vencimento?: string | null
  created_at?: string | null
}

export type DadosAdminAssinatura = {
  resumos: ResumoAssinatura[]
  pagamentos: PagamentoAdmin[]
  assinaturas: AssinaturaAdmin[]
  souAdmin: boolean
  erro: string
}

function idPerfilPagamento(item: PagamentoAdmin) {
  return item.perfil_id || item.user_id || item.assinatura_id || ''
}

export async function carregarDadosAdminAssinatura(): Promise<DadosAdminAssinatura> {
  const vazio: DadosAdminAssinatura = {
    resumos: [],
    pagamentos: [],
    assinaturas: [],
    souAdmin: false,
    erro: '',
  }

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return { ...vazio, erro: 'Faça login para acessar o painel administrativo.' }
  }

  const userId = authData.user.id

  const { data: meuPerfil } = await supabase
    .from('perfis')
    .select(colunasPerfisCobranca())
    .eq('id', userId)
    .maybeSingle()

  const perfilAtual = (meuPerfil || null) as PerfilAssinatura | null
  const souAdmin = perfilEhAdminConnect(perfilAtual)

  let lista: PerfilAssinatura[] = []

  const tentativaCompleta = await supabase
    .from('perfis')
    .select(colunasPerfisCobranca())
    .order('vencimento', { ascending: true, nullsFirst: false })

  if (!tentativaCompleta.error && Array.isArray(tentativaCompleta.data)) {
    lista = tentativaCompleta.data as unknown as PerfilAssinatura[]
  } else {
    const tentativaMinima = await supabase
      .from('perfis')
      .select(colunasPerfisCobrancaMinimas())
      .order('vencimento', { ascending: true, nullsFirst: false })

    if (tentativaMinima.error) {
      const apenasMeu = await supabase
        .from('perfis')
        .select(colunasPerfisCobrancaMinimas())
        .eq('id', userId)
        .maybeSingle()

      if (apenasMeu.error || !apenasMeu.data) {
        return {
          ...vazio,
          souAdmin,
          erro:
            'Não foi possível carregar perfis. Verifique permissões da tabela perfis no Supabase.',
        }
      }

      lista = [apenasMeu.data as unknown as PerfilAssinatura]
    } else {
      lista = (tentativaMinima.data || []) as unknown as PerfilAssinatura[]
    }
  }

  if (!souAdmin && lista.length > 1) {
    lista = lista.filter((item) => item.id === userId)
  }

  const resumos = lista.map(montarResumoAssinatura)

  let pagamentos: PagamentoAdmin[] = []
  const respPagamentos = await supabase
    .from('pagamentos')
    .select(
      'id, perfil_id, user_id, assinatura_id, valor, status, pago_em, data_pagamento, created_at, mes_referencia',
    )
    .order('created_at', { ascending: false })
    .limit(500)

  if (!respPagamentos.error && Array.isArray(respPagamentos.data)) {
    pagamentos = respPagamentos.data as unknown as PagamentoAdmin[]
    if (!souAdmin) {
      pagamentos = pagamentos.filter((p) => idPerfilPagamento(p) === userId)
    }
  }

  let assinaturas: AssinaturaAdmin[] = []
  const respAssinaturas = await supabase
    .from('assinaturas')
    .select('id, perfil_id, user_id, valor, mensalidade, status, vencimento, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!respAssinaturas.error && Array.isArray(respAssinaturas.data)) {
    assinaturas = respAssinaturas.data as unknown as AssinaturaAdmin[]
    if (!souAdmin) {
      assinaturas = assinaturas.filter(
        (a) => (a.perfil_id || a.user_id || '') === userId,
      )
    }
  }

  return {
    resumos,
    pagamentos,
    assinaturas,
    souAdmin,
    erro: '',
  }
}
