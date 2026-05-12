'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DEFAULT_LOGO_PATH, loadPublicDocument } from '@/lib/connect-public'

const STORAGE_KEY = 'connect_orcamentos_salvos'
const CONFIG_KEY = 'connect_configuracoes'

type Cliente = {
  nome?: string
  telefone?: string
  email?: string
  endereco?: string
}

type ItemOrcamento = {
  nome?: string
  descricao?: string
  quantidade?: number | string
  valor?: number | string
  preco?: number | string
  total?: number | string
  tipoCalculo?: string
  largura?: number
  altura?: number
  metragem?: number
  valorM2?: number
}

type Orcamento = {
  id?: string | number
  numero?: string | number
  titulo?: string
  cliente?: Cliente | string | null
  nomeCliente?: string
  telefone?: string
  email?: string
  endereco?: string
  itens?: ItemOrcamento[]
  subtotal?: number | string
  entrega?: number | string
  desconto?: number | string
  total?: number | string
  formaPagamento?: string
  validade?: string
  prazoEntrega?: string
  observacao?: string
  observacoes?: string
  status?: string
  data?: string
}

type Configuracao = {
  nomeEmpresa?: string
  nomeSistema?: string
  telefone?: string
  email?: string
  endereco?: string
  cidadeUf?: string
  cidade?: string
  logoUrl?: string
  logo?: string
  corPrimaria?: string
  corSecundaria?: string
  rodapePdf?: string
}

function normalizarNumero(valor: unknown) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  if (typeof valor !== 'string') return 0
  const numero = Number(
    valor
      .replace(/\s/g, '')
      .replace(/R\$/gi, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')
  )
  return Number.isFinite(numero) ? numero : 0
}

function moeda(valor: unknown) {
  return normalizarNumero(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatarData(data?: string) {
  if (!data) return new Date().toLocaleDateString('pt-BR')
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return data
  const d = new Date(data)
  return Number.isNaN(d.getTime()) ? data : d.toLocaleDateString('pt-BR')
}

function carregarLista(): Orcamento[] {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    const lista = salvo ? JSON.parse(salvo) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function carregarConfig(): Configuracao {
  try {
    const salvo = localStorage.getItem(CONFIG_KEY)
    const config = salvo ? JSON.parse(salvo) : {}
    return config && typeof config === 'object' ? config : {}
  } catch {
    return {}
  }
}

function buscarOrcamento(lista: Orcamento[], id: string) {
  return (
    lista.find((item) => String(item.id || '') === id) ||
    lista.find((item) => String(item.numero || '') === id) ||
    null
  )
}

function nomeCliente(orcamento?: Orcamento | null) {
  const cliente = orcamento?.cliente
  if (typeof cliente === 'string') return cliente
  return cliente?.nome || orcamento?.nomeCliente || 'Cliente não informado'
}

function dadoCliente(orcamento: Orcamento | null, campo: keyof Cliente) {
  const cliente = orcamento?.cliente
  if (typeof cliente === 'string') return ''
  const valorDireto = orcamento?.[campo as keyof Orcamento]
  return cliente?.[campo] || (typeof valorDireto === 'string' || typeof valorDireto === 'number' ? String(valorDireto) : '')
}

function totalItem(item: ItemOrcamento) {
  if (item.total !== undefined && item.total !== null) return normalizarNumero(item.total)
  if (item.tipoCalculo === 'm2') {
    const metragem = normalizarNumero(item.metragem)
    const valorM2 = normalizarNumero(item.valorM2 ?? item.valor ?? item.preco)
    return metragem * valorM2
  }
  return normalizarNumero(item.quantidade || 1) * normalizarNumero(item.valor ?? item.preco)
}

export default function ImpressaoOrcamentoPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = String(params?.id || '')
  const token = searchParams.get('token')

  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [config, setConfig] = useState<Configuracao>({})
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    let ativo = true

    async function carregarDocumento() {
      const lista = carregarLista()
      const local = buscarOrcamento(lista, id)
      const configLocal = carregarConfig()

      if (token) {
        try {
          const publico = await loadPublicDocument<Orcamento, Configuracao>(
            'quotation',
            id,
            token
          )

          if (!ativo) return

          if (publico) {
            setOrcamento(publico.document || local)
            setConfig(publico.config || configLocal)
            setCarregado(true)
            return
          }
        } catch (error) {
          console.error('Erro ao carregar impressão pública do orçamento:', error)
        }
      }

      if (!ativo) return
      setOrcamento(local)
      setConfig(configLocal)
      setCarregado(true)
    }

    carregarDocumento()

    return () => {
      ativo = false
    }
  }, [id, token])

  const itens = useMemo(() => (Array.isArray(orcamento?.itens) ? orcamento?.itens || [] : []), [orcamento])
  const subtotal = useMemo(
    () => normalizarNumero(orcamento?.subtotal) || itens.reduce((acc, item) => acc + totalItem(item), 0),
    [itens, orcamento]
  )
  const entrega = normalizarNumero(orcamento?.entrega)
  const desconto = normalizarNumero(orcamento?.desconto)
  const total = normalizarNumero(orcamento?.total) || Math.max(subtotal + entrega - desconto, 0)

  const nomeEmpresa = config.nomeEmpresa || config.nomeSistema || 'Connect Sistema'
  const logoUrl =
    config.logoUrl === '/logo-connect.png'
      ? DEFAULT_LOGO_PATH
      : config.logoUrl || config.logo || DEFAULT_LOGO_PATH
  const corPrimaria = config.corPrimaria || '#f97316'
  const corSecundaria = config.corSecundaria || '#e5e7eb'

  if (carregado && !orcamento) {
    return (
      <div className="print-page-shell">
        <div className="not-found-card">
          <h1>Orçamento não encontrado</h1>
          <p>Esse documento não foi localizado ou o link público expirou.</p>
          <button onClick={() => router.push('/orcamentos')}>Voltar</button>
        </div>
        <style jsx>{styles}</style>
      </div>
    )
  }

  return (
    <div className="print-page-shell">
      <div className="topbar">
        <button className="btn btn-sec" onClick={() => router.push('/orcamentos')}>
          Fechar
        </button>
        <button className="btn btn-pri" onClick={() => window.print()}>
          Imprimir / salvar PDF
        </button>
      </div>

      <article className="document">
        <header className="header" style={{ borderBottomColor: corPrimaria }}>
          <div className="brand">
            <img
              src={logoUrl}
              alt="Logo"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement
                if (!img.src.endsWith(DEFAULT_LOGO_PATH)) img.src = DEFAULT_LOGO_PATH
              }}
            />
            <div>
              <h1>{nomeEmpresa}</h1>
              <p>{config.endereco || ''}</p>
              <p>{config.cidadeUf || config.cidade || ''}</p>
              <p>{config.telefone || config.email || ''}</p>
            </div>
          </div>

          <div className="doc-info">
            <strong>{orcamento?.titulo || 'Orçamento Comercial'}</strong>
            <span>Nº {orcamento?.numero || orcamento?.id || '-'}</span>
            <small>{formatarData(orcamento?.data)}</small>
          </div>
        </header>

        <section className="summary" style={{ borderColor: corSecundaria }}>
          <div>
            <span>Cliente</span>
            <strong>{nomeCliente(orcamento)}</strong>
            <small>{dadoCliente(orcamento, 'telefone') || '-'}</small>
          </div>
          <div>
            <span>Pagamento</span>
            <strong>{orcamento?.formaPagamento || '-'}</strong>
            <small>{orcamento?.validade ? `Validade: ${orcamento.validade}` : 'Validade: -'}</small>
          </div>
          <div>
            <span>Status</span>
            <strong>{orcamento?.status || 'Pendente'}</strong>
            <small>{orcamento?.prazoEntrega ? `Entrega: ${orcamento.prazoEntrega}` : 'Prazo: -'}</small>
          </div>
        </section>

        <section className="client-box" style={{ borderColor: corSecundaria }}>
          <div><strong>E-mail:</strong> {dadoCliente(orcamento, 'email') || '-'}</div>
          <div><strong>Endereço:</strong> {dadoCliente(orcamento, 'endereco') || '-'}</div>
        </section>

        <section className="items" style={{ borderColor: corSecundaria }}>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Detalhes</th>
                <th>Qtd.</th>
                <th>Valor</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.length > 0 ? (
                itens.map((item, index) => {
                  const detalhes =
                    item.tipoCalculo === 'm2'
                      ? `${Number(item.largura || 0).toFixed(2)} x ${Number(item.altura || 0).toFixed(2)} m`
                      : item.descricao || '-'

                  return (
                    <tr key={`${item.nome || 'item'}-${index}`}>
                      <td>{item.nome || item.descricao || 'Item'}</td>
                      <td>{detalhes}</td>
                      <td>{item.tipoCalculo === 'm2' ? 'm2' : normalizarNumero(item.quantidade || 1)}</td>
                      <td>{moeda(item.valor ?? item.preco ?? item.valorM2)}</td>
                      <td>{moeda(totalItem(item))}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="empty">Nenhum item cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="footer-grid">
          <div className="notes" style={{ borderColor: corSecundaria }}>
            <strong>Observações</strong>
            <p>{orcamento?.observacao || orcamento?.observacoes || config.rodapePdf || 'Obrigado pela preferência.'}</p>
          </div>

          <div className="totals" style={{ borderColor: corSecundaria }}>
            <div><span>Subtotal</span><strong>{moeda(subtotal)}</strong></div>
            <div><span>Entrega</span><strong>{moeda(entrega)}</strong></div>
            <div><span>Desconto</span><strong>{moeda(desconto)}</strong></div>
            <div className="grand"><span>Total</span><strong>{moeda(total)}</strong></div>
          </div>
        </section>
      </article>

      <style jsx>{styles}</style>
    </div>
  )
}

const styles = `
  .print-page-shell {
    min-height: 100vh;
    background: #0b2d63;
    padding: 18px;
    color: #111827;
    font-family: Arial, sans-serif;
  }
  .topbar {
    max-width: 980px;
    margin: 0 auto 12px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .btn {
    border: 0;
    border-radius: 12px;
    padding: 11px 18px;
    font-weight: 800;
    cursor: pointer;
  }
  .btn-sec { background: #e5e7eb; color: #111827; }
  .btn-pri { background: #2563eb; color: #ffffff; }
  .document, .not-found-card {
    max-width: 980px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 22px;
    padding: 18px;
    box-shadow: 0 18px 40px rgba(0,0,0,0.18);
  }
  .not-found-card button {
    border: 0;
    border-radius: 10px;
    background: #2563eb;
    color: #fff;
    padding: 10px 16px;
    font-weight: 800;
  }
  .header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 3px solid #f97316;
    padding-bottom: 12px;
    margin-bottom: 12px;
  }
  .brand { display: flex; gap: 12px; align-items: center; min-width: 0; }
  .brand img {
    width: 72px;
    height: 72px;
    object-fit: contain;
    border-radius: 14px;
    background: #f8fafc;
  }
  h1 { margin: 0; font-size: 28px; line-height: 1; }
  p { margin: 0; }
  .brand p { color: #4b5563; margin-top: 2px; font-size: 13px; }
  .doc-info { text-align: right; display: grid; gap: 5px; align-content: start; }
  .doc-info strong { font-size: 22px; }
  .doc-info span { font-weight: 800; }
  .doc-info small { color: #64748b; }
  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 10px;
    margin-bottom: 10px;
  }
  .summary div { display: grid; gap: 4px; }
  .summary span { font-size: 11px; color: #64748b; font-weight: 900; text-transform: uppercase; }
  .summary strong { font-size: 15px; }
  .summary small { color: #64748b; }
  .client-box, .items, .notes, .totals {
    border: 1px solid #e5e7eb;
    border-radius: 14px;
  }
  .client-box { padding: 10px 12px; display: grid; gap: 4px; margin-bottom: 10px; font-size: 13px; }
  .items { overflow: hidden; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
  th { text-align: left; background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #475569; }
  th:nth-child(3), td:nth-child(3) { text-align: center; }
  th:nth-child(4), th:nth-child(5), td:nth-child(4), td:nth-child(5) { text-align: right; }
  tbody tr:last-child td { border-bottom: 0; }
  .empty { text-align: center !important; color: #64748b; padding: 16px; }
  .footer-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; align-items: start; }
  .notes { padding: 12px; min-height: 96px; }
  .notes strong { display: block; margin-bottom: 6px; color: #475569; }
  .notes p { white-space: pre-wrap; line-height: 1.35; font-size: 13px; }
  .totals { padding: 12px; display: grid; gap: 8px; }
  .totals div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
  .totals .grand { border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 19px; font-weight: 900; color: #0f172a; }
  @page { size: A4 portrait; margin: 7mm; }
  @media (max-width: 760px) {
    .print-page-shell { padding: 12px; }
    .document { padding: 12px; border-radius: 16px; }
    .header, .brand { align-items: flex-start; }
    .header, .summary, .footer-grid { grid-template-columns: 1fr; display: grid; }
    .doc-info { text-align: left; }
    .items { overflow-x: auto; }
    table { min-width: 680px; }
  }
  @media print {
    .print-page-shell { background: #fff; padding: 0; }
    .topbar { display: none !important; }
    .document {
      max-width: 100%;
      box-shadow: none;
      border-radius: 0;
      padding: 0;
    }
    .header, .summary, .client-box, .items, .notes, .totals {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    th, td { padding: 7px 8px; }
  }
`
