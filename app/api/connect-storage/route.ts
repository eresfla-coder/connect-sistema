import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { CONNECT_CLOUD_KEYS } from '@/lib/connect-cloud-storage'

export const dynamic = 'force-dynamic'

type StorageRow = { storage_key: string; payload: unknown; updated_at?: string | null }

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

async function getUserId(request: NextRequest) {
  const token = getBearerToken(request)
  if (!token) throw new Error('Sessão ausente.')
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id) throw new Error('Sessão inválida.')
  return data.user.id
}

function sanitizePayload(input: any) {
  const data = input?.data && typeof input.data === 'object' ? input.data : input
  const safe: Record<string, unknown> = {}
  for (const key of CONNECT_CLOUD_KEYS) if (data && Object.prototype.hasOwnProperty.call(data, key)) safe[key] = data[key]
  return safe
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.from('connect_storage').select('storage_key,payload,updated_at').eq('user_id', userId).in('storage_key', CONNECT_CLOUD_KEYS as unknown as string[])
    if (error) throw error
    const payload: Record<string, unknown> = {}
    for (const row of (data || []) as StorageRow[]) payload[row.storage_key] = row.payload
    return NextResponse.json({ ok: true, data: payload })
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || 'Falha ao carregar dados.' }, { status: 401 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId(request)
    const body = await request.json().catch(() => ({}))
    const payload = sanitizePayload(body)
    const keys = Object.keys(payload)
    if (!keys.length) return NextResponse.json({ ok: true, saved: 0 })
    const rows = keys.map((key) => ({ user_id: userId, storage_key: key, payload: payload[key], updated_at: new Date().toISOString() }))
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('connect_storage').upsert(rows, { onConflict: 'user_id,storage_key' })
    if (error) throw error
    return NextResponse.json({ ok: true, saved: rows.length })
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || 'Falha ao salvar dados.' }, { status: 400 })
  }
}
