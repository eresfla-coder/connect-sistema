'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ResetSenhaPage() {
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false)
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [tokenValido, setTokenValido] = useState(false)

  useEffect(() => {
    const hash = window.location.hash

    if (hash && hash.includes('access_token')) {
      setTokenValido(true)
    } else {
      setErro('Link inválido ou expirado.')
    }
  }, [])

  async function alterarSenha() {
    setErro('')
    setMensagem('')

    if (!novaSenha || !confirmarSenha) {
      setErro('Preencha todos os campos.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
    })

    if (error) {
      setErro('Erro ao atualizar senha.')
      return
    }

    setMensagem('Senha alterada com sucesso! Redirecionando para o login...')
    setTimeout(() => {
      window.location.href = '/login'
    }, 1200)
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
          background: 'linear-gradient(180deg, rgba(15,23,42,0.88), rgba(2,6,23,0.90))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTop: '3px solid #f97316',
          borderRadius: 28,
          padding: 28,
          boxShadow: '0 22px 60px rgba(0,0,0,0.34)',
          color: '#fff',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 74,
            height: 74,
            margin: '0 auto 14px',
            borderRadius: 22,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: -1,
            lineHeight: 1,
          }}
        >
          CONNECT <span style={{ color: '#f97316' }}>SISTEMA</span>
        </h1>

        <p
          style={{
            marginTop: 12,
            marginBottom: 20,
            color: '#cbd5e1',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Recuperação de acesso
        </p>

        {erro && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 12,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.30)',
              color: '#fecaca',
              fontSize: 14,
              textAlign: 'left',
            }}
          >
            {erro}
          </div>
        )}

        {mensagem && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 12,
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.30)',
              color: '#bbf7d0',
              fontSize: 14,
              textAlign: 'left',
            }}
          >
            {mensagem}
          </div>
        )}

        {tokenValido ? (
          <>
            <div style={{ position: 'relative' }}>
              <input
                type={mostrarNovaSenha ? 'text' : 'password'}
                placeholder="Nova senha"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 10,
                  height: 48,
                  padding: '0 48px 0 14px',
                  borderRadius: 14,
                  border: '1px solid rgba(148,163,184,0.28)',
                  background: '#08111f',
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
              />
              <button type="button" onClick={() => setMostrarNovaSenha((v) => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: 18, cursor: 'pointer' }}>{mostrarNovaSenha ? '🙈' : '👁️'}</button>
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type={mostrarConfirmarSenha ? 'text' : 'password'}
                placeholder="Confirmar senha"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 10,
                  height: 48,
                  padding: '0 48px 0 14px',
                  borderRadius: 14,
                  border: '1px solid rgba(148,163,184,0.28)',
                  background: '#08111f',
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
              />
              <button type="button" onClick={() => setMostrarConfirmarSenha((v) => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: 18, cursor: 'pointer' }}>{mostrarConfirmarSenha ? '🙈' : '👁️'}</button>
            </div>

            <button
              onClick={alterarSenha}
              style={{
                width: '100%',
                marginTop: 14,
                height: 52,
                border: 'none',
                borderRadius: 16,
                background: 'linear-gradient(90deg, #f97316, #fb923c)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: 1.2,
                cursor: 'pointer',
                boxShadow: '0 16px 30px rgba(249,115,22,0.28)',
              }}
            >
              ALTERAR SENHA
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              window.location.href = '/login'
            }}
            style={{
              width: '100%',
              height: 52,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              background: '#111827',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: 1.2,
              cursor: 'pointer',
            }}
          >
            VOLTAR PARA LOGIN
          </button>
        )}
      </div>
    </div>
  )
}
