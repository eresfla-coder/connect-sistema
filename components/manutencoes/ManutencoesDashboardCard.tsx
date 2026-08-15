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
        <div className="proxima"><b>{contagem.proxima}</b><span>Próximas</span></div>
        <div className="vencendo"><b>{contagem.vencendo}</b><span>Vencendo</span></div>
        <div className="vencida"><b>{contagem.vencida}</b><span>Vencidas</span></div>
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
        .box{background:linear-gradient(180deg, rgba(9,22,42,0.94), rgba(4,14,28,0.96));border:1px solid rgba(96,165,250,0.22);border-radius:28px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.04);min-width:0}.head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.head>div>span{display:flex;align-items:center;gap:6px;color:#5eead4;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.head h2{margin:6px 0 0;font-size:19px;font-weight:950;color:#ffffff}.head :global(a){color:#bfdbfe;font-weight:900;text-decoration:none;font-size:13px;padding:8px 14px;border-radius:999px;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.32)}.head :global(a:hover){color:#ffffff;background:rgba(96,165,250,.24);border-color:rgba(96,165,250,.55)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 4px}.stats>div{padding:12px;border-radius:18px;background:rgba(255,255,255,0.045);border:1px solid rgba(148,163,184,.22);min-width:0}.stats b{display:block;font-size:22px;font-weight:950;color:#ffffff}.stats span{font-size:11px;color:#cbd5e1;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.stats .proxima b{color:#bfdbfe}.stats .vencendo b{color:#fde68a}.stats .vencida b{color:#fca5a5}.list{display:grid;margin-top:8px}.row{display:grid;grid-template-columns:1fr auto 42px;align-items:center;gap:12px;padding:12px 0;border-top:1px solid rgba(148,163,184,.16)}.row>div{display:grid;gap:3px;min-width:0}.row b{color:#ffffff;font-weight:900;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row span{font-size:11px;color:#94a3b8;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.date{text-align:right}.date b{color:#e2e8f0;font-size:13px}.row button{height:38px;border:1px solid rgba(34,197,94,.42);border-radius:12px;background:rgba(34,197,94,.16);color:#86efac;display:grid;place-items:center;cursor:pointer}.row button:hover{background:rgba(34,197,94,.28);color:#dcfce7}.empty{color:#94a3b8;font-size:13px;text-align:center;padding:16px;margin:12px 0 0;border-radius:18px;background:rgba(255,255,255,.04);border:1px dashed rgba(148,163,184,.22)}@media(max-width:560px){.box{padding:16px;border-radius:24px}.row{grid-template-columns:1fr 40px}.date{grid-column:1;text-align:left}.row button{grid-column:2;grid-row:1/3}.stats>div{padding:10px}.stats b{font-size:19px}}
      `}</style>
    </section>
  )
}
