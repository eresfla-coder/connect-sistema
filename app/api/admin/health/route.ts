import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type StatusItem = { nome: string; status: 'online' | 'atencao' | 'offline'; detalhe?: string }

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request)
    const itens: StatusItem[] = []

    const supabase = getSupabaseAdmin()
    try {
      const { error } = await supabase.from('connect_storage').select('user_id').limit(1)
      itens.push({
        nome: 'Supabase',
        status: error ? 'offline' : 'online',
        detalhe: error?.message,
      })
    } catch (e: unknown) {
      itens.push({ nome: 'Supabase', status: 'offline', detalhe: e instanceof Error ? e.message : 'Erro' })
    }

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
    itens.push({
      nome: 'Mercado Pago',
      status: mpToken.startsWith('APP_USR') || mpToken.startsWith('TEST-') ? 'online' : 'atencao',
      detalhe: mpToken ? 'Token configurado' : 'Token ausente no ambiente',
    })

    itens.push({
      nome: 'WhatsApp',
      status: 'online',
      detalhe: 'Integração via wa.me / api.whatsapp.com',
    })

    try {
      const { error } = await supabase.from('connect_storage').select('storage_key').limit(1)
      itens.push({
        nome: 'Storage',
        status: error ? 'atencao' : 'online',
        detalhe: 'connect_storage',
      })
    } catch {
      itens.push({ nome: 'Storage', status: 'atencao' })
    }

    try {
      const { error } = await supabase.from('backups_usuario').select('id').limit(1)
      itens.push({
        nome: 'Backup',
        status: error ? (String(error.message).includes('does not exist') ? 'atencao' : 'offline') : 'online',
        detalhe: error?.message?.includes('does not exist') ? 'Execute migracao-producao-v1.sql' : 'backups_usuario OK',
      })
    } catch {
      itens.push({ nome: 'Backup', status: 'atencao', detalhe: 'Tabela não verificada' })
    }

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    itens.push({
      nome: 'Service role',
      status: serviceRole.startsWith('ey') ? 'online' : 'offline',
      detalhe: serviceRole ? 'Configurada' : 'SUPABASE_SERVICE_ROLE_KEY ausente',
    })

    return NextResponse.json({ ok: true, itens, verificadoEm: new Date().toISOString() })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha no health check.'
    return NextResponse.json({ ok: false, message }, { status: 403 })
  }
}
