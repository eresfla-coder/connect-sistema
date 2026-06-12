'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  carregarClientesCadastro,
  enderecoClienteCompleto,
  type ClienteCadastro,
} from '@/lib/clientesCadastro'

type Props = {
  valueId?: string
  onSelecionar: (cliente: ClienteCadastro | null) => void
  label?: string
  permitirManual?: boolean
  compacto?: boolean
}

export function SeletorClienteCadastrado({
  valueId = '',
  onSelecionar,
  label = 'Cliente cadastrado',
  permitirManual = true,
  compacto = false,
}: Props) {
  const [clientes, setClientes] = useState<ClienteCadastro[]>([])
  const [busca, setBusca] = useState('')
  const [idSelecionado, setIdSelecionado] = useState(valueId)

  useEffect(() => {
    void carregarClientesCadastro().then(setClientes)
  }, [])

  useEffect(() => {
    setIdSelecionado(valueId)
  }, [valueId])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return clientes.slice(0, 12)
    return clientes
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.telefone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
          (c.cpfCnpj || '').toLowerCase().includes(q),
      )
      .slice(0, 12)
  }, [busca, clientes])

  function selecionar(id: string) {
    setIdSelecionado(id)
    if (!id) {
      onSelecionar(null)
      return
    }
    const cliente = clientes.find((c) => String(c.id) === id) || null
    onSelecionar(cliente)
  }

  const labelStyle = {
    display: 'block' as const,
    marginBottom: 6,
    color: '#334155',
    fontWeight: 900,
    fontSize: 13,
  }

  const fieldStyle = {
    width: '100%',
    minHeight: compacto ? 44 : 50,
    borderRadius: 16,
    border: '1px solid #cbd5e1',
    background: '#f8fbff',
    color: '#0f172a',
    padding: '0 14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontSize: 15,
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label style={labelStyle}>{label}</label>
      <select value={idSelecionado} onChange={(e) => selecionar(e.target.value)} style={fieldStyle}>
        <option value="">{permitirManual ? 'Selecionar cliente cadastrado (opcional)' : 'Selecione um cliente...'}</option>
        {clientes.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.nome}
            {c.telefone ? ` • ${c.telefone}` : ''}
          </option>
        ))}
      </select>
      {clientes.length > 6 ? (
        <>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou documento..."
            style={{ ...fieldStyle, minHeight: 42 }}
          />
          {busca.trim() && filtrados.length > 0 ? (
            <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              {filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selecionar(String(c.id))}
                  style={{
                    textAlign: 'left',
                    borderRadius: 12,
                    border: idSelecionado === String(c.id) ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: idSelecionado === String(c.id) ? '#eff6ff' : '#fff',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 13,
                    color: '#0f172a',
                  }}
                >
                  {c.nome}
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                    {[c.telefone, c.cpfCnpj, enderecoClienteCompleto(c)].filter(Boolean).join(' • ')}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
