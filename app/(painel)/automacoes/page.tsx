'use client'

import { useEffect, useState } from 'react'

type Automacao = {
  id: string
  nome: string
  descricao: string
  ativa: boolean
}

const KEY = 'connect_automacoes_v37'

const automacoesBase: Automacao[] = [
  {
    id: 'orcamento_parado',
    nome: 'Orçamento parado',
    descricao: 'Envia lembrete automático para orçamento sem resposta.',
    ativa: true,
  },
  {
    id: 'os_pronta',
    nome: 'OS pronta',
    descricao: 'Notifica o cliente quando a OS for finalizada.',
    ativa: true,
  },
  {
    id: 'cobranca_vencida',
    nome: 'Cobrança vencida',
    descricao: 'Lembra clientes com pagamento em atraso.',
    ativa: false,
  },
  {
    id: 'cliente_inativo',
    nome: 'Cliente inativo',
    descricao: 'Mensagem automática para reativação de clientes.',
    ativa: false,
  },
]

export default function AutomacoesPage() {
  const [automacoes, setAutomacoes] = useState<Automacao[]>(automacoesBase)

  useEffect(() => {
    const salvo = localStorage.getItem(KEY)
    if (salvo) {
      setAutomacoes(JSON.parse(salvo))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(automacoes))
  }, [automacoes])

  function alternar(id: string) {
    setAutomacoes((old) =>
      old.map((item) =>
        item.id === id ? { ...item, ativa: !item.ativa } : item
      )
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[32px] bg-gradient-to-br from-[#08152f] to-[#0c274d] p-6 text-white shadow-2xl">
          <div className="text-sm uppercase tracking-[0.35em] text-cyan-300">
            Connect Sistema
          </div>

          <h1 className="mt-3 text-3xl font-black md:text-5xl">
            Central de Automação Inteligente
          </h1>

          <p className="mt-4 max-w-3xl text-white/70">
            Automatize cobranças, lembretes, notificações e relacionamento com clientes.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {automacoes.map((item) => (
            <div
              key={item.id}
              className="rounded-[28px] border border-white/60 bg-white p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    {item.nome}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {item.descricao}
                  </p>
                </div>

                <button
                  onClick={() => alternar(item.id)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                    item.ativa
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {item.ativa ? 'ATIVA' : 'DESATIVADA'}
                </button>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-100 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
                  Fluxo automático
                </div>

                <div className="mt-2 text-sm text-slate-700">
                  Sistema monitora eventos e prepara envio automático via WhatsApp.
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[28px] bg-white p-6 shadow-xl">
          <h3 className="text-2xl font-black text-slate-800">
            Histórico de automações
          </h3>

          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            Nenhuma automação executada ainda.
          </div>
        </div>
      </div>
    </div>
  )
}
