import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/api-auth'
import { coletarBackupUsuario, salvarBackupNuvem } from '@/lib/backup-server'
import type { ConnectBackupPayload } from '@/lib/backup-connect'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('backups_usuario')
      .select('id,created_at,versao,origem')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15)

    if (error) {
      if (String(error.message).includes('does not exist')) {
        return NextResponse.json({ ok: true, backups: [], aviso: 'Tabela backups_usuario não criada. Execute migracao-producao-v1.sql.' })
      }
      throw error
    }

    return NextResponse.json({ ok: true, backups: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao listar backups.'
    return NextResponse.json({ ok: false, message }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromRequest(request)
    const body = await request.json().catch(() => ({}))
    const origem = body?.origem === 'automatico' ? 'automatico' : 'manual'

    let payload: ConnectBackupPayload
    if (body?.payload && typeof body.payload === 'object') {
      payload = { ...(body.payload as ConnectBackupPayload), user_id: user.id }
    } else {
      payload = await coletarBackupUsuario(user.id)
    }

    let backupId: string | null = null
    try {
      const salvo = await salvarBackupNuvem(user.id, payload, origem)
      backupId = salvo?.id || null
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (!msg.includes('does not exist')) throw e
    }

    return NextResponse.json({ ok: true, backupId, payload })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao criar backup.'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
