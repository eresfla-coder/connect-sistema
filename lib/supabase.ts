import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key'

/** Cookie-based client — middleware @supabase/ssr lê a mesma sessão. */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
