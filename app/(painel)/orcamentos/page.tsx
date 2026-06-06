'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { abrirNovaAbaOuMesma, abrirWhatsappAposPrepararLink, abrirWhatsappUrl, comTimeout, montarUrlWhatsapp } from '@/lib/abrirExterno'
import { buscarConfiguracao } from '@/lib/configuracaoEmpresa'
import { montarUrlPublicaDocumento, timestampVersaoPublica } from '@/lib/empresaPublica'
import { mergeConfigPublicacao, normalizarLogoEmpresaPublica } from '@/lib/documentosPublicos'
import { gerarFinanceiroDeOrcamento } from '@/lib/financeiro'
import { supabase } from '@/lib/supabase'
import {
  extrairFormasPagamentoOrcamento,
  montarFormasPagamentoOrcamento,
  OPCOES_PAGAMENTO_ORCAMENTO,
} from '@/lib/orcamento-pagamento'
import {
  OBSERVACAO_PADRAO_ORCAMENTO,
  orcamentoDeveOcultarM2Cliente,
  validadeOrcamentoAtiva,
  resolverValidadePadraoOrcamento,
} from '@/lib/orcamentoTextos'
import { lerLocalStorageUsuario, obterUserIdPainel } from '@/lib/connect-user-storage'
import { registrarLogSistema } from '@/lib/logs-sistema'
import { exportarOrcamentosExcel } from '@/lib/export-modulos'
type TipoPessoaCliente = 'PF' | 'PJ'

type Cliente = {
  id: number
  nome: string
  telefone: string
  email: string
  endereco: string
  tipoPessoa?: TipoPessoaCliente
  cpf?: string
  cnpj?: string
  razaoSocial?: string
  nomeFantasia?: string
}

type TipoCadastroProduto = 'produto' | 'servico'
type TipoCalculoItem = 'unidade' | 'm2' | 'peso'

type Produto = {
  id: number
  nome: string
  valor: number
  codigoBarras?: string
  tipoCadastro?: TipoCadastroProduto
  tipoCalculo?: TipoCalculoItem
}

type StatusOrcamento = 'Pendente' | 'Aprovado' | 'Convertido' | 'Cancelado'
type ModeloOrcamento = 'recibo_profissional' | 'comercial_premium'

type ItemOrcamento = {
  tipoCadastro?: TipoCadastroProduto
  id: number
  nome: string
  descricao?: string
  quantidade: number
  valor: number
  mostrarCliente?: boolean
  tipoCalculo?: TipoCalculoItem
  largura?: number
  altura?: number
  metragem?: number
  valorM2?: number
  unidadeLabel?: string
}

type OrcamentoSalvo = {
  id: number
  numero: string
  titulo: string
  modelo?: ModeloOrcamento
  cliente: Cliente | null
  itens: ItemOrcamento[]
  subtotal: number
  entrega: number
  desconto: number
  total: number
  formaPagamento: string
  formasPagamentoLista?: string[]
  observacaoPagamento?: string
  ocultarValorUnitarioM2?: boolean
  validade: string
  prazoEntrega: string
  enderecoEntrega?: string
  observacao: string
  status: StatusOrcamento
  data: string
  link: string
  aprovado?: boolean
  aprovadoEm?: string
  atualizadoEm?: number
  osGeradaId?: number
  osGeradaEm?: string
  aprovacaoDigital?: {
    status?: 'aprovado' | 'recusado'
    nome?: string
    data?: string
    assinatura?: string
    origem?: string
  }
  tipoDocumento?: 'orcamento' | 'proposta_comercial'
  tituloProposta?: string
  descricaoProposta?: string
  condicoesPagamento?: string
  validadeProposta?: string
  observacoesProposta?: string
}

type ModeloPropostaRapida = 'servico' | 'produto' | 'moveis' | 'assistencia' | 'grafica'

type OrdemServicoGerada = {
  id: number
  numero: string
  cliente: string
  telefone: string
  whatsapp?: string
  email: string
  endereco: string
  equipamento: string
  marca: string
  modelo: string
  serial: string
  defeito: string
  checklist: string
  observacao: string
  valor: number
  entrada: number
  saldo: number
  status: string
  prioridade: string
  tecnico: string
  previsao: string
  data: string
  ultimaAtualizacao: string
  link: string
  orcamentoId?: number
  origem?: string
}

type OsSupabaseRow = {
  user_id: string
  local_id: string
  numero: string
  cliente: string
  telefone: string
  equipamento: string
  status: string
  prioridade: string
  valor: number
  entrada: number
  saldo: number
  aprovado: boolean
  payload: Record<string, unknown>
}

type VendaSalva = {
  id: number
  numero: string
  orcamentoId?: number
  cliente: Cliente | null
  itens: ItemOrcamento[]
  subtotal: number
  desconto: number
  total: number
  formaPagamento: string
  observacao: string
  status: string
  data: string
  origem: string
}

type ConfiguracaoSistema = {
  nomeEmpresa: string
  telefone: string
  email: string
  endereco: string
  cidadeUf: string
  responsavel: string
  tituloPdf: string
  rodapePdf: string
  validadePadrao: string
  prazoEntregaPadrao: string
  formaPagamentoPadrao: string
  corPrimaria: string
  corSecundaria: string
  corTabela: string
  mostrarQuantidade: boolean
  logoUrl: string
}

type Toast = {
  texto: string
  tipo: 'success' | 'error' | 'info'
}

const CONFIG_KEY = 'connect_configuracoes'
const FORMAS_KEY = 'connect_formas_pagamento'
const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const ORCAMENTOS_DELETED_PREFIX = 'connect_orcamentos_deleted_'
const OS_KEY = 'connect_ordens_servico_salvas'
const VENDAS_KEY = 'connect_vendas_salvas'
const PRODUTOS_KEY = 'connect_produtos'
const CLIENTES_KEY = 'connect_clientes'

let orcamentoIdSeq = 0

function gerarIdOrcamentoUnico() {
  orcamentoIdSeq += 1
  return Date.now() * 10 + (orcamentoIdSeq % 10)
}

function hashNumeroDeterministico(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function idDeterministicoOrcamento(seed: string) {
  return 1000000000 + (hashNumeroDeterministico(seed) % 800000000)
}

function textoDedupe(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function assinaturaOrcamento(item: OrcamentoSalvo) {
  const cliente = textoDedupe(item.cliente?.nome || '')
  const numero = textoDedupe(item.numero || '')
  const total = Number(item.total || 0).toFixed(2)
  const data = textoDedupe(item.data || '')
  return `${numero}|${cliente}|${total}|${data}`
}

function scoreOrcamento(item: OrcamentoSalvo) {
  let score = Number(item.atualizadoEm || 0)
  if (item.cliente?.nome) score += 10
  if (item.numero) score += 10
  if ((item.itens || []).length > 0) score += 12
  if (item.link) score += 4
  if (item.status && item.status !== 'Pendente') score += 4
  return score
}

function deduplicarOrcamentosPorId(lista: OrcamentoSalvo[]) {
  const mapa = new Map<string, OrcamentoSalvo>()
  for (const item of lista) {
    if (!item?.id) continue
    const chave = String(item.id)
    const existente = mapa.get(chave)
    if (!existente || scoreOrcamento(item) >= scoreOrcamento(existente)) {
      mapa.set(chave, item)
    }
  }

  const porAssinatura = new Map<string, OrcamentoSalvo>()
  for (const item of mapa.values()) {
    const assinatura = assinaturaOrcamento(item)
    const existente = porAssinatura.get(assinatura)
    if (!existente || scoreOrcamento(item) >= scoreOrcamento(existente)) {
      porAssinatura.set(assinatura, item)
    }
  }

  return Array.from(porAssinatura.values()).sort((a, b) => Number(b.id) - Number(a.id))
}

function logOrcamentoSave(payload: Record<string, unknown>) {
  console.log('[ORCAMENTO_SAVE]', { ...payload, timestamp: new Date().toISOString() })
}

function chaveOrcamentosDeleted(userId?: string | null) {
  return `${ORCAMENTOS_DELETED_PREFIX}${userId || 'anon'}`
}

function lerDeletedOrcamentos(userId?: string | null) {
  try {
    const raw = localStorage.getItem(chaveOrcamentosDeleted(userId))
    const lista = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(lista.map((item) => String(item)))
  } catch {
    return new Set<string>()
  }
}

function salvarDeletedOrcamentos(ids: Set<string>, userId?: string | null) {
  try {
    localStorage.setItem(chaveOrcamentosDeleted(userId), JSON.stringify(Array.from(ids)))
  } catch {}
}

const NOVO_CLIENTE_INICIAL = {
  nome: '',
  telefone: '',
  email: '',
  endereco: '',
  cpf: '',
  cnpj: '',
  razaoSocial: '',
  nomeFantasia: '',
}

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://connect-sistema-teste.vercel.app').replace(/\/$/, '')
const PUBLIC_ORC_PREFIX = 'connect_public_orcamento_'

function toBase64Url(value: string) {
  const utf8 = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  )
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function logoPublicaCompactaOrcamento(valor: any) {
  const logo = String(valor || '').trim()

  if (!logo) return '/logo-connect.png'

  // Logo base64 enorme estoura o limite da URL do WhatsApp; link com token traz a logo depois.
  if (logo.startsWith('data:') && logo.length > 1200) return ''

  if (logo.startsWith('data:')) return logo

  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo
  if (logo.startsWith('/')) return logo

  return `/${logo}`
}

function normalizarCodigoBarras(valor: any) {
  return String(valor || '').replace(/\D/g, '').slice(0, 48)
}

function telefoneWhatsappBrasil(valor: any) {
  let numero = String(valor || '').replace(/\D/g, '')

  if (!numero) return ''

  // Se já veio com DDI 55, não duplica.
  if (numero.startsWith('55')) return numero

  return `55${numero}`
}


function baseUrlDocumentoPublico() {
  if (typeof window !== 'undefined') return window.location.origin
  return SITE_URL || 'https://appconnectpro.com.br'
}

function serializarCompactoOrcamento(dados: any, config: any) {
  const itens = Array.isArray(dados?.itens)
    ? dados.itens.filter((item: any) => item?.mostrarCliente !== false).map((item: any) => ({
        n: item?.nome || '',
        q: Number(item?.quantidade || 0),
        v: Number(item?.valor || 0),
        t: Number(item?.total || (Number(item?.quantidade || 0) * Number(item?.valor || 0))),
      }))
    : []

  return toBase64Url(JSON.stringify({
    i: Number(dados?.id || 0),
    n: String(dados?.numero || ''),
    ti: String(dados?.titulo || ''),
    d: String(dados?.data || ''),
    st: String(dados?.status || ''),
    cl: {
      n: String(dados?.cliente?.nome || ''),
      t: String(dados?.cliente?.telefone || ''),
      e: String(dados?.cliente?.email || ''),
      en: String(dados?.cliente?.endereco || ''),
    },
    it: itens,
    sb: Number(dados?.subtotal || 0),
    en: Number(dados?.entrega || 0),
    ds: Number(dados?.desconto || 0),
    tt: Number(dados?.total || 0),
    fp: String(dados?.formaPagamento || ''),
    fpl: Array.isArray(dados?.formasPagamentoLista) ? dados.formasPagamentoLista : undefined,
    opg: String(dados?.observacaoPagamento || ''),
    om2: Boolean(dados?.ocultarValorUnitarioM2),
    vd: String(dados?.validade || ''),
    pe: String(dados?.prazoEntrega || ''),
    eden: String(dados?.enderecoEntrega || ''),
    ob: String(dados?.observacao || ''),
    td: String(dados?.tipoDocumento || ''),
    tp: String(dados?.tituloProposta || ''),
    dp: String(dados?.descricaoProposta || ''),
    cp: String(dados?.condicoesPagamento || ''),
    vp: String(dados?.validadeProposta || dados?.validade || ''),
    op: String(dados?.observacoesProposta || ''),
    em: {
      n: String(config?.nomeEmpresa || 'CONNECT SISTEMAS'),
      l: logoPublicaCompactaOrcamento(config?.logoUrl),
      t: String(
        config?.celularEmpresa ||
          config?.celular ||
          config?.whatsappEmpresa ||
          config?.whatsapp ||
          config?.telefoneEmpresa ||
          config?.telefone ||
          ''
      ),
      e: String(config?.email || ''),
      en: String(config?.endereco || ''),
      c: String(config?.cidadeUf || ''),
    },
  }))
}

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

const MODELOS_PROPOSTA: Record<
  ModeloPropostaRapida,
  {
    titulo: string
    descricao: string
    servico: string
    prazo: string
    pagamento: string
    validade: string
    observacoes: string
  }
> = {
  servico: {
    titulo: 'Proposta de Serviços',
    descricao: 'Apresentamos proposta para execução de serviços conforme especificações acordadas.',
    servico: 'Prestação de serviço especializado',
    prazo: '5 a 10 dias úteis após aprovação',
    pagamento: '50% na aprovação e 50% na entrega',
    validade: '7 dias',
    observacoes: 'Garantia conforme combinado. Início após confirmação da proposta.',
  },
  produto: {
    titulo: 'Proposta de Produtos',
    descricao: 'Proposta comercial para fornecimento de produtos com especificação e entrega programada.',
    servico: 'Fornecimento de produtos',
    prazo: '3 a 7 dias úteis após aprovação',
    pagamento: 'PIX, cartão ou boleto conforme negociação',
    validade: '5 dias',
    observacoes: 'Valores sujeitos a disponibilidade de estoque no momento da aprovação.',
  },
  moveis: {
    titulo: 'Proposta de Móveis Planejados',
    descricao: 'Projeto, fabricação e instalação de móveis planejados sob medida para o ambiente do cliente.',
    servico: 'Móveis planejados sob medida',
    prazo: '20 a 35 dias úteis após aprovação e medição',
    pagamento: 'Entrada na aprovação + saldo na entrega/instalação',
    validade: '10 dias',
    observacoes: 'Projeto técnico e medição final podem ajustar valores e prazos.',
  },
  assistencia: {
    titulo: 'Proposta de Assistência Técnica',
    descricao: 'Atendimento técnico especializado com diagnóstico, reparo e acompanhamento do equipamento.',
    servico: 'Assistência técnica',
    prazo: 'Atendimento em até 48h após aprovação',
    pagamento: 'À vista na aprovação ou conforme combinado',
    validade: '3 dias',
    observacoes: 'Peças não inclusas, salvo indicação expressa nesta proposta.',
  },
  grafica: {
    titulo: 'Proposta Gráfica / Papelaria',
    descricao: 'Produção gráfica personalizada para materiais impressos e comunicação visual.',
    servico: 'Serviços gráficos e papelaria',
    prazo: '2 a 5 dias úteis após aprovação da arte',
    pagamento: '50% na aprovação e 50% na retirada/entrega',
    validade: '5 dias',
    observacoes: 'Alterações de arte após aprovação podem gerar custo adicional.',
  },
}

function isPropostaComercial(orc?: Partial<OrcamentoSalvo> | null) {
  return String(orc?.tipoDocumento || '').toLowerCase() === 'proposta_comercial'
}

function rotuloTipoDocumento(orc?: Partial<OrcamentoSalvo> | null) {
  return isPropostaComercial(orc) ? 'Proposta Comercial' : 'Orçamento Comercial'
}

function textoIntroWhatsapp(orc?: Partial<OrcamentoSalvo> | null) {
  return isPropostaComercial(orc) ? 'Segue sua proposta comercial' : 'Segue seu orçamento'
}

function parseValorMoedaInput(valor: string) {
  const normalizado = String(valor || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}

function formatarDecimalVisual(valor?: number) {
  if (valor === undefined || valor === null) return ''
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatarPesoKgVisual(valor?: number) {
  if (valor === undefined || valor === null) return ''
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  })
}

function formatarPesoCampo(valor?: number) {
  if (valor === undefined || valor === null || Number(valor) <= 0) return ''
  const kg = Number(valor)
  const gramas = Math.round(kg * 1000)
  if (gramas < 1000) return String(gramas)
  return formatarPesoKgVisual(kg)
}

function textoPesoParaKg(valor: string) {
  const texto = String(valor || '').trim()
  if (!texto) return 0

  const temSeparador = texto.includes(',') || texto.includes('.')

  if (temSeparador) {
    const normalizado = texto.replace(/\./g, '').replace(',', '.')
    const numero = Number(normalizado)
    return Number.isFinite(numero) ? numero : 0
  }

  const somenteDigitos = texto.replace(/\D/g, '')
  if (!somenteDigitos) return 0

  const gramas = Number(somenteDigitos)
  return Number.isFinite(gramas) ? gramas / 1000 : 0
}

function tratarPesoInput(valor: string) {
  let limpo = String(valor || '').replace(/[^\d,.-]/g, '')
  limpo = limpo.replace(/\./g, ',').replace(/-/g, '')

  const partes = limpo.split(',')
  if (partes.length > 2) {
    limpo = `${partes[0]},${partes.slice(1).join('')}`
  }

  if (limpo.includes(',')) {
    const [inteiro, decimal = ''] = limpo.split(',')
    limpo = `${inteiro},${decimal.slice(0, 3)}`
  }

  return limpo
}

function aplicarMascaraDecimal(valor: string) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '')
  if (!somenteDigitos) return ''

  const inteiro = somenteDigitos.slice(0, -2) || '0'
  const decimal = somenteDigitos.slice(-2).padStart(2, '0')
  const numero = Number(`${inteiro}.${decimal}`)

  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function textoParaNumeroDecimal(valor: string) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '')
  if (!somenteDigitos) return 0
  return Number(somenteDigitos) / 100
}


function textoDecimalLivreParaNumero(valor: string) {
  const texto = String(valor || '').trim()
  if (!texto) return 0
  const normalizado = texto.replace(/\./g, '').replace(',', '.')
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}

function calcularMetragem(largura?: number, altura?: number) {
  return Number((Number(largura || 0) * Number(altura || 0)).toFixed(4))
}


function calcularTotalItem(item: ItemOrcamento) {
  if (item.tipoCalculo === 'm2') {
    const metragem = Number(item.metragem || calcularMetragem(item.largura, item.altura))
    const valorM2 = Number(item.valorM2 ?? item.valor ?? 0)
    return metragem * valorM2
  }

  return Number(item.quantidade || 0) * Number(item.valor || 0)
}

function extrairDiasBoleto(parcelas: string) {
  const dias = String(parcelas || '').match(/\d+/g) || []
  return dias.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
}

function montarTextoBoleto(parcelas: string) {
  const dias = extrairDiasBoleto(parcelas)
  if (!dias.length) return ''
  return `Boletos com vencimento em ${dias.map((dia) => `${dia} dias`).join(', ')}.`
}

function pagamentoOrcamentoTexto(formas: string[], observacao: string, parcelas?: string) {
  return montarFormasPagamentoOrcamento(formas, observacao, parcelas)
}

function montarFormaPagamentoFinal(base: string, parcelasBoleto?: string) {
  const forma = String(base || '').trim()
  if (!forma.toLowerCase().includes('boleto')) return forma
  const extra = String(parcelasBoleto || '').trim()
  return extra ? `${forma} • ${extra}` : forma
}

function normalizarStatus(status?: string): StatusOrcamento {
  if (status === 'Aprovado' || status === 'Convertido' || status === 'Cancelado') return status
  return 'Pendente'
}

type FonteStatusOrcamento = {
  status?: string
  aprovado?: boolean
  aprovadoEm?: string
  aprovacaoDigital?: OrcamentoSalvo['aprovacaoDigital']
}

function fonteStatusDeOrcamento(orc?: Partial<OrcamentoSalvo> | null): FonteStatusOrcamento | null {
  if (!orc) return null
  return {
    status: orc.status,
    aprovado: orc.aprovado,
    aprovadoEm: orc.aprovadoEm,
    aprovacaoDigital: orc.aprovacaoDigital,
  }
}

function fonteStatusDePublico(publico?: Record<string, unknown> | null): FonteStatusOrcamento | null {
  if (!publico || typeof publico !== 'object') return null
  const aprovacaoDigital = publico.aprovacaoDigital as OrcamentoSalvo['aprovacaoDigital']
  return {
    status: String(publico.status || ''),
    aprovado:
      publico.aprovado === true ||
      aprovacaoDigital?.status === 'aprovado' ||
      String(publico.status || '').toLowerCase().includes('aprov'),
    aprovadoEm: String(publico.aprovadoEm || aprovacaoDigital?.data || ''),
    aprovacaoDigital,
  }
}

function fonteStatusDeRow(row: OrcamentoRow): FonteStatusOrcamento {
  const payload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Partial<OrcamentoSalvo>)
      : null

  return {
    status: payload?.status || row.status,
    aprovado: row.aprovado === true || payload?.aprovado === true,
    aprovadoEm: payload?.aprovadoEm,
    aprovacaoDigital: payload?.aprovacaoDigital,
  }
}

function statusFonteAprovado(fonte?: FonteStatusOrcamento | null): boolean {
  if (!fonte) return false
  if (fonte.aprovado === true) return true
  const st = String(fonte.status || '').toLowerCase()
  return st.includes('aprov') || st === 'convertido'
}

function statusFonteCancelado(fonte?: FonteStatusOrcamento | null): boolean {
  if (!fonte) return false
  if (fonte.aprovacaoDigital?.status === 'recusado') return true
  const st = String(fonte.status || '').toLowerCase()
  return st.includes('cancel') || st.includes('recus')
}

function statusFonteConvertido(fonte?: FonteStatusOrcamento | null): boolean {
  if (!fonte) return false
  return normalizarStatus(fonte.status) === 'Convertido'
}

/** Aprovado é sticky: se qualquer fonte indicar aprovado, nunca volta para Pendente. */
function resolverStatusOrcamento(
  local?: FonteStatusOrcamento | null,
  remoto?: FonteStatusOrcamento | null,
  publico?: FonteStatusOrcamento | null,
): Pick<OrcamentoSalvo, 'status' | 'aprovado' | 'aprovadoEm' | 'aprovacaoDigital'> {
  if (publico?.aprovacaoDigital?.status === 'recusado' || statusFonteCancelado(publico)) {
    return {
      status: 'Cancelado',
      aprovado: false,
      aprovadoEm: publico?.aprovadoEm,
      aprovacaoDigital: publico?.aprovacaoDigital,
    }
  }

  const convertido =
    statusFonteConvertido(publico) ||
    statusFonteConvertido(remoto) ||
    statusFonteConvertido(local)

  const aprovadoPublico = statusFonteAprovado(publico) || publico?.aprovacaoDigital?.status === 'aprovado'
  const aprovadoRemoto = statusFonteAprovado(remoto)
  const aprovadoLocal = statusFonteAprovado(local)

  if (aprovadoPublico) {
    return {
      status: convertido ? 'Convertido' : 'Aprovado',
      aprovado: true,
      aprovadoEm: publico?.aprovadoEm || publico?.aprovacaoDigital?.data,
      aprovacaoDigital: publico?.aprovacaoDigital,
    }
  }

  if (aprovadoRemoto) {
    return {
      status: convertido ? 'Convertido' : 'Aprovado',
      aprovado: true,
      aprovadoEm: remoto?.aprovadoEm || local?.aprovadoEm,
      aprovacaoDigital: remoto?.aprovacaoDigital || local?.aprovacaoDigital || publico?.aprovacaoDigital,
    }
  }

  if (aprovadoLocal) {
    return {
      status: convertido || statusFonteConvertido(local) ? 'Convertido' : 'Aprovado',
      aprovado: true,
      aprovadoEm: local?.aprovadoEm || remoto?.aprovadoEm,
      aprovacaoDigital: local?.aprovacaoDigital || remoto?.aprovacaoDigital || publico?.aprovacaoDigital,
    }
  }

  if (convertido) {
    return {
      status: 'Convertido',
      aprovado: true,
      aprovadoEm: publico?.aprovadoEm || remoto?.aprovadoEm || local?.aprovadoEm,
      aprovacaoDigital: publico?.aprovacaoDigital || remoto?.aprovacaoDigital || local?.aprovacaoDigital,
    }
  }

  if (statusFonteCancelado(remoto) || statusFonteCancelado(local)) {
    return {
      status: 'Cancelado',
      aprovado: false,
      aprovadoEm: remoto?.aprovadoEm || local?.aprovadoEm,
      aprovacaoDigital: remoto?.aprovacaoDigital || local?.aprovacaoDigital,
    }
  }

  const statusCandidato =
    (publico?.status && normalizarStatus(publico.status) !== 'Pendente' && publico.status) ||
    (remoto?.status && normalizarStatus(remoto.status) !== 'Pendente' && remoto.status) ||
    local?.status

  return {
    status: normalizarStatus(statusCandidato),
    aprovado: false,
    aprovadoEm: undefined,
    aprovacaoDigital: publico?.aprovacaoDigital || local?.aprovacaoDigital || remoto?.aprovacaoDigital,
  }
}

function aplicarStatusResolvido(
  orcamento: OrcamentoSalvo,
  local?: OrcamentoSalvo | null,
  publico?: Record<string, unknown> | null,
): OrcamentoSalvo {
  const resolvido = resolverStatusOrcamento(
    fonteStatusDeOrcamento(local || orcamento),
    fonteStatusDeOrcamento(orcamento),
    fonteStatusDePublico(publico),
  )

  return {
    ...orcamento,
    status: resolvido.status,
    aprovado: resolvido.aprovado,
    aprovadoEm: resolvido.aprovadoEm || orcamento.aprovadoEm,
    aprovacaoDigital: resolvido.aprovacaoDigital || orcamento.aprovacaoDigital,
  }
}

function mesclarParOrcamentos(remoto: OrcamentoSalvo, local: OrcamentoSalvo): OrcamentoSalvo {
  const resolvido = resolverStatusOrcamento(
    fonteStatusDeOrcamento(local),
    fonteStatusDeOrcamento(remoto),
    null,
  )
  const maisRecente =
    Number(local.atualizadoEm || 0) >= Number(remoto.atualizadoEm || 0) ? local : remoto

  return {
    ...remoto,
    ...maisRecente,
    id: local.id || remoto.id,
    status: resolvido.status,
    aprovado: resolvido.aprovado,
    aprovadoEm: resolvido.aprovadoEm || maisRecente.aprovadoEm || local.aprovadoEm || remoto.aprovadoEm,
    aprovacaoDigital:
      resolvido.aprovacaoDigital ||
      maisRecente.aprovacaoDigital ||
      local.aprovacaoDigital ||
      remoto.aprovacaoDigital,
    osGeradaId: maisRecente.osGeradaId || local.osGeradaId || remoto.osGeradaId,
    osGeradaEm: maisRecente.osGeradaEm || local.osGeradaEm || remoto.osGeradaEm,
  }
}

type OrcamentoRow = {
  user_id?: string
  local_id?: string
  cliente_nome?: string
  cliente_telefone?: string
  cliente_email?: string
  cliente_endereco?: string
  itens?: ItemOrcamento[]
  subtotal?: number
  desconto?: number
  total?: number
  observacoes?: string
  status?: string
  aprovado?: boolean
  data?: string
  validade?: string
  prazo_entrega?: string
  forma_pagamento?: string
  payload?: Partial<OrcamentoSalvo> | Record<string, unknown>
}

type OrcamentoSupabaseUpsert = {
  user_id: string
  local_id: string
  aprovado: boolean
  payload: Record<string, unknown>
}

function serializarPayloadOrcamento(orcamento: OrcamentoSalvo): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(orcamento)) as Record<string, unknown>
  } catch {
    return { ...orcamento } as unknown as Record<string, unknown>
  }
}

function orcamentoParaUpsertSupabase(orc: OrcamentoSalvo, userId: string): OrcamentoSupabaseUpsert {
  const orcNormalizado = aplicarStatusResolvido(orc)
  const status = normalizarStatus(orcNormalizado.status)

  return {
    user_id: userId,
    local_id: String(orc.id),
    aprovado: status === 'Aprovado' || status === 'Convertido' || orcNormalizado.aprovado === true,
    payload: serializarPayloadOrcamento(orcNormalizado),
  }
}

function orcamentoDeRowSupabase(row: OrcamentoRow, local?: OrcamentoSalvo | null): OrcamentoSalvo {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload as Partial<OrcamentoSalvo> : null
  const fallbackSeed = JSON.stringify({
    numero: payload?.numero || '',
    cliente: row.cliente_nome || '',
    total: row.total || payload?.total || 0,
    data: row.data || payload?.data || '',
  })
  const localId = Number(row.local_id || payload?.id || 0) || idDeterministicoOrcamento(fallbackSeed)

  if (payload?.numero) {
    return aplicarStatusResolvido(
      {
        ...(payload as OrcamentoSalvo),
        id: localId,
        status: normalizarStatus(payload.status || row.status),
      },
      local,
    )
  }

  const clienteNome = String(row.cliente_nome || '').trim()
  const clienteTel = String(row.cliente_telefone || '').trim()

  return aplicarStatusResolvido(
    {
      id: localId,
      numero: String(payload?.numero || localId),
      titulo: 'Orçamento Comercial',
      cliente: clienteNome
        ? {
            id: localId,
            nome: clienteNome,
            telefone: clienteTel,
            email: String(row.cliente_email || ''),
            endereco: String(row.cliente_endereco || ''),
          }
        : null,
      itens: Array.isArray(row.itens) ? row.itens : [],
      subtotal: Number(row.subtotal || 0),
      entrega: 0,
      desconto: Number(row.desconto || 0),
      total: Number(row.total || 0),
      formaPagamento: String(row.forma_pagamento || 'PIX'),
      validade: String(row.validade || ''),
      prazoEntrega: String(row.prazo_entrega || ''),
      observacao: String(row.observacoes || ''),
      status: normalizarStatus(row.status),
      data: String(row.data || new Date().toLocaleDateString('pt-BR')),
      link: '',
    },
    local,
  )
}

function osAprovadoPorStatus(status?: string) {
  const valor = String(status || '').toLowerCase()
  return valor.includes('aprov') || valor === 'finalizada' || valor === 'entregue'
}

function serializarPayloadOS(os: OrdemServicoGerada): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(os)) as Record<string, unknown>
  } catch {
    return { ...os } as unknown as Record<string, unknown>
  }
}

function osParaRowSupabase(os: OrdemServicoGerada, userId: string): OsSupabaseRow {
  const status = String(os.status || 'Aberta')

  return {
    user_id: userId,
    local_id: String(os.id),
    numero: String(os.numero || ''),
    cliente: String(os.cliente || '').trim(),
    telefone: String(os.telefone || os.whatsapp || '').trim(),
    equipamento: String(os.equipamento || ''),
    status,
    prioridade: String(os.prioridade || 'Média'),
    valor: Number(os.valor || 0),
    entrada: Number(os.entrada || 0),
    saldo: Number(os.saldo || 0),
    aprovado: osAprovadoPorStatus(status),
    payload: serializarPayloadOS(os),
  }
}

export default function OrcamentoPage() {
  const router = useRouter()
  const clientesMock: Cliente[] = [
    { id: 1, nome: 'ERIC DAMASCENO', telefone: '84992181399', email: 'lojaconnect@hotmail.com', endereco: 'GILBERTO ROBERTO GOMES,243' },
    { id: 2, nome: 'MARIA SOUZA', telefone: '84999998888', email: 'maria@email.com', endereco: 'RUA DAS FLORES,120' },
  ]

  const produtosMock: Produto[] = [
    { id: 101, nome: 'SERVIÇO TÉCNICO', valor: 120, tipoCadastro: 'servico', tipoCalculo: 'unidade' },
    { id: 1, nome: 'FORMATAÇÃO PC', valor: 100 },
    { id: 2, nome: 'TROCA DE TELA', valor: 250 },
    { id: 3, nome: 'LIMPEZA TÉCNICA', valor: 80 },
    { id: 4, nome: 'FONTE PC 200W GOLDEN', valor: 129.9 },
  ]

  const [isMobile, setIsMobile] = useState(false)
  const [zapOrcCarregando, setZapOrcCarregando] = useState<number | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [darkMode, setDarkMode] = useState(false)

  const [config, setConfig] = useState<ConfiguracaoSistema>({
    nomeEmpresa: 'LOJA CONNECT',
    telefone: '84992181399',
    email: 'lojaconnect@hotmail.com',
    endereco: 'GILBERTO ROBERTO GOMES,243',
    cidadeUf: 'PARNAMIRIM-RN',
    responsavel: 'ERES FAUSTINO',
    tituloPdf: 'Orçamento Comercial',
    rodapePdf: OBSERVACAO_PADRAO_ORCAMENTO,
    validadePadrao: '7 dias',
    prazoEntregaPadrao: '3 dias',
    formaPagamentoPadrao: 'CARTAO 1X',
    corPrimaria: '#111827',
    corSecundaria: '#1d4ed8',
    corTabela: '#f3f4f6',
    mostrarQuantidade: true,
    logoUrl: '/logo-connect.png',
  })

  const [formasPagamento, setFormasPagamento] = useState<string[]>(['PIX', 'DINHEIRO', 'CARTAO 1X'])
  const [clientes, setClientes] = useState<Cliente[]>(clientesMock)
  const [produtos, setProdutos] = useState<Produto[]>(produtosMock)

  const [clienteBusca, setClienteBusca] = useState('')
  const [produtoBusca, setProdutoBusca] = useState('')
  const [codigoBarrasBusca, setCodigoBarrasBusca] = useState('')
  const [modoBalcaoTurbo, setModoBalcaoTurbo] = useState(false)
  const [ultimoBipado, setUltimoBipado] = useState('')
  const [ultimosBipados, setUltimosBipados] = useState<string[]>([])
  const [feedbackBalcao, setFeedbackBalcao] = useState<{ tipo: 'ok' | 'erro'; texto: string; detalhe?: string } | null>(null)
  const inputBipagemRef = useRef<HTMLInputElement | null>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<number | null>(null)
  const [quantidade, setQuantidade] = useState(1)
  const [pesoInput, setPesoInput] = useState('')

  const [modoItem, setModoItem] = useState<TipoCadastroProduto>('produto')
  const [filtroItem, setFiltroItem] = useState<'produto' | 'servico' | 'peso' | 'm2'>('produto')
  const [larguraItem, setLarguraItem] = useState(0)
  const [alturaItem, setAlturaItem] = useState(0)

  const [itens, setItens] = useState<ItemOrcamento[]>([])
  const [tituloPdf, setTituloPdf] = useState('Orçamento Comercial')
  const [observacao, setObservacao] = useState(OBSERVACAO_PADRAO_ORCAMENTO)
  const [modeloOrcamento, setModeloOrcamento] = useState<ModeloOrcamento>('recibo_profissional')
  const [mostrarEscolhaModelo, setMostrarEscolhaModelo] = useState(false)
  const [formAberto, setFormAberto] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState('PIX')
  const [formasPagamentoSelecionadas, setFormasPagamentoSelecionadas] = useState<string[]>(['Pix'])
  const [ocultarValorUnitarioM2, setOcultarValorUnitarioM2] = useState(true)
  const [parcelasBoleto, setParcelasBoleto] = useState('')
  const [validade, setValidade] = useState('')

  useEffect(() => {
    if (itens.some((item) => item.tipoCalculo === 'm2')) {
      setOcultarValorUnitarioM2(true)
    }
  }, [itens])
  const [prazoEntrega, setPrazoEntrega] = useState('')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [valorEntrega, setValorEntrega] = useState(0)
  const [descontoTipo, setDescontoTipo] = useState<'valor' | 'percentual'>('valor')
  const [descontoInput, setDescontoInput] = useState('')
  const [mostrarBuscaCliente, setMostrarBuscaCliente] = useState(false)
  const [mostrarBuscaProduto, setMostrarBuscaProduto] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [orcamentosSalvos, setOrcamentosSalvos] = useState<OrcamentoSalvo[]>([])
  const [editandoOrcamentoId, setEditandoOrcamentoId] = useState<number | null>(null)
  const [orcamentoMenuAberto, setOrcamentoMenuAberto] = useState<OrcamentoSalvo | null>(null)
  const syncAprovacaoPublicaRodandoRef = useRef(false)
  const ultimaSyncAprovacaoPublicaRef = useRef(0)
  const osAprovacaoRodandoRef = useRef(false)
  const osAprovacaoCriadasRef = useRef<Set<string>>(new Set())
  const syncOrcamentosRodandoRef = useRef(false)
  const syncOrcamentosPendenteRef = useRef(false)
  const userIdOrcamentosRef = useRef<string | null>(null)
  const ultimaCargaOrcamentosRef = useRef(0)
  const orcamentosCountRef = useRef(0)
  const salvandoRef = useRef(false)
  const rascunhoOrcamentoIdRef = useRef<number | null>(null)
  const [salvandoOrcamento, setSalvandoOrcamento] = useState(false)

  const [mostrarNovoCliente, setMostrarNovoCliente] = useState(false)
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaCliente>('PF')
  const [novoCliente, setNovoCliente] = useState({
    ...NOVO_CLIENTE_INICIAL,
  })

  const [modalPropostaAberto, setModalPropostaAberto] = useState(false)
  const [modeloPropostaRapida, setModeloPropostaRapida] = useState<ModeloPropostaRapida>('servico')
  const [propostaClienteBusca, setPropostaClienteBusca] = useState('')
  const [propostaCliente, setPropostaCliente] = useState<Cliente | null>(null)
  const [propostaTitulo, setPropostaTitulo] = useState('')
  const [propostaDescricao, setPropostaDescricao] = useState('')
  const [propostaServicoPrincipal, setPropostaServicoPrincipal] = useState('')
  const [propostaValorTotal, setPropostaValorTotal] = useState('')
  const [propostaPrazoEntrega, setPropostaPrazoEntrega] = useState('')
  const [propostaCondicoesPagamento, setPropostaCondicoesPagamento] = useState('')
  const [propostaValidade, setPropostaValidade] = useState('')
  const [propostaObservacoes, setPropostaObservacoes] = useState('')

  function obterIdOrcamentoAtivo(origem: string) {
    if (editandoOrcamentoId !== null) return editandoOrcamentoId
    if (rascunhoOrcamentoIdRef.current === null) {
      rascunhoOrcamentoIdRef.current = gerarIdOrcamentoUnico()
      logOrcamentoSave({ origem: `${origem}:rascunho-novo`, id: rascunhoOrcamentoIdRef.current, numero: null })
    }
    return rascunhoOrcamentoIdRef.current
  }

  function upsertOrcamentoNaLista(orcamento: OrcamentoSalvo, origem: string) {
    const idx = orcamentosSalvos.findIndex((item) => String(item.id) === String(orcamento.id))
    const listaAtualizada =
      idx >= 0
        ? orcamentosSalvos.map((item) => (String(item.id) === String(orcamento.id) ? orcamento : item))
        : [orcamento, ...orcamentosSalvos]
    logOrcamentoSave({
      origem,
      id: orcamento.id,
      numero: orcamento.numero,
      acao: idx >= 0 ? 'update-lista' : 'insert-lista',
      totalLista: listaAtualizada.length,
    })
    salvarListaOrcamentos(listaAtualizada)
    return listaAtualizada
  }

  function carregarOrcamentosLocalFallback() {
    try {
      const salvos = localStorage.getItem(ORCAMENTOS_KEY)
      if (salvos) {
        const lista = JSON.parse(salvos)
        if (Array.isArray(lista)) {
          const deletedIds = lerDeletedOrcamentos(userIdOrcamentosRef.current)
          setOrcamentosSalvos(
            deduplicarOrcamentosPorId(
              lista
                .map((item) => ({ ...item, status: normalizarStatus(item.status) }))
                .filter((item) => !deletedIds.has(String(item?.id || '')))
            )
          )
        }
      }
    } catch {}
  }

  function lerOrcamentosLocalStorage() {
    try {
      const salvos = localStorage.getItem(ORCAMENTOS_KEY)
      const lista = salvos ? JSON.parse(salvos) : []
      if (!Array.isArray(lista)) return [] as OrcamentoSalvo[]
      const deletedIds = lerDeletedOrcamentos(userIdOrcamentosRef.current)
      const normalizados = lista
        .map((item) => ({ ...item, status: normalizarStatus(item.status) }))
        .filter((item) => !deletedIds.has(String(item?.id || ''))) as OrcamentoSalvo[]
      return deduplicarOrcamentosPorId(normalizados)
    } catch (error) {
      console.error('[orcamentos] erro ao ler localStorage:', error)
      return [] as OrcamentoSalvo[]
    }
  }

  function marcarOrcamentoComoDeletado(id: number, userId?: string | null) {
    const deletedIds = lerDeletedOrcamentos(userId)
    deletedIds.add(String(id))
    salvarDeletedOrcamentos(deletedIds, userId)
  }

  function removerOrcamentoDeDeleted(id: number, userId?: string | null) {
    const deletedIds = lerDeletedOrcamentos(userId)
    if (deletedIds.delete(String(id))) {
      salvarDeletedOrcamentos(deletedIds, userId)
    }
  }

  function mesclarOrcamentos(cloud: OrcamentoSalvo[], local: OrcamentoSalvo[], userId?: string | null) {
    const deletedIds = lerDeletedOrcamentos(userId)
    const mapaCloud = new Map<string, OrcamentoSalvo>()
    const mapaLocal = new Map<string, OrcamentoSalvo>()

    for (const item of cloud) {
      if (!item?.id) continue
      const chave = String(item.id)
      if (deletedIds.has(chave)) continue
      mapaCloud.set(chave, item)
    }
    for (const item of local) {
      if (!item?.id) continue
      const chave = String(item.id)
      if (deletedIds.has(chave)) continue
      mapaLocal.set(chave, item)
    }

    const ids = new Set([...mapaCloud.keys(), ...mapaLocal.keys()])
    return deduplicarOrcamentosPorId(
      Array.from(ids)
      .map((id) => {
        const remoto = mapaCloud.get(id)
        const itemLocal = mapaLocal.get(id)
        if (remoto && itemLocal) return mesclarParOrcamentos(remoto, itemLocal)
        return aplicarStatusResolvido((remoto || itemLocal) as OrcamentoSalvo, itemLocal || null)
      })
      .sort((a, b) => Number(b.id) - Number(a.id))
    )
  }

  function aplicarOrcamentos(lista: OrcamentoSalvo[], contexto: string) {
    const userId = userIdOrcamentosRef.current
    const deletedIds = lerDeletedOrcamentos(userId)
    const locais = lerOrcamentosLocalStorage()
      .map((item) => aplicarStatusResolvido(item))
      .filter((item) => !deletedIds.has(String(item.id)))
    if (lista.length === 0 && locais.length > 0) {
      console.warn('[orcamentos] Supabase retornou vazio, mantendo cache local.', {
        contexto,
        locais: locais.length,
        idsLocais: locais.map((item) => item.id).slice(0, 8),
      })
      setOrcamentosSalvos(locais)
      try {
        localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(locais))
      } catch (error) {
        console.error('[orcamentos] erro ao salvar cache local:', { contexto, error })
      }
      return false
    }

    const listaNormalizada = mesclarOrcamentos(
      lista.filter((item) => !deletedIds.has(String(item?.id || ''))),
      locais,
      userId,
    )
    setOrcamentosSalvos(listaNormalizada)
    try {
      localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(listaNormalizada))
    } catch (error) {
      console.error('[orcamentos] erro ao salvar cache local:', { contexto, error })
    }
    return true
  }

  function isMobileOrcamentos() {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 900 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  }

  function aguardarOrcamentos(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  function origemDispositivoOrcamentos() {
    return isMobileOrcamentos() ? 'mobile' : 'PC'
  }

  async function obterAuthOrcamentos(maxTentativas = 6) {
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionData?.session?.user?.id) {
        const auth = {
          userId: sessionData.session.user.id,
          email: sessionData.session.user.email || '',
        }
        userIdOrcamentosRef.current = auth.userId
        return auth
      }
      if (sessionError) console.error('[Orcamentos] getSession falhou:', sessionError.message)

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userData?.user?.id) {
        const auth = {
          userId: userData.user.id,
          email: userData.user.email || '',
        }
        userIdOrcamentosRef.current = auth.userId
        return auth
      }
      if (userError) console.error('[Orcamentos] getUser falhou:', userError.message)

      if (tentativa < maxTentativas) {
        await aguardarOrcamentos(220 + tentativa * 120)
      }
    }

    return null
  }

  async function obterUserIdOrcamentos(maxTentativas = 6) {
    return (await obterAuthOrcamentos(maxTentativas))?.userId || null
  }

  async function carregarOrcamentosSupabase(motivo = 'manual') {
    if (syncOrcamentosRodandoRef.current) {
      syncOrcamentosPendenteRef.current = true
      return
    }
    syncOrcamentosRodandoRef.current = true
    try {
      const mobile = isMobileOrcamentos()
      const locaisAntes = lerOrcamentosLocalStorage()

      const auth = await obterAuthOrcamentos(mobile ? 8 : 5)
      const userId = auth?.userId || null
      if (!userId) {
        console.error('[Orcamentos] carregar abortado: user_id ausente.')
        carregarOrcamentosLocalFallback()
        return
      }
      userIdOrcamentosRef.current = userId

      const locais = locaisAntes.length ? locaisAntes : lerOrcamentosLocalStorage()
      const deletedIds = lerDeletedOrcamentos(userId)

      const { data, error } = await supabase
        .from('orcamentos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const normalizados = ((data || []) as OrcamentoRow[]).map((row) => {
        const localId = String(row.local_id || (row.payload as Partial<OrcamentoSalvo> | undefined)?.id || '')
        const itemLocal = locais.find((item) => String(item.id) === localId)
        return orcamentoDeRowSupabase(row, itemLocal)
      }).filter((item) => !deletedIds.has(String(item?.id || '')))

      if (normalizados.length === 0 && locais.length > 0) {
        console.warn('[Orcamentos] Supabase retornou lista vazia. Tentando subir cache local antes de exibir.')
        for (const orcamento of locais) {
          await persistirOrcamentoSupabase(orcamento, userId)
        }
        aplicarOrcamentos(locais, 'carregar-vazio-com-cache')
        return
      }

      const listaFinal = mesclarOrcamentos(normalizados, locais, userId)
      aplicarOrcamentos(listaFinal, 'carregarOrcamentosSupabase')
      ultimaCargaOrcamentosRef.current = Date.now()
    } catch (error) {
      console.error('[Orcamentos] erro ao carregar do Supabase:', error)
      carregarOrcamentosLocalFallback()
    } finally {
      syncOrcamentosRodandoRef.current = false
      if (syncOrcamentosPendenteRef.current) {
        syncOrcamentosPendenteRef.current = false
        window.setTimeout(() => void carregarOrcamentosSupabase('sync-pendente'), 350)
      }
    }
  }

  async function persistirOrcamentoSupabase(orcamento: OrcamentoSalvo, userIdParam?: string | null) {
    try {
      const auth = userIdParam ? null : await obterAuthOrcamentos()
      const userId = userIdParam || auth?.userId || null
      if (!userId) {
        console.error('[Orcamentos] persistir abortado: user_id ausente.', {
          origem: origemDispositivoOrcamentos(),
          local_id: String(orcamento.id),
          quantidadeEnviada: 1,
          tabela: 'orcamentos',
          onConflict: 'user_id,local_id',
        })
        return false
      }

      const row = orcamentoParaUpsertSupabase(orcamento, userId)
      removerOrcamentoDeDeleted(Number(orcamento.id), userId)

      const { data: existente } = await supabase
        .from('orcamentos')
        .select('local_id')
        .eq('user_id', userId)
        .eq('local_id', row.local_id)
        .maybeSingle()

      logOrcamentoSave({
        origem: 'supabase-upsert',
        id: row.local_id,
        numero: orcamento.numero,
        jaExistia: Boolean(existente?.local_id),
      })

      const { data, error } = await supabase
        .from('orcamentos')
        .upsert(row, { onConflict: 'user_id,local_id' })
        .select('local_id,payload')

      if (error) {
        const err = error as { code?: string; message?: string; details?: string; hint?: string }
        console.error('[Orcamentos] UPSERT public.orcamentos falhou:', {
          origem: origemDispositivoOrcamentos(),
          user_id: row.user_id,
          email: auth?.email || '(userIdParam)',
          local_id: row.local_id,
          quantidadeEnviada: 1,
          objetoEnviado: row,
          tabela: 'orcamentos',
          onConflict: 'user_id,local_id',
          'error.code': err.code ?? '(sem code)',
          'error.message': err.message ?? '(sem message)',
          'error.details': err.details ?? '(sem details)',
          'error.hint': err.hint ?? '(sem hint)',
          errorCompleto: error,
        })
        return false
      }

      return true
    } catch (e) {
      console.error('[Orcamentos] exceção ao persistir:', {
        origem: origemDispositivoOrcamentos(),
        user_id: userIdParam || null,
        local_id: String(orcamento.id),
        quantidadeEnviada: 1,
        objetoEnviado: userIdParam ? orcamentoParaUpsertSupabase(orcamento, userIdParam) : orcamento,
        tabela: 'orcamentos',
        onConflict: 'user_id,local_id',
        errorCompleto: e,
      })
      return false
    }
  }

  async function obterUserIdPainel() {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData?.session?.user?.id) return sessionData.session.user.id

    const { data: userData } = await supabase.auth.getUser()
    return userData?.user?.id || null
  }

  function lerOrdensServicoLocais(): OrdemServicoGerada[] {
    try {
      const raw = localStorage.getItem(OS_KEY)
      const lista = raw ? JSON.parse(raw) : []
      return Array.isArray(lista) ? lista : []
    } catch (error) {
      console.error('[orcamentos] erro ao ler OS locais:', error)
      return []
    }
  }

  function proximoNumeroOS(ordens: OrdemServicoGerada[]) {
    const numeros = ordens.map((o) => Number(o.numero)).filter((n) => !Number.isNaN(n))
    const maior = numeros.length ? Math.max(...numeros) : 0
    return String(maior + 1).padStart(4, '0')
  }

  function montarOSDeOrcamentoAprovado(orc: OrcamentoSalvo, ordens: OrdemServicoGerada[]): OrdemServicoGerada {
    const novoId = Date.now()
    const hoje = new Date().toLocaleDateString('pt-BR')

    return {
      id: novoId,
      numero: proximoNumeroOS(ordens),
      cliente: orc.cliente?.nome || '',
      telefone: orc.cliente?.telefone || '',
      whatsapp: orc.cliente?.telefone || '',
      email: orc.cliente?.email || '',
      endereco: orc.cliente?.endereco || '',
      equipamento: 'Serviço vindo do orçamento aprovado',
      marca: '',
      modelo: '',
      serial: '',
      defeito: orc.observacao || '',
      checklist: '',
      observacao: `Gerada automaticamente pela aprovação digital do orçamento ${orc.numero || orc.id}.`,
      valor: Number(orc.total || 0),
      entrada: 0,
      saldo: Number(orc.total || 0),
      status: 'Aberta',
      prioridade: 'Média',
      tecnico: '',
      previsao: '',
      data: hoje,
      ultimaAtualizacao: hoje,
      link: `${SITE_URL}/impressao-ordem-servico/${novoId}`,
      orcamentoId: orc.id,
      origem: 'aprovação digital',
    }
  }

  async function persistirOrdemServicoSupabase(os: OrdemServicoGerada, userId: string) {
    const row = osParaRowSupabase(os, userId)
    const { data, error } = await supabase
      .from('ordens_servico')
      .upsert(row, { onConflict: 'user_id,local_id' })
      .select('local_id,payload')

    if (error) {
      const err = error as { code?: string; message?: string; details?: string; hint?: string }
      console.error('[Orcamentos] erro Supabase ao criar OS automática:', {
        origem: origemDispositivoOrcamentos(),
        user_id: row.user_id,
        email: '(painel autenticado)',
        local_id: row.local_id,
        quantidadeEnviada: 1,
        objetoEnviado: row,
        tabela: 'ordens_servico',
        onConflict: 'user_id,local_id',
        'error.code': err.code ?? '(sem code)',
        'error.message': err.message ?? '(sem message)',
        'error.details': err.details ?? '(sem details)',
        'error.hint': err.hint ?? '(sem hint)',
        errorCompleto: error,
      })
      return false
    }

    return true
  }

  async function garantirOSParaOrcamentoAprovado(orc: OrcamentoSalvo): Promise<OrcamentoSalvo> {
    const chave = String(orc.id)
    if (osAprovacaoCriadasRef.current.has(chave) || orc.osGeradaId) return orc

    const userId = await obterUserIdPainel()
    if (!userId) {
      console.error('[orcamentos] aprovação recebida, mas sessão autenticada indisponível para criar OS.')
      return orc
    }

    const ordensLocais = lerOrdensServicoLocais()
    const localExistente = ordensLocais.find((os) => String(os.orcamentoId) === chave)
    if (localExistente) {
      osAprovacaoCriadasRef.current.add(chave)
      return { ...orc, osGeradaId: Number(localExistente.id), osGeradaEm: orc.osGeradaEm || new Date().toLocaleString('pt-BR') }
    }

    try {
      const { data: rows, error } = await supabase
        .from('ordens_servico')
        .select('local_id,numero,payload')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[orcamentos] erro ao consultar OS existentes antes de criar:', error)
      } else {
        const existente = ((rows || []) as Array<{ local_id?: string; payload?: Record<string, unknown> }>).find(
          (row) => String(row.payload?.orcamentoId || '') === chave
        )
        if (existente?.local_id) {
          osAprovacaoCriadasRef.current.add(chave)
          return { ...orc, osGeradaId: Number(existente.local_id), osGeradaEm: orc.osGeradaEm || new Date().toLocaleString('pt-BR') }
        }
      }

      const novaOS = montarOSDeOrcamentoAprovado(orc, ordensLocais)
      const ok = await persistirOrdemServicoSupabase(novaOS, userId)
      if (!ok) return orc

      localStorage.setItem(OS_KEY, JSON.stringify([novaOS, ...ordensLocais]))
      window.dispatchEvent(new Event('connect-data-change'))
      osAprovacaoCriadasRef.current.add(chave)

      const atualizado: OrcamentoSalvo = {
        ...orc,
        osGeradaId: novaOS.id,
        osGeradaEm: new Date().toLocaleString('pt-BR'),
      }
      await persistirOrcamentoSupabase(atualizado)
      return atualizado
    } catch (error) {
      console.error('[orcamentos] erro ao garantir OS automática:', error)
      return orc
    }
  }

  async function excluirOrcamentoSupabase(orcamento: OrcamentoSalvo) {
    try {
      const { data } = await supabase.auth.getUser()
      const userId = data?.user?.id
      if (!userId) return
      marcarOrcamentoComoDeletado(Number(orcamento.id), userId)

      const { error } = await supabase
        .from('orcamentos')
        .delete()
        .eq('user_id', userId)
        .eq('local_id', String(orcamento.id))

      if (error) console.warn('[orcamentos] erro ao excluir:', error.message)
    } catch (e) {
      console.warn('[orcamentos] erro ao excluir:', e)
    }
  }

  useEffect(() => {
    const verificar = () => setIsMobile(window.innerWidth <= 768)
    verificar()
    window.addEventListener('resize', verificar)
    return () => window.removeEventListener('resize', verificar)
  }, [])

  useEffect(() => {
    if (!modoBalcaoTurbo) return
    const timer = window.setTimeout(() => inputBipagemRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [modoBalcaoTurbo, itens.length])

  useEffect(() => {
    if (!feedbackBalcao) return
    const timer = window.setTimeout(() => setFeedbackBalcao(null), 950)
    return () => window.clearTimeout(timer)
  }, [feedbackBalcao])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const atualizar = () => {
      try {
        const salvo = localStorage.getItem('connect_theme')
        if (salvo === 'light') {
          setDarkMode(false)
          return
        }
        if (salvo === 'dark') {
          setDarkMode(true)
          return
        }
      } catch {}
      setDarkMode(media.matches)
    }

    atualizar()
    media.addEventListener?.('change', atualizar)
    window.addEventListener('connect-theme-change', atualizar as EventListener)
    return () => {
      media.removeEventListener?.('change', atualizar)
      window.removeEventListener('connect-theme-change', atualizar as EventListener)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    orcamentosCountRef.current = orcamentosSalvos.length
  }, [orcamentosSalvos.length])

  useEffect(() => {
    const salvoConfig = localStorage.getItem(CONFIG_KEY)
    if (salvoConfig) {
      try {
        const dados = JSON.parse(salvoConfig)
        setConfig((anterior) => ({ ...anterior, ...dados }))
        setTituloPdf(dados.tituloPdf || 'Orçamento Comercial')
        setObservacao(dados.rodapePdf || OBSERVACAO_PADRAO_ORCAMENTO)
        setFormaPagamento(dados.formaPagamentoPadrao || 'PIX')
        setValidade(resolverValidadePadraoOrcamento(dados.validadePadrao))
        setPrazoEntrega(dados.prazoEntregaPadrao || '')
      } catch {}
    }

    void buscarConfiguracao()
      .then((nuvem) => {
        setConfig((anterior) => ({
          ...anterior,
          ...nuvem,
          logoUrl: normalizarLogoEmpresaPublica(nuvem.logoUrl || anterior.logoUrl),
        }))
        setValidade((atual) => (editandoOrcamentoId === null ? resolverValidadePadraoOrcamento(nuvem.validadePadrao) : atual))
        setPrazoEntrega((atual) => (editandoOrcamentoId === null ? (nuvem.prazoEntregaPadrao ?? '') : atual))
      })
      .catch(() => {})

    const salvoFormas = localStorage.getItem(FORMAS_KEY)
    if (salvoFormas) {
      try {
        const lista = JSON.parse(salvoFormas)
        if (Array.isArray(lista) && lista.length > 0) {
          const normalizadas = lista
            .map((item) => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && 'nome' in item) return String(item.nome)
              return ''
            })
            .filter(Boolean)

          const unicas = normalizadas.filter((item, index, arr) => arr.indexOf(item) === index)
          if (unicas.length > 0) {
            setFormasPagamento(unicas)
            setFormaPagamento(unicas[0])
          }
        }
      } catch {}
    }

    void carregarOrcamentosSupabase('abertura-painel')

    void obterUserIdPainel().then((userId) => {
      try {
        const lista = lerLocalStorageUsuario<unknown[]>(PRODUTOS_KEY, userId, [])
        if (Array.isArray(lista) && lista.length > 0) {
          const normalizados = lista
            .map((produto: any, index: number): Produto => ({
              id: Number(produto?.id ?? index + 1),
              nome: String(produto?.nome ?? produto?.descricao ?? '').trim(),
              valor: Number(produto?.valor ?? produto?.preco ?? 0),
              codigoBarras: normalizarCodigoBarras(produto?.codigoBarras || produto?.codigo || produto?.ean || produto?.gtin || ''),
              tipoCadastro: produto?.tipoCadastro === 'servico' ? 'servico' : 'produto',
              tipoCalculo: produto?.tipoCalculo === 'm2' ? 'm2' : produto?.tipoCalculo === 'peso' ? 'peso' : 'unidade',
            }))
            .filter((produto: Produto) => Boolean(produto.nome))

          if (normalizados.length > 0) setProdutos(normalizados)
        }
      } catch {}
    })

    const salvosClientes = localStorage.getItem(CLIENTES_KEY)
    if (salvosClientes) {
      try {
        const lista = JSON.parse(salvosClientes)
        if (Array.isArray(lista) && lista.length > 0) {
          const normalizados = lista
            .map((cliente: any, index: number): Cliente => ({
              id: Number(cliente?.id ?? index + 1),
              nome: String(cliente?.nome ?? '').trim(),
              telefone: String(cliente?.telefone ?? ''),
              email: String(cliente?.email ?? ''),
              endereco: String(cliente?.endereco ?? ''),
              tipoPessoa: cliente?.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
              cpf: String(cliente?.cpf ?? ''),
              cnpj: String(cliente?.cnpj ?? ''),
              razaoSocial: String(cliente?.razaoSocial ?? ''),
              nomeFantasia: String(cliente?.nomeFantasia ?? ''),
            }))
            .filter((cliente: Cliente) => Boolean(cliente.nome))

          if (normalizados.length > 0) setClientes(normalizados)
        }
      } catch {}
    }
  }, [])

  useEffect(() => {
    function carregarDadosLocaisV78() {
      try {
        const salvosOrcamentos = localStorage.getItem(ORCAMENTOS_KEY)
        if (salvosOrcamentos) {
          const lista = JSON.parse(salvosOrcamentos)
          if (Array.isArray(lista) && lista.length > 0 && ultimaCargaOrcamentosRef.current === 0) {
            setOrcamentosSalvos(lista.map((item) => ({ ...item, status: normalizarStatus(item.status) })))
          }
        }
      } catch {}
      void carregarOrcamentosSupabase('connect-cloud-hydrated')
      void obterUserIdPainel().then((userId) => {
        try {
          const lista = lerLocalStorageUsuario<unknown[]>(PRODUTOS_KEY, userId, [])
          if (Array.isArray(lista) && lista.length > 0) {
            const normalizados = lista.map((produto: any, index: number): Produto => ({
              id: Number(produto?.id ?? index + 1),
              nome: String(produto?.nome ?? produto?.descricao ?? '').trim(),
              valor: Number(produto?.valor ?? produto?.preco ?? 0),
              codigoBarras: normalizarCodigoBarras(produto?.codigoBarras || produto?.codigo || produto?.ean || produto?.gtin || ''),
              tipoCadastro: produto?.tipoCadastro === 'servico' ? 'servico' : 'produto',
              tipoCalculo: produto?.tipoCalculo === 'm2' ? 'm2' : produto?.tipoCalculo === 'peso' ? 'peso' : 'unidade',
            })).filter((produto: Produto) => Boolean(produto.nome))
            if (normalizados.length > 0) setProdutos(normalizados)
          }
        } catch {}
      })
      try {
        const salvosClientes = localStorage.getItem(CLIENTES_KEY)
        if (salvosClientes) {
          const lista = JSON.parse(salvosClientes)
          if (Array.isArray(lista) && lista.length > 0) {
            const normalizados = lista.map((cliente: any, index: number): Cliente => ({
              id: Number(cliente?.id ?? index + 1),
              nome: String(cliente?.nome ?? '').trim(),
              telefone: String(cliente?.telefone ?? ''),
              email: String(cliente?.email ?? ''),
              endereco: String(cliente?.endereco ?? ''),
              tipoPessoa: cliente?.tipoPessoa === 'PJ' ? 'PJ' : 'PF',
              cpf: String(cliente?.cpf ?? ''),
              cnpj: String(cliente?.cnpj ?? ''),
              razaoSocial: String(cliente?.razaoSocial ?? ''),
              nomeFantasia: String(cliente?.nomeFantasia ?? ''),
            })).filter((cliente: Cliente) => Boolean(cliente.nome))
            if (normalizados.length > 0) setClientes(normalizados)
          }
        }
      } catch {}
    }
    window.addEventListener('connect-cloud-hydrated', carregarDadosLocaisV78)
    return () => window.removeEventListener('connect-cloud-hydrated', carregarDadosLocaisV78)
  }, [])

  useEffect(() => {
    let ativo = true

    const rodarCargaSupabase = (motivo: string) => {
      if (!ativo) return
      void carregarOrcamentosSupabase(motivo)
    }

    const timers = [
      window.setTimeout(() => rodarCargaSupabase('auth-estabilizando-350ms'), 350),
      window.setTimeout(() => rodarCargaSupabase('auth-estabilizando-1500ms'), 1500),
      window.setTimeout(() => rodarCargaSupabase('auth-estabilizando-3500ms'), 3500),
    ]

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!ativo || !session?.user?.id) return
      rodarCargaSupabase(`auth-${event}`)
    })

    const aoFoco = () => rodarCargaSupabase('window-focus')
    const aoVoltarVisivel = () => {
      if (document.visibilityState === 'visible') rodarCargaSupabase('visibility-visible')
    }

    window.addEventListener('focus', aoFoco)
    document.addEventListener('visibilitychange', aoVoltarVisivel)

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const tempoSemCarga = Date.now() - ultimaCargaOrcamentosRef.current
      if (tempoSemCarga > 30000 || orcamentosCountRef.current === 0) {
        rodarCargaSupabase('polling-leve')
      }
    }, 25000)

    return () => {
      ativo = false
      timers.forEach((timer) => window.clearTimeout(timer))
      subscription.unsubscribe()
      window.removeEventListener('focus', aoFoco)
      document.removeEventListener('visibilitychange', aoVoltarVisivel)
      window.clearInterval(interval)
    }
  }, [])

  const produtoSelecionado = useMemo(() => produtos.find((produto) => produto.id === produtoSelecionadoId) || null, [produtos, produtoSelecionadoId])
  const usaCampoM2 = produtoSelecionado?.tipoCalculo === 'm2'
  const usaCampoPeso = produtoSelecionado?.tipoCalculo === 'peso'

  const metragemAtual = useMemo(() => calcularMetragem(larguraItem, alturaItem), [larguraItem, alturaItem])
  const subtotal = useMemo(() => itens.reduce((acc, item) => acc + calcularTotalItem(item), 0), [itens])
  const itensCliente = useMemo(() => itens.filter((item) => item.mostrarCliente !== false), [itens])
  const valorDesconto = useMemo(() => {
    const numero = textoDecimalLivreParaNumero(descontoInput)
    if (descontoTipo === 'percentual') return Math.max(0, Math.min(100, numero)) * subtotal / 100
    return Math.max(0, numero)
  }, [descontoInput, descontoTipo, subtotal])
  const total = useMemo(() => Math.max(0, subtotal + valorEntrega - valorDesconto), [subtotal, valorEntrega, valorDesconto])

  const resumo = useMemo(() => {
    const totalDocumentos = orcamentosSalvos.length
    const pendentes = orcamentosSalvos.filter((item) => item.status === 'Pendente').length
    const aprovados = orcamentosSalvos.filter((item) => item.status === 'Aprovado').length
    const convertidos = orcamentosSalvos.filter((item) => item.status === 'Convertido').length
    const cancelados = orcamentosSalvos.filter((item) => item.status === 'Cancelado').length
    const somaValores = orcamentosSalvos.reduce((acc, item) => acc + Number(item.total || 0), 0)
    const totalAprovado = orcamentosSalvos
      .filter((item) => item.status === 'Aprovado' || item.status === 'Convertido')
      .reduce((acc, item) => acc + Number(item.total || 0), 0)
    const taxaAprovacao = totalDocumentos > 0 ? ((aprovados + convertidos) / totalDocumentos) * 100 : 0
    const ticketMedio = totalDocumentos > 0 ? somaValores / totalDocumentos : 0

    return {
      totalDocumentos,
      pendentes,
      aprovados,
      convertidos,
      cancelados,
      somaValores,
      totalAprovado,
      taxaAprovacao,
      ticketMedio,
    }
  }, [orcamentosSalvos])

  const clientesPropostaFiltrados = useMemo(() => {
    const busca = propostaClienteBusca.trim().toLowerCase()
    if (!busca) return clientes.slice(0, 10)
    return clientes
      .filter(
        (cliente) =>
          cliente.nome.toLowerCase().includes(busca) ||
          String(cliente.telefone || '').includes(busca) ||
          String(cliente.email || '').toLowerCase().includes(busca),
      )
      .slice(0, 10)
  }, [clientes, propostaClienteBusca])

  const clientesFiltrados = useMemo(() => {
    const termo = clienteBusca.trim().toLowerCase()
    if (!termo) return clientes
    return clientes.filter((cliente) => cliente.nome.toLowerCase().includes(termo) || cliente.telefone.toLowerCase().includes(termo) || String(cliente.cpf || '').toLowerCase().includes(termo) || String(cliente.cnpj || '').toLowerCase().includes(termo))
  }, [clienteBusca, clientes])

  const produtosFiltrados = useMemo(() => {
    const termo = produtoBusca.trim().toLowerCase()
    const filtradosPorModo = produtos.filter((produto) => {
      if (filtroItem === 'servico') return produto.tipoCadastro === 'servico'
      if (filtroItem === 'peso') return produto.tipoCadastro !== 'servico' && produto.tipoCalculo === 'peso'
      if (filtroItem === 'm2') return produto.tipoCadastro !== 'servico' && produto.tipoCalculo === 'm2'
      return produto.tipoCadastro !== 'servico' && (produto.tipoCalculo || 'unidade') === 'unidade'
    })
    if (!termo) return filtradosPorModo
    return filtradosPorModo.filter((produto) => [produto.nome, produto.codigoBarras || ''].join(' ').toLowerCase().includes(termo))
  }, [produtoBusca, produtos, filtroItem])

  function notificar(texto: string, tipo: Toast['tipo'] = 'success') {
    setToast({ texto, tipo })
  }

  function prepararOrcamentoCliente(dados: OrcamentoSalvo): OrcamentoSalvo {
    const itensVisiveis = (dados.itens || []).filter((item) => item.mostrarCliente !== false)
    const subtotalVisivel = itensVisiveis.reduce((acc, item) => acc + calcularTotalItem(item), 0)
    const descontoVisivel = subtotal > 0 ? Number(((valorDesconto * subtotalVisivel) / subtotal).toFixed(2)) : 0
    const totalVisivel = Math.max(0, subtotalVisivel + Number(dados.entrega || 0) - descontoVisivel)

    return {
      ...dados,
      itens: itensVisiveis,
      subtotal: subtotalVisivel,
      desconto: descontoVisivel,
      total: totalVisivel,
    }
  }


  async function sincronizarAprovacoesPublicas(forcar = false) {
    if (syncAprovacaoPublicaRodandoRef.current) return
    const agora = Date.now()
    if (!forcar && agora - ultimaSyncAprovacaoPublicaRef.current < 10000) return
    if (!orcamentosSalvos.length) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && !forcar) return

    syncAprovacaoPublicaRodandoRef.current = true
    ultimaSyncAprovacaoPublicaRef.current = agora

    try {
      const listaBase = [...orcamentosSalvos]
      let alterou = false
      const atualizados = await Promise.all(
        listaBase
          .filter((orcamento) => {
            const status = String(orcamento?.status || '').toLowerCase()
            return !status.includes('aprov') && !status.includes('cancel') && !status.includes('recus')
          })
          .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
          .slice(0, 18)
          .map(async (orcamento) => {
          try {
            const resp = await fetch(`/api/public-docs?tipo=orcamento&documentoId=${encodeURIComponent(String(orcamento.id))}&t=${Date.now()}`, { cache: 'no-store' })
            if (!resp.ok) return orcamento
            const json = await resp.json()
            const publico = json?.payload
            const statusPublico = normalizarStatus(publico?.status)
            const aprovacaoPublica = publico?.aprovacaoDigital
            const temAprovacaoPublica = statusPublico === 'Aprovado' || statusPublico === 'Cancelado' || aprovacaoPublica?.status === 'aprovado' || aprovacaoPublica?.status === 'recusado'
            if (!temAprovacaoPublica) return orcamento

            const atualizado = aplicarStatusResolvido(
              {
                ...orcamento,
                ...(publico && typeof publico === 'object' ? (publico as Partial<OrcamentoSalvo>) : {}),
                id: orcamento.id,
                atualizadoEm: Number((publico as any)?.atualizadoEm || Date.now()),
              },
              orcamento,
              publico && typeof publico === 'object' ? (publico as Record<string, unknown>) : null,
            )

            if (
              orcamento.status === atualizado.status &&
              Boolean(orcamento.aprovado) === Boolean(atualizado.aprovado) &&
              JSON.stringify((orcamento as any).aprovacaoDigital || {}) ===
                JSON.stringify(atualizado.aprovacaoDigital || {})
            ) {
              return orcamento
            }

            alterou = true
            return {
              ...atualizado,
              aprovadoEm:
                atualizado.aprovadoEm ||
                (publico as any)?.aprovadoEm ||
                aprovacaoPublica?.data ||
                new Date().toLocaleString('pt-BR'),
            }
          } catch (error) {
            console.error('[orcamentos] erro ao buscar aprovação pública:', error)
            return orcamento
          }
        })
      )

      if (alterou) {
        const mapa = new Map(atualizados.map((item) => [String(item.id), item]))
        let listaFinal = listaBase.map((item) => {
          const atualizado = mapa.get(String(item.id))
          if (!atualizado) return aplicarStatusResolvido(item)
          return mesclarParOrcamentos(atualizado, item)
        })
        salvarListaOrcamentos(listaFinal)

        const userIdSync = await obterUserIdOrcamentos(3)
        if (userIdSync) {
          const aprovadosAlterados = listaFinal.filter(
            (item) => item.status === 'Aprovado' || item.status === 'Convertido' || item.aprovado === true,
          )
          for (const orcamento of aprovadosAlterados) {
            await persistirOrcamentoSupabase(orcamento, userIdSync)
          }
        }

        if (!osAprovacaoRodandoRef.current) {
          osAprovacaoRodandoRef.current = true
          try {
            const aprovadosSemOs = listaFinal.filter((item) => item.status === 'Aprovado' && !item.osGeradaId)
            if (aprovadosSemOs.length) {
              const atualizadosComOs = await Promise.all(aprovadosSemOs.map((item) => garantirOSParaOrcamentoAprovado(item)))
              const mapaComOs = new Map(atualizadosComOs.map((item) => [String(item.id), item]))
              listaFinal = listaFinal.map((item) => mapaComOs.get(String(item.id)) || item)
              salvarListaOrcamentos(listaFinal)
            }
          } finally {
            osAprovacaoRodandoRef.current = false
          }
        }

        notificar('Aprovação do cliente sincronizada no painel.', 'success')
      }
    } finally {
      syncAprovacaoPublicaRodandoRef.current = false
    }
  }

  useEffect(() => {
    if (!orcamentosSalvos.length) return
    const timer = window.setTimeout(() => sincronizarAprovacoesPublicas(true), 1200)
    return () => window.clearTimeout(timer)
  }, [orcamentosSalvos.length])

  useEffect(() => {
    if (!orcamentosSalvos.length) return

    const rodarSync = () => sincronizarAprovacoesPublicas(true)
    const aoVoltarParaAba = () => {
      if (document.visibilityState === 'visible') rodarSync()
    }

    window.addEventListener('focus', rodarSync)
    document.addEventListener('visibilitychange', aoVoltarParaAba)

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      sincronizarAprovacoesPublicas(false)
    }, 20000)

    return () => {
      window.removeEventListener('focus', rodarSync)
      document.removeEventListener('visibilitychange', aoVoltarParaAba)
      window.clearInterval(interval)
    }
  }, [orcamentosSalvos])

  function tocarSomBalcao(tipo: 'ok' | 'erro' = 'ok') {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return
      const audio = new AudioContextClass()
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = tipo === 'ok' ? 880 : 220
      gain.gain.value = 0.055
      oscillator.connect(gain)
      gain.connect(audio.destination)
      oscillator.start()
      window.setTimeout(() => {
        oscillator.stop()
        audio.close().catch(() => {})
      }, tipo === 'ok' ? 90 : 160)
    } catch {}
  }

  function focarBipagemTurbo() {
    window.setTimeout(() => inputBipagemRef.current?.focus(), 60)
  }

  function vibrarBalcao(tipo: 'ok' | 'erro' = 'ok') {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(tipo === 'ok' ? 45 : [60, 35, 60])
      }
    } catch {}
  }

  function registrarBipagemTurbo(tipo: 'ok' | 'erro', texto: string, detalhe?: string) {
    setFeedbackBalcao({ tipo, texto, detalhe })
    vibrarBalcao(tipo)

    if (tipo === 'ok' && texto) {
      setUltimosBipados((atuais) => [texto, ...atuais.filter((item) => item !== texto)].slice(0, 5))
    }
  }

  function salvarListaOrcamentos(lista: OrcamentoSalvo[]) {
    const deletedIds = lerDeletedOrcamentos(userIdOrcamentosRef.current)
    const listaSemDuplicatas = deduplicarOrcamentosPorId(
      lista.filter((item) => !deletedIds.has(String(item?.id || '')))
    )
    const listaNormalizada = listaSemDuplicatas.map((item) => aplicarStatusResolvido(item))
    if (listaSemDuplicatas.length !== lista.length) {
      logOrcamentoSave({
        origem: 'dedupe-lista',
        removidos: lista.length - listaSemDuplicatas.length,
        total: listaNormalizada.length,
      })
    }
    setOrcamentosSalvos(listaNormalizada)
    localStorage.setItem(ORCAMENTOS_KEY, JSON.stringify(listaNormalizada))
    window.dispatchEvent(new Event('connect-data-change'))
  }

  function salvarListaClientes(lista: Cliente[]) {
    setClientes(lista)
    localStorage.setItem(CLIENTES_KEY, JSON.stringify(lista))
  }

  async function buscarCNPJ() {
    try {
      const cnpj = String(novoCliente.cnpj || '').replace(/\D/g, '')

      if (cnpj.length !== 14) {
        notificar('Digite um CNPJ válido.', 'error')
        return
      }

      const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
      if (!resposta.ok) {
        notificar('Não foi possível consultar esse CNPJ.', 'error')
        return
      }

      const data = await resposta.json()

      setNovoCliente((atual) => ({
        ...atual,
        nome: data.nome_fantasia || data.razao_social || atual.nome,
        razaoSocial: data.razao_social || '',
        nomeFantasia: data.nome_fantasia || '',
        email: atual.email,
        telefone: atual.telefone,
        endereco: [data.descricao_tipo_de_logradouro || '', data.logradouro || '', data.numero || '', data.bairro || '', data.municipio || '', data.uf || '']
          .filter(Boolean)
          .join(' - '),
        cnpj,
      }))

      notificar('Dados do CNPJ carregados com sucesso!')
    } catch {
      notificar('Erro ao buscar CNPJ.', 'error')
    }
  }

  function cadastrarNovoClienteRapido() {
    const nomeBase = String(novoCliente.nome || '').trim()
    const razaoSocial = String(novoCliente.razaoSocial || '').trim()
    const nomeFantasia = String(novoCliente.nomeFantasia || '').trim()
    const telefone = String(novoCliente.telefone || '').trim()
    const email = String(novoCliente.email || '').trim()
    const endereco = String(novoCliente.endereco || '').trim()
    const cpf = String(novoCliente.cpf || '').trim()
    const cnpj = String(novoCliente.cnpj || '').trim()

    if (tipoPessoa === 'PF' && !nomeBase) {
      notificar('Digite o nome do cliente.', 'error')
      return
    }

    if (tipoPessoa === 'PJ' && !razaoSocial && !nomeBase) {
      notificar('Digite a razão social ou busque o CNPJ.', 'error')
      return
    }

    const cliente: Cliente = {
      id: Date.now(),
      nome: tipoPessoa === 'PJ' ? (razaoSocial || nomeFantasia || nomeBase) : nomeBase,
      telefone,
      email,
      endereco,
      tipoPessoa,
      cpf,
      cnpj,
      razaoSocial,
      nomeFantasia,
    }

    const listaAtualizada = [cliente, ...clientes]
    salvarListaClientes(listaAtualizada)
    selecionarCliente(cliente)
    setNovoCliente({ ...NOVO_CLIENTE_INICIAL })
    setTipoPessoa('PF')
    setMostrarNovoCliente(false)
    notificar('Cliente cadastrado com sucesso!')
  }

  function gerarNumeroDocumentoIgnorandoAtual() {
    const numeros = orcamentosSalvos
      .filter((o) => o.id !== editandoOrcamentoId)
      .map((o) => Number(o.numero))
      .filter((n) => !Number.isNaN(n))
    const maior = numeros.length ? Math.max(...numeros) : 0
    return String(maior + 1).padStart(4, '0')
  }

  function gerarNumeroVenda() {
    const salvas = localStorage.getItem(VENDAS_KEY)
    const vendas: VendaSalva[] = salvas ? JSON.parse(salvas) : []
    const numeros = vendas.map((v) => Number(v.numero)).filter((n) => !Number.isNaN(n))
    const maior = numeros.length ? Math.max(...numeros) : 0
    return String(maior + 1).padStart(4, '0')
  }

  function gerarLinkDocumento(
    id: number,
    dados?: OrcamentoSalvo,
    cfgOverride?: Partial<ConfiguracaoSistema> | Record<string, unknown>
  ) {
    const base = baseUrlDocumentoPublico()
    const urlBase = `${base}/impressao-orcamento/${id}?preview=1`

    if (!dados) return urlBase

    try {
      const cfgEnvio = cfgOverride || config
      const payload = serializarCompactoOrcamento(dados, cfgEnvio)
      return payload ? `${urlBase}&d=${payload}` : urlBase
    } catch {
      return urlBase
    }
  }

  async function configParaPublicar() {
    try {
      const nuvem = await buscarConfiguracao()
      return mergeConfigPublicacao(config, nuvem)
    } catch {
      return mergeConfigPublicacao(config)
    }
  }

  async function gerarLinkDocumentoPublico(id: number, dados: OrcamentoSalvo) {
    const base = baseUrlDocumentoPublico()
    const cfgPublica = await configParaPublicar()
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const { data: sessao } = await supabase.auth.getSession()
      if (sessao?.session?.access_token) {
        headers.Authorization = `Bearer ${sessao.session.access_token}`
      }
      const resp = await fetch('/api/public-docs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tipo: 'orcamento',
          documentoId: String(id),
          document_type: 'orcamento',
          document_id: String(id),
          payload: { ...prepararOrcamentoCliente(dados), config: cfgPublica, cfg: cfgPublica },
        }),
      })
      if (resp.ok) {
        const json = await resp.json()
        if (json?.token) {
          const v = timestampVersaoPublica(json?.updated_at || Date.now())
          return montarUrlPublicaDocumento('/impressao-orcamento', String(id), {
            token: json.token,
            preview: true,
            v,
          })
        }
      }
    } catch {}
    return gerarLinkDocumento(id, dados, cfgPublica)
  }

  function visualizarOrcamentoInterno(id: number) {
    window.location.href = `/view/orcamento/${id}`
  }

  function aplicarModeloOrcamento(modelo: ModeloOrcamento) {
    setModeloOrcamento(modelo)
    if (modelo === 'comercial_premium') {
      setTituloPdf('Proposta Comercial Premium')
      setObservacao(config.rodapePdf || 'Agradecemos a oportunidade. Permanecemos à disposição para fechamento imediato.')
      return
    }

    setTituloPdf(config.tituloPdf || 'Orçamento Comercial')
    setObservacao(config.rodapePdf || OBSERVACAO_PADRAO_ORCAMENTO)
  }

  function limparCamposItem() {
    setProdutoBusca('')
    setQuantidade(0)
    setPesoInput('')
    setProdutoSelecionadoId(null)
    setModoItem('produto')
    setFiltroItem('produto')
    setLarguraItem(0)
    setAlturaItem(0)
    setMostrarBuscaProduto(false)
    setCodigoBarrasBusca('')
    setEditandoId(null)
  }

  function aplicarModeloProposta(modelo: ModeloPropostaRapida) {
    const base = MODELOS_PROPOSTA[modelo]
    setModeloPropostaRapida(modelo)
    setPropostaTitulo(base.titulo)
    setPropostaDescricao(base.descricao)
    setPropostaServicoPrincipal(base.servico)
    setPropostaPrazoEntrega(base.prazo)
    setPropostaCondicoesPagamento(base.pagamento)
    setPropostaValidade(base.validade)
    setPropostaObservacoes(base.observacoes)
  }

  function abrirModalProposta() {
    aplicarModeloProposta('servico')
    setPropostaCliente(null)
    setPropostaClienteBusca('')
    setPropostaValorTotal('')
    setModalPropostaAberto(true)
  }

  async function salvarPropostaComercial() {
    if (salvandoRef.current) {
      logOrcamentoSave({ origem: 'salvar-proposta-bloqueado', motivo: 'salvando' })
      return
    }

    const valor = parseValorMoedaInput(propostaValorTotal)
    if (!propostaCliente?.nome?.trim()) {
      notificar('Selecione o cliente da proposta.', 'error')
      return
    }
    if (!propostaTitulo.trim() || !propostaServicoPrincipal.trim()) {
      notificar('Preencha o título e o serviço/produto principal.', 'error')
      return
    }
    if (valor <= 0) {
      notificar('Informe o valor total da proposta.', 'error')
      return
    }

    salvandoRef.current = true
    setSalvandoOrcamento(true)
    try {
      const id = obterIdOrcamentoAtivo('salvar-proposta')
      const itemPrincipal: ItemOrcamento = {
      id: 1,
      nome: propostaServicoPrincipal.trim(),
      descricao: propostaDescricao.trim(),
      quantidade: 1,
      valor,
      tipoCadastro:
        modeloPropostaRapida === 'produto' || modeloPropostaRapida === 'grafica' ? 'produto' : 'servico',
      mostrarCliente: true,
    }

    const observacaoFinal = [
      propostaObservacoes.trim(),
      propostaDescricao.trim() ? `Descrição: ${propostaDescricao.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const novoBase: OrcamentoSalvo = {
      id,
      numero: gerarNumeroDocumentoIgnorandoAtual(),
      titulo: propostaTitulo.trim(),
      tituloProposta: propostaTitulo.trim(),
      modelo: 'comercial_premium',
      cliente: propostaCliente,
      itens: [itemPrincipal],
      subtotal: valor,
      entrega: 0,
      desconto: 0,
      total: valor,
      formaPagamento: propostaCondicoesPagamento.trim() || 'PIX',
      condicoesPagamento: propostaCondicoesPagamento.trim(),
      validade: propostaValidade.trim(),
      validadeProposta: propostaValidade.trim(),
      prazoEntrega: propostaPrazoEntrega.trim(),
      observacao: observacaoFinal,
      observacoesProposta: propostaObservacoes.trim(),
      descricaoProposta: propostaDescricao.trim(),
      status: 'Pendente',
      data: new Date().toLocaleDateString('pt-BR'),
      link: '',
      tipoDocumento: 'proposta_comercial',
      atualizadoEm: Date.now(),
    }

    const novo: OrcamentoSalvo = {
      ...novoBase,
      link: gerarLinkDocumento(id, prepararOrcamentoCliente(novoBase)),
    }

    upsertOrcamentoNaLista(novo, 'salvar-proposta')
    const okNuvem = await persistirOrcamentoSupabase(novo)
    notificar(
      okNuvem
        ? 'Proposta comercial salva com sucesso!'
        : 'Proposta salva no aparelho. A sincronização com a nuvem será tentada novamente.',
      okNuvem ? 'success' : 'info',
    )
    setEditandoOrcamentoId(id)
    setModalPropostaAberto(false)
    } finally {
      salvandoRef.current = false
      setSalvandoOrcamento(false)
    }
  }

  function novoOrcamento() {
    rascunhoOrcamentoIdRef.current = gerarIdOrcamentoUnico()
    logOrcamentoSave({ origem: 'novo-orcamento', id: rascunhoOrcamentoIdRef.current, numero: null })
    setClienteSelecionado(null)
    setClienteBusca('')
    limparCamposItem()
    setItens([])
    setModeloOrcamento('recibo_profissional')
    setTituloPdf(config.tituloPdf || 'Orçamento Comercial')
    setObservacao(config.rodapePdf || OBSERVACAO_PADRAO_ORCAMENTO)
    setFormaPagamento(config.formaPagamentoPadrao || formasPagamento[0] || 'PIX')
    setFormasPagamentoSelecionadas([config.formaPagamentoPadrao || formasPagamento[0] || 'Pix'])
    setOcultarValorUnitarioM2(true)
    setParcelasBoleto('')
    setValidade(resolverValidadePadraoOrcamento(config.validadePadrao))
    setPrazoEntrega(config.prazoEntregaPadrao || '')
    setEnderecoEntrega('')
    setValorEntrega(0)
    setDescontoTipo('valor')
    setDescontoInput('')
    setMostrarBuscaCliente(false)
    setEditandoOrcamentoId(null)
    setMostrarNovoCliente(false)
    setNovoCliente({ ...NOVO_CLIENTE_INICIAL })
  }

  function selecionarCliente(cliente: Cliente) {
    setClienteSelecionado(cliente)
    setClienteBusca(cliente.nome)
    setEnderecoEntrega(cliente.endereco || '')
    setMostrarBuscaCliente(false)
  }

  function selecionarProduto(produto: Produto) {
    setProdutoSelecionadoId(produto.id)
    setProdutoBusca(produto.nome)
    setMostrarBuscaProduto(false)

    if (produto.tipoCalculo === 'm2') {
      setLarguraItem(0)
      setAlturaItem(0)
      setQuantidade(1)
      return
    }

    if (produto.tipoCalculo === 'peso') {
      setQuantidade(0)
      setPesoInput('')
      setLarguraItem(0)
      setAlturaItem(0)
      return
    }

    setQuantidade(1)
    setLarguraItem(0)
    setAlturaItem(0)
  }

  function confirmarItemSelecionado() {
    if (!produtoSelecionado) {
      notificar(filtroItem === 'servico' ? 'Selecione um serviço.' : filtroItem === 'peso' ? 'Selecione um produto por peso.' : filtroItem === 'm2' ? 'Selecione um produto por m².' : 'Selecione um produto.', 'error')
      return
    }

    adicionarOuAtualizarProduto(produtoSelecionado)
  }

  function biparProdutoNoOrcamento(codigoInformado?: string) {
    const codigo = normalizarCodigoBarras(codigoInformado ?? codigoBarrasBusca)

    if (!codigo) {
      tocarSomBalcao('erro')
      registrarBipagemTurbo('erro', 'Código vazio', 'Bipe novamente')
      notificar('Bipe ou digite um código de barras.', 'error')
      focarBipagemTurbo()
      return
    }

    const produto = produtos.find((item) => normalizarCodigoBarras(item.codigoBarras || '') === codigo)

    if (!produto) {
      setCodigoBarrasBusca('')
      setUltimoBipado(`Não cadastrado: ${codigo}`)
      tocarSomBalcao('erro')
      registrarBipagemTurbo('erro', 'Produto não cadastrado', codigo)
      notificar(`Produto não cadastrado para o código ${codigo}.`, 'error')
      focarBipagemTurbo()
      return
    }

    const tipoCalculoProduto = produto.tipoCalculo === 'm2' ? 'm2' : produto.tipoCalculo === 'peso' ? 'peso' : 'unidade'

    if (produto.tipoCadastro === 'servico' || tipoCalculoProduto !== 'unidade') {
      selecionarProduto(produto)
      setCodigoBarrasBusca('')
      setUltimoBipado(produto.nome)
      tocarSomBalcao('ok')
      registrarBipagemTurbo('ok', produto.nome, 'Informe quantidade/peso/medida')
      notificar('Produto localizado. Informe quantidade/peso/medida e confirme.', 'info')
      focarBipagemTurbo()
      return
    }

    setItens((atual) => {
      const existente = atual.find((item) => item.nome === produto.nome && item.tipoCalculo !== 'm2' && item.tipoCalculo !== 'peso')

      if (existente) {
        return atual.map((item) => item.id === existente.id ? { ...item, quantidade: Number(item.quantidade || 0) + 1 } : item)
      }

      const novoItem: ItemOrcamento = {
        id: Date.now(),
        nome: produto.nome,
        quantidade: 1,
        valor: produto.valor,
        mostrarCliente: true,
        tipoCalculo: 'unidade',
        tipoCadastro: produto.tipoCadastro === 'servico' ? 'servico' : 'produto',
        unidadeLabel: 'un',
      }

      return [...atual, novoItem]
    })

    setCodigoBarrasBusca('')
    setProdutoBusca('')
    setProdutoSelecionadoId(null)
    setFiltroItem('produto')
    setModoItem('produto')
    setUltimoBipado(produto.nome)
    tocarSomBalcao('ok')
    registrarBipagemTurbo('ok', produto.nome, 'Adicionado ao orçamento')
    notificar(`Bipado: ${produto.nome}`)
    focarBipagemTurbo()
  }

  function adicionarOuAtualizarProduto(produto: Produto) {
    const tipoCadastroProduto = produto.tipoCadastro === 'servico' ? 'servico' : 'produto'
    const tipoCalculoProduto = produto.tipoCalculo === 'm2' ? 'm2' : produto.tipoCalculo === 'peso' ? 'peso' : 'unidade'

    if (tipoCalculoProduto !== 'm2') {
      let quantidadeFinal = quantidade

      if (tipoCalculoProduto === 'peso') {
        const pesoKg = textoPesoParaKg(pesoInput)

        if (!pesoKg || pesoKg <= 0) {
          notificar('Digite um peso válido.', 'error')
          return
        }

        quantidadeFinal = pesoKg
      } else if (!quantidade || quantidade <= 0) {
        notificar('Digite uma quantidade válida.', 'error')
        return
      }

      if (editandoId !== null) {
        setItens((atual) =>
          atual.map((item) =>
            item.id === editandoId
              ? {
                  ...item,
                  nome: produto.nome,
                  quantidade: quantidadeFinal,
                  valor: Number(item.valor || produto.valor),
                  tipoCalculo: tipoCalculoProduto,
                  tipoCadastro: tipoCadastroProduto,
                  mostrarCliente: item.mostrarCliente !== false,
                  unidadeLabel: tipoCalculoProduto === 'peso' ? 'kg' : tipoCadastroProduto === 'servico' ? 'serviço' : 'un',
                  largura: 0,
                  altura: 0,
                  metragem: 0,
                  valorM2: 0,
                }
              : item
          )
        )
        notificar('Item atualizado.')
      } else {
        const novoItem: ItemOrcamento = {
          id: Date.now(),
          nome: produto.nome,
          quantidade: quantidadeFinal,
          valor: produto.valor,
          mostrarCliente: true,
          tipoCalculo: tipoCalculoProduto,
          tipoCadastro: tipoCadastroProduto,
          unidadeLabel: tipoCalculoProduto === 'peso' ? 'kg' : tipoCadastroProduto === 'servico' ? 'serviço' : 'un',
        }
        setItens((atual) => [...atual, novoItem])
        notificar('Item adicionado.')
      }

      limparCamposItem()
      return
    }

    if (!larguraItem || larguraItem <= 0) {
      notificar('Digite a largura do item.', 'error')
      return
    }

    if (!alturaItem || alturaItem <= 0) {
      notificar('Digite a altura do item.', 'error')
      return
    }

    const metragem = calcularMetragem(larguraItem, alturaItem)

    if (!metragem || metragem <= 0) {
      notificar('A metragem calculada é inválida.', 'error')
      return
    }

    if (editandoId !== null) {
      setItens((atual) =>
        atual.map((item) =>
          item.id === editandoId
            ? {
                ...item,
                nome: produto.nome,
                quantidade: 1,
                valor: Number(item.valorM2 ?? item.valor ?? produto.valor),
                tipoCalculo: 'm2',
                tipoCadastro: tipoCadastroProduto,
                mostrarCliente: item.mostrarCliente !== false,
                unidadeLabel: 'm²',
                largura: larguraItem,
                altura: alturaItem,
                metragem,
                valorM2: Number(item.valorM2 ?? item.valor ?? produto.valor),
              }
            : item
        )
      )
      notificar(tipoCadastroProduto === 'servico' ? 'Serviço atualizado.' : 'Item atualizado.')
    } else {
      const novoItem: ItemOrcamento = {
        id: Date.now(),
        nome: produto.nome,
        quantidade: 1,
        valor: produto.valor,
        mostrarCliente: true,
        tipoCalculo: 'm2',
        tipoCadastro: tipoCadastroProduto,
        unidadeLabel: 'm²',
        largura: larguraItem,
        altura: alturaItem,
        metragem,
        valorM2: produto.valor,
      }
      setItens((atual) => [...atual, novoItem])
      notificar(tipoCadastroProduto === 'servico' ? 'Serviço adicionado.' : 'Item adicionado.')
    }

    limparCamposItem()
  }

  function editarItem(item: ItemOrcamento) {
    setProdutoBusca(item.nome)
    setProdutoSelecionadoId(produtos.find((produto) => produto.nome === item.nome && (produto.tipoCadastro === item.tipoCadastro || (produto.tipoCadastro ?? 'produto') === (item.tipoCadastro ?? 'produto')))?.id || null)
    setEditandoId(item.id)
    setMostrarBuscaProduto(true)

    if (item.tipoCalculo === 'm2') {
      setModoItem(item.tipoCadastro === 'servico' ? 'servico' : 'produto')
      setLarguraItem(Number(item.largura || 0))
      setAlturaItem(Number(item.altura || 0))
      setQuantidade(1)
    } else {
      setModoItem(item.tipoCadastro === 'servico' ? 'servico' : 'produto')
      setQuantidade(item.quantidade)
      setPesoInput(item.tipoCalculo === 'peso' ? formatarPesoKgVisual(item.quantidade) : '')
      setLarguraItem(0)
      setAlturaItem(0)
    }
  }

  function removerItem(id: number) {
    setItens((atual) => atual.filter((item) => item.id !== id))
    if (editandoId === id) limparCamposItem()
    notificar('Item removido.', 'info')
  }

  function alterarQuantidadeItem(id: number, novaQtd: number) {
    if (!novaQtd || novaQtd <= 0) return
    setItens((atual) => atual.map((item) => (item.id === id && item.tipoCalculo !== 'm2' ? { ...item, quantidade: novaQtd } : item)))
  }

  function alterarValorItem(id: number, novoValor: number) {
    if (novoValor < 0) return
    setItens((atual) =>
      atual.map((item) =>
        item.id === id
          ? item.tipoCalculo === 'm2'
            ? { ...item, valor: novoValor, valorM2: novoValor }
            : { ...item, valor: novoValor }
          : item
      )
    )
  }

  function alterarVisibilidadeItemCliente(id: number) {
    setItens((atual) => atual.map((item) => (item.id === id ? { ...item, mostrarCliente: item.mostrarCliente === false } : item)))
  }

  function ajustarQuantidadeItem(id: number, direcao: 1 | -1) {
    setItens((atual) =>
      atual.map((item) => {
        if (item.id !== id) return item
        if (item.tipoCalculo === 'm2') {
          const larguraAtual = Number(item.largura || 0)
          const alturaAtual = Number(item.altura || 0)
          const novaLargura = Math.max(0.01, Number((larguraAtual + direcao * 0.01).toFixed(2)))
          return { ...item, largura: novaLargura, metragem: calcularMetragem(novaLargura, alturaAtual) }
        }
        const passo = item.tipoCalculo === 'peso' ? 0.001 : 1
        const minimo = item.tipoCalculo === 'peso' ? 0.001 : 1
        const novaQuantidade = Math.max(minimo, Number((Number(item.quantidade || 0) + direcao * passo).toFixed(3)))
        return { ...item, quantidade: novaQuantidade }
      })
    )
  }

  function alterarLarguraItemLista(id: number, novaLargura: number) {
    if (novaLargura <= 0) return
    setItens((atual) =>
      atual.map((item) => {
        if (item.id !== id || item.tipoCalculo !== 'm2') return item
        const novaMetragem = calcularMetragem(novaLargura, item.altura)
        return { ...item, largura: novaLargura, metragem: novaMetragem }
      })
    )
  }

  function alterarAlturaItemLista(id: number, novaAltura: number) {
    if (novaAltura <= 0) return
    setItens((atual) =>
      atual.map((item) => {
        if (item.id !== id || item.tipoCalculo !== 'm2') return item
        const novaMetragem = calcularMetragem(item.largura, novaAltura)
        return { ...item, altura: novaAltura, metragem: novaMetragem }
      })
    )
  }

  async function salvarOrcamento() {
    if (salvandoRef.current) {
      logOrcamentoSave({ origem: 'salvar-orcamento-bloqueado', motivo: 'salvando' })
      return
    }

    if (itens.length === 0) {
      notificar('Adicione pelo menos um item.', 'error')
      return
    }

    salvandoRef.current = true
    setSalvandoOrcamento(true)

    try {
      if (editandoOrcamentoId !== null) {
        const atual = orcamentosSalvos.find((item) => item.id === editandoOrcamentoId)

        const atualizadoBase: OrcamentoSalvo = {
          id: editandoOrcamentoId,
          numero: atual?.numero || gerarNumeroDocumentoIgnorandoAtual(),
          titulo: tituloPdf,
          modelo: modeloOrcamento,
          cliente: clienteSelecionado,
          itens,
          subtotal,
          entrega: valorEntrega,
          desconto: valorDesconto,
          total,
          formaPagamento: pagamentoOrcamentoTexto(formasPagamentoSelecionadas, '', parcelasBoleto),
          formasPagamentoLista: formasPagamentoSelecionadas,
          observacaoPagamento: '',
          ocultarValorUnitarioM2: orcamentoDeveOcultarM2Cliente(itens, ocultarValorUnitarioM2),
          validade,
          prazoEntrega,
          enderecoEntrega: enderecoEntrega.trim() || undefined,
          observacao,
          status: atual?.status || 'Pendente',
          data: new Date().toLocaleDateString('pt-BR'),
          link: '',
          atualizadoEm: Date.now(),
        }

        const atualizado: OrcamentoSalvo = {
          ...atualizadoBase,
          link: gerarLinkDocumento(editandoOrcamentoId, prepararOrcamentoCliente(atualizadoBase)),
        }

        upsertOrcamentoNaLista(atualizado, 'salvar-orcamento-update')
        const okNuvem = await persistirOrcamentoSupabase(atualizado)
        gerarFinanceiroDeOrcamento(atualizado)
        logOrcamentoSave({
          origem: 'salvar-orcamento-update',
          id: atualizado.id,
          numero: atualizado.numero,
          okNuvem,
        })
        notificar(
          okNuvem
            ? 'Orçamento atualizado com sucesso! Parcelas financeiras atualizadas.'
            : 'Orçamento salvo no aparelho. A sincronização com a nuvem será tentada novamente.',
          okNuvem ? 'success' : 'info'
        )
        const { data: { session: sessEdit } } = await supabase.auth.getSession()
        void registrarLogSistema(sessEdit?.access_token || '', 'editou_orcamento', {
          modulo: 'orcamentos',
          referencia_id: String(atualizado.id),
        })
        setFormAberto(false)
        novoOrcamento()
        return
      }

      const id = obterIdOrcamentoAtivo('salvar-orcamento-novo')
      const novoBase: OrcamentoSalvo = {
        id,
        numero: gerarNumeroDocumentoIgnorandoAtual(),
        titulo: tituloPdf,
        modelo: modeloOrcamento,
        cliente: clienteSelecionado,
        itens,
        subtotal,
        entrega: valorEntrega,
        desconto: valorDesconto,
        total,
        formaPagamento: pagamentoOrcamentoTexto(formasPagamentoSelecionadas, '', parcelasBoleto),
        formasPagamentoLista: formasPagamentoSelecionadas,
        observacaoPagamento: '',
        ocultarValorUnitarioM2: orcamentoDeveOcultarM2Cliente(itens, ocultarValorUnitarioM2),
        validade,
        prazoEntrega,
        enderecoEntrega: enderecoEntrega.trim() || undefined,
        observacao,
        status: 'Pendente',
        data: new Date().toLocaleDateString('pt-BR'),
        link: '',
        atualizadoEm: Date.now(),
      }

      const novo: OrcamentoSalvo = {
        ...novoBase,
        link: gerarLinkDocumento(id, prepararOrcamentoCliente(novoBase)),
      }

      upsertOrcamentoNaLista(novo, 'salvar-orcamento-novo')
      const okNuvem = await persistirOrcamentoSupabase(novo)
      gerarFinanceiroDeOrcamento(novo)
      logOrcamentoSave({
        origem: 'salvar-orcamento-novo',
        id: novo.id,
        numero: novo.numero,
        okNuvem,
      })
      notificar(
        okNuvem
          ? 'Orçamento salvo com sucesso! Parcelas financeiras geradas.'
          : 'Orçamento salvo no aparelho. A sincronização com a nuvem será tentada novamente.',
        okNuvem ? 'success' : 'info'
      )
      const { data: { session: sessNovo } } = await supabase.auth.getSession()
      void registrarLogSistema(sessNovo?.access_token || '', 'criou_orcamento', {
        modulo: 'orcamentos',
        referencia_id: String(novo.id),
      })
      setEditandoOrcamentoId(id)
      setFormAberto(false)
    } finally {
      salvandoRef.current = false
      setSalvandoOrcamento(false)
    }
  }

  function alterarStatusOrcamento(id: number, status: StatusOrcamento, mensagem: string) {
    const listaAtualizada = orcamentosSalvos.map((item) =>
      item.id === id ? { ...item, status } : item
    )
    salvarListaOrcamentos(listaAtualizada)
    const atualizado = listaAtualizada.find((item) => item.id === id)
    if (atualizado) void persistirOrcamentoSupabase(atualizado)
    notificar(mensagem, status === 'Cancelado' ? 'info' : 'success')
  }

  function orcamentoTemServico(orc: OrcamentoSalvo) {
    return (orc.itens || []).some((item) => item.tipoCadastro === 'servico')
  }

  function orcamentoSomenteProdutos(orc: OrcamentoSalvo) {
    const itens = orc.itens || []
    return itens.length > 0 && itens.every((item) => item.tipoCadastro !== 'servico')
  }

  function gerarVenda(orc: OrcamentoSalvo) {
    const salvas = localStorage.getItem(VENDAS_KEY)
    const vendas: VendaSalva[] = salvas ? JSON.parse(salvas) : []
    const jaExiste = vendas.find((item) => item.orcamentoId === orc.id)
    if (jaExiste) {
      notificar('Essa venda já foi gerada.', 'info')
      return false
    }

    const novaVenda: VendaSalva = {
      id: Date.now() + 2,
      numero: gerarNumeroVenda(),
      orcamentoId: orc.id,
      cliente: orc.cliente,
      itens: orc.itens,
      subtotal: Number(orc.subtotal || 0),
      desconto: Number(orc.desconto || 0),
      total: Number(orc.total || 0),
      formaPagamento: orc.formaPagamento || 'PIX',
      observacao: orc.observacao || '',
      status: 'Concluída',
      data: new Date().toLocaleDateString('pt-BR'),
      origem: `Orçamento ${orc.numero}`,
    }
    localStorage.setItem(VENDAS_KEY, JSON.stringify([novaVenda, ...vendas]))
    window.dispatchEvent(new Event('storage'))
    alterarStatusOrcamento(orc.id, 'Aprovado', 'Venda gerada e orçamento aprovado!')
    return true
  }

  function gerarOS(orc: OrcamentoSalvo) {
    if (!orcamentoTemServico(orc)) {
      notificar('Esse orçamento é de venda de produtos. Use Gerar Venda. OS fica reservada para serviço técnico.', 'info')
      return
    }

    const listaOS = localStorage.getItem(OS_KEY)
    const ordens = listaOS ? JSON.parse(listaOS) : []
    const jaExiste = ordens.find((o: any) => o.orcamentoId === orc.id)
    if (jaExiste) {
      notificar('Essa OS já foi gerada.', 'info')
      return
    }

    const numeros = ordens.map((o: any) => Number(o.numero)).filter((n: number) => !Number.isNaN(n))
    const maior = numeros.length ? Math.max(...numeros) : 0
    const novoId = Date.now()
    const novaOS = {
      id: novoId,
      numero: String(maior + 1).padStart(4, '0'),
      cliente: orc.cliente?.nome || '',
      telefone: orc.cliente?.telefone || '',
      email: orc.cliente?.email || '',
      endereco: orc.cliente?.endereco || '',
      equipamento: 'Serviço vindo do orçamento',
      marca: '',
      modelo: '',
      serial: '',
      defeito: orc.observacao || '',
      checklist: '',
      observacao: orc.observacao || '',
      valor: Number(orc.total || 0),
      entrada: 0,
      saldo: Number(orc.total || 0),
      status: 'Aberta',
      prioridade: 'Média',
      tecnico: '',
      previsao: '',
      data: new Date().toLocaleDateString('pt-BR'),
      ultimaAtualizacao: new Date().toLocaleDateString('pt-BR'),
      link: `${SITE_URL}/impressao-ordem-servico/${novoId}`,
      orcamentoId: orc.id,
    }
    localStorage.setItem(OS_KEY, JSON.stringify([novaOS, ...ordens]))
    alterarStatusOrcamento(orc.id, 'Convertido', 'OS criada para atendimento técnico!')
    window.dispatchEvent(new Event('storage'))
  }

  function editarOrcamento(orc: OrcamentoSalvo) {
    rascunhoOrcamentoIdRef.current = orc.id
    setEditandoOrcamentoId(orc.id)
    setFormAberto(true)
    setClienteSelecionado(orc.cliente)
    setClienteBusca(orc.cliente?.nome || '')
    setItens(orc.itens || [])
    limparCamposItem()
    setModeloOrcamento(orc.modelo || 'recibo_profissional')
    setTituloPdf(orc.titulo || 'Orçamento Comercial')
    setObservacao(orc.observacao || '')
    const pagExtraido = extrairFormasPagamentoOrcamento(orc)
    setFormasPagamentoSelecionadas(pagExtraido.formas.length ? pagExtraido.formas : ['Pix'])
    setFormaPagamento(pagExtraido.formas[0] || 'Pix')
    setParcelasBoleto(String(orc.formaPagamento || '').includes('(') ? String(orc.formaPagamento || '').match(/\(([^)]+)\)/)?.[1] || '' : '')
    setOcultarValorUnitarioM2(Boolean(orc.ocultarValorUnitarioM2))
    setValidade(orc.validade || '')
    setPrazoEntrega(orc.prazoEntrega || '')
    setEnderecoEntrega(orc.enderecoEntrega || orc.cliente?.endereco || '')
    setValorEntrega(Number(orc.entrega || 0))
    setDescontoTipo('valor')
    setDescontoInput(Number(orc.desconto || 0) > 0 ? formatarDecimalVisual(Number(orc.desconto || 0)) : '')
    setMostrarBuscaCliente(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluirOrcamento(id: number) {
    const confirmar = window.confirm('Deseja excluir este orçamento?')
    if (!confirmar) return
    const userId = userIdOrcamentosRef.current || (await obterUserIdOrcamentos(2))
    marcarOrcamentoComoDeletado(id, userId)
    const orcamento = orcamentosSalvos.find((item) => item.id === id)
    const listaAtualizada = orcamentosSalvos.filter((item) => item.id !== id)
    salvarListaOrcamentos(listaAtualizada)
    if (orcamento) void excluirOrcamentoSupabase(orcamento)
    if (editandoOrcamentoId === id) novoOrcamento()
    const { data: { session: sessDel } } = await supabase.auth.getSession()
    void registrarLogSistema(sessDel?.access_token || '', 'excluiu_orcamento', {
      modulo: 'orcamentos',
      referencia_id: String(id),
    })
    notificar('Orçamento excluído.', 'info')
  }

  function abrirLinkOrcamento(link: string) {
    if (!link) return
    try {
      const url = new URL(link, window.location.origin)
      abrirNovaAbaOuMesma(url.toString())
    } catch {
      abrirNovaAbaOuMesma(link)
    }
  }

  async function copiarLinkOrcamento(orc: OrcamentoSalvo) {
    const link = await linkPublicoOrcamentoLista(orc)

    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(() => {
        notificar('Link copiado com sucesso!', 'success')
      }).catch(() => {
        try {
          const textarea = document.createElement('textarea')
          textarea.value = link
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.focus()
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
          notificar('Link copiado com sucesso!', 'success')
        } catch {
          window.prompt('Copie o link:', link)
        }
      })
      return
    }

    try {
      const textarea = document.createElement('textarea')
      textarea.value = link
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      notificar('Link copiado com sucesso!', 'success')
    } catch {
      window.prompt('Copie o link:', link)
    }
  }

  async function linkPublicoOrcamentoLista(orc: OrcamentoSalvo): Promise<string> {
    try {
      return await comTimeout(gerarLinkDocumentoPublico(orc.id, orc), 14000)
    } catch {
      return gerarLinkDocumento(orc.id, orc)
    }
  }

  async function compartilharLinkOrcamento(orc: OrcamentoSalvo) {
    if (zapOrcCarregando != null) return

    const telefone = telefoneWhatsappBrasil(orc.cliente?.telefone)
    setZapOrcCarregando(orc.id)
    try {
      let cfgEnvio = mergeConfigPublicacao(config)
      try {
        cfgEnvio = mergeConfigPublicacao(config, await configParaPublicar())
      } catch {}
      const linkRapido = gerarLinkDocumento(orc.id, prepararOrcamentoCliente(orc), cfgEnvio)
      await abrirWhatsappAposPrepararLink({
        telefone,
        linkRapido,
        prepararLinkCompleto: () => linkPublicoOrcamentoLista(orc),
        montarMensagem: (link) => {
          let mensagem = `Olá ${orc.cliente?.nome || 'cliente'}!\n\n`
          mensagem += `${textoIntroWhatsapp(orc)} *${orc.numero}* no valor de *${moeda(orc.total)}*.\n`
          if (validadeOrcamentoAtiva(orc.validade)) mensagem += `Validade: ${orc.validade}.\n`
          mensagem += `\n🔗 Acesse aqui:\n${link}`
          return mensagem
        },
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível abrir o WhatsApp. Tente novamente.'
      notificar(msg, 'error')
    } finally {
      window.setTimeout(() => setZapOrcCarregando(null), 800)
    }
  }

  async function enviarWhatsApp() {
    if (itens.length === 0) {
      notificar('Adicione pelo menos um item.', 'error')
      return
    }

    const baseId = obterIdOrcamentoAtivo('enviar-whatsapp')
    const numero = telefoneWhatsappBrasil(clienteSelecionado?.telefone || '')
    const numeroDocumento = editandoOrcamentoId !== null
      ? (orcamentosSalvos.find((item) => item.id === editandoOrcamentoId)?.numero || gerarNumeroDocumentoIgnorandoAtual())
      : (orcamentosSalvos.find((item) => item.id === baseId)?.numero || gerarNumeroDocumentoIgnorandoAtual())

    const dadosLinkPublico: OrcamentoSalvo = {
      id: baseId,
      numero: numeroDocumento,
      titulo: tituloPdf,
      cliente: clienteSelecionado,
      itens,
      subtotal,
      entrega: valorEntrega,
      desconto: valorDesconto,
      total,
      formaPagamento: pagamentoOrcamentoTexto(formasPagamentoSelecionadas, '', parcelasBoleto),
      formasPagamentoLista: formasPagamentoSelecionadas,
      observacaoPagamento: '',
        ocultarValorUnitarioM2: orcamentoDeveOcultarM2Cliente(itens, ocultarValorUnitarioM2),
      validade,
      prazoEntrega,
      enderecoEntrega: enderecoEntrega.trim() || undefined,
      observacao,
      status: 'Pendente',
      data: new Date().toLocaleDateString('pt-BR'),
      link: '',
    }

    try {
      const linkPublico = await linkPublicoOrcamentoLista(dadosLinkPublico)

      let mensagem = `Olá ${clienteSelecionado?.nome || 'cliente'}!

`
      const docAtual = orcamentosSalvos.find((item) => item.id === editandoOrcamentoId)
      const introDoc = textoIntroWhatsapp(docAtual || { tipoDocumento: 'orcamento' })
      mensagem += `${introDoc} #${numeroDocumento}
`
      mensagem += `Total: ${moeda(total)}
`
      mensagem += `Pagamento: ${pagamentoOrcamentoTexto(formasPagamentoSelecionadas, '', parcelasBoleto)}
`
      if (formasPagamentoSelecionadas.some((f) => f.toLowerCase().includes('boleto')) && parcelasBoleto) {
        mensagem += `${montarTextoBoleto(parcelasBoleto)}
`
      }
      if (validadeOrcamentoAtiva(validade)) mensagem += `Validade: ${validade}
`
      if (prazoEntrega) mensagem += `Prazo de entrega: ${prazoEntrega}
`
      const entregaEndereco = enderecoEntrega.trim()
      if (entregaEndereco) mensagem += `Endereço de entrega: ${entregaEndereco}
`
      if (observacao) mensagem += `Obs.: ${observacao}
`
      mensagem += `
Acesse aqui:
${linkPublico}`
      mensagem += `

Se aprovar, me responda por aqui que já deixo tudo encaminhado ✅`

      const zap = abrirWhatsappUrl(montarUrlWhatsapp(numero, mensagem))
      if (!zap.abriu && !zap.mostrarLink) {
        notificar('Não foi possível abrir o WhatsApp.', 'error')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível preparar o link para o WhatsApp.'
      notificar(msg, 'error')
    }
  }


  function abrirMenuOrcamento(orc: OrcamentoSalvo) {
    setOrcamentoMenuAberto(orc)
    try {
      window.setTimeout(() => {
        const el = document.getElementById('connect-acoes-orcamento-modal')
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 80)
    } catch {}
  }

  function fecharMenuOrcamento() {
    setOrcamentoMenuAberto(null)
  }

  function gerarPDF() {
    if (itens.length === 0) {
      notificar('Adicione pelo menos um item.', 'error')
      return
    }

    const idParaAbrir = obterIdOrcamentoAtivo('gerar-pdf')
    let dadosParaAbrir: OrcamentoSalvo | null = null

    if (editandoOrcamentoId !== null) {
      const atual = orcamentosSalvos.find((item) => item.id === editandoOrcamentoId)

      const atualizadoBase: OrcamentoSalvo = {
        id: editandoOrcamentoId,
        numero: atual?.numero || gerarNumeroDocumentoIgnorandoAtual(),
        titulo: tituloPdf,
        modelo: modeloOrcamento,
        cliente: clienteSelecionado,
        itens,
        subtotal,
        entrega: valorEntrega,
        desconto: valorDesconto,
        total,
        formaPagamento: pagamentoOrcamentoTexto(formasPagamentoSelecionadas, '', parcelasBoleto),
        formasPagamentoLista: formasPagamentoSelecionadas,
        observacaoPagamento: '',
        ocultarValorUnitarioM2: orcamentoDeveOcultarM2Cliente(itens, ocultarValorUnitarioM2),
        validade,
        prazoEntrega,
        enderecoEntrega: enderecoEntrega.trim() || undefined,
        observacao,
        status: atual?.status || 'Pendente',
        data: new Date().toLocaleDateString('pt-BR'),
        link: '',
        atualizadoEm: Date.now(),
      }

      const atualizado: OrcamentoSalvo = {
        ...atualizadoBase,
        link: gerarLinkDocumento(editandoOrcamentoId, prepararOrcamentoCliente(atualizadoBase)),
      }

      dadosParaAbrir = atualizado
      upsertOrcamentoNaLista(atualizado, 'gerar-pdf-update')
    } else {
      const existente = orcamentosSalvos.find((item) => item.id === idParaAbrir)
      const novoBase: OrcamentoSalvo = {
        id: idParaAbrir,
        numero: existente?.numero || gerarNumeroDocumentoIgnorandoAtual(),
        titulo: tituloPdf,
        modelo: modeloOrcamento,
        cliente: clienteSelecionado,
        itens,
        subtotal,
        entrega: valorEntrega,
        desconto: valorDesconto,
        total,
        formaPagamento: pagamentoOrcamentoTexto(formasPagamentoSelecionadas, '', parcelasBoleto),
        formasPagamentoLista: formasPagamentoSelecionadas,
        observacaoPagamento: '',
        ocultarValorUnitarioM2: orcamentoDeveOcultarM2Cliente(itens, ocultarValorUnitarioM2),
        validade,
        prazoEntrega,
        enderecoEntrega: enderecoEntrega.trim() || undefined,
        observacao,
        status: existente?.status || 'Pendente',
        data: new Date().toLocaleDateString('pt-BR'),
        link: '',
        atualizadoEm: Date.now(),
      }

      const novo: OrcamentoSalvo = {
        ...novoBase,
        link: gerarLinkDocumento(idParaAbrir, prepararOrcamentoCliente(novoBase)),
      }

      dadosParaAbrir = novo
      upsertOrcamentoNaLista(novo, 'gerar-pdf-novo')
      setEditandoOrcamentoId(idParaAbrir)
    }

    notificar('PDF pronto para visualização.', 'info')
    const linkFinal = gerarLinkDocumento(idParaAbrir, dadosParaAbrir || undefined)
    abrirNovaAbaOuMesma(linkFinal)
  }

  const colors = darkMode
    ? {
        bg: '#020617',
        shell: 'linear-gradient(180deg,#0f172a,#081225)',
        card: '#0f1b31',
        cardSoft: '#12223d',
        text: '#f8fafc',
        muted: '#94a3b8',
        border: 'rgba(59,130,246,0.28)',
        inputBg: '#08111f',
        inputBorder: 'rgba(148,163,184,0.28)',
        greenBg: 'linear-gradient(135deg,#facc15,#fde047)',
        greenBorder: '#eab308',
      }
    : {
        bg: '#f8fafc',
        shell: 'linear-gradient(180deg,#ffffff,#f8fbff)',
        card: '#ffffff',
        cardSoft: '#f8fafc',
        text: '#111827',
        muted: '#64748b',
        border: 'rgba(37,99,235,0.18)',
        inputBg: '#ffffff',
        inputBorder: '#dbeafe',
        greenBg: 'linear-gradient(135deg,#facc15,#fde047)',
        greenBorder: '#eab308',
      }

  const pageStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 1320,
    margin: '0 auto',
    padding: isMobile ? '12px 10px 96px' : 20,
    color: colors.text,
    overflowX: 'clip',
    boxSizing: 'border-box',
  }

  const shellStyle: React.CSSProperties = {
    background: colors.shell,
    borderRadius: isMobile ? 18 : 28,
    padding: isMobile ? 14 : 24,
    boxShadow: darkMode ? '0 18px 48px rgba(2,6,23,0.55)' : '0 18px 44px rgba(15,23,42,0.10)',
    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#d1d5db'}`,
  }

  const cardStyle: React.CSSProperties = {
    background: darkMode ? '#161b22' : '#f3f4f6',
    borderRadius: isMobile ? 14 : 20,
    padding: isMobile ? 12 : 16,
    boxShadow: darkMode ? '0 10px 26px rgba(0,0,0,0.18)' : '0 10px 26px rgba(0,0,0,0.06)',
    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#d1d5db'}`,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 800,
    color: colors.muted,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    color: colors.text,
    padding: '10px 12px',
    boxSizing: 'border-box',
    outline: 'none',
    fontSize: 14,
  }

  const buttonBase: React.CSSProperties = {
    height: 34,
    minHeight: 34,
    padding: '0 12px',
    border: '1px solid rgba(148,163,184,0.26)',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 900,
    fontSize: 10,
    lineHeight: 1,
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'transform .18s ease, box-shadow .18s ease, opacity .18s ease',
    boxShadow: 'none',
  }

  const actionButtonStyle = (variant: 'editar' | 'visualizar' | 'deletar' | 'copiar' | 'aprovar' | 'cancelar' | 'venda' | 'os' | 'gravar'): React.CSSProperties => {
    const map: Record<typeof variant, React.CSSProperties> = {
      editar: { background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', boxShadow: '0 8px 18px rgba(37,99,235,0.18)' },
      visualizar: { background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', boxShadow: '0 8px 18px rgba(15,23,42,0.16)' },
      deletar: { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', boxShadow: '0 8px 18px rgba(239,68,68,0.18)' },
      copiar: { background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', boxShadow: '0 8px 18px rgba(124,58,237,0.18)' },
      aprovar: { background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', boxShadow: '0 8px 18px rgba(34,197,94,0.18)' },
      cancelar: { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', boxShadow: '0 8px 18px rgba(245,158,11,0.18)' },
      venda: { background: 'linear-gradient(135deg,#14b8a6,#0f766e)', color: '#fff', boxShadow: '0 8px 18px rgba(20,184,166,0.18)' },
      os: { background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', boxShadow: '0 8px 18px rgba(249,115,22,0.18)' },
      gravar: { background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', boxShadow: '0 8px 18px rgba(5,150,105,0.18)' },
    }
    return {
      ...buttonBase,
      ...map[variant],
      width: '100%',
      minHeight: 44,
      height: 44,
      padding: '0 16px',
      fontSize: 13,
      lineHeight: 1.15,
      alignItems: 'center',
      justifyContent: 'center',
    }
  }

  const totalBoxStyle: React.CSSProperties = {
    ...inputStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    background: colors.greenBg,
    border: `1px solid ${colors.greenBorder}`,
    color: '#422006',
    fontSize: 16,
    letterSpacing: 0.3,
    boxShadow: '0 8px 20px rgba(250,204,21,0.30)',
  }

  function renderStatusBadge(status: StatusOrcamento) {
    const mapa: Record<StatusOrcamento, { fundo: string; texto: string; borda: string }> = {
      Pendente: { fundo: darkMode ? '#3f2b02' : '#fff7ed', texto: '#f59e0b', borda: '#f59e0b' },
      Aprovado: { fundo: darkMode ? '#052e16' : '#f0fdf4', texto: '#22c55e', borda: '#22c55e' },
      Convertido: { fundo: darkMode ? '#172554' : '#eff6ff', texto: '#3b82f6', borda: '#3b82f6' },
      Cancelado: { fundo: darkMode ? '#450a0a' : '#fef2f2', texto: '#ef4444', borda: '#ef4444' },
    }
    const item = mapa[status]
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 900,
          background: item.fundo,
          color: item.texto,
          border: `1px solid ${item.borda}`,
        }}
      >
        {status}
      </span>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, paddingBottom: 32 }}>
      <div style={pageStyle}>
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: isMobile ? 78 : 24,
              right: 18,
              zIndex: 999,
              minWidth: 260,
              maxWidth: 360,
              padding: '14px 16px',
              borderRadius: 14,
              color: '#fff',
              fontWeight: 800,
              boxShadow: '0 14px 30px rgba(0,0,0,0.25)',
              background:
                toast.tipo === 'success'
                  ? 'linear-gradient(90deg,#16a34a,#22c55e)'
                  : toast.tipo === 'error'
                  ? 'linear-gradient(90deg,#dc2626,#ef4444)'
                  : 'linear-gradient(90deg,#2563eb,#3b82f6)',
            }}
          >
            {toast.texto}
          </div>
        )}

        <div style={{ color: colors.muted, fontSize: 13, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
          Painel Comercial
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <button type="button" onClick={() => router.push('/dashboard')} style={{ border: '1px solid rgba(148,163,184,.28)', background: darkMode ? '#111827' : '#ffffff', color: colors.text, borderRadius: 999, padding: '10px 14px', fontWeight: 950, cursor: 'pointer', boxShadow: darkMode ? 'none' : '0 8px 20px rgba(15,23,42,.08)' }}>← Voltar</button>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 44, lineHeight: 1, fontWeight: 900, color: colors.text }}>Orçamentos</h1>
            <div style={{ marginTop: 8, color: colors.muted, fontWeight: 700 }}>Módulo blindado com foco em fechamento e conversão</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => exportarOrcamentosExcel(orcamentosSalvos as unknown as Record<string, unknown>[])}
              style={{ border: `1px solid ${colors.inputBorder}`, background: colors.card, color: colors.text, borderRadius: 999, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }}
            >
              Exportar Excel
            </button>
            <button
              onClick={() => { novoOrcamento(); setFormAberto(true) }}
              style={{
                border: 0,
                cursor: 'pointer',
                minHeight: 74,
                minWidth: isMobile ? '100%' : 286,
                padding: 0,
                borderRadius: 22,
                overflow: 'hidden',
                color: '#fff',
                background: 'linear-gradient(135deg,#0f172a 0%,#14532d 100%)',
                boxShadow: '0 18px 38px rgba(15,23,42,0.26)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr 38px', alignItems: 'center', height: '100%' }}>
                <div style={{
                  height: '100%',
                  minHeight: 74,
                  background: 'linear-gradient(180deg,#ffffff,#dcfce7)',
                  display: 'grid',
                  placeItems: 'center',
                  borderRight: '1px solid rgba(255,255,255,0.18)'
                }}>
                  <div style={{
                    width: 46,
                    height: 58,
                    borderRadius: 10,
                    background: '#fff',
                    border: '1px solid rgba(15,23,42,0.12)',
                    boxShadow: '0 10px 20px rgba(15,23,42,0.14)',
                    padding: 6
                  }}>
                    <div style={{ height: 5, borderRadius: 999, background: '#16a34a', marginBottom: 6 }} />
                    <div style={{ height: 4, borderRadius: 999, background: '#cbd5e1', marginBottom: 5 }} />
                    <div style={{ height: 4, borderRadius: 999, background: '#cbd5e1', marginBottom: 5, width: '82%' }} />
                    <div style={{ height: 4, borderRadius: 999, background: '#86efac', marginTop: 12 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'left', padding: '12px 12px' }}>
                  <div style={{ fontSize: 15, fontWeight: 950, lineHeight: 1 }}>Novo orçamento</div>
                  <div style={{ marginTop: 5, fontSize: 11, fontWeight: 800, opacity: .82 }}>
                    Criar proposta premium
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, opacity: .9 }}>›</div>
              </div>
            </button>
            <button
              type="button"
              onClick={abrirModalProposta}
              style={{
                border: '1px solid rgba(37,99,235,.28)',
                cursor: 'pointer',
                minHeight: 74,
                minWidth: isMobile ? '100%' : 220,
                padding: '12px 16px',
                borderRadius: 22,
                color: '#fff',
                background: 'linear-gradient(135deg,#1d4ed8 0%,#2563eb 52%,#0f172a 100%)',
                boxShadow: '0 14px 30px rgba(37,99,235,.22)',
                fontWeight: 950,
                fontSize: 15,
              }}
            >
              Nova proposta
            </button>
            <div style={{ display: 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: colors.muted }}>Modelo ativo</div>
              <div style={{ marginTop: 4, fontWeight: 900, color: colors.text }}>
                {modeloOrcamento === 'comercial_premium' ? 'Comercial Premium' : 'Recibo Profissional'}
              </div>
            </div>
            {false && config.logoUrl ? (
              <div style={{ ...cardStyle, padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={config.logoUrl} alt="Logo da empresa" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
                <div>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>{config.nomeEmpresa || 'Empresa'}</div>
                  <div style={{ fontSize: 12, color: colors.muted }}>{darkMode ? 'Modo escuro automático' : 'Modo claro automático'}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: 14, marginBottom: 18 }}>
          <ResumoCard titulo="Salvos" valor={String(resumo.totalDocumentos)} darkMode={darkMode} />
          <ResumoCard titulo="Pendentes" valor={String(resumo.pendentes)} darkMode={darkMode} />
          <ResumoCard titulo="Aprovados" valor={String(resumo.aprovados)} darkMode={darkMode} />
          <ResumoCard titulo="Convertidos" valor={String(resumo.convertidos)} darkMode={darkMode} />
          <ResumoCard titulo="Taxa" valor={`${resumo.taxaAprovacao.toFixed(0)}%`} darkMode={darkMode} />
          <ResumoCard titulo="Ticket" valor={moeda(resumo.ticketMedio)} darkMode={darkMode} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div style={{ ...cardStyle, background: darkMode ? '#0c1d14' : '#f0fdf4', borderColor: 'rgba(34,197,94,0.30)' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: darkMode ? '#86efac' : '#166534', marginBottom: 6 }}>💰 Valor aprovado</div>
            <div style={{ fontSize: isMobile ? 26 : 34, fontWeight: 900, color: darkMode ? '#f0fdf4' : '#166534' }}>{moeda(resumo.totalAprovado)}</div>
          </div>
          <div style={{ ...cardStyle, background: darkMode ? '#2a1207' : '#fff7ed', borderColor: 'rgba(249,115,22,0.28)' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: darkMode ? '#fdba74' : '#c2410c', marginBottom: 6 }}>📌 Cancelados</div>
            <div style={{ fontSize: isMobile ? 26 : 34, fontWeight: 900, color: darkMode ? '#fff7ed' : '#7c2d12' }}>{resumo.cancelados}</div>
          </div>
        </div>

        <section style={{ ...shellStyle, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 30, color: colors.text }}>Documentos salvos</h2>
              <div style={{ marginTop: 4, color: colors.muted, fontWeight: 700 }}>
                Lista premium compacta, com leitura rápida e ações centralizadas.
              </div>
            </div>

            <div style={{
              background: darkMode ? 'rgba(15,23,42,.86)' : '#ffffff',
              border: `1px solid ${darkMode ? 'rgba(96,165,250,.22)' : '#dbeafe'}`,
              borderRadius: 999,
              padding: '8px 14px',
              fontWeight: 900,
              color: colors.text,
              boxShadow: darkMode ? '0 10px 24px rgba(0,0,0,.22)' : '0 10px 24px rgba(15,23,42,.06)'
            }}>
              {orcamentosSalvos.length} registro(s)
            </div>
          </div>

          {orcamentosSalvos.length === 0 ? (
            <div style={{ ...cardStyle, color: colors.muted }}>Nenhum orçamento salvo ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {orcamentosSalvos.map((orc) => {
                const statusColor =
                  orc.status === 'Aprovado'
                    ? '#16a34a'
                    : orc.status === 'Convertido'
                      ? '#2563eb'
                      : orc.status === 'Cancelado'
                        ? '#ef4444'
                        : '#f59e0b'

                return (
                  <div
                    key={orc.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '92px 1.2fr 150px 130px 150px',
                      gap: isMobile ? 10 : 14,
                      alignItems: 'center',
                      padding: isMobile ? 12 : 14,
                      borderRadius: 20,
                      background: darkMode
                        ? 'linear-gradient(135deg, rgba(15,23,42,.96), rgba(30,41,59,.88))'
                        : 'linear-gradient(135deg,#ffffff,#f8fbff)',
                      border: `1px solid ${darkMode ? 'rgba(96,165,250,.18)' : '#dbeafe'}`,
                      boxShadow: darkMode ? '0 14px 30px rgba(0,0,0,.22)' : '0 14px 30px rgba(15,23,42,.06)',
                      transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: colors.muted, textTransform: 'uppercase', letterSpacing: .7 }}>Doc.</div>
                      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950, color: colors.text }}>#{orc.numero}</div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 950,
                          letterSpacing: .4,
                          textTransform: 'uppercase',
                          color: isPropostaComercial(orc) ? '#1d4ed8' : '#166534',
                          background: isPropostaComercial(orc) ? 'rgba(37,99,235,.12)' : 'rgba(34,197,94,.12)',
                          border: `1px solid ${isPropostaComercial(orc) ? 'rgba(37,99,235,.28)' : 'rgba(34,197,94,.28)'}`,
                        }}>
                          {rotuloTipoDocumento(orc)}
                        </span>
                        <strong style={{ color: colors.text, fontSize: 15, lineHeight: 1.25 }}>
                          {orc.tituloProposta || orc.titulo || rotuloTipoDocumento(orc)}
                        </strong>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '5px 9px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 950,
                          color: statusColor,
                          border: `1px solid ${statusColor}55`,
                          background: `${statusColor}12`,
                        }}>
                          {orc.status}
                        </span>
                      </div>

                      <div style={{ marginTop: 7, color: colors.muted, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>
                        👤 {orc.cliente?.nome || 'Cliente não informado'} {orc.data ? `• ${orc.data}` : ''}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: colors.muted, textTransform: 'uppercase', letterSpacing: .7 }}>Total</div>
                      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950, color: darkMode ? '#bbf7d0' : '#166534' }}>{moeda(orc.total)}</div>
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                      <button
                        onClick={() => visualizarOrcamentoInterno(orc.id)}
                        style={{ ...buttonBase, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', minHeight: 34, height: 34, borderRadius: 12 }}
                      >
                        👁 Visualizar
                      </button>
                      <button
                        type="button"
                        className={`connect-zap-btn${zapOrcCarregando === orc.id ? ' connect-zap-btn--loading' : ''}`}
                        disabled={zapOrcCarregando === orc.id}
                        onClick={() => void compartilharLinkOrcamento(orc)}
                        style={{ ...buttonBase, background: 'linear-gradient(135deg,#16a34a,#065f46)', color: '#fff', minHeight: 34, height: 34, borderRadius: 12, touchAction: 'manipulation' }}
                      >
                        {zapOrcCarregando === orc.id ? '⏳ Abrindo…' : '📲 WhatsApp'}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                      <button
                        onClick={() => abrirMenuOrcamento(orc)}
                        style={{ ...buttonBase, background: darkMode ? '#1f2937' : '#eef2ff', color: colors.text, minHeight: 34, height: 34, borderRadius: 12, border: `1px solid ${darkMode ? 'rgba(255,255,255,.10)' : '#dbeafe'}` }}
                      >
                        ⚙ Ações
                      </button>
                      <button
                        onClick={() => editarOrcamento(orc)}
                        style={{ ...buttonBase, background: 'linear-gradient(135deg,#0f172a,#334155)', color: '#fff', minHeight: 34, height: 34, borderRadius: 12 }}
                      >
                        ✎ Editar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>


        {false && mostrarEscolhaModelo && (
          <div
            onClick={() => setMostrarEscolhaModelo(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              background: 'rgba(2,6,23,0.62)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 18,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 860,
                borderRadius: 24,
                background: darkMode ? '#161b22' : '#f3f4f6',
                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#d1d5db'}`,
                boxShadow: '0 28px 70px rgba(15,23,42,0.34)',
                padding: isMobile ? 18 : 24,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Novo orçamento</div>
                  <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, color: colors.text }}>Escolha o modelo</div>
                </div>
                <button onClick={() => setMostrarEscolhaModelo(false)} style={{ ...buttonBase, minHeight: 40, padding: '10px 14px', background: darkMode ? '#2b313a' : '#e5e7eb', color: colors.text }}>Fechar</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <button
                  onClick={() => {
                    novoOrcamento()
                    aplicarModeloOrcamento('recibo_profissional')
                    setMostrarEscolhaModelo(false)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  style={{
                    textAlign: 'left',
                    borderRadius: 22,
                    padding: 20,
                    border: `1px solid ${darkMode ? 'rgba(148,163,184,0.24)' : '#dbe4ef'}`,
                    background: darkMode ? '#20262d' : '#ffffff',
                    boxShadow: '0 16px 32px rgba(15,23,42,0.10)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Modelo 01</div>
                  <div style={{ marginTop: 8, fontSize: 26, fontWeight: 900, color: colors.text }}>Recibo Profissional</div>
                  <div style={{ marginTop: 10, color: colors.muted, lineHeight: 1.6, fontSize: 14 }}>
                    Visual limpo, comercial e pronto para impressão multipágina. Melhor escolha para vender o sistema como solução profissional.
                  </div>
                  <div style={{ marginTop: 16, display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: darkMode ? '#14213b' : '#eff6ff', color: darkMode ? '#bfdbfe' : '#1d4ed8', fontWeight: 800, fontSize: 12 }}>
                    Recomendado para fechamento
                  </div>
                </button>

                <button
                  onClick={() => {
                    novoOrcamento()
                    aplicarModeloOrcamento('comercial_premium')
                    setMostrarEscolhaModelo(false)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  style={{
                    textAlign: 'left',
                    borderRadius: 22,
                    padding: 20,
                    border: '1px solid rgba(37,99,235,0.28)',
                    background: darkMode ? 'linear-gradient(180deg,#20262d,#161b22)' : 'linear-gradient(180deg,#f3f4f6,#ffffff)',
                    boxShadow: '0 16px 32px rgba(37,99,235,0.14)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, color: darkMode ? '#93c5fd' : '#1d4ed8', textTransform: 'uppercase', letterSpacing: 1 }}>Modelo 02</div>
                  <div style={{ marginTop: 8, fontSize: 26, fontWeight: 900, color: colors.text }}>Comercial Premium</div>
                  <div style={{ marginTop: 10, color: colors.muted, lineHeight: 1.6, fontSize: 14 }}>
                    Cabeçalho mais destacado e presença visual mais forte, ideal para empresas que querem uma proposta com mais impacto.
                  </div>
                  <div style={{ marginTop: 16, display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: darkMode ? '#1e3a5f' : '#dbeafe', color: darkMode ? '#dbeafe' : '#1d4ed8', fontWeight: 800, fontSize: 12 }}>
                    Visual mais chamativo
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {formAberto && (
          <div onClick={() => setFormAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(3px)' }} />
        )}
        <div style={formAberto ? { ...shellStyle, position: 'fixed', right: isMobile ? 8 : 24, top: isMobile ? 8 : 24, bottom: isMobile ? 8 : 24, zIndex: 1000, width: isMobile ? 'calc(100vw - 16px)' : 860, maxWidth: 'calc(100vw - 32px)', overflowY: 'auto', boxShadow: '0 30px 80px rgba(15,23,42,0.28)' } : { display: 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.05fr 0.95fr', gap: 16, alignItems: 'start' }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: -4 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: colors.text }}>{editandoOrcamentoId ? 'Editar orçamento' : 'Novo orçamento'}</div>
                <div style={{ color: colors.muted, fontWeight: 700, marginTop: 4 }}>Preencha os dados e salve o documento.</div>
              </div>
              <button onClick={() => setFormAberto(false)} style={{ ...buttonBase, minHeight: 38, padding: '8px 14px', background: darkMode ? '#1f2937' : '#eef2f7', color: colors.text }}>Fechar</button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>👤 Cliente</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                    <button
                      onClick={() => {
                        setMostrarNovoCliente((valor) => !valor)
                        setMostrarBuscaCliente(false)
                      }}
                      style={{
                        ...buttonBase,
                        minHeight: 40,
                        padding: '10px 14px',
                        background: 'linear-gradient(135deg,#4b5563,#374151)',
                        color: '#fff',
                        fontSize: 13,
                        flex: isMobile ? 1 : undefined,
                        boxShadow: '0 10px 18px rgba(37,99,235,0.22)',
                      }}
                    >
                      + Novo cliente
                    </button>
                    <button
                      onClick={() => {
                        if (clientesFiltrados.length > 0) setMostrarBuscaCliente((valor) => !valor)
                      }}
                      style={{
                        ...buttonBase,
                        minHeight: 40,
                        padding: '10px 14px',
                        background: darkMode ? '#18253f' : '#eef2ff',
                        color: colors.text,
                        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#d1d5db'}`,
                        fontSize: 13,
                        flex: isMobile ? 1 : undefined,
                      }}
                    >
                      Buscar
                    </button>
                  </div>
                </div>

                <input
                  value={clienteBusca}
                  onChange={(e) => {
                    setClienteBusca(e.target.value)
                    setMostrarBuscaCliente(true)
                    setMostrarNovoCliente(false)
                  }}
                  onFocus={() => {
                    setMostrarBuscaCliente(true)
                    setMostrarNovoCliente(false)
                  }}
                  placeholder="Pesquisar cliente ou salvar sem cliente (flash)..."
                  style={inputStyle}
                />

                {clienteSelecionado && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 14,
                      border: `1px solid ${darkMode ? 'rgba(34,197,94,0.30)' : '#bbf7d0'}`,
                      background: darkMode ? '#0d1f16' : '#f0fdf4',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: darkMode ? '#dcfce7' : '#166534' }}>{clienteSelecionado.nome}</div>
                    <div style={{ fontSize: 13, color: colors.muted }}>📞 {clienteSelecionado.telefone || 'Sem telefone'}</div>
                    <div style={{ fontSize: 13, color: colors.muted }}>🪪 {clienteSelecionado.tipoPessoa === 'PJ' ? 'PJ' : 'PF'} {clienteSelecionado.cpf ? `• CPF: ${clienteSelecionado.cpf}` : ''} {clienteSelecionado.cnpj ? `• CNPJ: ${clienteSelecionado.cnpj}` : ''}</div>
                    {clienteSelecionado.email ? <div style={{ fontSize: 13, color: colors.muted }}>✉️ {clienteSelecionado.email}</div> : null}
                    {clienteSelecionado.endereco ? <div style={{ fontSize: 13, color: colors.muted }}>📍 Endereço do cliente: {clienteSelecionado.endereco}</div> : null}
                  </div>
                )}

                {clienteSelecionado && (
                  <div style={{ marginTop: 10 }}>
                    <label style={labelStyle}>📦 Endereço de entrega</label>
                    <input
                      value={enderecoEntrega}
                      onChange={(e) => setEnderecoEntrega(e.target.value)}
                      placeholder="Preencha se for diferente do cadastro (ex.: trabalho, outro bairro)"
                      style={inputStyle}
                    />
                  </div>
                )}

                {mostrarNovoCliente && (
                  <div
                    style={{
                      marginTop: 12,
                      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#d1d5db'}`,
                      borderRadius: 16,
                      padding: 12,
                      background: darkMode ? '#091224' : '#f8fbff',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 900, color: colors.text }}>Cadastro rápido de cliente</div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setTipoPessoa('PF')}
                        style={{
                          ...buttonBase,
                          minHeight: 38,
                          padding: '8px 12px',
                          background: tipoPessoa === 'PF' ? 'linear-gradient(135deg,#16a34a,#22c55e)' : darkMode ? '#1f2937' : '#e5e7eb',
                          color: tipoPessoa === 'PF' ? '#052e16' : colors.text,
                          fontSize: 12,
                        }}
                      >
                        Pessoa Física
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoPessoa('PJ')}
                        style={{
                          ...buttonBase,
                          minHeight: 38,
                          padding: '8px 12px',
                          background: tipoPessoa === 'PJ' ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : darkMode ? '#1f2937' : '#e5e7eb',
                          color: '#fff',
                          fontSize: 12,
                        }}
                      >
                        Pessoa Jurídica
                      </button>
                      {tipoPessoa === 'PJ' && (
                        <button
                          type="button"
                          onClick={buscarCNPJ}
                          style={{
                            ...buttonBase,
                            minHeight: 38,
                            padding: '8px 12px',
                            background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                            color: '#fff',
                            fontSize: 12,
                          }}
                        >
                          Buscar CNPJ
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : tipoPessoa === 'PJ' ? '1fr 1fr 1fr' : '1fr 1fr',
                        gap: 8
                      }}
                    >
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>
                          {tipoPessoa === 'PJ' ? 'Razão Social' : 'Nome'}
                        </label>
                        <input
                          value={tipoPessoa === 'PJ' ? novoCliente.razaoSocial : novoCliente.nome}
                          onChange={(e) =>
                            setNovoCliente((atual) => ({
                              ...atual,
                              [tipoPessoa === 'PJ' ? 'razaoSocial' : 'nome']: e.target.value,
                            }))
                          }
                          placeholder={tipoPessoa === 'PJ' ? 'Razão social' : 'Nome do cliente'}
                          style={inputStyle}
                        />
                      </div>

                      {tipoPessoa === 'PJ' ? (
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Nome Fantasia</label>
                          <input
                            value={novoCliente.nomeFantasia}
                            onChange={(e) => setNovoCliente((atual) => ({ ...atual, nomeFantasia: e.target.value, nome: e.target.value }))}
                            placeholder="Nome fantasia"
                            style={inputStyle}
                          />
                        </div>
                      ) : (
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>CPF</label>
                          <input
                            value={novoCliente.cpf}
                            onChange={(e) => setNovoCliente((atual) => ({ ...atual, cpf: e.target.value }))}
                            placeholder="CPF"
                            style={inputStyle}
                          />
                        </div>
                      )}

                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>
                          {tipoPessoa === 'PJ' ? 'CNPJ' : 'Telefone'}
                        </label>
                        <input
                          value={tipoPessoa === 'PJ' ? novoCliente.cnpj : novoCliente.telefone}
                          onChange={(e) =>
                            setNovoCliente((atual) => ({
                              ...atual,
                              [tipoPessoa === 'PJ' ? 'cnpj' : 'telefone']: e.target.value,
                            }))
                          }
                          placeholder={tipoPessoa === 'PJ' ? 'CNPJ' : 'Telefone'}
                          style={inputStyle}
                        />
                      </div>

                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Telefone</label>
                        <input
                          value={novoCliente.telefone}
                          onChange={(e) => setNovoCliente((atual) => ({ ...atual, telefone: e.target.value }))}
                          placeholder="Telefone"
                          style={inputStyle}
                        />
                      </div>

                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>E-mail</label>
                        <input
                          value={novoCliente.email}
                          onChange={(e) => setNovoCliente((atual) => ({ ...atual, email: e.target.value }))}
                          placeholder="E-mail"
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                        <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Endereço</label>
                        <input
                          value={novoCliente.endereco}
                          onChange={(e) => setNovoCliente((atual) => ({ ...atual, endereco: e.target.value }))}
                          placeholder="Endereço"
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={cadastrarNovoClienteRapido}
                        style={{
                          ...buttonBase,
                          minHeight: 42,
                          padding: '10px 14px',
                          background: 'linear-gradient(135deg,#4b5563,#374151)',
                          color: '#052e16',
                          boxShadow: '0 10px 18px rgba(34,197,94,0.20)',
                          flex: isMobile ? 1 : undefined,
                        }}
                      >
                        Salvar cliente
                      </button>
                      <button
                        onClick={() => {
                          setMostrarNovoCliente(false)
                          setNovoCliente({ ...NOVO_CLIENTE_INICIAL })
                        }}
                        style={{
                          ...buttonBase,
                          minHeight: 42,
                          padding: '10px 14px',
                          background: darkMode ? '#2b313a' : '#e5e7eb',
                          color: colors.text,
                          flex: isMobile ? 1 : undefined,
                        }}
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                )}

                {mostrarBuscaCliente && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {clientesFiltrados.length === 0 ? (
                      <div
                        style={{
                          border: `1px dashed ${colors.border}`,
                          background: colors.inputBg,
                          color: colors.muted,
                          borderRadius: 12,
                          padding: 12,
                          fontWeight: 700,
                        }}
                      >
                        Nenhum cliente encontrado. Use o botão <strong>+ Novo cliente</strong>.
                      </div>
                    ) : (
                      clientesFiltrados.map((cliente) => (
                        <button
                          key={cliente.id}
                          onClick={() => selecionarCliente(cliente)}
                          style={{
                            textAlign: 'left',
                            border: `1px solid ${colors.inputBorder}`,
                            background: colors.inputBg,
                            color: colors.text,
                            borderRadius: 12,
                            padding: 12,
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          <div style={{ fontWeight: 900 }}>{cliente.nome}</div>
                          <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                            {cliente.telefone || 'Sem telefone'} {cliente.email ? `• ${cliente.email}` : ''} {cliente.cpf ? `• CPF: ${cliente.cpf}` : ''} {cliente.cnpj ? `• CNPJ: ${cliente.cnpj}` : ''}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>📦 Produto / Serviço</label>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
                  {[
                    { key: 'produto', label: 'Produto', cor: '#f97316' },
                    { key: 'servico', label: 'Serviço', cor: '#2563eb' },
                    { key: 'peso', label: 'Kg / Peso', cor: '#16a34a' },
                    { key: 'm2', label: 'm²', cor: '#7c3aed' },
                  ].map((opcao) => (
                    <button
                      key={opcao.key}
                      onClick={() => {
                        const key = opcao.key as 'produto' | 'servico' | 'peso' | 'm2'
                        setFiltroItem(key)
                        setModoItem(key === 'servico' ? 'servico' : 'produto')
                        setProdutoSelecionadoId(null)
                        setProdutoBusca('')
                        setQuantidade(key === 'peso' ? 0 : 1)
                        setPesoInput('')
                        setLarguraItem(0)
                        setAlturaItem(0)
                      }}
                      style={{
                        ...buttonBase,
                        background: filtroItem === opcao.key ? opcao.cor : darkMode ? '#e5e7eb' : '#f1f5f9',
                        color: filtroItem === opcao.key ? '#fff' : '#111827',
                        borderColor: filtroItem === opcao.key ? opcao.cor : 'rgba(148,163,184,0.30)',
                      }}
                    >
                      {opcao.label}
                    </button>
                  ))}
                </div>

                {usaCampoM2 ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: isMobile ? '1fr 1fr' : 'minmax(180px, 1fr) minmax(108px, 0.7fr) minmax(108px, 0.7fr) minmax(150px, auto)',
                      alignItems: 'stretch',
                    }}
                  >
                    <input
                      value={produtoBusca}
                      onChange={(e) => {
                        setProdutoBusca(e.target.value)
                        setProdutoSelecionadoId(null)
                        setMostrarBuscaProduto(true)
                      }}
                      onFocus={() => setMostrarBuscaProduto(true)}
                      placeholder={filtroItem === 'm2' ? 'Pesquisar produto por m²...' : 'Pesquisar produto...'}
                      style={{ ...inputStyle, gridColumn: isMobile ? '1 / -1' : undefined, minWidth: 0 }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatarDecimalVisual(larguraItem)}
                      onChange={(e) => setLarguraItem(textoParaNumeroDecimal(e.target.value))}
                      placeholder="Largura"
                      style={{ ...inputStyle, minWidth: 0 }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatarDecimalVisual(alturaItem)}
                      onChange={(e) => setAlturaItem(textoParaNumeroDecimal(e.target.value))}
                      placeholder="Altura"
                      style={{ ...inputStyle, minWidth: 0 }}
                    />
                    <button
                      onClick={confirmarItemSelecionado}
                      style={{
                        ...buttonBase,
                        background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                        color: '#fff',
                        minHeight: 44,
                        height: 44,
                        width: isMobile ? '100%' : 'auto',
                        gridColumn: isMobile ? '1 / -1' : undefined,
                      }}
                    >
                      {editandoId !== null ? 'Atualizar item' : 'Adicionar item'}
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(110px, 140px) minmax(150px, auto)',
                      alignItems: 'stretch',
                    }}
                  >
                    <input
                      value={produtoBusca}
                      onChange={(e) => {
                        setProdutoBusca(e.target.value)
                        setProdutoSelecionadoId(null)
                        setMostrarBuscaProduto(true)
                      }}
                      onFocus={() => setMostrarBuscaProduto(true)}
                      placeholder={filtroItem === 'servico' ? 'Pesquisar serviço...' : filtroItem === 'peso' ? 'Pesquisar produto por kg/peso...' : 'Pesquisar produto...'}
                      style={{ ...inputStyle, minWidth: 0 }}
                    />
                    <input
                      type={usaCampoPeso ? 'text' : 'number'}
                      inputMode={usaCampoPeso ? 'decimal' : 'numeric'}
                      min={usaCampoPeso ? undefined : 1}
                      value={usaCampoPeso ? pesoInput : (quantidade || '')}
                      onChange={(e) => {
                        if (usaCampoPeso) {
                          const valor = tratarPesoInput(e.target.value)
                          setPesoInput(valor)
                          setQuantidade(textoPesoParaKg(valor))
                          return
                        }

                        setQuantidade(Number(e.target.value || 0))
                      }}
                      placeholder={usaCampoPeso ? 'Ex: 0,65 ou 650' : modoItem === 'servico' ? 'Qtd.' : 'Qtd.'}
                      style={{ ...inputStyle, minWidth: 0 }}
                    />
                    <button
                      onClick={confirmarItemSelecionado}
                      style={{
                        ...buttonBase,
                        background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                        color: '#fff',
                        minHeight: 44,
                        height: 44,
                        width: isMobile ? '100%' : 'auto',
                      }}
                    >
                      {editandoId !== null ? 'Atualizar item' : 'Adicionar item'}
                    </button>
                  </div>
                )}

                {produtoSelecionado && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: darkMode ? '#172554' : '#eff6ff', border: '1px solid #3b82f6', color: darkMode ? '#dbeafe' : '#1e3a8a', fontWeight: 800 }}>
                    Selecionado: {produtoSelecionado.nome} • {usaCampoM2 ? `${moeda(produtoSelecionado.valor)} / m²` : usaCampoPeso ? `${moeda(produtoSelecionado.valor)} / kg` : moeda(produtoSelecionado.valor)}
                    {usaCampoM2 ? <div style={{ marginTop: 6 }}>Área calculada: {Number(metragemAtual || 0).toFixed(2)} m²</div> : null}
                    {usaCampoPeso && quantidade > 0 ? <div style={{ marginTop: 6 }}>Peso informado: {quantidade < 1 ? `${Math.round(quantidade * 1000)} g` : `${formatarPesoKgVisual(quantidade)} kg`}</div> : null}
                  </div>
                )}

                {mostrarBuscaProduto && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {produtosFiltrados.map((produto) => (
                      <button
                        key={produto.id}
                        onClick={() => selecionarProduto(produto)}
                        style={{
                          textAlign: 'left',
                          border: `1px solid ${colors.inputBorder}`,
                          background: colors.inputBg,
                          color: colors.text,
                          borderRadius: 10,
                          padding: 10,
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {produto.nome} • {produto.tipoCalculo === 'm2' ? `${moeda(produto.valor)} / m²` : produto.tipoCalculo === 'peso' ? `${moeda(produto.valor)} / kg` : moeda(produto.valor)}{produto.codigoBarras ? ` • cód. ${produto.codigoBarras}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Itens</div>
                {itens.length === 0 ? (
                  <div style={{ color: colors.muted }}>Nenhum item adicionado.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {itens.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: `1.5px solid ${item.tipoCalculo === 'm2' ? '#22c55e' : '#1d4ed8'}`,
                          borderRadius: 16,
                          padding: 14,
                          background: darkMode ? '#091224' : '#ffffff',
                          boxShadow: darkMode ? '0 8px 24px rgba(0,0,0,0.20)' : '0 8px 22px rgba(37,99,235,0.08)',
                          display: 'grid',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: colors.text, lineHeight: 1.2, wordBreak: 'break-word', marginBottom: 4 }}>
                              {item.nome}
                            </div>
                            {item.mostrarCliente === false && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '4px 8px', background: darkMode ? '#451a03' : '#ffedd5', color: darkMode ? '#fed7aa' : '#9a3412', fontSize: 11, fontWeight: 950, marginBottom: 5 }}>
                                Interno/Oculto do cliente
                              </span>
                            )}
                            {item.tipoCalculo === 'm2' && (
                              <div style={{ fontSize: 12, color: colors.muted, fontWeight: 700 }}>
                                Área calculada: {Number(item.metragem || 0).toFixed(2)} m²
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              background: item.tipoCalculo === 'm2' ? (darkMode ? '#172554' : '#eff6ff') : darkMode ? '#1e293b' : '#f8fafc',
                              color: item.tipoCalculo === 'm2' ? '#60a5fa' : colors.muted,
                              border: `1px solid ${item.tipoCalculo === 'm2' ? '#3b82f6' : colors.inputBorder}`,
                              borderRadius: 999,
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.tipoCalculo === 'm2' ? 'Metro quadrado' : item.tipoCalculo === 'peso' ? 'Produto por peso' : item.tipoCadastro === 'servico' ? 'Serviço' : 'Produto'}
                          </div>
                        </div>

                        {item.tipoCalculo === 'm2' ? (
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(110px, 1fr))', gap: 8 }}>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Largura</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={formatarDecimalVisual(item.largura)}
                                onChange={(e) => alterarLarguraItemLista(item.id, textoParaNumeroDecimal(e.target.value))}
                                style={inputStyle}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Altura</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={formatarDecimalVisual(item.altura)}
                                onChange={(e) => alterarAlturaItemLista(item.id, textoParaNumeroDecimal(e.target.value))}
                                style={inputStyle}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>R$ / m²</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={formatarDecimalVisual(Number(item.valorM2 ?? item.valor ?? 0))}
                                onChange={(e) => alterarValorItem(item.id, textoParaNumeroDecimal(e.target.value))}
                                style={inputStyle}
                                placeholder="0,00"
                              />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Total</label>
                              <div style={totalBoxStyle}>💰 {moeda(calcularTotalItem(item))}</div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '120px 140px 1fr', gap: 8 }}>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>{item.tipoCalculo === 'peso' ? 'Peso' : item.tipoCadastro === 'servico' ? 'Qtd. serviço' : 'Qtd'}</label>
                              <input type={item.tipoCalculo === 'peso' ? 'text' : 'number'} inputMode={item.tipoCalculo === 'peso' ? 'decimal' : 'numeric'} min={item.tipoCalculo === 'peso' ? undefined : 1} value={item.tipoCalculo === 'peso' ? formatarPesoCampo(item.quantidade) : item.quantidade} onChange={(e) => alterarQuantidadeItem(item.id, item.tipoCalculo === 'peso' ? textoPesoParaKg(e.target.value) : Number(e.target.value || 1))} style={inputStyle} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>R$ Unitário</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={formatarDecimalVisual(item.valor)}
                                onChange={(e) => alterarValorItem(item.id, textoParaNumeroDecimal(e.target.value))}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12 }}>Total</label>
                              <div style={totalBoxStyle}>💰 {moeda(calcularTotalItem(item))}</div>
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${colors.inputBorder}`, paddingTop: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>
                            Total do item: <span style={{ color: '#22c55e' }}>{moeda(calcularTotalItem(item))}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={() => ajustarQuantidadeItem(item.id, 1)} style={{ ...buttonBase, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', padding: '10px 14px', boxShadow: '0 8px 18px rgba(34,197,94,0.22)' }}>+</button>
                            <button onClick={() => ajustarQuantidadeItem(item.id, -1)} style={{ ...buttonBase, background: darkMode ? '#334155' : '#e2e8f0', color: darkMode ? '#fff' : '#111827', padding: '10px 14px' }}>-</button>
                            <button onClick={() => alterarVisibilidadeItemCliente(item.id)} style={{ ...buttonBase, background: item.mostrarCliente === false ? 'linear-gradient(135deg,#f97316,#ea580c)' : darkMode ? '#334155' : '#e2e8f0', color: item.mostrarCliente === false ? '#fff' : darkMode ? '#fff' : '#111827', padding: '10px 14px' }}>{item.mostrarCliente === false ? 'Mostrar ao cliente' : 'Ocultar do cliente'}</button>
                            <button onClick={() => editarItem(item)} style={{ ...buttonBase, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', padding: '10px 14px', boxShadow: '0 8px 18px rgba(37,99,235,0.25)' }}>Editar</button>
                            <button onClick={() => removerItem(item.id)} style={{ ...buttonBase, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', padding: '10px 14px', boxShadow: '0 8px 18px rgba(239,68,68,0.22)' }}>Remover</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={cardStyle}>
                <label style={labelStyle}>📝 Título</label>
                <div style={{ display: 'grid', gridTemplateColumns: config.logoUrl ? '56px 1fr' : '1fr', gap: 8, alignItems: 'center' }}>
                  {config.logoUrl ? <img src={config.logoUrl} alt="Logo" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: '#fff', padding: 4 }} /> : null}
                  <input value={tituloPdf} onChange={(e) => setTituloPdf(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                  <div style={{ gridColumn: isMobile ? '1 / -1' : '1 / -1' }}>
                    <label style={labelStyle}>💳 Formas de pagamento</label>
                    
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {OPCOES_PAGAMENTO_ORCAMENTO.map((opcao) => {
                        const ativo = formasPagamentoSelecionadas.includes(opcao.label)
                        return (
                          <button
                            key={opcao.id}
                            type="button"
                            onClick={() =>
                              setFormasPagamentoSelecionadas((atual) =>
                                atual.includes(opcao.label) ? atual.filter((f) => f !== opcao.label) : [...atual, opcao.label],
                              )
                            }
                            style={{
                              minHeight: 38,
                              borderRadius: 999,
                              border: ativo ? '2px solid #2563eb' : `1px solid ${colors.inputBorder}`,
                              background: ativo ? (darkMode ? '#1e3a8a' : '#eff6ff') : (darkMode ? '#0f172a' : '#fff'),
                              color: ativo ? (darkMode ? '#bfdbfe' : '#1d4ed8') : colors.text,
                              fontWeight: 900,
                              fontSize: 13,
                              padding: '0 14px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              boxShadow: ativo ? '0 0 16px rgba(37,99,235,.15)' : 'none',
                            }}
                          >
                            <span>{opcao.icon}</span> {opcao.label}
                          </button>
                        )
                      })}
                    
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 800, color: colors.muted, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={ocultarValorUnitarioM2}
                        onChange={(e) => setOcultarValorUnitarioM2(e.target.checked)}
                      />
                      No PDF/WhatsApp para o cliente, itens m² mostram só descrição e valor final (cálculo interno no painel)
                    </label>
                  </div>
                  {formasPagamentoSelecionadas.some((f) => f.toLowerCase().includes('boleto')) && (
                    <div>
                      <label style={labelStyle}>🗓️ Prazo dos boletos</label>
                      <select value={parcelasBoleto} onChange={(e) => setParcelasBoleto(e.target.value)} style={inputStyle}>
                        <option value="">Selecione</option>
                        <option value="30 dias">30 dias</option>
                        <option value="30 / 60 dias">30 / 60 dias</option>
                        <option value="30 / 60 / 90 dias">30 / 60 / 90 dias</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>📅 Validade</label>
                    <input value={validade} onChange={(e) => setValidade(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>🚚 Prazo entrega</label>
                    <input value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>🚛 Entrega</label>
                    <input type="number" min={0} step="0.01" value={valorEntrega === 0 ? '' : valorEntrega} placeholder="0,00" onFocus={(e) => e.currentTarget.select()} onChange={(e) => setValorEntrega(e.target.value === '' ? 0 : Number(e.target.value))} style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>🏷 Desconto</label>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '140px 1fr', gap: 8 }}>
                    <select value={descontoTipo} onChange={(e) => setDescontoTipo(e.target.value as 'valor' | 'percentual')} style={inputStyle}>
                      <option value="valor">R$</option>
                      <option value="percentual">%</option>
                    </select>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={descontoInput}
                      onChange={(e) => setDescontoInput(e.target.value)}
                      placeholder={descontoTipo === 'percentual' ? 'Ex: 10' : '0,00'}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Resumo</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 15 }}>Subtotal: <strong>{moeda(subtotal)}</strong></div>
                  <div style={{ fontSize: 15 }}>Entrega: <strong>{moeda(valorEntrega)}</strong></div>
                  <div style={{ fontSize: 15 }}>Desconto: <strong>{moeda(valorDesconto)}</strong>{descontoTipo === 'percentual' && descontoInput ? ` (${textoDecimalLivreParaNumero(descontoInput).toLocaleString('pt-BR')}%)` : ''}</div>
                  <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900 }}>💰 Total: {moeda(total)}</div>
                </div>
              </div>

              <div style={cardStyle}>
                <label style={{ ...labelStyle, color: '#dc2626' }}>📝 Observação</label>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', justifyContent: isMobile ? 'stretch' : 'stretch', gap: 8, alignItems: 'stretch' }}>
                <button type="button" disabled={salvandoOrcamento} onClick={novoOrcamento} style={{ ...buttonBase, width: '100%', background: '#e5e7eb', color: '#111827', opacity: salvandoOrcamento ? 0.6 : 1 }}>Limpar</button>
                <button type="button" disabled={salvandoOrcamento} onClick={() => void salvarOrcamento()} style={{ ...actionButtonStyle('os'), opacity: salvandoOrcamento ? 0.7 : 1, cursor: salvandoOrcamento ? 'wait' : 'pointer' }}>
                  {salvandoOrcamento ? 'Salvando…' : editandoOrcamentoId !== null ? 'Atualizar orçamento' : 'Salvar orçamento'}
                </button>
                <button type="button" disabled={salvandoOrcamento} onClick={gerarPDF} style={{ ...actionButtonStyle('editar'), opacity: salvandoOrcamento ? 0.7 : 1 }}>Gerar PDF</button>
              </div>
            </div>
          </div>

        </div>
      </div>

        {modalPropostaAberto && (
          <div
            onClick={() => setModalPropostaAberto(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1250,
              background: 'rgba(2,6,23,0.62)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 18,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 760,
                maxHeight: '92vh',
                overflowY: 'auto',
                borderRadius: 24,
                background: darkMode ? '#161b22' : '#ffffff',
                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#dbeafe'}`,
                boxShadow: '0 28px 70px rgba(15,23,42,0.34)',
                padding: isMobile ? 16 : 22,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Proposta rápida</div>
                  <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: colors.text }}>Nova proposta comercial</div>
                </div>
                <button type="button" onClick={() => setModalPropostaAberto(false)} style={{ ...buttonBase, minHeight: 40, padding: '10px 14px', background: darkMode ? '#2b313a' : '#e5e7eb', color: colors.text }}>Fechar</button>
              </div>

              <label style={labelStyle}>Modelo rápido</label>
              <select
                value={modeloPropostaRapida}
                onChange={(e) => aplicarModeloProposta(e.target.value as ModeloPropostaRapida)}
                style={{ ...inputStyle, marginBottom: 12 }}
              >
                <option value="servico">Serviço</option>
                <option value="produto">Produto</option>
                <option value="moveis">Móveis planejados</option>
                <option value="assistencia">Assistência técnica</option>
                <option value="grafica">Gráfica / Papelaria</option>
              </select>

              <label style={labelStyle}>Cliente</label>
              <input
                value={propostaClienteBusca}
                onChange={(e) => setPropostaClienteBusca(e.target.value)}
                placeholder="Buscar cliente cadastrado"
                style={{ ...inputStyle, marginBottom: 8 }}
              />
              {propostaCliente ? (
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 12, background: darkMode ? 'rgba(37,99,235,.12)' : '#eff6ff', color: colors.text, fontWeight: 800 }}>
                  Selecionado: {propostaCliente.nome} {propostaCliente.telefone ? `• ${propostaCliente.telefone}` : ''}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6, marginBottom: 12, maxHeight: 140, overflowY: 'auto' }}>
                  {clientesPropostaFiltrados.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => {
                        setPropostaCliente(cliente)
                        setPropostaClienteBusca(cliente.nome)
                      }}
                      style={{ ...buttonBase, justifyContent: 'flex-start', background: darkMode ? '#1f2937' : '#f8fafc', color: colors.text, minHeight: 38, height: 38 }}
                    >
                      {cliente.nome} {cliente.telefone ? `• ${cliente.telefone}` : ''}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Título da proposta</label>
                  <input value={propostaTitulo} onChange={(e) => setPropostaTitulo(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Serviço/produto principal</label>
                  <input value={propostaServicoPrincipal} onChange={(e) => setPropostaServicoPrincipal(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <label style={labelStyle}>Descrição da proposta</label>
              <textarea value={propostaDescricao} onChange={(e) => setPropostaDescricao(e.target.value)} rows={3} style={{ ...inputStyle, minHeight: 88, resize: 'vertical', marginBottom: 10 }} />

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Valor total</label>
                  <input value={propostaValorTotal} onChange={(e) => setPropostaValorTotal(e.target.value)} placeholder="0,00" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Prazo de entrega</label>
                  <input value={propostaPrazoEntrega} onChange={(e) => setPropostaPrazoEntrega(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Condições de pagamento</label>
                  <input value={propostaCondicoesPagamento} onChange={(e) => setPropostaCondicoesPagamento(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Validade da proposta</label>
                  <input value={propostaValidade} onChange={(e) => setPropostaValidade(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <label style={labelStyle}>Observações</label>
              <textarea value={propostaObservacoes} onChange={(e) => setPropostaObservacoes(e.target.value)} rows={2} style={{ ...inputStyle, minHeight: 70, resize: 'vertical', marginBottom: 14 }} />

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                <button type="button" disabled={salvandoOrcamento} onClick={() => setModalPropostaAberto(false)} style={{ ...buttonBase, background: darkMode ? '#2b313a' : '#e5e7eb', color: colors.text, opacity: salvandoOrcamento ? 0.6 : 1 }}>Cancelar</button>
                <button type="button" disabled={salvandoOrcamento} onClick={() => void salvarPropostaComercial()} style={{ ...actionButtonStyle('os'), opacity: salvandoOrcamento ? 0.7 : 1, cursor: salvandoOrcamento ? 'wait' : 'pointer' }}>
                  {salvandoOrcamento ? 'Salvando…' : 'Salvar proposta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {orcamentoMenuAberto && (
          <div
            onClick={fecharMenuOrcamento}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(2,6,23,0.55)',
              backdropFilter: 'blur(4px)',
              zIndex: 999,
              display: 'grid',
              alignItems: isMobile ? 'flex-end' : 'center',
              justifyContent: 'center',
              padding: isMobile ? '16px 12px calc(env(safe-area-inset-bottom, 0px) + 14px)' : 16,
            }}
          >
            <div
              id="connect-acoes-orcamento-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 680,
                maxHeight: isMobile ? '82dvh' : '88vh',
                overflowY: 'auto',
                borderRadius: isMobile ? '22px 22px 16px 16px' : 18,
                background: darkMode ? '#161b22' : '#f3f4f6',
                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#d1d5db'}`,
                boxShadow: darkMode ? '0 18px 44px rgba(0,0,0,0.34)' : '0 18px 44px rgba(15,23,42,0.16)',
                padding: isMobile ? 12 : 12,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: colors.text }}>Orçamento Comercial</div>
                  <div style={{ color: colors.muted, fontWeight: 700, marginTop: 4 }}>{orcamentoMenuAberto.cliente?.nome || '-'} • #{orcamentoMenuAberto.numero}</div>
                </div>
                <button onClick={fecharMenuOrcamento} style={{ ...buttonBase, width: 30, height: 30, padding: 0, background: darkMode ? '#2b313a' : '#e5e7eb', color: colors.text }}>✕</button>
              </div>

              <div>
                <label style={labelStyle}>🔗 Link compartilhável do documento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 46px', gap: 8 }}>
                  <input readOnly value={gerarLinkDocumento(orcamentoMenuAberto.id, orcamentoMenuAberto)} style={inputStyle} />
                  <button type="button" onClick={() => void copiarLinkOrcamento(orcamentoMenuAberto)} style={{ ...buttonBase, background: darkMode ? '#2b313a' : '#e5e7eb', color: colors.text, minHeight: 28, height: 28 }}>📋</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 170px 120px', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Selecione o status do documento</label>
                  <select value={orcamentoMenuAberto.status} onChange={(e) => setOrcamentoMenuAberto({ ...orcamentoMenuAberto, status: e.target.value as StatusOrcamento })} style={inputStyle}>
                    <option value="Pendente">Pendente</option>
                    <option value="Aprovado">Aprovado</option>
                    <option value="Convertido">Convertido</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
                <div style={{ color: colors.muted, fontWeight: 700, paddingBottom: 10 }}>Valor: {moeda(orcamentoMenuAberto.total)}</div>
                <button
                  onClick={() => {
                    alterarStatusOrcamento(orcamentoMenuAberto.id, orcamentoMenuAberto.status, 'Status atualizado!')
                    fecharMenuOrcamento()
                  }}
                  style={actionButtonStyle('gravar')}
                >
                  Gravar
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(118px,1fr))', gap: 8 }}>
                <button onClick={() => { editarOrcamento(orcamentoMenuAberto); fecharMenuOrcamento() }} style={actionButtonStyle('editar')}>Editar</button>
                <button
                  onClick={() => {
                    const id = orcamentoMenuAberto.id
                    fecharMenuOrcamento()
                    visualizarOrcamentoInterno(id)
                  }}
                  style={actionButtonStyle('visualizar')}
                >
                  Visualizar
                </button>
                <button onClick={() => { excluirOrcamento(orcamentoMenuAberto.id); fecharMenuOrcamento() }} style={actionButtonStyle('deletar')}>Deletar</button>
                <button type="button" onClick={() => void copiarLinkOrcamento(orcamentoMenuAberto)} style={actionButtonStyle('copiar')}>Copiar</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(112px,1fr))', gap: 8 }}>
                <button onClick={() => { alterarStatusOrcamento(orcamentoMenuAberto.id, 'Aprovado', 'Orçamento aprovado!'); fecharMenuOrcamento() }} style={actionButtonStyle('aprovar')}>Aprovar</button>
                <button onClick={() => { alterarStatusOrcamento(orcamentoMenuAberto.id, 'Cancelado', 'Orçamento cancelado.'); fecharMenuOrcamento() }} style={actionButtonStyle('cancelar')}>Cancelar</button>
                <button onClick={() => { gerarVenda(orcamentoMenuAberto); fecharMenuOrcamento() }} style={actionButtonStyle('venda')}>{orcamentoSomenteProdutos(orcamentoMenuAberto) ? 'Finalizar Venda' : 'Gerar Venda'}</button>
                <button
                  disabled={!orcamentoTemServico(orcamentoMenuAberto)}
                  title={!orcamentoTemServico(orcamentoMenuAberto) ? 'OS fica disponível apenas para orçamento de serviço.' : 'Criar ordem de serviço'}
                  onClick={() => { gerarOS(orcamentoMenuAberto); fecharMenuOrcamento() }}
                  style={{ ...actionButtonStyle('os'), opacity: orcamentoTemServico(orcamentoMenuAberto) ? 1 : 0.45, cursor: orcamentoTemServico(orcamentoMenuAberto) ? 'pointer' : 'not-allowed' }}
                >Gerar OS</button>
              </div>
            </div>
          </div>
        )}

    </div>
  )
}

function ResumoCard({ titulo, valor, darkMode }: { titulo: string; valor: string; darkMode: boolean }) {
  return (
    <div
      style={{
        background: darkMode ? '#0f1b31' : '#ffffff',
        borderRadius: 18,
        padding: 18,
        border: `1px solid ${darkMode ? 'rgba(59,130,246,0.28)' : '#e5e7eb'}`,
        boxShadow: darkMode ? '0 10px 26px rgba(0,0,0,0.16)' : '0 10px 26px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: darkMode ? '#94a3b8' : '#6b7280', marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: darkMode ? '#f8fafc' : '#111827', lineHeight: 1 }}>{valor}</div>
    </div>
  )
}

