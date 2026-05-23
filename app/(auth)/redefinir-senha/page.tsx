'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DEFAULT_LOGO_PATH } from '@/lib/connect-public'
import {
  clearPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from '@/lib/auth-recovery'
import { supabase } from '@/lib/supabase'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [validandoLink, setValidandoLink] = useState(true)
  const [sessaoRecuperacao, setSessaoRecuperacao] = useState(false)
  const [mensagemErro, setMensagemErro] = useState('')
  const [mensagemSucesso, setMensagemSucesso] = useState('')

  useEffect(() => {
    let ativo = true

    async function validarSessaoRecuperacao() {
      try {
        const hash = window.location.hash
        if (hash.includes('type=recovery')) {
          markPasswordRecoveryPending()
        }

        const params = new URLSearchParams(window.location.search)
        if (params.get('recuperacao') === '1') {
          markPasswordRecoveryPending()
        }

        const { data, error } = await supabase.auth.getSession()

        if (!ativo) return

        if (error || !data.session) {
          setMensagemErro(
            'Link inválido ou expirado. Solicite um novo e-mail em "Esqueci a senha".'
          )
          setSessaoRecuperacao(false)
          return
        }

        setSessaoRecuperacao(true)
        markPasswordRecoveryPending()
      } catch {
        if (!ativo) return
        setMensagemErro('Não foi possível validar o link de recuperação.')
      } finally {
        if (ativo) setValidandoLink(false)
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryPending()
        setSessaoRecuperacao(true)
        setValidandoLink(false)
        setMensagemErro('')
      }
    })

    validarSessaoRecuperacao()

    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleRedefinirSenha(e: FormEvent) {
    e.preventDefault()
    setMensagemErro('')
    setMensagemSucesso('')

    if (!novaSenha.trim()) {
      setMensagemErro('Digite a nova senha.')
      return
    }

    if (novaSenha.length < 6) {
      setMensagemErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setMensagemErro('A confirmação da senha não confere.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha })

      if (error) {
        setMensagemErro(error.message || 'Não foi possível atualizar a senha.')
        return
      }

      clearPasswordRecoveryPending()
      document.cookie = 'connect_auth=; path=/; max-age=0; samesite=lax'
      await supabase.auth.signOut()

      setMensagemSucesso('Senha definida com sucesso. Faça login com a nova senha.')
      setTimeout(() => {
        router.replace('/login?senha=atualizada')
      }, 1200)
    } catch {
      setMensagemErro('Erro ao salvar a nova senha. Tente novamente.')
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
    cursor: sessaoRecuperacao && !loading ? 'pointer' : 'not-allowed',
    boxShadow: '0 16px 30px rgba(249,115,22,0.28)',
    opacity: loading || !sessaoRecuperacao ? 0.7 : 1,
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
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15,23,42,0.88), rgba(2,6,23,0.90))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: '3px solid #f97316',
            borderRadius: 28,
            padding: 28,
            boxShadow: '0 22px 60px rgba(0,0,0,0.34)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img
              src={DEFAULT_LOGO_PATH}
              alt="Logo"
              style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 12 }}
            />
            <h1 style={{ margin: 0, color: '#fff', fontSize: 28, fontWeight: 900 }}>
              Definir nova senha
            </h1>
            <p style={{ marginTop: 8, color: '#94a3b8', fontSize: 13 }}>
              Crie uma senha nova para continuar usando o Connect Sistema.
            </p>
          </div>

          {validandoLink ? (
            <p style={{ color: '#cbd5e1', textAlign: 'center', fontSize: 14 }}>
              Validando link de recuperação...
            </p>
          ) : (
            <form onSubmit={handleRedefinirSenha} style={{ display: 'grid', gap: 16 }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    color: '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  Nova senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  disabled={!sessaoRecuperacao || loading}
                  placeholder="••••••••"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
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
                  }}
                >
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  disabled={!sessaoRecuperacao || loading}
                  placeholder="••••••••"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  style={inputStyle}
                />
              </div>

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

              <button
                type="submit"
                disabled={loading || !sessaoRecuperacao}
                style={buttonStyle}
              >
                {loading ? 'SALVANDO...' : 'SALVAR NOVA SENHA'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Link href="/login" style={{ color: '#f97316', fontSize: 13, fontWeight: 700 }}>
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
