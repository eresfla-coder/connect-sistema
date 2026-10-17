import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/api-auth'
import {
  acumularPagantes,
  classificarCadastro,
  deduplicarCadastros,
  filtrarCadastros,
  leituraTemContinuacao,
  normalizarFiltroCadastro,
  ordenarCadastrosPublicos,
  paginarCadastros,
  resumirCadastros,
  TAMANHO_PAGINA_PAGAMENTOS,
  type CadastroBruto,
} from '@/lib/cadastros-publicos'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dataNegocio } from '@/lib/vigencia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LEITURA_MAX = 5000
const PAGINA_LEITURA = 500
const CHUNK = 150

type LinhaCadastro = { user_id: string; criado_em: string }
type LinhaPerfil = {
  id: string
  email?: string | null
  status?: string | null
  ativo?: boolean | null
  vencimento?: string | null
}

function statusAuth(error: unknown) {
  const msg = error instanceof Error ? error.message : ''
  return msg === 'Acesso negado.' || msg === 'Sessão ausente.' || msg === 'Sessão inválida.' ? 403 : 500
}

function tabelaAusente(error: { code?: string; message?: string } | null) {
  const codigo = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  return codigo === '42P01' || codigo === 'PGRST205' || msg.includes('cadastros_publicos')
}

function fatias<T>(lista: T[], tamanho: number): T[][] {
  const grupos: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) grupos.push(lista.slice(i, i + tamanho))
  return grupos
}

async function lerPagantes(grupo: string[], destino: Set<string>) {
  let inicio = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('pagamentos')
      .select('id,user_id')
      .eq('status', 'pago')
      .eq('gateway', 'mercado_pago')
      .in('user_id', grupo)
      .order('id', { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA_PAGAMENTOS - 1)
    if (error) throw error
    const linhas = (data || []) as Array<{ user_id?: string | null }>
    acumularPagantes(destino, linhas)
    if (!leituraTemContinuacao(linhas.length, TAMANHO_PAGINA_PAGAMENTOS)) return
    inicio += TAMANHO_PAGINA_PAGAMENTOS
  }
}

async function lerCadastros(): Promise<LinhaCadastro[]> {
  const linhas: LinhaCadastro[] = []
  let inicio = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('cadastros_publicos')
      .select('user_id,criado_em')
      .order('criado_em', { ascending: false })
      .order('user_id', { ascending: true })
      .range(inicio, inicio + PAGINA_LEITURA - 1)
    if (error) throw error
    const pagina = (data || []) as LinhaCadastro[]
    if (linhas.length + pagina.length > LEITURA_MAX) throw new Error('LIMITE_LEITURA')
    linhas.push(...pagina)
    if (pagina.length < PAGINA_LEITURA) return linhas
    inicio += PAGINA_LEITURA
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req)
    const url = new URL(req.url)
    const filtro = normalizarFiltroCadastro(url.searchParams.get('filtro'))
    const busca = String(url.searchParams.get('q') || '')
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '20')

    let linhas: LinhaCadastro[]
    try {
      linhas = await lerCadastros()
    } catch (error) {
      const db = error as { code?: string; message?: string }
      if (tabelaAusente(db)) {
        return NextResponse.json(
          { ok: false, code: 'TABELA_AUSENTE', error: 'A tabela de cadastros públicos ainda não foi criada.' },
          { status: 503 },
        )
      }
      if (error instanceof Error && error.message === 'LIMITE_LEITURA') {
        return NextResponse.json(
          { ok: false, code: 'LIMITE_LEITURA', error: 'Há cadastros demais para resumir nesta consulta.' },
          { status: 503 },
        )
      }
      throw error
    }

    const ids = [...new Set(linhas.map((linha) => String(linha.user_id || '')).filter(Boolean))]
    const perfis = new Map<string, LinhaPerfil>()
    const carteira = new Set<string>()
    const pagantes = new Set<string>()

    for (const grupo of fatias(ids, CHUNK)) {
      const [perfilRes, porPerfil, porAuth] = await Promise.all([
        supabaseAdmin.from('perfis').select('id,email,status,ativo,vencimento').in('id', grupo),
        supabaseAdmin.from('admin_cliente_sistemas').select('perfil_id').in('perfil_id', grupo),
        supabaseAdmin.from('admin_cliente_sistemas').select('auth_user_id').in('auth_user_id', grupo),
        lerPagantes(grupo, pagantes),
      ])
      if (perfilRes.error) throw perfilRes.error
      if (porPerfil.error) throw porPerfil.error
      if (porAuth.error) throw porAuth.error
      for (const perfil of (perfilRes.data || []) as LinhaPerfil[]) perfis.set(String(perfil.id), perfil)
      for (const vinculo of porPerfil.data || []) {
        if (vinculo.perfil_id) carteira.add(String(vinculo.perfil_id))
      }
      for (const vinculo of porAuth.data || []) {
        if (vinculo.auth_user_id) carteira.add(String(vinculo.auth_user_id))
      }
    }

    const hoje = dataNegocio()
    const classificados = ordenarCadastrosPublicos(deduplicarCadastros(
      linhas.map((linha): CadastroBruto => {
        const perfil = perfis.get(String(linha.user_id))
        return {
          userId: String(linha.user_id),
          criadoEm: linha.criado_em,
          email: perfil?.email || null,
          status: perfil?.status || null,
          ativo: perfil?.ativo ?? null,
          vencimento: perfil?.vencimento || null,
          naCarteira: carteira.has(String(linha.user_id)),
          paganteConfirmado: pagantes.has(String(linha.user_id)),
        }
      }),
    ).map((item) => classificarCadastro(item, hoje)))

    const resumo = resumirCadastros(classificados)
    const filtrados = filtrarCadastros(classificados, filtro, busca)
    const pagina = paginarCadastros(filtrados, page, pageSize)

    return NextResponse.json({
      ok: true,
      resumo,
      filtro,
      page: pagina.page,
      pageSize: pagina.pageSize,
      totalFiltrado: pagina.total,
      pages: pagina.pages,
      itens: pagina.itens.map((item) => ({
        userId: item.userId,
        criadoEm: item.criadoEm,
        email: item.email,
        status: item.status,
        vencimento: item.vencimento,
        rotulo: item.rotulo,
        testeAtivo: item.testeAtivo,
        testeVencido: item.testeVencido,
        convertido: item.convertido,
        pagante: item.pagante,
      })),
    })
  } catch (error: unknown) {
    console.error('CADASTROS_PUBLICOS_GET', error instanceof Error ? error.message : 'erro')
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Erro ao listar cadastros.' },
      { status: statusAuth(error) },
    )
  }
}
