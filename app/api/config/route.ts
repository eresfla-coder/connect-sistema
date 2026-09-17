import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CFG_EMPRESA_COLS_PUBLICAS } from '@/lib/public-docs-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Configuração da empresa do usuário autenticado.
 * userId na query NÃO é autorização — exige Bearer e o userId deve ser o próprio.
 * Callers públicos devem usar /api/public-docs/config?token=...
 */
export async function GET(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!bearer) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const userIdQuery = searchParams.get('userId') || ''

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(bearer)
    const authUserId = userData?.user?.id || ''
    if (userError || !authUserId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    if (userIdQuery && userIdQuery !== authUserId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('configuracoes_empresa')
      .select(CFG_EMPRESA_COLS_PUBLICAS)
      .eq('user_id', authUserId)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Config não encontrada' }, { status: 404 })
    }

    const config = {
      nomeEmpresa: data.nome_empresa || 'LOJA CONNECT',
      tipoPessoa: data.tipo_pessoa || 'PJ',
      cpf: data.cpf || '',
      cnpj: data.cnpj || '',
      cep: data.cep || '',
      bairro: data.bairro || '',
      telefone: data.telefone || '',
      celularEmpresa: data.celular_empresa || data.whatsapp_empresa || data.telefone || '',
      whatsappEmpresa: data.whatsapp_empresa || data.telefone || '',
      email: data.email || '',
      endereco: data.endereco || '',
      cidadeUf: data.cidade_uf || '',
      responsavel: data.responsavel || '',
      logoUrl: data.logo_url || '/logo-connect.png',
      corPrimaria: data.cor_primaria || '#16a34a',
      corSecundaria: data.cor_secundaria || '#dcfce7',
    }

    return NextResponse.json(
      { config },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
