'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Check, Printer, Loader2 } from 'lucide-react'
import { jsPDF } from 'jspdf'

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
}

export default function ContratoDocumentoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = String(params?.id || '')

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [empresa, setEmpresa] = useState({ nome: 'LOJA CONNECT', telefone: '', endereco: '', cidadeUf: '' })
  const [loading, setLoading] = useState(true)
  const [assinado, setAssinado] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!id) return

    try {
      const salvo = localStorage.getItem('connect_contratos')
      if (salvo) {
        const lista = JSON.parse(salvo)
        const encontrado = lista.find((c: Contrato) => String(c.id) === id)
        if (encontrado) {
          setContrato(encontrado)
        }
      }
    } catch {}

    try {
      const cfg = JSON.parse(localStorage.getItem('connect_configuracoes') || '{}')
      setEmpresa({
        nome: cfg.nomeEmpresa || 'LOJA CONNECT',
        telefone: cfg.telefone || '',
        endereco: cfg.endereco || '',
        cidadeUf: cfg.cidadeUf || '',
      })
    } catch {}

    setLoading(false)
  }, [id])

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
      const rect = canvas.getBoundingClientRect()
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
  }, [assinado])

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

  function confirmarAssinatura() {
    const canvas = canvasRef.current
    if (!canvas) return
    setAssinado(true)
  }

  function gerarPDF() {
    if (!contrato) return
    const doc = new jsPDF('p', 'mm', 'a4')
    const pageW = doc.internal.pageSize.getWidth()
    let y = 15

    doc.setFontSize(10)
    doc.setTextColor(100)
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

    // Contratante
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('CONTRATANTE:', 15, y)
    y += 7
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)
    const cli = contrato.cliente || {}
    doc.text(`Nome: ${cli.nome || ''}`, 15, y)
    y += 6
    doc.text(`Documento: ${cli.cpf || cli.cnpj || ''}`, 15, y)
    y += 6
    doc.text(`Endereço: ${cli.endereco || ''}`, 15, y)
    y += 6
    doc.text(`Cidade: ${cli.cidade || ''}`, 15, y)
    y += 6
    doc.text(`Telefone: ${cli.telefone || ''}`, 15, y)
    y += 12

    // Contratada
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('CONTRATADA:', 15, y)
    y += 7
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)
    doc.text(`Empresa: ${empresa.nome}`, 15, y)
    y += 6
    doc.text(`Endereço: ${empresa.endereco}`, 15, y)
    y += 6
    doc.text(`Cidade: ${empresa.cidadeUf}`, 15, y)
    y += 6
    doc.text(`Telefone: ${empresa.telefone}`, 15, y)
    y += 12

    // Serviço
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('1. DESCRIÇÃO DO SERVIÇO', 15, y)
    y += 7
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)
    const servicoLines = doc.splitTextToSize(contrato.descricaoServico || '', pageW - 30)
    doc.text(servicoLines, 15, y)
    y += servicoLines.length * 5.5 + 4

    if (contrato.descricaoServicoItens?.length > 0) {
      contrato.descricaoServicoItens.forEach((item, i) => {
        const itemLines = doc.splitTextToSize(`• ${item}`, pageW - 30)
        doc.text(itemLines, 20, y)
        y += itemLines.length * 5.5
      })
      y += 4
    }

    // Valor
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('2. VALOR E CONDIÇÕES', 15, y)
    y += 7
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)
    doc.text(`Valor Total: R$ ${contrato.valorTotal?.toFixed(2).replace('.', ',') || '0,00'}`, 15, y)
    y += 6
    doc.text(`Parcelamento: ${contrato.parcelas}x de R$ ${contrato.valorParcela?.toFixed(2).replace('.', ',') || '0,00'}`, 15, y)
    y += 6
    doc.text(`Forma de Pagamento: ${contrato.formaPagamento}`, 15, y)
    y += 6
    doc.text(`Prazo de Execução: ${contrato.prazoExecucao}`, 15, y)
    y += 6
    doc.text(`Garantia: ${contrato.garantia}`, 15, y)
    y += 12

    // Cláusulas
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('3. CLÁUSULAS E DISPOSIÇÕES GERAIS', 15, y)
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)
    const clausulasLines = doc.splitTextToSize(contrato.clausulasExtras || '', pageW - 30)
    doc.text(clausulasLines, 15, y)
    y += clausulasLines.length * 4.5 + 12

    // Assinaturas
    if (y > 230) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('ASSINATURAS', pageW / 2, y, { align: 'center' })
    y += 15

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)

    // Contratante
    doc.line(15, y, 90, y)
    y += 5
    doc.text(`${cli.nome || 'Contratante'}`, 15, y)
    y += 4
    doc.text(`CPF/CNPJ: ${cli.cpf || cli.cnpj || ''}`, 15, y)
    y += 20

    // Contratada
    doc.line(pageW - 90, y - 20, pageW - 15, y - 20)
    doc.text(`${empresa.nome}`, pageW - 90, y - 15)
    doc.text(`CNPJ: `, pageW - 90, y - 11)

    doc.save(`Contrato_${contrato.numero}_${cli.nome || 'cliente'}.pdf`)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff' }}><Loader2 className="animate-spin" size={32} /></div>

  if (!contrato) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', color: '#64748b' }}>Contrato não encontrado.</div>

  const cli = contrato.cliente || {}

  return (
    <div style={{ minHeight: '100vh', background: '#f8fbff', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#0f172a', padding: '16px 0 40px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Contrato Nº {contrato.numero}</h1>
          <button onClick={gerarPDF} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '8px 16px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={16} /> Baixar PDF
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, padding: '28px 32px', border: '1px solid #dbe3ef', marginBottom: 16 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>CONTRATO DE PRESTAÇÃO DE SERVIÇO</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Nº {contrato.numero} — {contrato.data}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
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
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Endereço:</strong> {empresa.endereco}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Cidade:</strong> {empresa.cidadeUf}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Telefone:</strong> {empresa.telefone}</p>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, background: '#f8fbff', padding: 16, borderRadius: 12 }}>
            <div>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Valor Total:</strong> R$ {contrato.valorTotal?.toFixed(2).replace('.', ',')}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Parcelas:</strong> {contrato.parcelas}x de R$ {contrato.valorParcela?.toFixed(2).replace('.', ',')}</p>
            </div>
            <div>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Pagamento:</strong> {contrato.formaPagamento}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Prazo:</strong> {contrato.prazoExecucao}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Garantia:</strong> {contrato.garantia}</p>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, margin: '0 0 10px' }}>2. CLÁUSULAS E DISPOSIÇÕES GERAIS</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, margin: 0, color: '#334155' }}>{contrato.clausulasExtras}</pre>
          </div>

          {!assinado ? (
            <div style={{ marginTop: 24, padding: 20, border: '2px dashed #dbe3ef', borderRadius: 16, background: '#fafbfc' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 12px', textAlign: 'center' }}>Assinatura Digital do Contratante</h3>
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', margin: '0 0 12px' }}>Desenhe sua assinatura abaixo com o dedo ou mouse:</p>
              <canvas
                ref={canvasRef}
                width={500}
                height={120}
                style={{ width: '100%', maxWidth: 500, height: 120, border: '1px solid #ccc', borderRadius: 8, background: '#fff', cursor: 'crosshair', display: 'block', margin: '0 auto' }}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
                <button onClick={limparAssinatura} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #dbe3ef', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>Limpar</button>
                <button onClick={confirmarAssinatura} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={16} /> Confirmar Assinatura
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 24, padding: 20, border: '2px solid #22c55e', borderRadius: 16, background: '#f0fdf4', textAlign: 'center' }}>
              <Check size={32} style={{ color: '#22c55e', marginBottom: 8 }} />
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 8px', color: '#166534' }}>Contrato Assinado Digitalmente</h3>
              <p style={{ fontSize: 14, color: '#166534', margin: 0 }}>Este contrato foi assinado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
