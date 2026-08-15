'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, MessageCircle } from 'lucide-react'
import { abrirWhatsappUrl, montarUrlWhatsapp } from '@/lib/abrirExterno'
import {
  formatarDataBr,
  mensagemLembreteManutencao,
  normalizarTelefoneWhatsapp,
  type Manutencao,
  type StatusManutencao,
} from '@/lib/manutencoes'
import { supabase } from '@/lib/supabase-browser'

type Item = Manutencao & { status: StatusManutencao; diasRestantes: number | null }

export default function ManutencoesDashboardCard() {
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return
        const response = await fetch('/api/manutencoes?urgentes=1&limit=10', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        })
        const payload = await response.json().catch(() => null)
        if (ativo && response.ok && payload?.ok) setItens(payload.manutencoes || [])
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    void carregar()
    return () => { ativo = false }
  }, [])

  const urgentes = useMemo(
    () => itens
      .filter((item) => ['proxima', 'vencendo', 'vencida'].includes(item.status))
      .sort((a, b) => Number(a.diasRestantes ?? 99999) - Number(b.diasRestantes ?? 99999))
      .slice(0, 5),
    [itens],
  )
  const contagem = useMemo(() => ({
    proxima: itens.filter((item) => item.status === 'proxima').length,
    vencendo: itens.filter((item) => item.status === 'vencendo').length,
    vencida: itens.filter((item) => item.status === 'vencida').length,
  }), [itens])

  function abrirWhatsapp(item: Item) {
    const telefone = normalizarTelefoneWhatsapp(item.cliente?.telefone)
    if (!telefone) return window.alert('Cliente sem WhatsApp cadastrado.')
    abrirWhatsappUrl(montarUrlWhatsapp(telefone, mensagemLembreteManutencao(item)))
  }

  return (
    <section className="box">
      <div className="head">
        <div><span><CalendarClock size={18} /> Agenda preventiva</span><h2>Manutenções Próximas</h2></div>
        <Link href="/manutencoes">Ver todas</Link>
      </div>
      <div className="stats">
        <div><b>{contagem.proxima}</b><span>Próximas</span></div>
        <div><b>{contagem.vencendo}</b><span>Vencendo</span></div>
        <div><b>{contagem.vencida}</b><span>Vencidas</span></div>
      </div>
      {carregando ? <p className="empty">Carregando agenda...</p> : urgentes.length === 0 ? (
        <p className="empty">Nenhuma manutenção exige contato agora.</p>
      ) : (
        <div className="list">
          {urgentes.map((item) => (
            <div className="row" key={item.id}>
              <div>
                <b>{item.cliente?.nome || 'Cliente'}</b>
                <span>{item.equipamento?.nome || item.titulo}</span>
              </div>
              <div className="date"><b>{formatarDataBr(item.proxima_manutencao)}</b><span>{item.diasRestantes! < 0 ? `${Math.abs(item.diasRestantes!)}d atrasada` : `Faltam ${item.diasRestantes}d`}</span></div>
              <button onClick={() => abrirWhatsapp(item)} title="Abrir WhatsApp"><MessageCircle size={18} /></button>
            </div>
          ))}
        </div>
      )}
      <style jsx>{`
        .box{background:#fff;border:1px solid #dbe5ef;border-radius:20px;padding:18px;box-shadow:0 10px 28px rgba(15,23,42,.06);margin-top:16px}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}.head>div>span{display:flex;align-items:center;gap:6px;color:#0f766e;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.head h2{margin:4px 0;font-size:20px}.head a{color:#0f766e;font-weight:900;text-decoration:none}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.stats div{padding:10px 12px;border-radius:12px;background:#f8fafc}.stats b{display:block;font-size:20px}.stats span{font-size:11px;color:#64748b;font-weight:800}.list{display:grid}.row{display:grid;grid-template-columns:1fr auto 42px;align-items:center;gap:12px;padding:11px 0;border-top:1px solid #eef2f7}.row>div{display:grid;gap:2px;min-width:0}.row span{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.date{text-align:right}.row button{height:38px;border:0;border-radius:11px;background:#dcfce7;color:#15803d;display:grid;place-items:center;cursor:pointer}.empty{color:#64748b;text-align:center;padding:18px}@media(max-width:560px){.row{grid-template-columns:1fr 40px}.date{grid-column:1;text-align:left}.row button{grid-column:2;grid-row:1/3}.stats div{padding:8px}.stats b{font-size:18px}}
      `}</style>
    </section>
  )
}
