import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isUsuarioAdmin } from '@/lib/access'
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

    if (isUsuarioAdmin({ email, perfil })) {
      const snapshotFinal = {
        ...snapshotAssinaturaAdmin(documentosUsados),
        documentosUsados,
      }
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

    return NextResponse.json({
      ok: true,
      perfil: atualizado.perfil,
      assinatura: atualizado.assinatura,
      snapshot: snapshotFinal,
      catalogo: PLANOS_CATALOGO,
      dica: 'Envie x-connect-docs-count no header para contagem de documentos do cliente.',
      notaContagemCliente: 'Use contarDocumentosLocal() no browser para contagem real.',
    })
  } catch (error: any) {
    console.error('ASSINATURA_STATUS_ERROR', error)
    return NextResponse.json({ ok: false, message: error?.message || 'Erro ao consultar assinatura.' }, { status: 500 })
  }
}
