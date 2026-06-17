import { NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: true, supabase: 'skipped' })
  }

  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        cache: 'no-store',
      },
      1200,
    )

    return NextResponse.json({
      ok: res.ok,
      supabase: res.ok ? 'up' : 'degraded',
      status: res.status,
    })
  } catch {
    return NextResponse.json({ ok: false, supabase: 'timeout' }, { status: 503 })
  }
}
