'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

const RECIBOS_KEY = 'connect_recibos_salvos'
const CONFIG_KEY = 'connect_configuracoes'

type ReciboType = {
  id?: string | number
  numero?: string | number
  cliente?: string
  nomeCliente?: string
  documentoCliente?: string
  cpfCliente?: string
  telefoneCliente?: string
  referente?: string
  descricao?: string
  observacoes?: string
  observacao?: string
  valor?: number | string
  valorPago?: number | string
  formaPagamento?: string
  data?: string
  dataCriacao?: string
  criadoEm?: string
  empresa?: string
  emitente?: string
  cidade?: string
}

type ConfigType = {
  nomeSistema?: string
  nomeEmpresa?: string
  razaoSocial?: string
  cnpj?: string
  cpf?: string
  telefone?: string
  whatsapp?: string
  email?: string
  endereco?: string
  cidade?: string
  corPrimaria?: string
  logo?: string
}

function normalizarNumero(valor: unknown) {
  if (typeof valor === 'number') return valor
  if (typeof valor !== 'string') return 0

  const texto = valor.trim()
  if (!texto) return 0

  const limpo = texto
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : 0
}

function moeda(valor: unknown) {
  return normalizarNumero(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function somenteNumeros(valor?: string) {
  return String(valor || '').replace(/\D/g, '')
}

function formatarDocumento(valor?: string) {
  const n = somenteNumeros(valor)

  if (n.length === 11) {
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  if (n.length === 14) {
    return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }

  return valor || ''
}

function formatarTelefone(valor?: string) {
  const n = somenteNumeros(valor)

  if (n.length === 11) {
    return n.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  }

  if (n.length === 10) {
    return n.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  }

  return valor || ''
}

function formatarData(valor?: string) {
  if (!valor) return ''

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
    return valor
  }

  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor

  return data.toLocaleDateString('pt-BR')
}

function getRecibos(): ReciboType[] {
  try {
    const salvo = localStorage.getItem(RECIBOS_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function getConfig(): ConfigType {
  try {
    const salvo = localStorage.getItem(CONFIG_KEY)
    const config = salvo ? JSON.parse(salvo) : {}
    return config && typeof config === 'object' ? config : {}
  } catch {
    return {}
  }
}

function buscarRecibo(lista: ReciboType[], id: string): ReciboType | null {
  return (
    lista.find((item) => String(item.id) === String(id)) ||
    lista.find((item) => String(item.numero) === String(id)) ||
    null
  )
}

export default function ReciboDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [recibo, setRecibo] = useState<ReciboType | null>(null)
  const [config, setConfig] = useState<ConfigType>({})
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    const lista = getRecibos()
    const encontrado = buscarRecibo(lista, id)
    const configuracoes = getConfig()

    setRecibo(encontrado)
    setConfig(configuracoes)
    setCarregado(true)
  }, [id])

  const nomeEmpresa = useMemo(() => {
    return (
      config.nomeEmpresa ||
      config.razaoSocial ||
      config.nomeSistema ||
      'Connect Sistema'
    )
  }, [config])

  const documentoEmpresa = useMemo(() => {
    return formatarDocumento(config.cnpj || config.cpf || '')
  }, [config])

  const telefoneEmpresa = useMemo(() => {
    return formatarTelefone(config.telefone || config.whatsapp || '')
  }, [config])

  const enderecoEmpresa = useMemo(() => {
    return [config.endereco, config.cidade].filter(Boolean).join(' - ')
  }, [config])

  const nomeCliente = recibo?.cliente || recibo?.nomeCliente || 'Cliente não informado'
  const documentoCliente = formatarDocumento(recibo?.documentoCliente || recibo?.cpfCliente || '')
  const telefoneCliente = formatarTelefone(recibo?.telefoneCliente || '')
  const descricao = recibo?.referente || recibo?.descricao || 'Recebimento registrado.'
  const observacao = recibo?.observacoes || recibo?.observacao || ''
  const dataRecibo = formatarData(recibo?.data || recibo?.dataCriacao || recibo?.criadoEm || '')
  const valorRecibo = recibo?.valorPago ?? recibo?.valor ?? 0
  const numeroRecibo = String(recibo?.numero || recibo?.id || '')

  function imprimir() {
    window.print()
  }

  if (carregado && !recibo) {
    return (
      <div className="min-h-screen bg-neutral-100 px-4 py-6">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Recibo não encontrado</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Verifique se o recibo foi salvo corretamente em
                <span className="font-semibold"> {RECIBOS_KEY}</span>.
              </p>
            </div>

            <button
              onClick={() => router.push('/recibos')}
              className="inline-flex items-center justify-center rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-hidden {
            display: none !important;
          }

          .print-root {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
          }

          .print-card {
            border: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="print-root min-h-screen bg-neutral-100 px-4 py-6">
        <div className="print-hidden mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-between gap-3">
          <Link
            href="/recibos"
            className="inline-flex items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50"
          >
            Voltar
          </Link>

          <button
            onClick={imprimir}
            className="inline-flex items-center justify-center rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Imprimir recibo
          </button>
        </div>

        <div className="print-card mx-auto w-full max-w-[820px] rounded-[28px] border border-neutral-200 bg-white p-8 shadow-[0_10px_35px_rgba(0,0,0,0.06)]">
          <header className="border-b border-neutral-200 pb-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-900">RECIBO</h1>
                <p className="mt-2 text-sm text-neutral-500">Nº {numeroRecibo || '-'}</p>
              </div>

              <div className="max-w-[340px] text-left sm:text-right">
                <h2 className="text-lg font-bold text-neutral-900">{nomeEmpresa}</h2>

                {documentoEmpresa ? (
                  <p className="mt-1 text-sm text-neutral-600">{documentoEmpresa}</p>
                ) : null}

                {telefoneEmpresa ? (
                  <p className="mt-1 text-sm text-neutral-600">{telefoneEmpresa}</p>
                ) : null}

                {config.email ? (
                  <p className="mt-1 break-all text-sm text-neutral-600">{config.email}</p>
                ) : null}

                {enderecoEmpresa ? (
                  <p className="mt-1 text-sm text-neutral-600">{enderecoEmpresa}</p>
                ) : null}
              </div>
            </div>
          </header>

          <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Recebemos de
              </p>
              <p className="mt-2 text-base font-semibold text-neutral-900">{nomeCliente}</p>

              {documentoCliente ? (
                <p className="mt-1 text-sm text-neutral-600">Documento: {documentoCliente}</p>
              ) : null}

              {telefoneCliente ? (
                <p className="mt-1 text-sm text-neutral-600">Telefone: {telefoneCliente}</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Dados do recibo
              </p>

              {dataRecibo ? (
                <p className="mt-2 text-sm text-neutral-700">
                  <span className="font-semibold">Data:</span> {dataRecibo}
                </p>
              ) : null}

              {recibo?.formaPagamento ? (
                <p className="mt-1 text-sm text-neutral-700">
                  <span className="font-semibold">Forma de pagamento:</span> {recibo.formaPagamento}
                </p>
              ) : null}

              <p className="mt-1 text-sm text-neutral-700">
                <span className="font-semibold">Valor:</span> {moeda(valorRecibo)}
              </p>
            </div>
          </section>

          <section className="mt-8">
            <div className="rounded-2xl border border-neutral-200 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Referente a
              </p>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-neutral-800">
                {descricao}
              </p>
            </div>
          </section>

          {observacao ? (
            <section className="mt-6">
              <div className="rounded-2xl border border-neutral-200 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Observações
                </p>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-neutral-700">
                  {observacao}
                </p>
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <div className="rounded-3xl border border-dashed border-neutral-300 px-6 py-5">
              <p className="text-base leading-8 text-neutral-800">
                Declaro para os devidos fins que recebi a quantia de{' '}
                <span className="font-bold">{moeda(valorRecibo)}</span> de{' '}
                <span className="font-bold">{nomeCliente}</span>, referente a{' '}
                <span className="font-bold">{descricao}</span>.
              </p>
            </div>
          </section>

          <section className="mt-14">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              <div className="pt-8 text-center">
                <div className="mx-auto h-px w-full max-w-[280px] bg-neutral-400" />
                <p className="mt-3 text-sm font-semibold text-neutral-800">Assinatura do emitente</p>
              </div>

              <div className="pt-8 text-center">
                <div className="mx-auto h-px w-full max-w-[280px] bg-neutral-400" />
                <p className="mt-3 text-sm font-semibold text-neutral-800">Assinatura do pagador</p>
              </div>
            </div>
          </section>

          <footer className="mt-12 border-t border-neutral-200 pt-5 text-center">
            <p className="text-xs text-neutral-500">
              Documento gerado pelo sistema {config.nomeSistema || 'Connect Sistema'}
            </p>
          </footer>
        </div>
      </div>
    </>
  )
}
