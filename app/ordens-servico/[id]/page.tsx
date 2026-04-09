'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const STORAGE_KEY = 'connect_ordens_servico_salvas'

function moeda(valor?: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default function OrdemServicoDetalhePage() {
  const params = useParams()
  const id = String(params.id || '')
  const [os, setOs] = useState<any>(null)

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo) {
      try {
        const lista = JSON.parse(salvo)
        const encontrado = Array.isArray(lista)
          ? lista.find((item: any) => String(item.id) === id)
          : null
        setOs(encontrado || null)
      } catch {
        setOs(null)
      }
    }
  }, [id])

  if (!os) {
    return (
      <div style={{ padding: 20 }}>
        <h1>OS não encontrada</h1>
        <Link href="/ordens-servico">Voltar</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/ordens-servico">← Voltar</Link>
      </div>

      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Ordem de Serviço #{os.numero}</h1>
        <p><strong>Cliente:</strong> {os.cliente}</p>
        <p><strong>Telefone:</strong> {os.telefone}</p>
        <p><strong>E-mail:</strong> {os.email}</p>
        <p><strong>Endereço:</strong> {os.endereco}</p>
        <hr />
        <p><strong>Equipamento:</strong> {os.equipamento}</p>
        <p><strong>Marca:</strong> {os.marca}</p>
        <p><strong>Modelo:</strong> {os.modelo}</p>
        <p><strong>Serial / IMEI:</strong> {os.serial}</p>
        <p><strong>Defeito:</strong> {os.defeito}</p>
        <p><strong>Checklist:</strong> {os.checklist}</p>
        <p><strong>Status:</strong> {os.status}</p>
        <p><strong>Valor:</strong> {moeda(os.valor)}</p>
        <p><strong>Entrada:</strong> {moeda(os.entrada)}</p>
        <p><strong>Saldo:</strong> {moeda(os.saldo)}</p>
        <p><strong>Observação:</strong> {os.observacao}</p>
      </div>
    </div>
  )
}
