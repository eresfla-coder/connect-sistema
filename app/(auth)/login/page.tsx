'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function venceuPerfil(vencimento?: string | null) {
  if (!vencimento) return false
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dataVencimento = new Date(vencimento)
  dataVencimento.setHours(0, 0, 0, 0)
  return dataVencimento < hoje
}

export default function LoginPage() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensagemErro, setMensagemErro] = useState('')
  const [mensagemSucesso, setMensagemSucesso] = useState('')
  const router = useRouter()

  function limparMensagens() {
    setMensagemErro('')
    setMensagemSucesso('')
  }

  function salvarCookieLogin() {
    document.cookie = 'connect_auth=logado; path=/; max-age=2592000; samesite=lax'
  }

  function removerCookieLogin() {
    document.cookie = 'connect_auth=; path=/; max-age=0; samesite=lax'
  }

  async function handleEntrar(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      })

      if (authError) {
        setMensagemErro('E-mail ou senha inválidos.')
        return
      }

      const { data: authData, error: userError } = await supabase.auth.getUser()

      if (userError) {
        setMensagemErro('Não foi possível validar o usuário logado.')
        return
      }

      const user = authData?.user

      if (!user) {
        setMensagemErro('Não foi possível identificar o usuário logado.')
        return
      }

      const { data, error } = await supabase
        .from('perfis')
        .select('id, email, ativo, status, vencimento')
        .eq('id', user.id)
        .single()

      if (error || !data) {
        setMensagemErro('Usuário não encontrado na tabela de perfis.')
        return
      }

      const acessoBloqueado =
        data.ativo === false ||
        data.status === 'bloqueado' ||
        venceuPerfil(data.vencimento)

      if (acessoBloqueado) {
        removerCookieLogin()
        router.push('/bloqueado')
        return
      }

      salvarCookieLogin()
      setMensagemSucesso('Acesso validado com sucesso.')
      router.push('/dashboard')
    } catch (err) {
      setMensagemErro('Ocorreu um erro ao validar seu acesso.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCriarConta(e: FormEvent) {
    e.preventDefault()
    limparMensagens()

    if (!email.trim()) {
      setMensagemErro('Digite o e-mail.')
      return
    }

    if (!senha.trim()) {
      setMensagemErro('Digite a senha.')
      return
    }

    if (senha.length < 6) {
      setMensagemErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (senha !== confirmarSenha) {
      setMensagemErro('A confirmação da senha não confere.')
      return
    }

    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: senha,
      })

      if (authError) {
        setMensagemErro(authError.message)
        return
      }

      const userId = authData.user?.id || null

      const { error: perfilError } = await supabase
        .from('perfis')
        .upsert(
          [
            {
              id: userId,
              email,
              ativo: true,
              status: 'teste',
            },
          ],
          { onConflict: 'id' }
        )

      if (perfilError) {
        setMensagemErro('Conta criada no Auth, mas houve erro ao salvar em perfis.')
        return
      }

      setMensagemSucesso('Conta criada com sucesso. Agora você já pode entrar.')
      setModo('entrar')
      setConfirmarSenha('')
      setSenha('')
    } catch (err) {
      setMensagemErro('Erro ao criar a conta.')
      console.error(err)
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

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    height: 54,
    border: 'none',
    borderRadius: 16,
    background: 'linear-gradient(90deg, #f97316, #fb923c)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 1.2,
    cursor: 'pointer',
    boxShadow: '0 16px 30px rgba(249,115,22,0.28)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    opacity: loading ? 0.8 : 1,
  }

  const toggleStyle = (ativo: boolean): React.CSSProperties => ({
    width: '100%',
    height: 48,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.10)',
    background: ativo ? 'linear-gradient(90deg, #f97316, #fb923c)' : 'rgba(255,255,255,0.05)',
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.4,
    cursor: 'pointer',
  })

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background:
          'radial-gradient(circle at top left, rgba(249,115,22,0.14) 0%, rgba(2,6,23,0.95) 34%, rgba(1,4,15,1) 100%)',
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
          background: 'rgba(249,115,22,0.12)',
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
          background: 'rgba(34,197,94,0.10)',
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
            background: 'linear-gradient(180deg, rgba(15,23,42,0.88), rgba(2,6,23,0.90))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: '3px solid #f97316',
            borderRadius: 28,
            padding: 28,
            boxShadow: '0 22px 60px rgba(0,0,0,0.34)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 78,
                height: 78,
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
                style={{ width: 56, height: 56, objectFit: 'contain' }}
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
              CONNECT <span style={{ color: '#f97316' }}>SISTEMA</span>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                limparMensagens()
                setModo('entrar')
              }}
              style={toggleStyle(modo === 'entrar')}
            >
              ENTRAR
            </button>

            <button
              type="button"
              onClick={() => {
                limparMensagens()
                setModo('criar')
              }}
              style={toggleStyle(modo === 'criar')}
            >
              CRIAR CONTA
            </button>
          </div>

          <form onSubmit={modo === 'entrar' ? handleEntrar : handleCriarConta} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4 }}>
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
              <label style={{ display: 'block', marginBottom: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4 }}>
                Senha
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                style={inputStyle}
              />
            </div>

            {modo === 'criar' && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4 }}>
                  Confirmar senha
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {mensagemErro ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  color: '#fecaca',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {mensagemErro}
              </div>
            ) : null}

            {mensagemSucesso ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.35)',
                  color: '#bbf7d0',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {mensagemSucesso}
              </div>
            ) : null}

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading
                ? modo === 'entrar'
                  ? 'VALIDANDO ACESSO...'
                  : 'CRIANDO CONTA...'
                : modo === 'entrar'
                ? 'ENTRAR NO PAINEL'
                : 'CRIAR CONTA'}
            </button>

            <button
              type="button"
              style={{
                width: '100%',
                height: 48,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e5e7eb',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 1.4,
                cursor: 'default',
              }}
            >
              Acesso Seguro
            </button>
          </form>

          <div
            style={{
              marginTop: 20,
              textAlign: 'center',
              color: '#64748b',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
            }}
          >
            Protegido por Criptografia de Ponta
          </div>
        </div>
      </div>
    </div>
  )
}