/**
 * Snapshot de assinatura/plano e isAdminMaster para UI de planos.
 * NÃO usar no fluxo de login nem no layout — use /api/painel/acesso.
 * @see docs/AUTENTICACAO-V1.md
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isUsuarioAdminServer } from '@/lib/access-server'
import { snapshotAssinaturaAdmin } from '@/lib/assinaturaAcesso'
import { garantirTrialAssinatura, obterAssinaturaUsuario } from '@/lib/assinaturaServer'
import { PLANOS_CATALOGO } from '@/lib/planosSaaS'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

export async function GET(request: NextRequest) {
  console.log('[STATUS_START]')
  try {
    const token = getBearerToken(request)
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Sessão ausente.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    const user = authData?.user

    if (authError || !user?.id) {
      return NextResponse.json({ ok: false, message: 'Sessão inválida.' }, { status: 401 })
    }

    const email = String(user.email || '').trim().toLowerCase()
    const documentosUsados =
      request.headers.get('x-connect-docs-count') != null
        ? Number(request.headers.get('x-connect-docs-count'))
        : 0

    const { perfil, assinatura, snapshot } = await obterAssinaturaUsuario(user.id)

    if (isUsuarioAdminServer({ email, perfil })) {
      const snapshotFinal = {
        ...snapshotAssinaturaAdmin(documentosUsados),
        documentosUsados,
      }
      console.log('[STATUS_END]', { isAdminMaster: true })
      return NextResponse.json({
        ok: true,
        perfil,
        assinatura,
        snapshot: snapshotFinal,
        catalogo: PLANOS_CATALOGO,
        isAdminMaster: true,
      })
    }

    await garantirTrialAssinatura(user.id, user.email)

    const atualizado = await obterAssinaturaUsuario(user.id)
    const snapshotFinal = {
      ...atualizado.snapshot,
      documentosUsados: documentosUsados || atualizado.snapshot.documentosUsados,
    }

    console.log('[STATUS_END]', { isAdminMaster: false })
    return NextResponse.json({
      ok: true,
      perfil: atualizado.perfil,
      assinatura: atualizado.assinatura,
      snapshot: snapshotFinal,
      catalogo: PLANOS_CATALOGO,
      dica: 'Envie x-connect-docs-count no header para contagem de documentos do cliente.',
      notaContagemCliente: 'Use contarDocumentosLocal() no browser para contagem real.',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao consultar assinatura.'
    console.error('[STATUS_RESULT]', message)
    console.error('ASSINATURA_STATUS_ERROR', error)
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
