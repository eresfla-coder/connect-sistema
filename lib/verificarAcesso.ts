import { supabase } from './supabase'
import { ADMIN_EMAILS, acessoBloqueado } from './access'
import type { EmpresaSaas, PerfilSaas } from './empresa'

type UserLike = { id: string; email?: string | null }

export type ResultadoAcesso = {
  bloqueado: boolean
  motivo?: string
  perfil?: PerfilSaas | null
  empresa?: EmpresaSaas | null
}

export async function verificarAcesso(user: UserLike): Promise<ResultadoAcesso> {
  const emailNormalizado = String(user.email || '').trim().toLowerCase()
  if (ADMIN_EMAILS.includes(emailNormalizado)) {
    return { bloqueado: false, motivo: 'admin_liberado' }
  }

  const { data: perfil } = await supabase
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<PerfilSaas>()

  if (!perfil) return { bloqueado: true, motivo: 'perfil_nao_encontrado' }

  if (acessoBloqueado(perfil)) {
    return { bloqueado: true, motivo: 'perfil_bloqueado', perfil }
  }

  if (!perfil.empresa_id) {
    return { bloqueado: true, motivo: 'empresa_nao_vinculada', perfil }
  }

  const { data: empresa } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', perfil.empresa_id)
    .maybeSingle<EmpresaSaas>()

  if (!empresa) return { bloqueado: true, motivo: 'empresa_nao_encontrada', perfil }

  if (empresa.ativo === false) {
    return { bloqueado: true, motivo: 'empresa_inativa', perfil, empresa }
  }

  const plano = String(empresa.plano || 'trial').trim().toLowerCase()
  const trialAte = empresa.trial_ate ? new Date(empresa.trial_ate) : null
  const trialExpirou = trialAte && !Number.isNaN(trialAte.getTime()) && trialAte.getTime() < Date.now()

  if (trialExpirou && plano === 'trial') {
    return { bloqueado: true, motivo: 'trial_expirado', perfil, empresa }
  }

  return { bloqueado: false, perfil, empresa }
}
