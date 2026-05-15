'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { Check, Crown, AlertTriangle, Loader2, CreditCard, Zap } from 'lucide-react'

type Assinatura = {
  id: string
  plano: string
  status: string
  data_inicio: string
  data_fim: string
  data_trial_fim: string
  trial_dias: number
  valor_mensal: number
  valor_anual: number
}

function formatarPrecoPlano(valor: number) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PLANOS = [
  {
    nome: 'Mensal',
    preco: 49.9,
    periodo: 'mês',
    descricao: 'Acesso completo a todas as funcionalidades',
    recursos: [
      'Orçamentos ilimitados',
      'Ordens de serviço ilimitadas',
      'Clientes ilimitados',
      'Contratos digitais',
      'Suporte por WhatsApp',
      'Backup automático',
    ],
    destaque: false,
  },
  {
    nome: 'Anual',
    preco: 479.9,
    periodo: 'ano',
    descricao: 'Economize R$ 119 com pagamento anual',
    recursos: [
      'Tudo do plano mensal',
      '2 meses grátis',
      'Prioridade no suporte',
      'Relatórios avançados',
      'API de integração',
      'White label (logo sua)',
    ],
    destaque: true,
    badge: 'MAIS POPULAR',
  },
]

export default function PlanosPage() {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function carregar() {
      try {
        const { data: session } = await supabase.auth.getSession()
        if (!session?.session?.user) {
          router.push('/login')
          return
        }

        const { data } = await supabase
          .from('assinaturas')
          .select('*')
          .eq('user_id', session.session.user.id)
          .single()

        setAssinatura(data)
      } catch {}
      setLoading(false)
    }
    carregar()
  }, [router])

  async function assinarPlano(plano: 'mensal' | 'anual') {
    setProcessando(true)
    
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.user) return

      // Criar pagamento no Supabase
      const { data: pagamento, error } = await supabase
        .from('pagamentos')
        .insert({
          user_id: session.session.user.id,
          valor: plano === 'mensal' ? 49.9 : 479.9,
          status: 'pendente',
          metodo: 'pix',
          descricao: `Assinatura ${plano} - Connect Sistema`,
        })
        .select()
        .single()

      if (error || !pagamento) {
        alert('Erro ao criar pagamento. Tente novamente.')
        setProcessando(false)
        return
      }

      // Aqui você integraria com Mercado Pago
      // Por enquanto, simula sucesso
      alert(`Pagamento criado! ID: ${pagamento.id}\n\nEm produção, aqui redirecionaria para o Mercado Pago.`)
      
      // Atualizar assinatura
      await supabase
        .from('assinaturas')
        .upsert({
          user_id: session.session.user.id,
          plano: plano,
          status: 'ativa',
          data_inicio: new Date().toISOString(),
          data_fim: new Date(Date.now() + (plano === 'mensal' ? 30 : 365) * 86400000).toISOString(),
          valor_mensal: plano === 'mensal' ? 49.9 : 479.9,
        })

      router.push('/dashboard')
    } catch (e) {
      console.error(e)
      alert('Erro ao processar. Tente novamente.')
    }
    
    setProcessando(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fbff' }}>
        <Loader2 className="animate-spin" size={40} style={{ color: '#1d4ed8' }} />
      </div>
    )
  }

  const isTrial = assinatura?.status === 'trial'
  const trialRestante = assinatura?.data_trial_fim
    ? Math.max(0, Math.ceil((new Date(assinatura.data_trial_fim).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <div style={{ minHeight: '100vh', background: '#f8fbff', fontFamily: 'system-ui, sans-serif', padding: '40px 20px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Crown size={48} style={{ color: '#1d4ed8', marginBottom: 16 }} />
          <h1 style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', margin: '0 0 12px' }}>Escolha seu plano</h1>
          <p style={{ fontSize: 17, color: '#64748b', margin: 0, maxWidth: 500, marginInline: 'auto' }}>
            Comece gratuitamente por 7 dias. Cancele quando quiser.
          </p>
          
          {isTrial && (
            <div style={{ 
              background: '#fef3c7', 
              border: '1px solid #f59e0b', 
              borderRadius: 12, 
              padding: '12px 20px', 
              marginTop: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertTriangle size={20} style={{ color: '#d97706' }} />
              <span style={{ color: '#92400e', fontWeight: 700 }}>
                Você está no período de teste — {trialRestante} dias restantes
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {PLANOS.map((plano) => (
            <div
              key={plano.nome}
              style={{
                background: '#fff',
                borderRadius: 20,
                padding: '32px 28px',
                border: plano.destaque ? '2px solid #1d4ed8' : '1px solid #dbe3ef',
                position: 'relative',
                boxShadow: plano.destaque ? '0 8px 30px rgba(29, 78, 216, 0.15)' : 'none',
              }}
            >
              {plano.badge && (
                <div style={{
                  position: 'absolute',
                  top: -12,
                  right: 20,
                  background: '#1d4ed8',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 900,
                  padding: '6px 14px',
                  borderRadius: 20,
                }}>
                  {plano.badge}
                </div>
              )}

              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 8px' }}>{plano.nome}</h3>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px', minHeight: 40 }}>{plano.descricao}</p>

              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 42, fontWeight: 900, color: '#0f172a' }}>R$ {formatarPrecoPlano(plano.preco)}</span>
                <span style={{ fontSize: 16, color: '#64748b' }}>/{plano.periodo}</span>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'grid', gap: 10 }}>
                {plano.recursos.map((recurso) => (
                  <li key={recurso} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#334155' }}>
                    <Check size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                    {recurso}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => assinarPlano(plano.nome.toLowerCase() as 'mensal' | 'anual')}
                disabled={processando}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: 14,
                  border: 'none',
                  background: plano.destaque ? '#1d4ed8' : '#0f172a',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {processando ? (
                  <><Loader2 size={18} className="animate-spin" /> Processando...</>
                ) : (
                  <><CreditCard size={18} /> Assinar {plano.nome}</>
                )}
              </button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32, color: '#94a3b8', fontSize: 13 }}>
          <Zap size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Pagamento seguro via PIX ou Cartão. Cancele quando quiser.
        </div>
      </div>
    </div>
  )
}
