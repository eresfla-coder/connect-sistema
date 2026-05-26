'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Check, Printer, Loader2 } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { buscarConfiguracao } from '@/lib/configuracaoEmpresa'
import {
  empresaContratoFromConfig,
  empresaContratoFromPayload,
  empresaContratoPadrao,
  logoContratoVisivel,
  parseAssinaturaPayload,
  payloadContratoPublico,
  type AssinaturaContrato,
  type EmpresaContratoView,
} from '@/lib/contratoEmpresa'
import { logoUrlAbsolutaPublica } from '@/lib/documentosPublicos'

type Cliente = {
  nome?: string
  telefone?: string
  cpf?: string
  cnpj?: string
  endereco?: string
  bairro?: string
  cidade?: string
  tipoPessoa?: 'PF' | 'PJ'
}

type Contrato = {
  id: string
  numero: string
  data: string
  validade: string
  cliente: Cliente
  descricaoServico: string
  descricaoServicoItens: string[]
  clausulasExtras: string
  valorTotal: number
  parcelas: number
  valorParcela: number
  formaPagamento: string
  prazoExecucao: string
  garantia: string
  cidadeContrato: string
  status?: string
}

function mapContratoFromPayload(c: Record<string, unknown>, id: string): Contrato {
  const cli = (c.cliente || {}) as Cliente
  return {
    id: String(c.id ?? id),
    numero: String(c.numero ?? ''),
    data: String(c.data ?? ''),
    validade: String(c.validade ?? ''),
    cliente: {
      nome: cli.nome,
      telefone: cli.telefone,
      cpf: cli.cpf,
      cnpj: cli.cnpj,
      endereco: cli.endereco,
      bairro: cli.bairro,
      cidade: cli.cidade,
      tipoPessoa: cli.tipoPessoa,
    },
    descricaoServico: String(c.descricaoServico ?? ''),
    descricaoServicoItens: Array.isArray(c.descricaoServicoItens) ? (c.descricaoServicoItens as string[]) : [],
    clausulasExtras: String(c.clausulasExtras ?? ''),
    valorTotal: Number(c.valorTotal ?? 0),
    parcelas: Number(c.parcelas ?? 1),
    valorParcela: Number(c.valorParcela ?? 0),
    formaPagamento: String(c.formaPagamento ?? ''),
    prazoExecucao: String(c.prazoExecucao ?? ''),
    garantia: String(c.garantia ?? ''),
    cidadeContrato: String(c.cidadeContrato ?? ''),
    status: String(c.status ?? ''),
  }
}

export default function ContratoDocumentoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = String(params?.id || '')
  const token = String(searchParams.get('token') || '').trim()

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [empresa, setEmpresa] = useState<EmpresaContratoView>(empresaContratoPadrao())
  const [loading, setLoading] = useState(true)
  const [erroPublico, setErroPublico] = useState<string | null>(null)
  const [assinatura, setAssinatura] = useState<AssinaturaContrato | null>(null)
  const [salvandoAssinatura, setSalvandoAssinatura] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const assinado = Boolean(assinatura?.status === 'assinado' && assinatura?.dataUrl)

  const persistirAssinaturaNuvem = useCallback(
    async (contratoAtual: Contrato, assin: AssinaturaContrato) => {
      if (!token) return
      setSalvandoAssinatura(true)
      try {
        const resp = await fetch('/api/public-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_type: 'contrato',
            document_id: String(contratoAtual.id),
            token,
            payload: payloadContratoPublico(contratoAtual as unknown as Record<string, unknown>, empresa, {
              token,
              assinatura: assin,
            }),
          }),
        })
        if (!resp.ok) {
          console.error('[contrato] Falha ao salvar assinatura na nuvem')
        }
      } catch (e) {
        console.error('[contrato] Erro ao salvar assinatura:', e)
      } finally {
        setSalvandoAssinatura(false)
      }
    },
    [token, empresa]
  )

  const chaveAssinaturaLocal = useCallback((contratoId: string) => `connect_contrato_assinatura_${contratoId}`, [])

  const salvarAssinaturaLocal = useCallback(
    (contratoId: string, assin: AssinaturaContrato | null) => {
      try {
        const key = chaveAssinaturaLocal(contratoId)
        if (assin?.dataUrl) localStorage.setItem(key, JSON.stringify(assin))
        else localStorage.removeItem(key)
      } catch {}
    },
    [chaveAssinaturaLocal]
  )

  const carregarAssinaturaLocal = useCallback(
    (contratoId: string): AssinaturaContrato | null => {
      try {
        const raw = localStorage.getItem(chaveAssinaturaLocal(contratoId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as AssinaturaContrato
        if (parsed?.dataUrl) return { ...parsed, status: 'assinado' }
      } catch {}
      return null
    },
    [chaveAssinaturaLocal]
  )

  const atualizarContratoLocal = useCallback(
    (atualizado: Contrato, assin?: AssinaturaContrato | null) => {
      try {
        const salvo = localStorage.getItem('connect_contratos')
        const lista = salvo ? JSON.parse(salvo) : []
        const idx = lista.findIndex((c: Contrato) => String(c.id) === String(atualizado.id))
        const item = { ...atualizado, status: assin ? 'Assinado' : atualizado.status }
        if (idx >= 0) lista[idx] = item
        else lista.unshift(item)
        localStorage.setItem('connect_contratos', JSON.stringify(lista))
        if (assin) salvarAssinaturaLocal(String(atualizado.id), assin)
      } catch {}
    },
    [salvarAssinaturaLocal]
  )

  useEffect(() => {
    let vivo = true

    async function carregar() {
      setLoading(true)
      setErroPublico(null)
      setContrato(null)
      setAssinatura(null)

      if (!id) {
        if (vivo) setLoading(false)
        return
      }

      if (token) {
        try {
          const resp = await fetch(
            `/api/public-docs?document_type=contrato&document_id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`,
            { cache: 'no-store' }
          )
          if (!resp.ok) {
            if (vivo) {
              setErroPublico('Contrato não encontrado ou link inválido. Peça um novo link ao emitente.')
              setLoading(false)
            }
            return
          }
          const row = await resp.json()
          const payload = (row?.payload || {}) as Record<string, unknown>
          const c = payload?.contrato as Record<string, unknown>
          if (!c || typeof c !== 'object') {
            if (vivo) {
              setErroPublico('Não foi possível carregar este contrato.')
              setLoading(false)
            }
            return
          }
          if (vivo) {
            setContrato(mapContratoFromPayload(c, id))
            setEmpresa(empresaContratoFromPayload(payload))
            const assin = parseAssinaturaPayload(payload)
            if (assin) {
              setAssinatura(assin)
              salvarAssinaturaLocal(id, assin)
            } else {
              const localAssin = carregarAssinaturaLocal(id)
              if (localAssin) setAssinatura(localAssin)
            }
            setLoading(false)
          }
          return
        } catch {
          if (vivo) {
            setErroPublico('Erro ao carregar o contrato. Verifique sua conexão.')
            setLoading(false)
          }
          return
        }
      }

      try {
        const salvo = localStorage.getItem('connect_contratos')
        if (salvo) {
          const lista = JSON.parse(salvo)
          const encontrado = lista.find((c: Contrato) => String(c.id) === id)
          if (encontrado) {
            setContrato(encontrado)
            const localAssin = carregarAssinaturaLocal(id)
            if (localAssin) setAssinatura(localAssin)
          }
        }
      } catch {}

      try {
        const cfg = await buscarConfiguracao()
        if (vivo) setEmpresa(empresaContratoFromConfig(cfg))
      } catch {
        try {
          const raw = JSON.parse(localStorage.getItem('connect_configuracoes') || '{}')
          if (vivo) setEmpresa(empresaContratoFromConfig(raw))
        } catch {
          if (vivo) setEmpresa(empresaContratoPadrao())
        }
      }

      if (vivo) setLoading(false)
    }

    void carregar()
    return () => {
      vivo = false
    }
  }, [id, token, carregarAssinaturaLocal, salvarAssinaturaLocal])

  useEffect(() => {
    if (assinado) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, canvas.width, canvas.height)

    let desenhando = false

    function getPos(e: MouseEvent | TouchEvent) {
      const rect = canvas!.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      return { x: clientX - rect.left, y: clientY - rect.top }
    }

    function start(e: MouseEvent | TouchEvent) {
      desenhando = true
      const { x, y } = getPos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    function move(e: MouseEvent | TouchEvent) {
      if (!desenhando) return
      e.preventDefault()
      const { x, y } = getPos(e)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#0f172a'
      ctx.lineTo(x, y)
      ctx.stroke()
    }

    function end() {
      desenhando = false
    }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup', end)
    canvas.addEventListener('mouseleave', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)

    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseup', end)
      canvas.removeEventListener('mouseleave', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', end)
    }
  }, [assinado, contrato?.id])

  function limparAssinatura() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, canvas.width, canvas.height)
  }

  async function confirmarAssinatura() {
    const canvas = canvasRef.current
    if (!canvas || !contrato) return

    const dataUrl = canvas.toDataURL('image/png')
    const assin: AssinaturaContrato = {
      status: 'assinado',
      dataUrl,
      assinadoEm: new Date().toISOString(),
      nome: contrato.cliente?.nome || '',
    }

    setAssinatura(assin)
    salvarAssinaturaLocal(String(contrato.id), assin)
    const atualizado = { ...contrato, status: 'Assinado' }
    setContrato(atualizado)
    atualizarContratoLocal(atualizado, assin)

    let nuvemOk = false
    if (token) {
      await persistirAssinaturaNuvem(atualizado, assin)
      try {
        const resp = await fetch('/api/contratos/assinatura', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_id: String(contrato.id),
            token,
            status: 'Assinado',
          }),
        })
        nuvemOk = resp.ok
      } catch {
        nuvemOk = false
      }
    }

    if (!token) {
      alert('Assinatura salva neste dispositivo. Para sincronizar na nuvem, use o link enviado por WhatsApp.')
      return
    }

    if (!nuvemOk) {
      alert('Assinatura registrada localmente, mas não foi possível confirmar na nuvem. Tente novamente ou peça um novo link.')
    }
  }

  function gerarPDF() {
    if (!contrato) return
    const doc = new jsPDF('p', 'mm', 'a4')
    const pageW = doc.internal.pageSize.getWidth()
    let y = 15

    if (logoContratoVisivel(empresa.logoUrl)) {
      try {
        doc.addImage(empresa.logoUrl, 'PNG', 15, y, 42, 18)
        y += 22
      } catch {
        try {
          const abs = logoUrlAbsolutaPublica(empresa.logoUrl)
          if (abs.startsWith('http')) doc.addImage(abs, 'PNG', 15, y, 42, 18)
          y += 22
        } catch {}
      }
    }

    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(empresa.nome, 15, y)
    y += 8
    doc.text(`Documento gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW - 15, y, { align: 'right' })
    y += 10

    doc.setFontSize(20)
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text('CONTRATO DE PRESTAÇÃO DE SERVIÇO', pageW / 2, y, { align: 'center' })
    y += 12

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)
    doc.text(`Contrato Nº ${contrato.numero}`, 15, y)
    doc.text(`Data: ${contrato.data}`, pageW - 15, y, { align: 'right' })
    y += 8
    doc.text(`Validade: ${contrato.validade}`, pageW - 15, y, { align: 'right' })
    y += 12

    const cli = contrato.cliente || {}
    const docEmpresa = empresa.cnpj || empresa.cpf || ''

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('CONTRATANTE:', 15, y)
    y += 7
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`Nome: ${cli.nome || ''}`, 15, y)
    y += 6
    doc.text(`Documento: ${cli.cpf || cli.cnpj || ''}`, 15, y)
    y += 6
    doc.text(`Endereço: ${cli.endereco || ''}`, 15, y)
    y += 6
    doc.text(`Telefone: ${cli.telefone || ''}`, 15, y)
    y += 12

    doc.setFont('helvetica', 'bold')
    doc.text('CONTRATADA:', 15, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.text(`Empresa: ${empresa.nome}`, 15, y)
    y += 6
    if (docEmpresa) {
      doc.text(`CNPJ/CPF: ${docEmpresa}`, 15, y)
      y += 6
    }
    doc.text(`Endereço: ${empresa.endereco}`, 15, y)
    y += 6
    doc.text(`Cidade: ${empresa.cidadeUf}`, 15, y)
    y += 6
    doc.text(`Telefone: ${empresa.telefone}`, 15, y)
    y += 6
    if (empresa.email) {
      doc.text(`E-mail: ${empresa.email}`, 15, y)
      y += 6
    }
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.text('1. DESCRIÇÃO DO SERVIÇO', 15, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    const servicoLines = doc.splitTextToSize(contrato.descricaoServico || '', pageW - 30)
    doc.text(servicoLines, 15, y)
    y += servicoLines.length * 5.5 + 4

    if (contrato.descricaoServicoItens?.length > 0) {
      contrato.descricaoServicoItens.forEach((item) => {
        const itemLines = doc.splitTextToSize(`• ${item}`, pageW - 30)
        doc.text(itemLines, 20, y)
        y += itemLines.length * 5.5
      })
      y += 4
    }

    doc.setFont('helvetica', 'bold')
    doc.text('2. VALOR E CONDIÇÕES', 15, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.text(`Valor Total: R$ ${contrato.valorTotal?.toFixed(2).replace('.', ',') || '0,00'}`, 15, y)
    y += 6
    doc.text(`Parcelamento: ${contrato.parcelas}x de R$ ${contrato.valorParcela?.toFixed(2).replace('.', ',') || '0,00'}`, 15, y)
    y += 6
    doc.text(`Forma de Pagamento: ${contrato.formaPagamento}`, 15, y)
    y += 12

    doc.setFont('helvetica', 'bold')
    doc.text('3. CLÁUSULAS', 15, y)
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const clausulasLines = doc.splitTextToSize(contrato.clausulasExtras || '', pageW - 30)
    doc.text(clausulasLines, 15, y)
    y += clausulasLines.length * 4.5 + 12

    if (y > 220) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('ASSINATURAS', pageW / 2, y, { align: 'center' })
    y += 12

    doc.line(15, y, 90, y)
    y += 5
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`${cli.nome || 'Contratante'}`, 15, y)
    y += 5
    if (assinado && assinatura?.dataUrl) {
      try {
        doc.addImage(assinatura.dataUrl, 'PNG', 15, y, 55, 18)
        y += 22
      } catch {}
    } else {
      y += 15
    }
    doc.text(`CPF/CNPJ: ${cli.cpf || cli.cnpj || ''}`, 15, y)
    y += 16

    const yEmp = y
    doc.line(pageW - 90, yEmp, pageW - 15, yEmp)
    doc.text(`${empresa.nome}`, pageW - 90, yEmp + 5)
    if (docEmpresa) doc.text(`CNPJ/CPF: ${docEmpresa}`, pageW - 90, yEmp + 10)

    doc.save(`Contrato_${contrato.numero}_${cli.nome || 'cliente'}.pdf`)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff' }}>
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (!contrato) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', color: '#64748b', padding: 24, textAlign: 'center' }}>
        {erroPublico || 'Contrato não encontrado.'}
      </div>
    )
  }

  const cli = contrato.cliente || {}
  const docEmpresa = empresa.cnpj || empresa.cpf || ''
  const dataAssinatura = assinatura?.assinadoEm
    ? new Date(assinatura.assinadoEm).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR')

  return (
    <div style={{ minHeight: '100vh', background: '#f8fbff', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#0f172a', padding: '16px 0 40px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {logoContratoVisivel(empresa.logoUrl) ? (
              <img
                src={empresa.logoUrl}
                alt={empresa.nome}
                style={{ maxHeight: 56, maxWidth: 160, objectFit: 'contain' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <div>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 700 }}>{empresa.nome}</p>
              <h1 style={{ fontSize: 22, fontWeight: 900, margin: '4px 0 0' }}>Contrato Nº {contrato.numero}</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={gerarPDF}
            style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '8px 16px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={16} /> Baixar PDF
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, padding: '28px 32px', border: '1px solid #dbe3ef', marginBottom: 16 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>CONTRATO DE PRESTAÇÃO DE SERVIÇO</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Nº {contrato.numero} — {contrato.data}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 24 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 900, margin: '0 0 8px', color: '#1d4ed8' }}>CONTRATANTE</h3>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Nome:</strong> {cli.nome || ''}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Documento:</strong> {cli.cpf || cli.cnpj || ''}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Endereço:</strong> {cli.endereco || ''}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Telefone:</strong> {cli.telefone || ''}</p>
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 900, margin: '0 0 8px', color: '#1d4ed8' }}>CONTRATADA</h3>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Empresa:</strong> {empresa.nome}</p>
              {docEmpresa ? <p style={{ margin: '4px 0', fontSize: 14 }}><strong>CNPJ/CPF:</strong> {docEmpresa}</p> : null}
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Endereço:</strong> {empresa.endereco}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Cidade:</strong> {empresa.cidadeUf}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Telefone:</strong> {empresa.telefone}</p>
              {empresa.email ? <p style={{ margin: '4px 0', fontSize: 14 }}><strong>E-mail:</strong> {empresa.email}</p> : null}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, margin: '0 0 10px' }}>1. DESCRIÇÃO DO SERVIÇO</h3>
            <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>{contrato.descricaoServico}</p>
            {contrato.descricaoServicoItens?.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
                {contrato.descricaoServicoItens.map((item, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20, background: '#f8fbff', padding: 16, borderRadius: 12 }}>
            <div>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Valor Total:</strong> R$ {contrato.valorTotal?.toFixed(2).replace('.', ',')}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Parcelas:</strong> {contrato.parcelas}x de R$ {contrato.valorParcela?.toFixed(2).replace('.', ',')}</p>
            </div>
            <div>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Pagamento:</strong> {contrato.formaPagamento}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Prazo:</strong> {contrato.prazoExecucao}</p>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, margin: '0 0 10px' }}>2. CLÁUSULAS E DISPOSIÇÕES GERAIS</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, margin: 0, color: '#334155' }}>{contrato.clausulasExtras}</pre>
          </div>

          {assinado && assinatura?.dataUrl ? (
            <div style={{ marginTop: 24, padding: 20, border: '2px solid #22c55e', borderRadius: 16, background: '#f0fdf4' }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <Check size={28} style={{ color: '#22c55e' }} />
                <h3 style={{ fontSize: 18, fontWeight: 900, margin: '8px 0 4px', color: '#166534' }}>Contrato assinado digitalmente</h3>
                <p style={{ fontSize: 14, color: '#166534', margin: 0 }}>
                  {assinatura.nome || cli.nome || 'Contratante'} — {dataAssinatura}
                </p>
              </div>
              <img
                src={assinatura.dataUrl}
                alt="Assinatura do contratante"
                style={{ display: 'block', maxWidth: '100%', height: 100, margin: '0 auto', objectFit: 'contain', background: '#fff', borderRadius: 8, border: '1px solid #bbf7d0' }}
              />
            </div>
          ) : (
            <div style={{ marginTop: 24, padding: 20, border: '2px dashed #dbe3ef', borderRadius: 16, background: '#fafbfc' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 12px', textAlign: 'center' }}>Assinatura digital do contratante</h3>
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', margin: '0 0 12px' }}>Desenhe sua assinatura abaixo:</p>
              <canvas
                ref={canvasRef}
                width={500}
                height={120}
                style={{ width: '100%', maxWidth: 500, height: 120, border: '1px solid #ccc', borderRadius: 8, background: '#fff', cursor: 'crosshair', display: 'block', margin: '0 auto', touchAction: 'none' }}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={limparAssinatura} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #dbe3ef', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                  Limpar
                </button>
                <button
                  type="button"
                  disabled={salvandoAssinatura}
                  onClick={() => void confirmarAssinatura()}
                  style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {salvandoAssinatura ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  {salvandoAssinatura ? 'Salvando…' : 'Confirmar assinatura'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
