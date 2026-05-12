import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

function erro(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token') || searchParams.get('p')
    const tipo = searchParams.get('tipo') || ''
    const documentoId = searchParams.get('documentoId') || searchParams.get('id') || ''

    let query = supabase
      .from('public_documents')
      .select('tipo, documento_id, payload, user_id, token, updated_at')
      .limit(1)

    if (token) {
      query = query.eq('token', token)
    } else if (tipo && documentoId) {
      query = query.eq('tipo', tipo).eq('documento_id', documentoId).order('updated_at', { ascending: false })
    } else {
      return erro('Token ou documento não fornecido.')
    }

    const { data: doc, error: docError } = await query.maybeSingle()

    if (docError || !doc) {
      return erro('Documento não encontrado.', 404)
    }

    const payload = doc.payload || {}
    const payloadCfg = payload.cfg || payload.config || {}
    const ownerId = doc.user_id || payload.user_id || payload.owner_user_id || payloadCfg.user_id || payloadCfg.owner_user_id || ''

    let configAtual: Record<string, any> = {}
    if (ownerId) {
      const { data: cfg } = await supabase
        .from('configuracoes_empresa')
        .select('*')
        .eq('user_id', ownerId)
        .maybeSingle()

      if (cfg) configAtual = cfg
    }

    const telefoneAtual = normalizePhone(
      configAtual.celular_empresa ||
        configAtual.whatsapp_empresa ||
        configAtual.telefone ||
        ''
    )
    const telefonePayload = normalizePhone(
      payloadCfg.celularEmpresa ||
        payloadCfg.whatsappEmpresa ||
        payloadCfg.celular ||
        payloadCfg.whatsapp ||
        payloadCfg.telefoneEmpresa ||
        payloadCfg.telefone ||
        ''
    )

    const telefoneFinal = telefoneAtual || telefonePayload

    const config = {
      nomeEmpresa: String(configAtual.nome_empresa || payloadCfg.nomeEmpresa || payloadCfg.nome || 'LOJA CONNECT'),
      telefone: String(telefoneFinal || ''),
      celularEmpresa: String(configAtual.celular_empresa || telefoneFinal || payloadCfg.celularEmpresa || payloadCfg.celular || ''),
      whatsappEmpresa: String(configAtual.whatsapp_empresa || telefoneFinal || payloadCfg.whatsappEmpresa || payloadCfg.whatsapp || ''),
      telefoneEmpresa: String(configAtual.telefone || telefoneFinal || payloadCfg.telefoneEmpresa || payloadCfg.telefone || ''),
      email: String(configAtual.email || payloadCfg.email || ''),
      endereco: String(configAtual.endereco || payloadCfg.endereco || ''),
      cidadeUf: String(configAtual.cidade_uf || payloadCfg.cidadeUf || ''),
      responsavel: String(configAtual.responsavel || payloadCfg.responsavel || ''),
      logoUrl: String(configAtual.logo_url || payloadCfg.logoUrl || payloadCfg.logo || '/logo-connect.png'),
      corPrimaria: String(configAtual.cor_primaria || payloadCfg.corPrimaria || '#16a34a'),
      corSecundaria: String(configAtual.cor_secundaria || payloadCfg.corSecundaria || '#dcfce7'),
      tituloPdf: String(configAtual.titulo_pdf || payloadCfg.tituloPdf || 'Orçamento Comercial'),
      rodapePdf: String(configAtual.rodape_pdf || payloadCfg.rodapePdf || 'Obrigado pela preferência.'),
      validadePadrao: String(configAtual.validade_padrao || payloadCfg.validadePadrao || '7 dias'),
      prazoEntregaPadrao: String(configAtual.prazo_entrega_padrao || payloadCfg.prazoEntregaPadrao || '3 dias'),
      formaPagamentoPadrao: String(configAtual.forma_pagamento_padrao || payloadCfg.formaPagamentoPadrao || 'PIX'),
      mostrarQuantidade: configAtual.mostrar_quantidade ?? payloadCfg.mostrarQuantidade ?? true,
      user_id: ownerId || '',
      owner_user_id: ownerId || '',
    }

    return NextResponse.json({
      tipo: doc.tipo,
      documento_id: doc.documento_id,
      found: true,
      config_atualizada: !!configAtual.id,
      config,
      payload,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 })
  }
}
