import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { restaurarBackupNuvem, BackupTimeoutError } from '@/lib/backup-server'
import type { ConnectBackupPayload } from '@/lib/backup-connect'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request)
    const userId = request.nextUrl.searchParams.get('userId') || ''
    const backupId = request.nextUrl.searchParams.get('backupId') || ''

    if (!userId) {
      return NextResponse.json({ ok: false, message: 'userId obrigatório.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (backupId) {
      const { data, error } = await supabase
        .from('backups_usuario')
        .select('id,user_id,created_at,versao,origem,payload')
        .eq('id', backupId)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error
      if (!data) return NextResponse.json({ ok: false, message: 'Backup não encontrado.' }, { status: 404 })
      return NextResponse.json({ ok: true, backup: data })
    }

    const { data, error } = await supabase
      .from('backups_usuario')
      .select('id,created_at,versao,origem')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15)

    if (error) throw error
    return NextResponse.json({ ok: true, backups: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha.'
    return NextResponse.json({ ok: false, message }, { status: 403 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminFromRequest(request)
    const body = await request.json().catch(() => ({}))
    const userId = String(body?.userId || '')
    const backupId = String(body?.backupId || '')

    if (!userId || !backupId) {
      return NextResponse.json({ ok: false, message: 'userId e backupId obrigatórios.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('backups_usuario')
      .select('payload')
      .eq('id', backupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    if (!data?.payload) return NextResponse.json({ ok: false, message: 'Backup não encontrado.' }, { status: 404 })

    await restaurarBackupNuvem(userId, data.payload as ConnectBackupPayload)

    try {
      await supabase.from('logs_sistema').insert({
        user_id: userId,
        acao: 'restaurou_backup',
        modulo: 'admin',
        detalhes: { backupId, admin: true },
      })
    } catch {
      /* logs opcionais */
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    if (error instanceof BackupTimeoutError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 })
    }
    const message = error instanceof Error ? error.message : 'Falha ao restaurar.'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
