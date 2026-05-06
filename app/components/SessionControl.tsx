'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const DEVICE_KEY = 'connect_device_id_v1'
const DEVICE_LABEL_KEY = 'connect_device_label_v1'
const CHECK_INTERVAL = 120000

function criarIdDispositivo() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}

function getDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = criarIdDispositivo()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function gerarRotuloDispositivo() {
  if (typeof window === 'undefined') return 'Dispositivo'

  const ua = navigator.userAgent || ''
  const plataforma = navigator.platform || ''
  const isIphone = /iPhone/i.test(ua)
  const isIpad = /iPad/i.test(ua) || (plataforma === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)

  if (isIphone) return 'iPhone'
  if (isIpad) return 'iPad'
  if (isAndroid) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac'
  return 'Navegador'
}

function getDeviceLabel() {
  if (typeof window === 'undefined') return 'Dispositivo'
  let label = localStorage.getItem(DEVICE_LABEL_KEY)
  if (!label) {
    label = gerarRotuloDispositivo()
    localStorage.setItem(DEVICE_LABEL_KEY, label)
  }
  return label
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

export default function SessionControl() {
  const router = useRouter()
  const [bloqueado, setBloqueado] = useState(false)
  const verificandoRef = useRef(false)
  const saiuRef = useRef(false)

  useEffect(() => {
    let ativo = true
    let timer: ReturnType<typeof setInterval> | null = null

    async function chamarApi(path: string) {
      const token = await getAccessToken()
      if (!token) return null

      const resposta = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          deviceLabel: getDeviceLabel(),
        }),
      })

      return resposta.json().catch(() => null)
    }

    async function derrubarSessao() {
      if (saiuRef.current) return
      saiuRef.current = true
      setBloqueado(true)
      try {
        await supabase.auth.signOut()
      } catch {}
      try {
        sessionStorage.setItem('connect_sessao_motivo', 'Sua conta foi acessada em outro dispositivo. Por segurança, esta sessão foi encerrada.')
      } catch {}
      router.replace('/sessao-bloqueada')
    }

    async function verificar() {
      if (verificandoRef.current || saiuRef.current) return
      verificandoRef.current = true
      try {
        const data = await chamarApi('/api/sessao/verificar')
        if (!ativo || !data) return
        if (data.ok && data.active === false) {
          await derrubarSessao()
        }
      } catch (error) {
        // Falha de rede não deve derrubar o cliente.
      } finally {
        verificandoRef.current = false
      }
    }

    async function iniciar() {
      try {
        const token = await getAccessToken()
        if (!ativo || !token) return
        await chamarApi('/api/sessao/registrar')
        if (!ativo) return
        timer = setInterval(verificar, CHECK_INTERVAL)
      } catch (error) {
        // Se a tabela ainda não foi criada, não trava o sistema.
      }
    }

    iniciar()

    let ultimoFocus = 0
    function onFocus() {
      const agora = Date.now()
      if (agora - ultimoFocus < 60000) return
      ultimoFocus = agora
      void verificar()
    }

    function onVisible() {
      if (document.visibilityState === 'visible') onFocus()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      ativo = false
      if (timer) clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  if (!bloqueado) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(2,6,23,0.82)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 28,
          padding: 26,
          background: 'linear-gradient(180deg, #0f172a, #020617)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff',
          boxShadow: '0 24px 80px rgba(0,0,0,0.40)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔐</div>
        <h2 style={{ margin: 0, fontSize: 25, fontWeight: 900 }}>Sessão encerrada</h2>
        <p style={{ color: '#cbd5e1', lineHeight: 1.5 }}>
          Esta conta foi acessada em outro dispositivo. Para proteger sua assinatura, apenas uma sessão fica ativa por vez.
        </p>
      </div>
    </div>
  )
}
