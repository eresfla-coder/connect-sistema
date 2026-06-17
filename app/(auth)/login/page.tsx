'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ativarModoDemo, marcarSessaoReal, sairDemoMode } from '@/lib/connect-demo'
import { consultarAcessoPainel, resolverDestinoPosLogin } from '@/lib/connect-auth-client'

type ModoAuth = 'entrar' | 'criar'

function traduzirErroAuth(message?: string) {
  if (!message) return 'Ocorreu um erro. Tente novamente.'

  const msg = message.toLowerCase()

  if (msg.includes('invalid login credentials')) return 'E-mail ou senha inválidos.'
  if (msg.includes('email not confirmed')) return 'Seu e-mail ainda não foi confirmado.'
  if (msg.includes('user already registered')) return 'Este e-mail já está cadastrado.'
  if (msg.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.'
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde um pouco e tente novamente.'
  if (msg.includes('too many requests')) return 'Muitas tentativas. Aguarde um pouco e tente novamente.'
  if (msg.includes('over_email_send_rate_limit')) {
    return 'Limite temporário de envios atingido. Aguarde um pouco antes de tentar de novo.'
  }
  if (msg.includes('failed to fetch')) {
    return 'Falha de conexão com o servidor. Verifique internet, Vercel e Supabase.'
  }
  if (msg.includes('load failed')) {
    return 'Falha de conexão com o servidor. Verifique internet, Vercel e Supabase.'
  }

  return message
}

export default function LoginPage() {
  const router = useRouter()

  function lerRedirectParam() {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('redirect') || ''
  }

  const [modo, setModo] = useState<ModoAuth>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const redirectReset = useMemo(() => {
    if (typeof window === 'undefined') return ''

    const origin = window.location.origin

    if (origin.includes('localhost') || origin.includes('192.168.')) {
      return `${origin}/reset-senha`
    }

    return `${origin}/reset-senha`
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return

    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    let ativo = true

    async function redirecionarSeJaLogado() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!ativo || !session?.access_token) return

      marcarSessaoReal()
      sairDemoMode()

      const redirectParam = lerRedirectParam()
      const acesso = await consultarAcessoPainel(session.access_token)
      const destino = resolverDestinoPosLogin({
        redirectParam,
        adminLogado: acesso.adminLogado,
      })

      console.log('[LOGIN_REDIRECT]', { destino, jaLogado: true, admin: acesso.adminLogado })
      router.replace(destino)
    }

    void redirecionarSeJaLogado()

    return () => {
      ativo = false
    }
  }, [router])

  function iniciarCooldown(segundos: number) {
    setCooldown(segundos)
  }

  function limparAvisos() {
    setMensagem('')
    setErro('')
  }

  function mensagemResetManual(emailCliente: string) {
    const texto = [
      'Não consegui enviar o e-mail automático de recuperação agora.',
      '',
      'E-mail informado: ' + emailCliente,
      '',
      'Chame o administrador pelo WhatsApp para receber uma senha provisória.',
      'No painel admin existe a opção: Resetar senha / WhatsApp.',
    ].join('\n')

    return texto
  }

  function podeExecutar() {
    if (loading) return false

    if (cooldown > 0) {
      setErro(`Aguarde ${cooldown}s para tentar novamente.`)
      return false
    }

    return true
  }

  function handleDemo() {
    limparAvisos()
    try {
      ativarModoDemo()
      setMensagem('Modo demonstração carregado com dados fictícios.')
      router.replace('/boas-vindas')
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível iniciar a demonstração.')
    }
  }

  async function handleEntrar(e: FormEvent) {
    e.preventDefault()
    limparAvisos()

    if (!podeExecutar()) return

    setLoading(true)
    console.log('[LOGIN_SUBMIT]')

    try {
      const emailNormalizado = email.trim().toLowerCase()

      const { error } = await supabase.auth.signInWithPassword({
        email: emailNormalizado,
        password: senha,
      })

      if (error) {
        const erroTraduzido = traduzirErroAuth(error.message)
        setErro(erroTraduzido)

        if (
          erroTraduzido.includes('Muitas tentativas') ||
          erroTraduzido.includes('Limite temporário')
        ) {
          iniciarCooldown(20)
        } else {
          iniciarCooldown(5)
        }

        return
      }

      console.log('[LOGIN_SUCCESS]')

      marcarSessaoReal()
      sairDemoMode()

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      if (!token) {
        setErro('Sessão não foi gravada. Tente novamente.')
        return
      }

      const redirectParam = lerRedirectParam()
      const acesso = await consultarAcessoPainel(token, { forcar: true })
      const destino = resolverDestinoPosLogin({
        redirectParam,
        adminLogado: acesso.adminLogado,
      })

      console.log('[LOGIN_REDIRECT]', { destino, admin: acesso.adminLogado, redirectParam })
      router.replace(destino)
    } catch (err: any) {
      setErro(traduzirErroAuth(err?.message || 'Failed to fetch'))
      iniciarCooldown(10)
    } finally {
      setLoading(false)
    }
  }

  async function handleCriarConta(e: FormEvent) {
    e.preventDefault()
    limparAvisos()

    if (!podeExecutar()) return

    if (!email.trim()) {
      setErro('Digite o e-mail.')
      return
    }

    if (!senha.trim()) {
      setErro('Digite a senha.')
      return
    }

    if (senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (senha !== confirmarSenha) {
      setErro('A confirmação da senha não confere.')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
      })

      if (error) {
        const erroTraduzido = traduzirErroAuth(error.message)
        setErro(erroTraduzido)

        if (
          erroTraduzido.includes('Muitas tentativas') ||
          erroTraduzido.includes('Limite temporário')
        ) {
          iniciarCooldown(20)
        } else {
          iniciarCooldown(5)
        }

        return
      }

      const userId = data.user?.id

      if (data.session?.user) {
        marcarSessaoReal()
        sairDemoMode()
      }

      if (userId) {
        const { error: perfilError } = await supabase.from('perfis').upsert(
          [
            {
              id: userId,
              email: email.trim().toLowerCase(),
              ativo: true,
              status: 'trial',
              plano_tier: 'trial',
              vencimento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            },
          ],
          { onConflict: 'id' }
        )

        if (perfilError) {
          setErro('Conta criada, mas houve erro ao salvar o perfil.')
          iniciarCooldown(5)
          return
        }
      }

      setMensagem('Conta criada com sucesso! Agora você já pode entrar.')
      setModo('entrar')
      setSenha('')
      setConfirmarSenha('')
      iniciarCooldown(5)
    } catch (err: any) {
      setErro(traduzirErroAuth(err?.message || 'Failed to fetch'))
      iniciarCooldown(10)
    } finally {
      setLoading(false)
    }
  }

  async function handleEsqueciSenha() {
    limparAvisos()

    if (!podeExecutar()) return

    if (!email.trim()) {
      setErro('Digite seu e-mail primeiro.')
      return
    }

    setLoading(true)

    try {
      const emailNormalizado = email.trim().toLowerCase()

      const { error } = await supabase.auth.resetPasswordForEmail(emailNormalizado, {
        redirectTo: redirectReset || `${window.location.origin}/reset-senha`,
      })

      if (error) {
        const erroTraduzido = traduzirErroAuth(error.message)
        setErro(`${erroTraduzido}\n\n${mensagemResetManual(emailNormalizado)}`)

        if (
          erroTraduzido.includes('Muitas tentativas') ||
          erroTraduzido.includes('Limite temporário')
        ) {
          iniciarCooldown(30)
        } else {
          iniciarCooldown(8)
        }

        return
      }

      setMensagem('Link de recuperação enviado para seu e-mail.')
      iniciarCooldown(30)
    } catch (err: any) {
      const emailNormalizado = email.trim().toLowerCase()
      const erroTraduzido = traduzirErroAuth(err?.message || 'Failed to fetch')
      setErro(`${erroTraduzido}\n\n${mensagemResetManual(emailNormalizado)}`)
      iniciarCooldown(15)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 52,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.95)',
    color: '#111827',
    padding: '0 16px',
    outline: 'none',
    fontSize: 15,
    boxSizing: 'border-box',
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.06)',
  }

  const buttonMainStyle: React.CSSProperties = {
    width: '100%',
    height: 54,
    border: 'none',
    borderRadius: 16,
    background: 'linear-gradient(90deg, #0ea5e9, #10b981)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 1.2,
    cursor: loading || cooldown > 0 ? 'not-allowed' : 'pointer',
    boxShadow: '0 16px 30px rgba(14,165,233,0.24)',
    opacity: loading || cooldown > 0 ? 0.7 : 1,
  }

  const buttonSecStyle: React.CSSProperties = {
    width: '100%',
    height: 48,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.4,
    cursor: loading || cooldown > 0 ? 'not-allowed' : 'pointer',
    opacity: loading || cooldown > 0 ? 0.7 : 1,
  }

  const toggleStyle = (ativo: boolean): React.CSSProperties => ({
    width: '100%',
    height: 48,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.10)',
    background: ativo
      ? 'linear-gradient(90deg, #0ea5e9, #10b981)'
      : 'rgba(255,255,255,0.05)',
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.4,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
  })

  const textoBotaoPrincipal = loading
    ? modo === 'entrar'
      ? 'VALIDANDO ACESSO...'
      : 'CRIANDO CONTA...'
    : cooldown > 0
      ? `AGUARDE ${cooldown}s`
      : modo === 'entrar'
        ? 'ENTRAR NO PAINEL'
        : 'CRIAR CONTA'

  const textoBotaoReset = cooldown > 0 ? `AGUARDE ${cooldown}s` : 'ESQUECI MINHA SENHA'

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background:
          'radial-gradient(circle at top left, rgba(14,165,233,0.18) 0%, rgba(2,6,23,0.95) 34%, rgba(1,4,15,1) 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '-8%',
          left: '-8%',
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: 'rgba(14,165,233,0.14)',
          filter: 'blur(80px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '-8%',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: 'rgba(16,185,129,0.12)',
          filter: 'blur(90px)',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 460,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            background:
              'linear-gradient(180deg, rgba(15,23,42,0.88), rgba(2,6,23,0.90))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: '3px solid #10b981',
            borderRadius: 28,
            padding: 28,
            boxShadow: '0 22px 60px rgba(0,0,0,0.34)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 68,
                height: 68,
                margin: '0 auto 14px',
                borderRadius: 22,
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 14px 24px rgba(0,0,0,0.22)',
                overflow: 'hidden',
              }}
            >
              <img
                src="/logo-connect.png"
                alt="Logo"
                style={{ width: 54, height: 54, objectFit: 'contain' }}
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>

            <h1
              style={{
                margin: 0,
                color: '#ffffff',
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: -1,
                lineHeight: 1,
              }}
            >
              CONNECT <span style={{ color: '#10b981' }}>SISTEMA</span>
            </h1>

            <div
              style={{
                marginTop: 8,
                color: '#94a3b8',
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 3,
              }}
            >
              {modo === 'entrar' ? 'Autenticação de Sistema' : 'Cadastro de Usuário'}
            </div>
          </div>

          {erro ? (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.30)',
                color: '#fecaca',
                fontSize: 14,
              }}
            >
              {erro}
            </div>
          ) : null}

          {mensagem ? (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.30)',
                color: '#bbf7d0',
                fontSize: 14,
              }}
            >
              {mensagem}
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (loading) return
                limparAvisos()
                setModo('entrar')
              }}
              style={toggleStyle(modo === 'entrar')}
            >
              ACESSO
            </button>

            <button
              type="button"
              onClick={() => {
                if (loading) return
                limparAvisos()
                setModo('criar')
              }}
              style={toggleStyle(modo === 'criar')}
            >
              NOVA CONTA
            </button>
          </div>

          <form
            onSubmit={modo === 'entrar' ? handleEntrar : handleCriarConta}
            style={{ display: 'grid', gap: 16 }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 8,
                  color: '#cbd5e1',
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 1.4,
                }}
              >
                E-mail de acesso
              </label>

              <input
                type="email"
                required
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 8,
                  color: '#cbd5e1',
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 1.4,
                }}
              >
                Senha
              </label>

              <div style={{ position: 'relative' }}>
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 52 }}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: 18 }}
                >
                  {mostrarSenha ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {modo === 'criar' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    color: '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 1.4,
                  }}
                >
                  Confirmar senha
                </label>

                <div style={{ position: 'relative' }}>
                  <input
                    type={mostrarConfirmarSenha ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 52 }}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarConfirmarSenha((v) => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: 18 }}
                  >
                    {mostrarConfirmarSenha ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading || cooldown > 0} style={buttonMainStyle}>
              {textoBotaoPrincipal}
            </button>

            {modo === 'entrar' && (
              <button
                type="button"
                onClick={handleEsqueciSenha}
                disabled={loading || cooldown > 0}
                style={buttonSecStyle}
              >
                {textoBotaoReset}
              </button>
            )}

            {modo === 'entrar' && (
              <button
                type="button"
                onClick={handleDemo}
                disabled={loading}
                style={{
                  ...buttonSecStyle,
                  border: '1px solid rgba(16,185,129,0.42)',
                  background: 'linear-gradient(90deg, rgba(37,99,235,0.28), rgba(16,185,129,0.22))',
                  color: '#ffffff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                ENTRAR COMO DEMONSTRAÇÃO
              </button>
            )}

            <button
              type="button"
              style={{
                ...buttonSecStyle,
                cursor: 'default',
                opacity: 1,
              }}
            >
              Acesso Seguro
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
