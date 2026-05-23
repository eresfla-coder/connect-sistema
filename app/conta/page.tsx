'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { infoTrialAssinatura, perfilAcessoBloqueado } from '@/lib/acesso-saas'
import {
  formatarMoeda,
  montarResumoAssinatura,
  type PerfilAssinatura,
} from '@/lib/assinatura-cobranca'
import { lerConfigEmpresaLocal, type ConfigEmpresaCompleta } from '@/lib/connect-public'
import { montarMensagemRenovacao } from '@/lib/financeiro-admin'
import { carregarPerfilUsuario } from '@/lib/sync-perfil'
import {
  lerConsumoPlano,
  limitesDoPlano,
  percentualUso,
  planoDoStatus,
  rotuloPlano,
} from '@/lib/growth-plano'
import { abrirWhatsAppComTelefone } from '@/lib/whatsapp-abrir'
import { supabase } from '@/lib/supabase'

type PagamentoLinha = {
  id?: string
  valor?: number | string
  status?: string
  data?: string
  created_at?: string
}

export default function ContaClientePage() {
  const [isMobile, setIsMobile] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [perfil, setPerfil] = useState<PerfilAssinatura | null>(null)
  const [config, setConfig] = useState<Partial<ConfigEmpresaCompleta>>({})
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>([])
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      const { perfil: p, erro } = await carregarPerfilUsuario()
      if (!ativo) return

      if (!p || erro) {
        setPerfil(null)
        setCarregando(false)
        return
      }

      setPerfil(p)
      setConfig(lerConfigEmpresaLocal())

      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id

      if (userId) {
        const { data: pagos } = await supabase
          .from('pagamentos')
          .select('id, valor, status, data, created_at')
          .eq('perfil_id', userId)
          .order('created_at', { ascending: false })
          .limit(12)

        if (pagos && ativo) setPagamentos(pagos as PagamentoLinha[])

        const { data: pagosAlt } = await supabase
          .from('pagamentos')
          .select('id, valor, status, data, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(12)

        if ((!pagos || pagos.length === 0) && pagosAlt && ativo) {
          setPagamentos(pagosAlt as PagamentoLinha[])
        }
      }

      setCarregando(false)
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  const resumo = useMemo(
    () => (perfil ? montarResumoAssinatura(perfil) : null),
    [perfil],
  )

  const trial = useMemo(() => infoTrialAssinatura(perfil), [perfil])

  const telefoneSuporte = useMemo(() => {
    return (
      config.telefone ||
      process.env.NEXT_PUBLIC_CONNECT_SUPORTE_WHATSAPP ||
      ''
    )
  }, [config.telefone])

  function renovarSistema() {
    if (!resumo) return
    const msg = montarMensagemRenovacao(resumo)
    if (telefoneSuporte) {
      abrirWhatsAppComTelefone(telefoneSuporte, msg)
      return
    }
    abrirWhatsAppComTelefone(resumo.telefone, msg)
  }

  function suporteWhatsApp() {
    const nome = resumo?.nomeCliente || 'cliente'
    const msg = `Olá! Sou ${nome} e preciso de suporte no Connect Sistema.`
    if (!telefoneSuporte) {
      alert('Suporte WhatsApp não configurado. Use Configurações da empresa.')
      return
    }
    abrirWhatsAppComTelefone(telefoneSuporte, msg)
  }

  async function alterarSenha() {
    if (!novaSenha || novaSenha.length < 6) {
      alert('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      alert('A confirmação não confere.')
      return
    }

    setSalvandoSenha(true)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvandoSenha(false)

    if (error) {
      alert(error.message)
      return
    }

    setSenhaAtual('')
    setNovaSenha('')
    setConfirmarSenha('')
    alert('Senha alterada com sucesso!')
  }

  if (carregando) {
    return (
      <div style={{ color: '#fff', padding: 24, textAlign: 'center' }}>
        Carregando sua área SaaS...
      </div>
    )
  }

  if (!perfil || !resumo) {
    return (
      <div style={{ color: '#fff', padding: 24 }}>
        Não foi possível carregar sua conta.
      </div>
    )
  }

  const bloqueado = perfilAcessoBloqueado(perfil)
  const plano = planoDoStatus(perfil.status)
  const limites = limitesDoPlano(plano)
  const consumo = lerConsumoPlano()

  const usoItens = [
    { nome: 'Orçamentos', usado: consumo.orcamentos, limite: limites.orcamentos },
    { nome: 'Ordens de serviço', usado: consumo.ordensServico, limite: limites.ordensServico },
    { nome: 'Clientes', usado: consumo.clientes, limite: limites.clientes },
    { nome: 'Recibos', usado: consumo.recibos, limite: limites.recibos },
  ]

  function msgPlano(acao: string) {
    const nome = resumo?.nomeCliente || 'cliente'
    return `Olá! Sou ${nome} (${perfil?.email}). Quero ${acao} no Connect Sistema. Plano atual: ${rotuloPlano(plano)}.`
  }

  function trocarPlano() {
    if (!telefoneSuporte) {
      alert('Configure o suporte em Configurações.')
      return
    }
    abrirWhatsAppComTelefone(telefoneSuporte, msgPlano('trocar de plano'))
  }

  function cancelarAssinatura() {
    if (!confirm('Deseja solicitar o cancelamento da assinatura?')) return
    if (!telefoneSuporte) {
      alert('Configure o suporte em Configurações.')
      return
    }
    abrirWhatsAppComTelefone(telefoneSuporte, msgPlano('cancelar minha assinatura'))
  }

  return (
    <div style={{ color: '#fff', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2 }}>
        ÁREA DO CLIENTE
      </div>
      <h1 style={{ fontSize: isMobile ? 30 : 40, fontWeight: 900, margin: '8px 0 16px' }}>
        Minha Conta SaaS
      </h1>

      {trial.textoBanner ? (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 16,
            background: 'rgba(59,130,246,0.14)',
            border: '1px solid rgba(59,130,246,0.28)',
            fontWeight: 700,
          }}
        >
          {trial.textoBanner}
        </div>
      ) : null}

      <Card titulo={`Consumo do plano · ${rotuloPlano(plano)}`}>
        <div style={{ display: 'grid', gap: 12 }}>
          {usoItens.map((item) => {
            const pct = percentualUso(item.usado, item.limite)
            return (
              <div key={item.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                  <span>{item.nome}</span>
                  <span>
                    {item.usado} / {item.limite}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    height: 10,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background:
                        pct >= 90
                          ? 'linear-gradient(90deg,#ef4444,#f97316)'
                          : 'linear-gradient(90deg,#22c55e,#16a34a)',
                      transition: 'width .3s ease',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={trocarPlano} style={btnSecundario}>
            Trocar plano
          </button>
          <button type="button" onClick={renovarSistema} style={btnVerde}>
            Renovar assinatura
          </button>
          <button type="button" onClick={cancelarAssinatura} style={btnOutline}>
            Cancelar assinatura
          </button>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 14,
          marginBottom: 16,
        }}
      >
        <Card titulo="Plano atual">
          <Linha label="Status" valor={resumo.statusTexto} />
          <Linha label="Mensalidade" valor={formatarMoeda(resumo.valorMensalidade)} />
          <Linha label="Vencimento" valor={resumo.vencimentoFormatado} />
          <span
            style={{
              display: 'inline-flex',
              marginTop: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: resumo.badge.corFundo,
              color: resumo.badge.corTexto,
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {resumo.badge.label}
          </span>
        </Card>

        <Card titulo="Dados da empresa">
          <Linha label="Empresa" valor={config.nomeEmpresa || perfil.nome_empresa || '—'} />
          <Linha label="Responsável" valor={config.responsavel || perfil.nome || '—'} />
          <Linha label="E-mail" valor={perfil.email || '—'} />
          <Linha label="Telefone" valor={config.telefone || perfil.telefone || '—'} />
          <Link href="/configuracoes" style={linkStyle}>
            Editar dados da empresa →
          </Link>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <Card titulo="Pagamentos">
        {pagamentos.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>Nenhum pagamento registrado ainda.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {pagamentos.map((p) => (
              <div
                key={String(p.id || p.created_at)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>{p.status || 'registrado'}</span>
                <strong>
                  {formatarMoeda(Number(p.valor || 0))}
                </strong>
              </div>
            ))}
          </div>
        )}
        </Card>

        <Card titulo="Recibos e documentos">
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5, margin: '0 0 12px' }}>
            Acesse recibos emitidos e comprovantes sem sair do ecossistema Connect.
          </p>
          <Link href="/recibos" style={linkStyle}>
            Ver recibos →
          </Link>
          <Link href="/recibo-avulso" style={{ ...linkStyle, display: 'block', marginTop: 8 }}>
            Recibo avulso →
          </Link>
        </Card>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 14,
          marginTop: 16,
        }}
      >
        <Card titulo="Suporte premium">
          <button type="button" onClick={suporteWhatsApp} style={btnVerde}>
            💬 Suporte WhatsApp
          </button>
          <button
            type="button"
            onClick={renovarSistema}
            style={{ ...btnVerde, marginTop: 10, background: 'linear-gradient(135deg,#f97316,#ea580c)' }}
          >
            🔄 Renovar sistema
          </button>
          {bloqueado ? (
            <div style={{ marginTop: 10, color: '#fecaca', fontSize: 13 }}>
              Assinatura vencida — renove para liberar o acesso.
            </div>
          ) : null}
        </Card>

        <Card titulo="Alterar senha">
          <CampoSenha
            label="Senha atual (opcional)"
            value={senhaAtual}
            onChange={setSenhaAtual}
          />
          <CampoSenha label="Nova senha" value={novaSenha} onChange={setNovaSenha} />
          <CampoSenha
            label="Confirmar nova senha"
            value={confirmarSenha}
            onChange={setConfirmarSenha}
          />
          <button
            type="button"
            disabled={salvandoSenha}
            onClick={alterarSenha}
            style={{ ...btnVerde, marginTop: 10, opacity: salvandoSenha ? 0.7 : 1 }}
          >
            {salvandoSenha ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </Card>
      </div>
    </div>
  )
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 18,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 18 }}>{titulo}</div>
      {children}
    </div>
  )
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ marginBottom: 6, color: '#cbd5e1' }}>
      <strong style={{ color: '#fff' }}>{label}:</strong> {valor}
    </div>
  )
}

function CampoSenha({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 800 }}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 40,
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(15,23,42,0.5)',
          color: '#fff',
          padding: '0 12px',
        }}
      />
    </label>
  )
}

const linkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 10,
  color: '#7dd3fc',
  fontWeight: 800,
  textDecoration: 'none',
  fontSize: 13,
}

const btnVerde: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  border: 'none',
  borderRadius: 12,
  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
}

const btnSecundario: React.CSSProperties = {
  minHeight: 42,
  border: 'none',
  borderRadius: 12,
  padding: '0 14px',
  background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}

const btnOutline: React.CSSProperties = {
  minHeight: 42,
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 12,
  padding: '0 14px',
  background: 'transparent',
  color: '#fecaca',
  fontWeight: 800,
  cursor: 'pointer',
}
