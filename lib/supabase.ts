/**
 * Client Supabase do browser — OBRIGATÓRIO: createBrowserClient (@supabase/ssr).
 *
 * Grava sessão em cookies HTTP para o middleware (createServerClient) enxergar
 * a mesma sessão. NÃO substituir por createClient do @supabase/supabase-js
 * (localStorage only) — isso causa loop 307 login ↔ painel após signIn.
 *
 * @see docs/AUTENTICACAO-V1.md
 */
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key'

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
