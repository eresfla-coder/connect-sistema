import { supabase } from './supabase'
import { dataMaisDias, normalizarStatus } from './access'

type UserLike = {
  id: string
  email?: string | null
  user_metadata?: Record<string, any> | null
}

export type EmpresaSaas = {
  id: string
  nome?: string | null
  email?: string | null
  telefone?: string | null
  trial_ate?: string | null
  ativo?: boolean | null
  plano?: string | null
}

export type PerfilSaas = {
  id: string
  empresa_id?: string | null
  email?: string | null
  nome?: string | null
  ativo?: boolean | null
  status?: string | null
  vencimento?: string | null
  created_at?: string | null
}

function seteDiasIso() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

function nomeDoUsuario(user: UserLike) {
  const meta = user.user_metadata || {}
  return String(meta.nome || meta.name || user.email || 'Cliente Connect')
}

async function buscarEmpresaPorEmail(email: string) {
  const { data } = await supabase
    .from('empresas')
    .select('*')
    .eq('email', email)
    .maybeSingle<EmpresaSaas>()

  return data || null
}

async function criarOuBuscarEmpresa(user: UserLike) {
  const email = String(user.email || '').trim().toLowerCase()
  const nome = nomeDoUsuario(user)

  const existente = email ? await buscarEmpresaPorEmail(email) : null
  if (existente) return existente

  const { data, error } = await supabase
    .from('empresas')
    .insert({
      nome,
      email,
      trial_ate: seteDiasIso(),
      ativo: true,
      plano: 'trial',
    })
    .select('*')
    .single<EmpresaSaas>()

  if (!error && data) return data

  // Proteção contra corrida: se dois carregamentos tentarem criar ao mesmo tempo.
  const depois = email ? await buscarEmpresaPorEmail(email) : null
  if (depois) return depois

  throw error || new Error('Não foi possível criar a empresa.')
}

export async function garantirEmpresa(user: UserLike) {
  const email = String(user.email || '').trim().toLowerCase()
  const nome = nomeDoUsuario(user)

  const { data: perfilExistente } = await supabase
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<PerfilSaas>()

  let empresa: EmpresaSaas | null = null

  if (perfilExistente?.empresa_id) {
    const { data } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', perfilExistente.empresa_id)
      .maybeSingle<EmpresaSaas>()
    empresa = data || null
  }

  if (!empresa) {
    empresa = await criarOuBuscarEmpresa(user)
  }

  const perfilBase: PerfilSaas = {
    id: user.id,
    empresa_id: empresa.id,
    email,
    nome,
    ativo: perfilExistente?.ativo ?? true,
    status: normalizarStatus(perfilExistente?.status || 'trial'),
    vencimento: perfilExistente?.vencimento || dataMaisDias(7),
  }

  const { error: perfilError } = await supabase
    .from('perfis')
    .upsert(perfilBase, { onConflict: 'id' })

  if (perfilError) throw perfilError

  if (!empresa.trial_ate) {
    const trialAte = seteDiasIso()
    await supabase.from('empresas').update({ trial_ate: trialAte }).eq('id', empresa.id)
    empresa.trial_ate = trialAte
  }

  return { perfil: perfilBase, empresa }
}
