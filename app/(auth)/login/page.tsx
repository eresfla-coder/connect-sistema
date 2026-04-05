'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleEntrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      })

      if (authError) {
        alert('E-mail ou senha inválidos.')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      alert('Erro ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCriarConta(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    if (!email.trim() || !senha.trim()) {
      alert('Preencha e-mail e senha.')
      return
    }

    if (senha.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (senha !== confirmarSenha) {
      alert('Senhas não conferem.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
      })

      if (error) {
        alert(error.message)
        return
      }

      const { error: perfilError } = await supabase.from('perfis').insert([
        {
          email: email.trim(),
          ativo: true,
        },
      ])

      if (perfilError) {
        console.error('Erro ao criar perfil:', perfilError)
      }

      alert('Conta criada com sucesso!')
      setModo('entrar')
      setConfirmarSenha('')
    } catch {
      alert('Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

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
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'rgba(15,23,42,0.9)',
          borderRadius: 28,
          padding: 28,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <h1
          style={{
            color: '#fff',
            textAlign: 'center',
            margin: '0 0 18px 0',
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: 0.5,
          }}
        >
          CONNECT SISTEMA
        </h1>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setModo('entrar')}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: modo === 'entrar' ? '#f97316' : '#1e293b',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            ENTRAR
          </button>

          <button
            type="button"
            onClick={() => setModo('criar')}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: modo === 'criar' ? '#f97316' : '#1e293b',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            CRIAR
          </button>
        </div>

        <form
          onSubmit={modo === 'entrar' ? handleEntrar : handleCriarConta}
          style={{ display: 'grid', gap: 10 }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            style={{
              height: 46,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: '#0f172a',
              color: '#fff',
              padding: '0 14px',
              outline: 'none',
            }}
          />

          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            style={{
              height: 46,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: '#0f172a',
              color: '#fff',
              padding: '0 14px',
              outline: 'none',
            }}
          />

          {modo === 'criar' && (
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              placeholder="Confirmar senha"
              autoComplete="new-password"
              style={{
                height: 46,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#0f172a',
                color: '#fff',
                padding: '0 14px',
                outline: 'none',
              }}
            />
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: loading ? '#475569' : '#22c55e',
              color: '#fff',
              fontWeight: 900,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
            }}
          >
            {loading ? 'Carregando...' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}