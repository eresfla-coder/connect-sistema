import { redirect } from 'next/navigation'
import { createServerClient } from './supabase-server'

export async function requireUser() {
  const supabase = createServerClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    redirect('/login')
  }

  return data.user
}