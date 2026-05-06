'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resetDemoData } from '@/lib/connect-demo'

const passos = [
  { titulo: '1. Cadastre ou escolha um cliente', texto: 'Use Clientes para consultar dados, abrir WhatsApp e acompanhar o histórico.', href: '/clientes', acao: 'Abrir clientes', icone: '👥' },
  { titulo: '2. Gere um orçamento', texto: 'Monte proposta, envie pelo WhatsApp e aprove a venda com visual profissional.', href: '/orcamentos', acao: 'Criar orçamento', icone: '💰' },
  { titulo: '3. Controle OS e recibos', texto: 'Registre equipamento, status, valores e entregue recibos prontos para impressão.', href: '/ordens-servico', acao: 'Abrir OS', icone: '🔧' },
  { titulo: '4. Cobre pelo financeiro', texto: 'Veja pendências, atraso, vencimento de hoje e envie cobrança segura por WhatsApp.', href: '/financeiro', acao: 'Ver financeiro', icone: '💸' },
]

const botaoPrimario = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 18px', borderRadius: 999, background: '#ffffff', color: '#1d4ed8', fontWeight: 950, textDecoration: 'none', boxShadow: '0 12px 28px rgba(15,23,42,.22)' } as const
const botaoSecundario = { minHeight: 46, padding: '0 18px', borderRadius: 999, background: 'rgba(255,255,255,.14)', color: '#ffffff', fontWeight: 950, border: '1px solid rgba(255,255,255,.25)', cursor: 'pointer' } as const

export default function BoasVindasPage() {
  const router = useRouter()
  function reiniciarDemo() { resetDemoData(); alert('Demonstração reiniciada com dados fictícios.'); router.refresh() }

  return (
    <div style={{ minHeight: 'calc(100vh - 40px)', borderRadius: 28, padding: 24, background: 'radial-gradient(circle at top left, rgba(37,99,235,.13), transparent 34%), linear-gradient(135deg,#f8fbff,#eef6ff)', border: '1px solid rgba(37,99,235,.10)', boxShadow: '0 24px 60px rgba(15,23,42,.08)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, alignItems: 'stretch' }}>
        <section style={{ borderRadius: 28, padding: 28, background: 'linear-gradient(135deg,#0f172a,#1d4ed8 58%,#10b981)', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 26px 70px rgba(37,99,235,.24)' }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: 2.8, textTransform: 'uppercase', opacity: .8 }}>Connect Sistema</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 46, lineHeight: .95, letterSpacing: -1.8 }}>Bem-vindo ao modo demonstração</h1>
            <p style={{ margin: 0, maxWidth: 700, color: '#dbeafe', fontSize: 16, lineHeight: 1.55, fontWeight: 700 }}>Esta área usa dados fictícios para o cliente testar sem risco. Dá para navegar, gerar cobrança, ver clientes, orçamentos e financeiro com cara de sistema pronto para venda.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
              <Link href="/dashboard" style={botaoPrimario}>Começar agora</Link>
              <button onClick={reiniciarDemo} style={botaoSecundario}>Reiniciar dados demo</button>
            </div>
          </div>
          <div style={{ position: 'absolute', right: -70, top: -70, width: 230, height: 230, borderRadius: '50%', background: 'rgba(255,255,255,.14)' }} />
          <div style={{ position: 'absolute', right: 34, bottom: 24, fontSize: 82, opacity: .22 }}>🚀</div>
        </section>
        <aside style={{ borderRadius: 28, padding: 22, background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 18px 45px rgba(15,23,42,.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: 1.5, color: '#16a34a', textTransform: 'uppercase' }}>Pronto para teste</div>
          <h2 style={{ margin: '8px 0 10px', color: '#0f172a', fontSize: 26 }}>Checklist rápido</h2>
          <div style={{ display: 'grid', gap: 10 }}>{['Dados de exemplo carregados', 'Financeiro com cobrança WhatsApp', 'Clientes premium 360', 'Backup por exportação JSON', 'Sem sincronização automática pesada'].map((item) => <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#334155', fontWeight: 850 }}><span style={{ width: 25, height: 25, borderRadius: 999, background: '#dcfce7', color: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>✓</span>{item}</div>)}</div>
        </aside>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 18 }}>
        {passos.map((passo) => <Link key={passo.href} href={passo.href} style={{ textDecoration: 'none', color: '#0f172a', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 24, padding: 20, boxShadow: '0 16px 35px rgba(15,23,42,.06)', display: 'grid', gap: 10 }}><div style={{ width: 46, height: 46, borderRadius: 16, background: 'linear-gradient(135deg,#dbeafe,#ecfeff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{passo.icone}</div><strong style={{ fontSize: 18 }}>{passo.titulo}</strong><span style={{ color: '#64748b', fontWeight: 700, lineHeight: 1.45 }}>{passo.texto}</span><span style={{ color: '#2563eb', fontWeight: 950 }}>{passo.acao} →</span></Link>)}
      </div>
    </div>
  )
}
