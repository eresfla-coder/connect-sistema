import { supabase } from '@/lib/supabase'

// ============================================
// TIPO GENÉRICO PARA QUALQUER TABELA
// ============================================

export type TabelaSupabase =
  | 'clientes'
  | 'produtos'
  | 'orcamentos'
  | 'ordens_servico'
  | 'vendas'
  | 'recibos'
  | 'contratos'
  | 'configuracoes_empresa'

// ============================================
// BUSCAR TODOS (com fallback localStorage)
// ============================================

export async function buscarTodos<T = any>(
  tabela: TabelaSupabase,
  localKey: string,
  opcoes?: { orderBy?: string; ascending?: boolean; limit?: number }
): Promise<T[]> {
  // 1. Tentar Supabase
  try {
    let query = supabase
      .from(tabela)
      .select('*')

    if (opcoes?.orderBy) {
      query = query.order(opcoes.orderBy, { ascending: opcoes.ascending ?? false })
    }

    if (opcoes?.limit) {
      query = query.limit(opcoes.limit)
    }

    const { data, error } = await query

    if (!error && data && data.length > 0) {
      // Sincronizar localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(localKey, JSON.stringify(data))
      }
      return data as T[]
    }
  } catch (e) {
    console.warn(`[${tabela}] Erro Supabase:`, e)
  }

  // 2. Fallback localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(localKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed as T[]
      }
    } catch {}
  }

  return []
}

// ============================================
// BUSCAR POR ID
// ============================================

export async function buscarPorId<T = any>(
  tabela: TabelaSupabase,
  id: string
): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .eq('id', id)
      .single()

    if (!error && data) return data as T
  } catch {}

  return null
}

// ============================================
// SALVAR (insert ou update)
// ============================================

export async function salvar<T = any>(
  tabela: TabelaSupabase,
  localKey: string,
  registro: T,
  id?: string
): Promise<T | null> {
  // Sempre salvar localStorage primeiro (fallback)
  if (typeof window !== 'undefined') {
    try {
      const existentes = JSON.parse(localStorage.getItem(localKey) || '[]')
      const lista = Array.isArray(existentes) ? existentes : []

      if (id) {
        const idx = lista.findIndex((item: any) => item.id === id)
        if (idx >= 0) {
          lista[idx] = { ...lista[idx], ...registro, id }
        } else {
          lista.unshift({ ...registro, id })
        }
      } else {
        const novoId = (registro as any).id || crypto.randomUUID()
        lista.unshift({ ...registro, id: novoId })
      }

      localStorage.setItem(localKey, JSON.stringify(lista))
    } catch {}
  }

  // Tentar Supabase
  try {
    if (id) {
      const { data, error } = await supabase
        .from(tabela)
        .update(registro as any)
        .eq('id', id)
        .select()
        .single()

      if (!error && data) return data as T
    } else {
      const { data, error } = await supabase
        .from(tabela)
        .insert(registro as any)
        .select()
        .single()

      if (!error && data) {
        // Atualizar localStorage com o ID real do Supabase
        if (typeof window !== 'undefined') {
          try {
            const existentes = JSON.parse(localStorage.getItem(localKey) || '[]')
            const lista = Array.isArray(existentes) ? existentes : []
            const idx = lista.findIndex((item: any) =>
              JSON.stringify(item) === JSON.stringify(registro)
            )
            if (idx >= 0) {
              lista[idx] = { ...lista[idx], ...data }
              localStorage.setItem(localKey, JSON.stringify(lista))
            }
          } catch {}
        }
        return data as T
      }
    }
  } catch (e) {
    console.warn(`[${tabela}] Erro ao salvar no Supabase:`, e)
  }

  return null
}

// ============================================
// DELETAR
// ============================================

export async function deletar(
  tabela: TabelaSupabase,
  localKey: string,
  id: string
): Promise<boolean> {
  // Remover do localStorage
  if (typeof window !== 'undefined') {
    try {
      const existentes = JSON.parse(localStorage.getItem(localKey) || '[]')
      const lista = Array.isArray(existentes) ? existentes : []
      const filtrado = lista.filter((item: any) => item.id !== id && String(item.id) !== id)
      localStorage.setItem(localKey, JSON.stringify(filtrado))
    } catch {}
  }

  // Tentar Supabase
  try {
    const { error } = await supabase
      .from(tabela)
      .delete()
      .eq('id', id)

    return !error
  } catch (e) {
    console.warn(`[${tabela}] Erro ao deletar no Supabase:`, e)
    return false
  }
}

// ============================================
// SINCRONIZAR (localStorage → Supabase)
// ============================================

export async function sincronizarParaNuvem<T = any>(
  tabela: TabelaSupabase,
  localKey: string
): Promise<{ sucesso: number; falhas: number }> {
  if (typeof window === 'undefined') return { sucesso: 0, falhas: 0 }

  let sucesso = 0
  let falhas = 0

  try {
    const raw = localStorage.getItem(localKey)
    if (!raw) return { sucesso: 0, falhas: 0 }

    const lista = JSON.parse(raw)
    if (!Array.isArray(lista)) return { sucesso: 0, falhas: 0 }

    for (const item of lista) {
      // Remover campos que não existem no Supabase
      const { id, ...dados } = item

      try {
        const { error } = await supabase
          .from(tabela)
          .upsert(dados, { onConflict: 'id' })

        if (!error) {
          sucesso++
        } else {
          falhas++
        }
      } catch {
        falhas++
      }
    }
  } catch {}

  return { sucesso, falhas }
}

// ============================================
// CONTAR (para badges/dashboard)
// ============================================

export async function contar(tabela: TabelaSupabase): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(tabela)
      .select('*', { count: 'exact', head: true })

    if (!error && count !== null) return count
  } catch {}

  return 0
}

// ============================================
// HELPERS
// ============================================

export function gerarNumero(prefixo: string, lista: { numero?: string }[]): string {
  const max = lista.reduce((m, item) => {
    const n = parseInt(String(item.numero || '0').replace(/\D/g, ''))
    return n > m ? n : m
  }, 0)
  return `${prefixo}${String(max + 1).padStart(4, '0')}`
}

export function moeda(valor?: number): string {
  if (valor == null) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}
