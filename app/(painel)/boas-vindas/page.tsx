'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { resetDemoData } from '@/lib/connect-demo'
import OnboardingTourModal from '@/components/onboarding/OnboardingTourModal'
import {
  CHECKLIST_ITENS,
  marcarChecklist,
  mesclarChecklistDetectado,
  progressoChecklistPercent,
  type ChecklistProgress,
} from '@/lib/onboardingChecklist'

const passos = [
  { titulo: '1. Cadastre ou escolha um cliente', texto: 'Use Clientes para consultar dados, abrir WhatsApp e acompanhar o histórico.', href: '/clientes', acao: 'Abrir clientes', icone: '👥' },
  { titulo: '2. Gere um orçamento', texto: 'Monte proposta, envie pelo WhatsApp e aprove a venda com visual profissional.', href: '/orcamentos', acao: 'Criar orçamento', icone: '💰' },
  { titulo: '3. Controle OS e recibos', texto: 'Registre equipamento, status, valores e entregue recibos prontos para impressão.', href: '/ordens-servico', acao: 'Abrir OS', icone: '🔧' },
  { titulo: '4. Cobre pelo financeiro', texto: 'Veja pendências, atraso, vencimento de hoje e envie cobrança segura por WhatsApp.', href: '/financeiro', acao: 'Ver financeiro', icone: '💸' },
]

const botaoPrimario = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 18px', borderRadius: 999, background: '#ffffff', color: '#1d4ed8', fontWeight: 950, textDecoration: 'none', boxShadow: '0 12px 28px rgba(15,23,42,.22)' } as const
const botaoSecundario = { minHeight: 46, padding: '0 18px', borderRadius: 999, background: 'rgba(255,255,255,.14)', color: '#ffffff', fontWeight: 950, border: '1px solid rgba(255,255,255,.25)', cursor: 'pointer' } as const
const ONBOARDING_KEY = 'connect_onboarding_empresa'

type EmpresaForm = {
  nomeEmpresa: string
  whatsappEmpresa: string
  endereco: string
  segmento: string
  logoUrl: string
}

export default function BoasVindasPage() {
  const router = useRouter()
  const [form, setForm] = useState<EmpresaForm>({
    nomeEmpresa: '',
    whatsappEmpresa: '',
    endereco: '',
    segmento: '',
    logoUrl: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [checklistPct, setChecklistPct] = useState(0)
  const [checklistProgress, setChecklistProgress] = useState<ChecklistProgress>({})

  function reiniciarDemo() { resetDemoData(); alert('Demonstração reiniciada com dados fictícios.'); router.refresh() }

  useEffect(() => {
    const atualizar = () => {
      const merged = mesclarChecklistDetectado()
      setChecklistProgress(merged)
      setChecklistPct(progressoChecklistPercent(merged))
    }
    atualizar()
    window.addEventListener('connect-checklist-change', atualizar)
    window.addEventListener('storage', atualizar)
    return () => {
      window.removeEventListener('connect-checklist-change', atualizar)
      window.removeEventListener('storage', atualizar)
    }
  }, [])

  useEffect(() => {
    let ativo = true

    async function carregarEmpresa() {
      try {
        const local = JSON.parse(localStorage.getItem(ONBOARDING_KEY) || '{}')
        if (ativo && local && typeof local === 'object') {
          setForm((prev) => ({ ...prev, ...local }))
        }
      } catch {}

      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return

      const { data } = await supabase
        .from('configuracoes_empresa')
        .select('nome_empresa,whatsapp_empresa,endereco,responsavel,logo_url')
        .eq('user_id', userId)
        .maybeSingle()

      if (!ativo || !data) return

      const carregado = {
        nomeEmpresa: data.nome_empresa || '',
        whatsappEmpresa: data.whatsapp_empresa || '',
        endereco: data.endereco || '',
        segmento: data.responsavel || '',
        logoUrl: data.logo_url || '',
      }
      setForm((prev) => ({ ...prev, ...carregado }))
      try {
        localStorage.setItem(ONBOARDING_KEY, JSON.stringify(carregado))
      } catch {}
    }

    void carregarEmpresa()
    return () => {
      ativo = false
    }
  }, [])

  const progresso = useMemo(() => {
    const campos = [form.nomeEmpresa, form.whatsappEmpresa, form.endereco, form.segmento, form.logoUrl]
    const preenchidos = campos.filter((campo) => String(campo || '').trim()).length
    return Math.round((preenchidos / campos.length) * 100)
  }, [form])

  function atualizarCampo(campo: keyof EmpresaForm, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
    setMensagem('')
  }

  async function salvarEmpresa() {
    setSalvando(true)
    setMensagem('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      const payload = {
        nomeEmpresa: form.nomeEmpresa.trim(),
        whatsappEmpresa: form.whatsappEmpresa.trim(),
        endereco: form.endereco.trim(),
        segmento: form.segmento.trim(),
        logoUrl: form.logoUrl.trim(),
      }

      localStorage.setItem(ONBOARDING_KEY, JSON.stringify(payload))

      if (userId) {
        const { error } = await supabase
          .from('configuracoes_empresa')
          .upsert(
            {
              user_id: userId,
              nome_empresa: payload.nomeEmpresa || 'Minha empresa',
              telefone: payload.whatsappEmpresa,
              whatsapp_empresa: payload.whatsappEmpresa,
              endereco: payload.endereco,
              responsavel: payload.segmento,
              logo_url: payload.logoUrl || '/logo-connect.png',
            },
            { onConflict: 'user_id' },
          )

        if (error) {
          console.error('ONBOARDING_EMPRESA_SUPABASE_ERRO', error)
          setMensagem('Dados salvos neste aparelho. Confira a tabela configuracoes_empresa no Supabase.')
          return
        }
      }

      setMensagem('Empresa configurada com sucesso. Você já pode começar pelo dashboard.')
    } catch (error) {
      console.error('ONBOARDING_EMPRESA_ERRO', error)
      setMensagem('Não foi possível salvar agora. Os dados ficaram como rascunho neste aparelho.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 40px)', borderRadius: 28, padding: 24, background: 'radial-gradient(circle at top left, rgba(37,99,235,.13), transparent 34%), linear-gradient(135deg,#f8fbff,#eef6ff)', border: '1px solid rgba(37,99,235,.10)', boxShadow: '0 24px 60px rgba(15,23,42,.08)' }}>
      <OnboardingTourModal />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, alignItems: 'stretch' }}>
        <section style={{ borderRadius: 28, padding: 28, background: 'linear-gradient(135deg,#0f172a,#1d4ed8 58%,#10b981)', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 26px 70px rgba(37,99,235,.24)' }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: 2.8, textTransform: 'uppercase', opacity: .8 }}>Connect Sistema</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 46, lineHeight: .95, letterSpacing: -1.8 }}>Bem-vindo ao seu painel</h1>
            <p style={{ margin: 0, maxWidth: 700, color: '#dbeafe', fontSize: 16, lineHeight: 1.55, fontWeight: 700 }}>Configure sua empresa em poucos minutos para seus orçamentos, OS, recibos e cobranças já saírem com dados profissionais.</p>
            <div style={{ marginTop: 20, maxWidth: 520 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                <span>Progresso do onboarding</span>
                <span>{progresso}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,.18)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${progresso}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(135deg,#ffffff,#86efac)', transition: 'width .25s ease' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
              <Link href="/dashboard" style={botaoPrimario}>Começar agora</Link>
              <button onClick={reiniciarDemo} style={botaoSecundario}>Reiniciar dados demo</button>
            </div>
          </div>
          <div style={{ position: 'absolute', right: -70, top: -70, width: 230, height: 230, borderRadius: '50%', background: 'rgba(255,255,255,.14)' }} />
          <div style={{ position: 'absolute', right: 34, bottom: 24, fontSize: 82, opacity: .22 }}>🚀</div>
        </section>
        <aside style={{ borderRadius: 28, padding: 22, background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 18px 45px rgba(15,23,42,.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: 1.5, color: '#16a34a', textTransform: 'uppercase' }}>Cadastro da empresa</div>
          <h2 style={{ margin: '8px 0 10px', color: '#0f172a', fontSize: 26 }}>Identidade comercial</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <Campo label="Nome da empresa" value={form.nomeEmpresa} onChange={(v) => atualizarCampo('nomeEmpresa', v)} placeholder="Ex.: Connect Assistência" />
            <Campo label="WhatsApp" value={form.whatsappEmpresa} onChange={(v) => atualizarCampo('whatsappEmpresa', v)} placeholder="84999999999" />
            <Campo label="Endereço" value={form.endereco} onChange={(v) => atualizarCampo('endereco', v)} placeholder="Rua, número, bairro e cidade" />
            <Campo label="Segmento" value={form.segmento} onChange={(v) => atualizarCampo('segmento', v)} placeholder="Assistência técnica, serviços, loja..." />
            <Campo label="Logo da empresa (URL)" value={form.logoUrl} onChange={(v) => atualizarCampo('logoUrl', v)} placeholder="https://..." />
            <button onClick={() => void salvarEmpresa()} disabled={salvando} style={{ minHeight: 46, border: 'none', borderRadius: 16, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontWeight: 950, cursor: salvando ? 'wait' : 'pointer', boxShadow: '0 12px 26px rgba(37,99,235,.20)' }}>
              {salvando ? 'Salvando...' : 'Salvar onboarding'}
            </button>
            {mensagem ? <div style={{ color: mensagem.includes('sucesso') ? '#047857' : '#b45309', fontWeight: 850, fontSize: 13 }}>{mensagem}</div> : null}
          </div>
        </aside>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 18 }}>
        {passos.map((passo) => <Link key={passo.href} href={passo.href} style={{ textDecoration: 'none', color: '#0f172a', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 24, padding: 20, boxShadow: '0 16px 35px rgba(15,23,42,.06)', display: 'grid', gap: 10 }}><div style={{ width: 46, height: 46, borderRadius: 16, background: 'linear-gradient(135deg,#dbeafe,#ecfeff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{passo.icone}</div><strong style={{ fontSize: 18 }}>{passo.titulo}</strong><span style={{ color: '#64748b', fontWeight: 700, lineHeight: 1.45 }}>{passo.texto}</span><span style={{ color: '#2563eb', fontWeight: 950 }}>{passo.acao} →</span></Link>)}
      </div>

      <section style={{ marginTop: 22, borderRadius: 24, padding: 22, background: '#fff', border: '1px solid #dbeafe', boxShadow: '0 16px 40px rgba(15,23,42,.06)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.4, color: '#2563eb', textTransform: 'uppercase' }}>Checklist inicial</div>
            <h2 style={{ margin: '6px 0 0', fontSize: 24, color: '#0f172a' }}>Primeiros passos no Connect</h2>
          </div>
          <div style={{ fontWeight: 950, color: '#16a34a' }}>{checklistPct}% concluído</div>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', margin: '14px 0 18px', overflow: 'hidden' }}>
          <div style={{ width: `${checklistPct}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb,#10b981)', transition: 'width .25s ease' }} />
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {CHECKLIST_ITENS.map((item) => {
            const done = !!checklistProgress[item.id]
            return (
              <div key={item.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 16, border: '1px solid #e2e8f0', background: done ? '#f0fdf4' : '#f8fafc' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => {
                      marcarChecklist(item.id, e.target.checked)
                      const next = { ...checklistProgress, [item.id]: e.target.checked }
                      setChecklistProgress(next)
                      setChecklistPct(progressoChecklistPercent(next))
                    }}
                  />
                  <span>
                    <strong style={{ display: 'block', color: '#0f172a' }}>{item.titulo}</strong>
                    <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>{item.descricao}</span>
                  </span>
                </label>
                <Link href={item.href} style={{ padding: '8px 14px', borderRadius: 999, background: '#2563eb', color: '#fff', fontWeight: 900, fontSize: 13, textDecoration: 'none' }}>{item.acao}</Link>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Campo({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ color: '#475569', fontWeight: 950, fontSize: 11, textTransform: 'uppercase', letterSpacing: .7 }}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ minHeight: 44, borderRadius: 14, border: '1px solid #dbeafe', background: '#f8fbff', color: '#0f172a', padding: '0 13px', fontWeight: 800, outline: 'none' }}
      />
    </label>
  )
}
