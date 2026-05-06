import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 🔍 Verifica ENV
  if (!url) {
    return NextResponse.json({
      ok: false,
      etapa: 'env',
      erro: 'NEXT_PUBLIC_SUPABASE_URL NÃO definida',
    })
  }

  if (!key) {
    return NextResponse.json({
      ok: false,
      etapa: 'env',
      erro: 'NEXT_PUBLIC_SUPABASE_ANON_KEY NÃO definida',
    })
  }

  try {
    // 🔗 Teste direto no Supabase
    const resp = await fetch(`${url}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    })

    const texto = await resp.text()

    return NextResponse.json({
      ok: resp.ok,
      etapa: 'supabase',
      status: resp.status,
      statusText: resp.statusText,
      url,
      resposta: texto,
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      etapa: 'fetch',
      erro: error?.message || 'Erro desconhecido ao acessar Supabase',
      url,
    })
  }
}