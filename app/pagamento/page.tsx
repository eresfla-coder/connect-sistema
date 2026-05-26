export default function PagamentoPage() {
  const whatsapp = 'https://wa.me/5584992181399?text=Ol%C3%A1!%20Quero%20ativar%20minha%20assinatura%20do%20Connect%20Sistema.'

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'radial-gradient(circle at top left, rgba(34,197,94,0.18), transparent 28%), radial-gradient(circle at top right, rgba(37,99,235,0.20), transparent 34%), linear-gradient(180deg, #08111f 0%, #020617 100%)' }}>
      <section style={{ width: '100%', maxWidth: 860, borderRadius: 32, padding: 28, color: '#fff', border: '1px solid rgba(255,255,255,0.12)', background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.97))', boxShadow: '0 28px 70px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
          <div>
            <div style={{ color: '#22c55e', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 900 }}>Connect Sistema Pro</div>
            <h1 style={{ margin: '10px 0 10px', fontSize: 42, lineHeight: 1, fontWeight: 950 }}>Ative sua assinatura</h1>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 16, lineHeight: 1.7 }}>Continue usando orçamento, OS, recibos, financeiro e aprovação digital com aparência profissional.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ padding: 20, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: '#93c5fd', fontWeight: 900, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>Plano mensal</div>
              <div style={{ marginTop: 8, fontSize: 38, fontWeight: 950 }}>R$ 49,90</div>
              <div style={{ color: '#cbd5e1', marginTop: 6 }}>por mês</div>
            </div>
            <div style={{ padding: 20, borderRadius: 24, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(147,197,253,0.24)' }}>
              <div style={{ color: '#bfdbfe', fontWeight: 900, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>Plano anual • melhor custo-benefício</div>
              <div style={{ marginTop: 8, fontSize: 38, fontWeight: 950 }}>R$ 479,00</div>
              <div style={{ color: '#cbd5e1', marginTop: 6 }}>por ano</div>
            </div>
            <div style={{ padding: 20, borderRadius: 24, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)' }}>
              <div style={{ color: '#86efac', fontWeight: 900, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>Incluso</div>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: '#dcfce7', lineHeight: 1.8 }}>
                <li>Orçamentos e OS</li>
                <li>Aprovação pelo cliente</li>
                <li>PDF premium</li>
                <li>Uso no celular e PC</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            <a href={whatsapp} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', padding: '15px 22px', borderRadius: 18, background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', fontWeight: 950, boxShadow: '0 16px 32px rgba(34,197,94,0.24)' }}>Ativar pelo WhatsApp</a>
            <a href="/login" style={{ textDecoration: 'none', padding: '15px 22px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontWeight: 900 }}>Voltar ao login</a>
          </div>

          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>Pagamento automático por gateway entra na próxima etapa. Nesta versão, a ativação é manual pelo administrador.</p>
        </div>
      </section>
    </main>
  )
}
