'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const OS_KEY = 'connect_ordens_servico_salvas'
const CONFIG_KEY = 'connect_configuracoes'

type OrdemServico = {
  id?: string | number
  numero?: string | number
  cliente?: string
  telefone?: string
  email?: string
  endereco?: string
  equipamento?: string
  marca?: string
  modelo?: string
  serial?: string
  defeito?: string
  checklist?: string
  observacao?: string
  valor?: number | string
  entrada?: number | string
  saldo?: number | string
  status?: string
  prioridade?: string
  tecnico?: string
  previsao?: string
  data?: string
  ultimaAtualizacao?: string
}

type ConfiguracaoSistema = {
  nomeEmpresa?: string
  telefone?: string
  endereco?: string
  cidadeUf?: string
  cidade?: string
  responsavel?: string
  corPrimaria?: string
  corSecundaria?: string
  logoUrl?: string
  logo?: string
}

function normalizarNumero(valor: unknown) {
  if (typeof valor === 'number') return valor
  if (typeof valor !== 'string') return 0
  const texto = valor.trim()
  if (!texto) return 0
  const limpo = texto.replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.')
  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : 0
}

function moeda(valor?: unknown) {
  return normalizarNumero(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatarDataBR(data?: string) {
  if (!data) return new Date().toLocaleDateString('pt-BR')
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return data
  const d = new Date(`${data}T00:00:00`)
  if (Number.isNaN(d.getTime())) return data
  return d.toLocaleDateString('pt-BR')
}

function escapeHtml(valor: string) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function numeroPorExtenso(valor: number) {
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

  function ate999(n: number): string {
    if (n === 0) return ''
    if (n === 100) return 'cem'
    const c = Math.floor(n / 100)
    const resto = n % 100
    const d = Math.floor(resto / 10)
    const u = resto % 10
    let partes: string[] = []
    if (c > 0) partes.push(centenas[c])
    if (resto > 0) {
      if (resto < 10) partes.push(unidades[resto])
      else if (resto < 20) partes.push(especiais[resto - 10])
      else partes.push(u > 0 ? `${dezenas[d]} e ${unidades[u]}` : dezenas[d])
    }
    return partes.filter(Boolean).join(' e ')
  }

  const inteiro = Math.floor(valor)
  if (inteiro === 0) return 'ZERO REAIS'
  const milhares = Math.floor(inteiro / 1000)
  const resto = inteiro % 1000
  let partes: string[] = []
  if (milhares > 0) partes.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`)
  if (resto > 0) partes.push(ate999(resto))
  return `${partes.join(', ').replace(/, ([^,]*)$/, ' e $1')} ${inteiro === 1 ? 'REAL' : 'REAIS'}`.toUpperCase()
}

function getOrdens(): OrdemServico[] {
  try {
    const salvo = localStorage.getItem(OS_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function getConfig(): ConfiguracaoSistema {
  try {
    const salvo = localStorage.getItem(CONFIG_KEY)
    const config = salvo ? JSON.parse(salvo) : {}
    return config && typeof config === 'object' ? config : {}
  } catch {
    return {}
  }
}

function buscarOS(lista: OrdemServico[], id: string): OrdemServico | null {
  return (
    lista.find((item) => String(item.id) === String(id)) ||
    lista.find((item) => String(item.numero) === String(id)) ||
    null
  )
}

export default function ImpressaoOrdemServicoPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [os, setOs] = useState<OrdemServico | null>(null)
  const [config, setConfig] = useState<ConfiguracaoSistema>({})
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    setOs(buscarOS(getOrdens(), id))
    setConfig(getConfig())
    setCarregado(true)
  }, [id])

  const valorNumero = useMemo(() => normalizarNumero(os?.valor ?? 0), [os])
  const entradaNumero = useMemo(() => normalizarNumero(os?.entrada ?? 0), [os])
  const saldoNumero = useMemo(() => normalizarNumero(os?.saldo ?? 0), [os])

  const nomeEmpresa = config.nomeEmpresa || 'LOJA CONNECT'
  const cidadeUf = config.cidadeUf || config.cidade || 'PARNAMIRIM-RN'
  const telefoneEmpresa = config.telefone || ''
  const responsavel = config.responsavel || 'ERES FAUSTINO'
  const logoUrl = config.logoUrl || config.logo || '/logo-connect.png'
  const corPrimaria = config.corPrimaria || '#22c55e'
  const corSecundaria = config.corSecundaria || '#e5e7eb'

  const numeroOS = String(os?.numero || os?.id || '')
  const cliente = os?.cliente || 'Cliente não informado'
  const equipamento = os?.equipamento || 'Equipamento não informado'
  const marcaModelo = [os?.marca, os?.modelo].filter(Boolean).join(' / ') || '-'
  const serial = os?.serial || '-'
  const defeito = os?.defeito || 'Não informado'
  const checklist = os?.checklist || 'Não informado'
  const observacao = os?.observacao || 'Sem observações.'
  const tecnico = os?.tecnico || responsavel
  const status = os?.status || 'Aberta'
  const prioridade = os?.prioridade || 'Média'
  const previsao = os?.previsao || '-'
  const dataAbertura = formatarDataBR(os?.data)
  const ultimaAtualizacao = formatarDataBR(os?.ultimaAtualizacao || os?.data)
  const telefoneCliente = os?.telefone || ''
  const emailCliente = os?.email || ''
  const enderecoCliente = os?.endereco || '-'
  const valorExtenso = numeroPorExtenso(valorNumero)

  function abrirVisualizacaoPDF() {
    if (!os) return

    const logoAbsoluta = String(logoUrl).startsWith('data:')
      ? String(logoUrl)
      : `${window.location.origin}${String(logoUrl).startsWith('/') ? String(logoUrl) : `/${String(logoUrl)}`}`

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Ordem de Serviço</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #0b2d63; font-family: Arial, sans-serif; color: #111827; }
          .topbar { max-width: 980px; margin: 18px auto 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 0 12px; }
          .btn { border: none; border-radius: 12px; padding: 11px 18px; font-weight: 800; cursor: pointer; }
          .btn-sec { background: #e5e7eb; color: #111827; }
          .btn-pri { background: #2563eb; color: #fff; }
          .page-wrap { max-width: 980px; margin: 0 auto 20px; padding: 0 12px 20px; }
          .page { background: #f7f3ea; border-radius: 24px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid ${escapeHtml(corSecundaria)}; }
          .inner { background: #fff; border-radius: 22px; padding: 16px; border: 1px solid ${escapeHtml(corSecundaria)}; }
          .header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 3px solid ${escapeHtml(corPrimaria)}; padding-bottom: 12px; margin-bottom: 12px; }
          .brand { display: flex; gap: 12px; align-items: center; }
          .brand img { width: 80px; height: 80px; object-fit: contain; border-radius: 12px; }
          .company-name { font-weight: 900; font-size: 30px; line-height: 1.05; color: #111827; }
          .muted { color: #4b5563; margin-top: 2px; }
          .head-right { text-align: right; }
          .head-right .titulo { font-weight: 900; font-size: 22px; color: #111827; }
          .head-right .numero { margin-top: 10px; font-weight: 700; }

          .hero { border: 1px solid ${escapeHtml(corSecundaria)}; border-radius: 14px; padding: 12px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }
          .hero-badge { display: inline-block; background: ${escapeHtml(corPrimaria)}; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px; }
          .hero-box { display: inline-block; background: #fff59d; padding: 9px 15px; border-radius: 14px; font-size: 28px; font-weight: 900; color: #111827; box-shadow: inset 0 -12px 0 rgba(255,235,59,0.45); }

          .cards3, .cards2 { display: grid; gap: 8px; margin-bottom: 8px; }
          .cards3 { grid-template-columns: repeat(3,1fr); }
          .cards2 { grid-template-columns: repeat(2,1fr); }

          .card { border: 1px solid ${escapeHtml(corSecundaria)}; border-radius: 12px; padding: 10px; min-height: 86px; text-align: center; }
          .icone { font-size: 16px; margin-bottom: 4px; }
          .label { font-weight: 800; font-size: 12px; margin-bottom: 4px; color: #3f3f46; }
          .value { font-size: 14px; font-weight: 700; line-height: 1.2; word-break: break-word; }

          .box { border: 1px solid ${escapeHtml(corSecundaria)}; border-radius: 14px; padding: 10px; margin-bottom: 8px; }
          .box-titulo { font-weight: 900; margin-bottom: 5px; color: #6b7280; }

          .assinatura { margin-top: 0; text-align: center; }
          .assinatura .linha { width: 230px; max-width: 100%; margin: 0 auto; border-top: 2px solid #111827; padding-top: 3px; }
          .assinatura .nome { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
          .assinatura .sub { margin-top: 1px; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: .3px; }

          @page { size: A4 portrait; margin: 6mm; }
          @media print {
            html, body { background: white !important; }
            .topbar { display: none !important; }
            .page-wrap { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
            .page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; border: none !important; background: #fff !important; }
            .inner { border: none !important; padding: 0 !important; }
            .cards3, .cards2, .hero, .box, .assinatura { break-inside: avoid-page; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="topbar">
          <button class="btn btn-sec" onclick="window.close()">Fechar</button>
          <button class="btn btn-pri" onclick="window.print()">Visualizar / Baixar PDF</button>
        </div>

        <div class="page-wrap">
          <div class="page">
            <div class="inner">
              <div class="header">
                <div class="brand">
                  <img src="${escapeHtml(logoAbsoluta)}" alt="Logo" />
                  <div>
                    <div class="company-name">${escapeHtml(nomeEmpresa)}</div>
                    <div class="muted">${escapeHtml(config.endereco || '')}</div>
                    <div class="muted">${escapeHtml(cidadeUf)}</div>
                    <div class="muted">${escapeHtml(telefoneEmpresa || '')}</div>
                  </div>
                </div>
                <div class="head-right">
                  <div class="titulo">Ordem de Serviço</div>
                  <div class="numero">Nº ${escapeHtml(numeroOS || '-')}</div>
                  <div class="muted">${escapeHtml(dataAbertura)}</div>
                </div>
              </div>

              <div class="hero">
                <div>
                  <div style="font-size:18px;color:#111827;line-height:1.3">Cliente <strong>${escapeHtml(cliente)}</strong></div>
                  <div style="margin-top:5px;font-size:14px;color:#374151">Equipamento <strong>${escapeHtml(equipamento)}</strong></div>
                  <div style="margin-top:7px;font-size:12px;font-weight:800;color:#374151">VALOR TOTAL: ${escapeHtml(valorExtenso)}</div>
                </div>
                <div style="text-align:right">
                  <div class="hero-badge">OS</div><br />
                  <div style="font-size:11px;font-weight:900;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Saldo atual</div>
                  <div class="hero-box">${escapeHtml(moeda(saldoNumero))}</div>
                </div>
              </div>

              <div class="cards3">
                <div class="card"><div class="icone">👤</div><div class="label">Cliente</div><div class="value">${escapeHtml(cliente)}</div></div>
                <div class="card"><div class="icone">📞</div><div class="label">Telefone</div><div class="value">${escapeHtml(telefoneCliente || '-')}</div></div>
                <div class="card"><div class="icone">📅</div><div class="label">Data</div><div class="value">${escapeHtml(dataAbertura)}</div></div>
              </div>

              <div class="cards3">
                <div class="card"><div class="icone">🛠️</div><div class="label">Status</div><div class="value">${escapeHtml(status)}</div></div>
                <div class="card"><div class="icone">⚡</div><div class="label">Prioridade</div><div class="value">${escapeHtml(prioridade)}</div></div>
                <div class="card"><div class="icone">👨‍🔧</div><div class="label">Técnico</div><div class="value">${escapeHtml(tecnico)}</div></div>
              </div>

              <div class="box">
                <div class="box-titulo">📦 Equipamento</div>
                <div><strong>Nome:</strong> ${escapeHtml(equipamento)}</div>
                <div><strong>Marca / Modelo:</strong> ${escapeHtml(marcaModelo)}</div>
                <div><strong>Nº de série:</strong> ${escapeHtml(serial)}</div>
              </div>

              <div class="box">
                <div class="box-titulo">🧾 Atendimento</div>
                <div><strong>Defeito informado:</strong> ${escapeHtml(defeito)}</div>
                <div><strong>Checklist:</strong> ${escapeHtml(checklist)}</div>
                <div><strong>Observações:</strong> ${escapeHtml(observacao)}</div>
              </div>

              <div class="cards2">
                <div class="card"><div class="icone">💰</div><div class="label">Valor total</div><div class="value">${escapeHtml(moeda(valorNumero))}</div></div>
                <div class="card"><div class="icone">💵</div><div class="label">Entrada</div><div class="value">${escapeHtml(moeda(entradaNumero))}</div></div>
              </div>

              <div class="cards3">
                <div class="card"><div class="icone">📌</div><div class="label">Saldo</div><div class="value">${escapeHtml(moeda(saldoNumero))}</div></div>
                <div class="card"><div class="icone">⏳</div><div class="label">Previsão</div><div class="value">${escapeHtml(previsao)}</div></div>
                <div class="card"><div class="icone">🕒</div><div class="label">Atualização</div><div class="value">${escapeHtml(ultimaAtualizacao)}</div></div>
              </div>

              <div class="box">
                <div class="box-titulo">📍 Contato do cliente</div>
                <div><strong>Telefone:</strong> ${escapeHtml(telefoneCliente || '-')}</div>
                <div><strong>E-mail:</strong> ${escapeHtml(emailCliente || '-')}</div>
                <div><strong>Endereço:</strong> ${escapeHtml(enderecoCliente)}</div>
              </div>

              <div class="assinatura">
                <div class="linha">
                  <div class="nome">${escapeHtml(tecnico)}</div>
                  <div class="sub">RESPONSÁVEL / ASSINATURA</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `

    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.open()
    janela.document.write(html)
    janela.document.close()
  }

  if (carregado && !os) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b2d63', zIndex: 9999, overflow: 'auto', padding: 20 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', borderRadius: 18, padding: 20, border: '1px solid #e5e7eb' }}>
          <h1 style={{ marginTop: 0 }}>OS não encontrada</h1>
          <button
            onClick={() => router.push('/ordens-servico')}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}
          >
            Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b2d63', zIndex: 9999, overflow: 'auto', padding: 20 }}>
      <div style={{ maxWidth: 980, margin: '0 auto 14px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/ordens-servico')}
          style={{ background: '#e5e7eb', color: '#111827', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.12)' }}
        >
          Fechar
        </button>

        <button
          onClick={abrirVisualizacaoPDF}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.12)' }}
        >
          Visualizar / Baixar PDF
        </button>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', background: '#f7f3ea', borderRadius: 24, padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.08)', border: `1px solid ${corSecundaria}` }}>
        <div style={{ background: '#fff', borderRadius: 22, padding: 18, border: `1px solid ${corSecundaria}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: `3px solid ${corPrimaria}`, paddingBottom: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img
                src={logoUrl}
                alt="Logo"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  if (!img.src.endsWith('/logo-connect.jpeg')) img.src = '/logo-connect.jpeg'
                }}
                style={{ width: 82, height: 82, objectFit: 'contain', borderRadius: 12 }}
              />
              <div>
                <div style={{ fontWeight: 900, fontSize: 30, lineHeight: 1.05, color: '#111827' }}>{nomeEmpresa}</div>
                <div style={{ color: '#4b5563', marginTop: 6 }}>{config.endereco || ''}</div>
                <div style={{ color: '#4b5563' }}>{cidadeUf}</div>
                <div style={{ color: '#4b5563' }}>{telefoneEmpresa || ''}</div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 900, fontSize: 22, color: '#111827' }}>Ordem de Serviço</div>
              <div style={{ marginTop: 10, fontWeight: 700 }}>Nº {numeroOS || '-'}</div>
              <div style={{ color: '#4b5563' }}>{dataAbertura}</div>
            </div>
          </div>

          <div style={{ border: `1px solid ${corSecundaria}`, borderRadius: 14, padding: 14, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, color: '#111827', lineHeight: 1.35 }}>Cliente <strong>{cliente}</strong></div>
              <div style={{ marginTop: 6, fontSize: 14, color: '#374151' }}>Equipamento <strong>{equipamento}</strong></div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: '#374151' }}>VALOR TOTAL: {valorExtenso}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-block', background: corPrimaria, color: '#fff', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>OS</div>
              <br />
              <div style={{ fontSize: 11, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Saldo atual</div>
              <div style={{ display: 'inline-block', background: '#fff59d', padding: '10px 16px', borderRadius: 14, fontSize: 30, fontWeight: 900, color: '#111827', boxShadow: 'inset 0 -12px 0 rgba(255,235,59,0.45)' }}>
                {moeda(saldoNumero)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
            <Card emoji="👤" titulo="Cliente" valor={cliente} />
            <Card emoji="📞" titulo="Telefone" valor={telefoneCliente || '-'} />
            <Card emoji="📅" titulo="Data" valor={dataAbertura} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
            <Card emoji="🛠️" titulo="Status" valor={status} />
            <Card emoji="⚡" titulo="Prioridade" valor={prioridade} />
            <Card emoji="👨‍🔧" titulo="Técnico" valor={tecnico} />
          </div>

          <div style={{ border: `1px solid ${corSecundaria}`, borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 6, color: '#6b7280' }}>📦 Equipamento</div>
            <div><strong>Nome:</strong> {equipamento}</div>
            <div><strong>Marca / Modelo:</strong> {marcaModelo}</div>
            <div><strong>Nº de série:</strong> {serial}</div>
          </div>

          <div style={{ border: `1px solid ${corSecundaria}`, borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 6, color: '#6b7280' }}>🧾 Atendimento</div>
            <div><strong>Defeito informado:</strong> {defeito}</div>
            <div><strong>Checklist:</strong> {checklist}</div>
            <div><strong>Observações:</strong> {observacao}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 10 }}>
            <Card emoji="💰" titulo="Valor total" valor={moeda(valorNumero)} />
            <Card emoji="💵" titulo="Entrada" valor={moeda(entradaNumero)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
            <Card emoji="📌" titulo="Saldo" valor={moeda(saldoNumero)} />
            <Card emoji="⏳" titulo="Previsão" valor={previsao} />
            <Card emoji="🕒" titulo="Atualização" valor={ultimaAtualizacao} />
          </div>

          <div style={{ border: `1px solid ${corSecundaria}`, borderRadius: 14, padding: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, marginBottom: 6, color: '#6b7280' }}>📍 Contato do cliente</div>
            <div><strong>Telefone:</strong> {telefoneCliente || '-'}</div>
            <div><strong>E-mail:</strong> {emailCliente || '-'}</div>
            <div><strong>Endereço:</strong> {enderecoCliente}</div>
          </div>

          <div style={{ marginTop: 4, textAlign: 'center' }}>
            <div style={{ width: 230, maxWidth: '100%', margin: '0 auto', borderTop: '2px solid #111827', paddingTop: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>{tecnico}</div>
              <div style={{ marginTop: 1, fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '.3px' }}>RESPONSÁVEL / ASSINATURA</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ emoji, titulo, valor }: { emoji: string; titulo: string; valor: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, minHeight: 92, textAlign: 'center', background: '#fff' }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4, color: '#3f3f46' }}>{titulo}</div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word' }}>{valor}</div>
    </div>
  )
}
