import {
  lerLocalStorageUsuario,
  obterUserIdPainel,
  obterUserIdPainelSync,
  salvarLocalStorageUsuario,
} from '@/lib/connect-user-storage'
import { normalizarLogoEmpresaPublica } from '@/lib/documentosPublicos'
import { supabase } from '@/lib/supabase'

export type TipoPessoaEmpresa = 'PF' | 'PJ'

// ============================
// TIPO UNIFICADO
// ============================

export type ConfiguracaoEmpresa = {
  nomeEmpresa: string
  tipoPessoa: TipoPessoaEmpresa
  cpf: string
  cnpj: string
  cep: string
  bairro: string
  telefone: string
  celularEmpresa: string
  whatsappEmpresa: string
  email: string
  endereco: string
  cidadeUf: string
  responsavel: string
  logoUrl: string
  corPrimaria: string
  corSecundaria: string
  tituloPdf: string
  rodapePdf: string
  validadePadrao: string
  prazoEntregaPadrao: string
  formaPagamentoPadrao: string
  mostrarQuantidade: boolean
}

export const CONFIG_PADRAO: ConfiguracaoEmpresa = {
  nomeEmpresa: 'LOJA CONNECT',
  tipoPessoa: 'PJ',
  cpf: '',
  cnpj: '',
  cep: '',
  bairro: '',
  telefone: '',
  celularEmpresa: '',
  whatsappEmpresa: '',
  email: '',
  endereco: '',
  cidadeUf: '',
  responsavel: '',
  logoUrl: '/logo-connect.png',
  corPrimaria: '#16a34a',
  corSecundaria: '#dcfce7',
  tituloPdf: 'Orçamento Comercial',
  rodapePdf: 'Obrigado pela preferência.',
  validadePadrao: '7 dias',
  prazoEntregaPadrao: '3 dias',
  formaPagamentoPadrao: 'PIX',
  mostrarQuantidade: true,
}

export function normalizarTipoPessoaEmpresa(valor: unknown): TipoPessoaEmpresa {
  return String(valor || '').trim().toUpperCase() === 'PF' ? 'PF' : 'PJ'
}

export function rotuloDocumentoEmpresa(cfg: Pick<ConfiguracaoEmpresa, 'tipoPessoa' | 'cpf' | 'cnpj'>): string {
  const cpf = String(cfg.cpf || '').trim()
  const cnpj = String(cfg.cnpj || '').trim()
  const tipo = normalizarTipoPessoaEmpresa(cfg.tipoPessoa)

  if (tipo === 'PF' && cpf) return `CPF: ${cpf}`
  if (tipo === 'PJ' && cnpj) return `CNPJ: ${cnpj}`
  if (cnpj) return `CNPJ: ${cnpj}`
  if (cpf) return `CPF: ${cpf}`
  return ''
}

export function enderecoEmpresaLinha(cfg: Pick<ConfiguracaoEmpresa, 'endereco' | 'bairro' | 'cidadeUf' | 'cep'>): string {
  const cep = String(cfg.cep || '').trim()
  const cepFmt = cep ? (cep.includes('-') ? cep : cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')) : ''
  return [cfg.endereco, cfg.bairro, cfg.cidadeUf, cepFmt ? `CEP ${cepFmt}` : '']
    .map((parte) => String(parte || '').trim())
    .filter(Boolean)
    .join(' • ')
}

const LOCAL_KEY = 'connect_configuracoes'

// ============================
// HELPERS DE SERIALIZAÇÃO
// ============================

function telefoneWhatsappDeRow(row: Record<string, unknown>) {
  const telefone = String(row.telefone || '').trim()
  const whatsapp = String(row.whatsapp_empresa || row.whatsapp || '').trim()
  const legadoCelular = String(row.celular_empresa || '').trim()
  return {
    telefone: telefone || whatsapp || legadoCelular,
    whatsapp: whatsapp || telefone || legadoCelular,
    celular: legadoCelular || whatsapp || telefone,
  }
}

function appToDbCore(cfg: ConfiguracaoEmpresa): Record<string, unknown> {
  const celular = String(cfg.celularEmpresa || '').trim()
  const telefone = String(cfg.telefone || '').trim() || celular
  const whatsapp = String(cfg.whatsappEmpresa || '').trim() || celular || telefone

  return {
    nome_empresa: cfg.nomeEmpresa,
    tipo_pessoa: cfg.tipoPessoa,
    cpf: cfg.cpf,
    cnpj: cfg.cnpj,
    cep: cfg.cep,
    bairro: cfg.bairro,
    telefone,
    whatsapp_empresa: whatsapp,
    email: cfg.email,
    endereco: cfg.endereco,
    cidade_uf: cfg.cidadeUf,
    responsavel: cfg.responsavel,
    logo_url: cfg.logoUrl,
  }
}

/** Campos visuais/PDF — podem não existir na tabela; ficam no localStorage e connect_storage. */
function camposPreferenciaLocal(cfg: ConfiguracaoEmpresa): Partial<ConfiguracaoEmpresa> {
  return {
    corPrimaria: cfg.corPrimaria,
    corSecundaria: cfg.corSecundaria,
    tituloPdf: cfg.tituloPdf,
    rodapePdf: cfg.rodapePdf,
    validadePadrao: cfg.validadePadrao,
    prazoEntregaPadrao: cfg.prazoEntregaPadrao,
    formaPagamentoPadrao: cfg.formaPagamentoPadrao,
    mostrarQuantidade: cfg.mostrarQuantidade,
  }
}

function dbToApp(row: Record<string, unknown>, local?: ConfiguracaoEmpresa | null): ConfiguracaoEmpresa {
  const contatos = telefoneWhatsappDeRow(row || {})
  const prefs = local ? camposPreferenciaLocal(local) : {}
  return {
    nomeEmpresa: String(row.nome_empresa || CONFIG_PADRAO.nomeEmpresa),
    tipoPessoa: normalizarTipoPessoaEmpresa(row.tipo_pessoa),
    cpf: String(row.cpf || ''),
    cnpj: String(row.cnpj || ''),
    cep: String(row.cep || ''),
    bairro: String(row.bairro || ''),
    telefone: contatos.telefone,
    celularEmpresa: contatos.celular,
    whatsappEmpresa: contatos.whatsapp,
    email: String(row.email || ''),
    endereco: String(row.endereco || ''),
    cidadeUf: String(row.cidade_uf || ''),
    responsavel: String(row.responsavel || ''),
    logoUrl: normalizarLogoEmpresaPublica(String(row.logo_url || '')) || CONFIG_PADRAO.logoUrl,
    corPrimaria: prefs.corPrimaria ?? (row.cor_primaria != null ? String(row.cor_primaria) : CONFIG_PADRAO.corPrimaria),
    corSecundaria: prefs.corSecundaria ?? (row.cor_secundaria != null ? String(row.cor_secundaria) : CONFIG_PADRAO.corSecundaria),
    tituloPdf: prefs.tituloPdf ?? (row.titulo_pdf != null ? String(row.titulo_pdf) : CONFIG_PADRAO.tituloPdf),
    rodapePdf: prefs.rodapePdf ?? (row.rodape_pdf != null ? String(row.rodape_pdf) : CONFIG_PADRAO.rodapePdf),
    validadePadrao:
      prefs.validadePadrao ??
      (row.validade_padrao != null && row.validade_padrao !== undefined
        ? String(row.validade_padrao)
        : CONFIG_PADRAO.validadePadrao),
    prazoEntregaPadrao:
      prefs.prazoEntregaPadrao ??
      (row.prazo_entrega_padrao != null && row.prazo_entrega_padrao !== undefined
        ? String(row.prazo_entrega_padrao)
        : CONFIG_PADRAO.prazoEntregaPadrao),
    formaPagamentoPadrao:
      prefs.formaPagamentoPadrao ??
      (row.forma_pagamento_padrao != null ? String(row.forma_pagamento_padrao) : CONFIG_PADRAO.formaPagamentoPadrao),
    mostrarQuantidade:
      prefs.mostrarQuantidade ??
      (typeof row.mostrar_quantidade === 'boolean' ? row.mostrar_quantidade : CONFIG_PADRAO.mostrarQuantidade),
  }
}

// ============================
// BUSCAR (Com fallbacks)
// ============================

async function resolverUserIdComRetry(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) return user.id
  } catch {
    /* ignore */
  }

  for (const delay of [0, 250, 700, 1500]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const uid = await obterUserIdPainel()
    if (uid) return uid
  }

  return obterUserIdPainelSync()
}

/**
 * Buscador principal: Supabase (por user_id) → cache local → padrão
 */
export async function buscarConfiguracao(): Promise<ConfiguracaoEmpresa> {
  const userId = await resolverUserIdComRetry()

  if (userId) {
    try {
      const { data, error } = await supabase
        .from('configuracoes_empresa')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) {
        console.warn('[config] Supabase error:', error.message)
      } else if (data) {
        const local = carregarLocal(userId)
        const cfg = dbToApp(data as Record<string, unknown>, local)
        salvarLocal(cfg, userId)
        return cfg
      }
    } catch (e) {
      console.warn('[config] Erro ao buscar config:', e)
    }
  }

  const local = carregarLocal(userId)
  if (local) return local

  return { ...CONFIG_PADRAO }
}

/**
 * Buscador síncrono (documentos públicos onde não dá await)
 */
export function buscarConfiguracaoSync(): ConfiguracaoEmpresa {
  // Sem await: usa localStorage (já sincronizado pelo app)
  return carregarLocal(obterUserIdPainelSync()) || { ...CONFIG_PADRAO }
}

// Público para uso direto em documentos que precisam buscar depois
export async function buscarConfiguracaoAsync(): Promise<ConfiguracaoEmpresa> {
  return buscarConfiguracao()
}

// ============================
// SALVAR (Supabase + Local)
// ============================

interface SupabaseError {
  message: string
}

export async function salvarConfiguracao(cfg: ConfiguracaoEmpresa): Promise<void> {
  const userId = await resolverUserIdComRetry()

  // Sempre salvar localStorage (fallback e cache)
  salvarLocal(cfg, userId)

  if (!userId) {
    throw new Error('Faça login para salvar as configurações na nuvem.')
  }

  const dbRecord = appToDbCore(cfg)
  const { error } = await supabase
    .from('configuracoes_empresa')
    .upsert(
      {
        user_id: userId,
        ...dbRecord,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    const msg = (error as SupabaseError).message || ''
    // Coluna extra no schema: dados já estão no localStorage; não bloquear o usuário.
    if (msg.includes('schema cache') || msg.includes('Could not find')) {
      console.warn('[config] Supabase parcial (colunas opcionais ausentes):', msg)
      return
    }
    throw new Error(msg || 'Erro ao salvar configurações no Supabase.')
  }
}

// ============================
// LOCALSTORAGE (fallback/cache)
// ============================

export function salvarLocal(cfg: ConfiguracaoEmpresa, userId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    salvarLocalStorageUsuario(LOCAL_KEY, userId ?? obterUserIdPainelSync(), cfg)
  } catch {
    console.warn('[config] Falha ao salvar localStorage')
  }
}

export function carregarLocal(userId?: string | null): ConfiguracaoEmpresa | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = lerLocalStorageUsuario<Partial<ConfiguracaoEmpresa> | null>(
      LOCAL_KEY,
      userId ?? obterUserIdPainelSync(),
      null,
    )
    if (!parsed || typeof parsed !== 'object') return null
    return { ...CONFIG_PADRAO, ...parsed }
  } catch {
    return null
  }
}

// ============================
// RESOLVER TELEFONE (WhatsApp)
// ============================

export function resolverTelefone(cfg: ConfiguracaoEmpresa): string {
  const num = String(
    cfg.celularEmpresa ||
    cfg.whatsappEmpresa ||
    cfg.telefone ||
    ''
  ).replace(/\D/g, '')

  if (!num || num.length < 10) return ''

  if (num.startsWith('55')) {
    return num.length === 13 ? num : ''
  }

  if (num.length >= 10) {
    return `55${num}`
  }

  return ''
}

export function resolverTelefoneFormatado(cfg: ConfiguracaoEmpresa): string {
  const raw = String(
    cfg.celularEmpresa ||
    cfg.whatsappEmpresa ||
    cfg.telefone ||
    ''
  )
  return raw
}
