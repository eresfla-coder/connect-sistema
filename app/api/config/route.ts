import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function GET(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId não fornecido' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  try {
    const { data, error } = await supabase
      .from('configuracoes_empresa')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Config não encontrada' }, { status: 404 })
    }

    const config = {
      nomeEmpresa: data.nome_empresa || 'LOJA CONNECT',
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

    return NextResponse.json({ config }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
