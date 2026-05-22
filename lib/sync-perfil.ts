import type { PerfilAssinatura } from '@/lib/assinatura-cobranca'
import { supabase } from '@/lib/supabase'

const CACHE_KEY = 'connect_perfil_cache_v1'
const CACHE_TTL_MS = 5 * 60 * 1000

type CachePerfil = {
  ts: number
  userId: string
  perfil: PerfilAssinatura
}

const COLUNAS =
  'id, email, nome, nome_empresa, telefone, whatsapp, celular, ativo, status, vencimento, valor_mensalidade, mensalidade, valor_plano, is_admin'

export async function carregarPerfilUsuario(options?: {
  forcar?: boolean
}): Promise<{ perfil: PerfilAssinatura | null; erro?: string }> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  const user = authData?.user

  if (authError || !user) {
    return { perfil: null, erro: 'Sessão inválida' }
  }

  if (!options?.forcar && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const cache = JSON.parse(raw) as CachePerfil
        if (
          cache.userId === user.id &&
          Date.now() - cache.ts < CACHE_TTL_MS
        ) {
          return { perfil: cache.perfil }
        }
      }
    } catch {
      // ignora cache corrompido
    }
  }

  const { data, error } = await supabase
    .from('perfis')
    .select(COLUNAS)
    .eq('id', user.id)
    .single()

  if (error || !data) {
    return { perfil: null, erro: error?.message || 'Perfil não encontrado' }
  }

  const perfil = data as PerfilAssinatura

  if (typeof window !== 'undefined') {
    try {
      const cache: CachePerfil = { ts: Date.now(), userId: user.id, perfil }
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch {
      // quota excedida — segue sem cache
    }
  }

  return { perfil }
}

export function limparCachePerfil() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(CACHE_KEY)
}
