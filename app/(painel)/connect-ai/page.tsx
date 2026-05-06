'use client'

import { CSSProperties, useEffect, useMemo, useState } from 'react'

const ORCAMENTOS_KEY = 'connect_orcamentos_salvos'
const OS_KEY = 'connect_ordens_servico_salvas'
const FINANCEIRO_KEY = 'connect_financeiro_titulos'
const CLIENTES_KEY = 'connect_clientes'
const PRODUTOS_KEY = 'connect_produtos'
const AI_HISTORY_KEY = 'connect_ai_historico_v1'

type TipoFerramenta = 'whatsapp' | 'os' | 'orcamento' | 'financeiro' | 'followup'

type HistoricoIA = {
  id: number
  tipo: TipoFerramenta
  titulo: string
  texto: string
  criadoEm: string
}

type Insight = {
  titulo: string
  descricao: string
  nivel: 'verde' | 'azul' | 'amarelo' | 'vermelho'
  icone: string
}

function lerLista<T = any>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function dinheiro(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function normalizarTelefone(valor: string) {
  const digitos = String(valor || '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.startsWith('55')) return digitos
  if (digitos.length >= 10) return `55${digitos}`
  return digitos
}

function hojePt() {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function copiar(texto: string) {
  try {
    navigator.clipboard?.writeText(texto)
    alert('Texto copiado.')
  } catch {
    alert('Não foi possível copiar automaticamente.')
  }
}

function abrirWhatsApp(telefone: string, texto: string) {
  const tel = normalizarTelefone(telefone)
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export default function ConnectAIPage() {
  const [tipo, setTipo] = useState<TipoFerramenta>('whatsapp')
  const [cliente, setCliente] = useState('')
  const [telefone, setTelefone] = useState('')
  const [contexto, setContexto] = useState('')
  const [tom, setTom] = useState<'profissional' | 'amigavel' | 'cobranca' | 'urgente'>('profissional')
  const [resultado, setResultado] = useState('')
  const [historico, setHistorico] = useState<HistoricoIA[]>([])
  const [dados, setDados] = useState({ orcamentos: [] as any[], os: [] as any[], financeiro: [] as any[], clientes: [] as any[], produtos: [] as any[] })

  useEffect(() => {
    setDados({
      orcamentos: lerLista(ORCAMENTOS_KEY),
      os: lerLista(OS_KEY),
      financeiro: lerLista(FINANCEIRO_KEY),
      clientes: lerLista(CLIENTES_KEY),
      produtos: lerLista(PRODUTOS_KEY),
    })
    setHistorico(lerLista<HistoricoIA>(AI_HISTORY_KEY).slice(0, 12))
  }, [])

  const metricas = useMemo(() => {
    const totalOrcamentos = dados.orcamentos.reduce((s, o) => s + Number(o?.total || o?.valor || 0), 0)
    const orcamentosPendentes = dados.orcamentos.filter((o) => !String(o?.status || '').toLowerCase().includes('aprov')).length
    const osAbertas = dados.os.filter((o) => !['finalizada', 'entregue', 'cancelada'].includes(String(o?.status || '').toLowerCase())).length
    const financeiroAberto = dados.financeiro.filter((f) => !String(f?.status || '').toLowerCase().includes('pago')).reduce((s, f) => s + Number(f?.valor || f?.total || 0), 0)
    const produtosSemCodigo = dados.produtos.filter((p) => !String(p?.codigoBarras || '').trim()).length
    return { totalOrcamentos, orcamentosPendentes, osAbertas, financeiroAberto, produtosSemCodigo }
  }, [dados])

  const insights = useMemo<Insight[]>(() => {
    const lista: Insight[] = []
    if (metricas.orcamentosPendentes > 0) lista.push({ icone: '💬', nivel: 'amarelo', titulo: 'Orçamentos precisam de follow-up', descricao: `${metricas.orcamentosPendentes} orçamento(s) podem receber mensagem de fechamento hoje.` })
    if (metricas.osAbertas > 0) lista.push({ icone: '🔧', nivel: 'azul', titulo: 'OS em andamento', descricao: `${metricas.osAbertas} ordem(ns) aberta(s). Avise o cliente sempre que mudar o status.` })
    if (metricas.financeiroAberto > 0) lista.push({ icone: '💸', nivel: 'vermelho', titulo: 'Financeiro aberto', descricao: `Existe aproximadamente ${dinheiro(metricas.financeiroAberto)} em aberto para acompanhar.` })
    if (metricas.produtosSemCodigo > 0) lista.push({ icone: '📦', nivel: 'verde', titulo: 'Código de barras', descricao: `${metricas.produtosSemCodigo} produto(s) sem código. Completar isso fortalece o Modo Balcão PRO.` })
    if (!lista.length) lista.push({ icone: '🚀', nivel: 'verde', titulo: 'Operação saudável', descricao: 'Nenhum alerta crítico encontrado nos dados locais agora.' })
    return lista
  }, [metricas])

  function gerarTexto() {
    const nome = cliente.trim() || 'cliente'
    const extra = contexto.trim()
    let texto = ''

    if (tipo === 'whatsapp') {
      texto = `Olá ${nome}, tudo bem?\n\nPassando para te atualizar sobre seu atendimento aqui na Connect. ${extra || 'Se precisar, posso te enviar mais detalhes por aqui.'}\n\nFico à disposição.`
    }

    if (tipo === 'os') {
      texto = `Resumo sugerido para OS:\n\nEquipamento/serviço: ${extra || 'descrever equipamento, defeito relatado e análise inicial.'}\nStatus inicial: aguardando avaliação técnica.\nObservação: cliente deve ser avisado antes de qualquer serviço adicional ou troca de peça.`
    }

    if (tipo === 'orcamento') {
      texto = `Olá ${nome}!\n\nSegue uma proposta preparada com cuidado para atender sua necessidade. ${extra || 'O orçamento contempla os itens/serviços solicitados e pode ser ajustado se necessário.'}\n\nPosso confirmar para dar andamento?`
    }

    if (tipo === 'financeiro') {
      texto = `Olá ${nome}, tudo bem?\n\nIdentificamos uma pendência financeira em aberto. ${extra || 'Estou enviando esta mensagem apenas para facilitar a regularização.'}\n\nCaso já tenha realizado o pagamento, por favor desconsidere e nos envie o comprovante.`
    }

    if (tipo === 'followup') {
      texto = `Olá ${nome}!\n\nPassando para saber se você conseguiu avaliar nossa proposta. ${extra || 'Posso te ajudar com alguma dúvida ou ajuste no orçamento?'}\n\nSe estiver tudo certo, já posso seguir com a aprovação.`
    }

    if (tom === 'amigavel') texto = texto.replace('Olá', 'Oi').concat('\n\nObrigado pela confiança!')
    if (tom === 'cobranca') texto = texto.concat('\n\nSe preferir, podemos combinar a melhor forma de pagamento.')
    if (tom === 'urgente') texto = texto.concat('\n\nAssim que você responder, já consigo priorizar por aqui.')

    setResultado(texto)

    const novo: HistoricoIA = {
      id: Date.now(),
      tipo,
      titulo: tipo === 'whatsapp' ? 'Mensagem WhatsApp' : tipo === 'os' ? 'Resumo OS' : tipo === 'orcamento' ? 'Texto Orçamento' : tipo === 'financeiro' ? 'Cobrança' : 'Follow-up',
      texto,
      criadoEm: hojePt(),
    }
    const atual = [novo, ...historico].slice(0, 12)
    setHistorico(atual)
    try { localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(atual)) } catch {}
  }

  const corNivel = (nivel: Insight['nivel']) => {
    if (nivel === 'vermelho') return '#ef4444'
    if (nivel === 'amarelo') return '#f59e0b'
    if (nivel === 'azul') return '#2563eb'
    return '#22c55e'
  }

  return (
    <div style={{ display: 'grid', gap: 18, paddingBottom: 40 }}>
      <section style={{ borderRadius: 26, padding: 22, color: '#fff', background: 'linear-gradient(135deg,#0f172a 0%,#1d4ed8 54%,#06b6d4 100%)', boxShadow: '0 20px 45px rgba(37,99,235,.22)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -80, top: -80, width: 240, height: 240, borderRadius: 999, background: 'rgba(255,255,255,.12)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.2, opacity: .86, textTransform: 'uppercase' }}>Connect AI v1</div>
          <h1 style={{ margin: '6px 0 8px', fontSize: 'clamp(28px,5vw,46px)', lineHeight: 1, fontWeight: 950 }}>Assistente inteligente do sistema</h1>
          <p style={{ margin: 0, maxWidth: 780, fontSize: 15, opacity: .9, lineHeight: 1.55 }}>Gere mensagens, resumos de OS, follow-ups, cobranças e insights rápidos usando os dados locais do Connect. Esta versão já entrega valor sem custo de API e fica pronta para conectar IA paga depois.</p>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
        {[
          ['Orçamentos', dinheiro(metricas.totalOrcamentos), '💰'],
          ['Pendentes', String(metricas.orcamentosPendentes), '⏳'],
          ['OS abertas', String(metricas.osAbertas), '🔧'],
          ['Em aberto', dinheiro(metricas.financeiroAberto), '💸'],
        ].map(([label, value, icon]) => (
          <div key={label} style={{ borderRadius: 20, padding: 16, background: '#fff', boxShadow: '0 12px 30px rgba(15,23,42,.08)', border: '1px solid rgba(148,163,184,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: 22 }}>{icon}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 950, color: '#0f172a' }}>{value}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(300px,.85fr)', gap: 16 }} className="connect-ai-grid">
        <div style={{ borderRadius: 24, padding: 18, background: '#fff', boxShadow: '0 16px 38px rgba(15,23,42,.08)', border: '1px solid rgba(148,163,184,.16)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, color: '#0f172a', fontWeight: 950 }}>Gerador inteligente</h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Escolha o tipo, informe o contexto e gere uma mensagem pronta.</p>
            </div>
            <span style={{ padding: '8px 12px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontWeight: 900, fontSize: 12 }}>Modo local</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
            {([
              ['whatsapp', 'WhatsApp', '💬'],
              ['os', 'Resumo OS', '🔧'],
              ['orcamento', 'Orçamento', '📄'],
              ['financeiro', 'Cobrança', '💸'],
              ['followup', 'Follow-up', '🎯'],
            ] as [TipoFerramenta,string,string][]).map((item) => (
              <button key={item[0]} onClick={() => setTipo(item[0])} style={{ border: tipo === item[0] ? '1px solid #2563eb' : '1px solid #e2e8f0', background: tipo === item[0] ? 'linear-gradient(135deg,#2563eb,#06b6d4)' : '#f8fafc', color: tipo === item[0] ? '#fff' : '#0f172a', borderRadius: 16, padding: '12px 14px', fontWeight: 950, cursor: 'pointer', textAlign: 'left', boxShadow: tipo === item[0] ? '0 12px 26px rgba(37,99,235,.22)' : 'none' }}>
                <span style={{ marginRight: 8 }}>{item[2]}</span>{item[1]}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 900, color: '#334155', fontSize: 13 }}>Cliente
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 900, color: '#334155', fontSize: 13 }}>Telefone / WhatsApp
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="84999999999" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 900, color: '#334155', fontSize: 13 }}>Tom
              <select value={tom} onChange={(e) => setTom(e.target.value as any)} style={inputStyle}>
                <option value="profissional">Profissional</option>
                <option value="amigavel">Amigável</option>
                <option value="cobranca">Cobrança educada</option>
                <option value="urgente">Prioridade</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6, fontWeight: 900, color: '#334155', fontSize: 13, marginTop: 10 }}>Contexto
            <textarea value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Ex: orçamento de troca de tela, cliente pediu desconto, OS pronta para retirada..." rows={5} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <button onClick={gerarTexto} style={primaryBtn}>✨ Gerar com IA</button>
            <button onClick={() => copiar(resultado)} disabled={!resultado} style={secondaryBtn}>Copiar</button>
            <button onClick={() => abrirWhatsApp(telefone, resultado)} disabled={!resultado} style={whatsBtn}>Enviar WhatsApp</button>
          </div>

          {resultado && (
            <div style={{ marginTop: 16, padding: 16, borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14 }}>
              {resultado}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ borderRadius: 24, padding: 18, background: '#fff', boxShadow: '0 16px 38px rgba(15,23,42,.08)', border: '1px solid rgba(148,163,184,.16)' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, color: '#0f172a', fontWeight: 950 }}>Insights IA</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {insights.map((item) => (
                <div key={item.titulo} style={{ padding: 13, borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 13, background: corNivel(item.nivel), color: '#fff', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>{item.icone}</div>
                  <div>
                    <div style={{ fontWeight: 950, color: '#0f172a', fontSize: 14 }}>{item.titulo}</div>
                    <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.35 }}>{item.descricao}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderRadius: 24, padding: 18, background: '#0f172a', boxShadow: '0 16px 38px rgba(15,23,42,.18)', color: '#fff' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 950 }}>Histórico rápido</h2>
            <div style={{ display: 'grid', gap: 9, maxHeight: 330, overflowY: 'auto' }}>
              {historico.length ? historico.map((h) => (
                <button key={h.id} onClick={() => setResultado(h.texto)} style={{ textAlign: 'left', border: '1px solid rgba(255,255,255,.10)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 14, padding: 12, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 950, fontSize: 13 }}>{h.titulo}</div>
                  <div style={{ opacity: .68, fontSize: 11, marginTop: 2 }}>{h.criadoEm}</div>
                </button>
              )) : <div style={{ color: '#cbd5e1', fontSize: 13 }}>Nada gerado ainda.</div>}
            </div>
          </div>
        </div>
      </section>

      <style jsx>{`
        @media (max-width: 900px) {
          .connect-ai-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #dbe4ef',
  borderRadius: 14,
  padding: '12px 13px',
  fontSize: 14,
  outline: 'none',
  background: '#fff',
  color: '#0f172a',
  boxSizing: 'border-box',
}

const primaryBtn: CSSProperties = {
  border: 'none',
  borderRadius: 15,
  background: 'linear-gradient(135deg,#2563eb,#06b6d4)',
  color: '#fff',
  fontWeight: 950,
  padding: '12px 16px',
  cursor: 'pointer',
  boxShadow: '0 12px 25px rgba(37,99,235,.22)',
}

const secondaryBtn: CSSProperties = {
  border: '1px solid #dbe4ef',
  borderRadius: 15,
  background: '#fff',
  color: '#0f172a',
  fontWeight: 950,
  padding: '12px 16px',
  cursor: 'pointer',
}

const whatsBtn: CSSProperties = {
  border: 'none',
  borderRadius: 15,
  background: 'linear-gradient(135deg,#16a34a,#065f46)',
  color: '#fff',
  fontWeight: 950,
  padding: '12px 16px',
  cursor: 'pointer',
}
