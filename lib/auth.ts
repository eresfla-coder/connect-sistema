import { redirect } from 'next/navigation'
import { createServerSupabase } from './supabase-server'

export async function requireUser() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    redirect('/login')
  }

  return data.user
}