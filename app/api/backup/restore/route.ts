import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/api-auth'
import { restaurarBackupNuvem } from '@/lib/backup-server'
import { CONNECT_BACKUP_VERSION, type ConnectBackupPayload } from '@/lib/backup-connect'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const body = await request.json().catch(() => ({}))
    const payload = body?.payload as ConnectBackupPayload | undefined

    if (!payload?.dados) {
      return NextResponse.json({ ok: false, message: 'Payload de backup inválido.' }, { status: 400 })
    }

    const user_id = String(payload.user_id || user.id)
    if (user_id !== user.id) {
      return NextResponse.json({ ok: false, message: 'Backup de outro usuário.' }, { status: 403 })
    }

    if (!String(payload.versao || CONNECT_BACKUP_VERSION)) {
      return NextResponse.json({ ok: false, message: 'Versão de backup ausente.' }, { status: 400 })
    }

    await restaurarBackupNuvem(user.id, { ...payload, user_id: user.id })

    try {
      const supabase = getSupabaseAdmin()
      await supabase.from('logs_sistema').insert({
        user_id: user.id,
        acao: 'restaurou_backup',
        modulo: 'backup',
        detalhes: { versao: payload.versao, created_at: payload.created_at },
      })
    } catch {
      // tabela pode não existir ainda
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao restaurar backup.'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
