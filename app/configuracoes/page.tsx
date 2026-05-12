'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LOGO_PATH } from '@/lib/connect-public'
import { supabase } from '@/lib/supabase'

type ConfiguracaoSistema = {
  nomeEmpresa: string
  telefone: string
  email: string
  endereco: string
  cidadeUf: string
  responsavel: string
  logoUrl: string
  corPrimaria: string
  corSecundaria: string
}

const CONFIG_KEY = 'connect_configuracoes'

export default function ConfiguracoesPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  const [config, setConfig] = useState<ConfiguracaoSistema>({
    nomeEmpresa: 'LOJA CONNECT',
    telefone: '84992181399',
    email: 'lojaconnect@hotmail.com',
    endereco: 'GILBERTO ROBERTO GOMES, 243',
    cidadeUf: 'PARNAMIRIM-RN',
    responsavel: 'ERES FAUSTINO',
    logoUrl: DEFAULT_LOGO_PATH,
    corPrimaria: '#f97316',
    corSecundaria: '#e5e7eb',
  })

  useEffect(() => {
    const atualizarTela = () => setIsMobile(window.innerWidth <= 768)
    atualizarTela()
    window.addEventListener('resize', atualizarTela)
    return () => window.removeEventListener('resize', atualizarTela)
  }, [])

  useEffect(() => {
    const salvo = localStorage.getItem(CONFIG_KEY)
    if (!salvo) return

    try {
      const dados = JSON.parse(salvo)
      setConfig((anterior) => ({
        ...anterior,
        nomeEmpresa: dados.nomeEmpresa || anterior.nomeEmpresa,
        telefone: dados.telefone || anterior.telefone,
        email: dados.email || anterior.email,
        endereco: dados.endereco || anterior.endereco,
        cidadeUf: dados.cidadeUf || anterior.cidadeUf,
        responsavel: dados.responsavel || anterior.responsavel,
        logoUrl: dados.logoUrl === '/logo-connect.png' ? DEFAULT_LOGO_PATH : dados.logoUrl || anterior.logoUrl,
        corPrimaria: dados.corPrimaria || anterior.corPrimaria,
        corSecundaria: dados.corSecundaria || anterior.corSecundaria,
      }))
    } catch {}
  }, [])

  const previewLogo = useMemo(() => config.logoUrl || DEFAULT_LOGO_PATH, [config.logoUrl])

  function atualizarCampo<K extends keyof ConfiguracaoSistema>(
    campo: K,
    valor: ConfiguracaoSistema[K],
  ) {
    setConfig((anterior) => ({
      ...anterior,
      [campo]: valor,
    }))
  }

  function salvarConfiguracoes() {
    setSalvando(true)

    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        ...config,
      }),
    )

    setTimeout(() => {
      setSalvando(false)
      alert('Configurações salvas com sucesso!')
    }, 400)
  }

  function lerArquivoLogo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    if (!arquivo) return

    const leitor = new FileReader()

    leitor.onload = () => {
      const resultado = String(leitor.result || '')
      atualizarCampo('logoUrl', resultado)
    }

    leitor.readAsDataURL(arquivo)
  }

  async function alterarSenha() {
    if (!senhaAtual.trim()) {
      alert('Digite a senha atual.')
      return
    }

    if (!novaSenha.trim()) {
      alert('Digite a nova senha.')
      return
    }

    if (novaSenha.length < 6) {
      alert('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      alert('A confirmação da nova senha não confere.')
      return
    }

    setSalvandoSenha(true)

    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
    })

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

  const pageStyle: React.CSSProperties = {
    maxWidth: 1180,
    margin: '0 auto',
    padding: isMobile ? 12 : 20,
    color: '#111827',
  }

  const titleTopStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  }

  const mainCardStyle: React.CSSProperties = {
    background: '#f5f1e8',
    borderRadius: isMobile ? 18 : 28,
    padding: isMobile ? 14 : 24,
    boxShadow: '0 14px 34px rgba(0,0,0,0.10)',
    border: `2px solid ${config.corSecundaria || '#e5e7eb'}`,
  }

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: isMobile ? 14 : 20,
    padding: isMobile ? 14 : 18,
    boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
    border: `2px solid ${config.corSecundaria || '#e5e7eb'}`,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 800,
    color: '#374151',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 44,
    borderRadius: 10,
    border: `1px solid ${config.corSecundaria || '#e5e7eb'}`,
    background: '#ffffff',
    color: '#111827',
    padding: '0 12px',
    boxSizing: 'border-box',
    outline: 'none',
    fontSize: 14,
  }

  const buttonBase: React.CSSProperties = {
    height: 42,
    border: 'none',
    borderRadius: 10,
    padding: '0 16px',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 14,
  }

  return (
    <div style={pageStyle}>
      <div style={titleTopStyle}>Painel Comercial</div>

      <h1
        style={{
          margin: '0 0 16px 0',
          fontSize: isMobile ? 34 : 44,
          lineHeight: 1,
          fontWeight: 900,
          color: '#ffffff',
          textShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        Configurações
      </h1>

      <div style={mainCardStyle}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.35fr 0.65fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div style={{ ...cardStyle, display: 'grid', gap: 14 }}>
            <div
              style={{
                fontSize: isMobile ? 22 : 24,
                fontWeight: 900,
                color: '#111827',
                marginBottom: 4,
              }}
            >
              Dados da empresa
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>🏢 Nome da empresa</label>
                <input
                  style={inputStyle}
                  value={config.nomeEmpresa}
                  onChange={(e) => atualizarCampo('nomeEmpresa', e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle}>📞 Telefone</label>
                <input
                  style={inputStyle}
                  value={config.telefone}
                  onChange={(e) => atualizarCampo('telefone', e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle}>📧 E-mail</label>
                <input
                  style={inputStyle}
                  value={config.email}
                  onChange={(e) => atualizarCampo('email', e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle}>👤 Responsável</label>
                <input
                  style={inputStyle}
                  value={config.responsavel}
                  onChange={(e) => atualizarCampo('responsavel', e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle}>📍 Endereço</label>
                <input
                  style={inputStyle}
                  value={config.endereco}
                  onChange={(e) => atualizarCampo('endereco', e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle}>🗺 Cidade / UF</label>
                <input
                  style={inputStyle}
                  value={config.cidadeUf}
                  onChange={(e) => atualizarCampo('cidadeUf', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>🖼 Logo do cliente / empresa</label>
              <input
                style={inputStyle}
                placeholder="Cole URL ou base64 da logo"
                value={config.logoUrl}
                onChange={(e) => atualizarCampo('logoUrl', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>📂 Selecionar logo do computador</label>
              <input
                type="file"
                accept="image/*"
                onChange={lerArquivoLogo}
                style={{
                  ...inputStyle,
                  height: 'auto',
                  padding: 10,
                }}
              />
            </div>

            <div
              style={{
                border: `1px solid ${config.corSecundaria || '#e5e7eb'}`,
                borderRadius: 16,
                padding: 16,
                background: '#fffef7',
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  marginBottom: 10,
                  color: '#111827',
                }}
              >
                Pré-visualização da logo
              </div>

              <div
                style={{
                  minHeight: 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  border: '1px dashed #d1d5db',
                  background: '#ffffff',
                  padding: 12,
                }}
              >
                <img
                  src={previewLogo}
                  alt="Logo"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement
                    img.src = DEFAULT_LOGO_PATH
                  }}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 90,
                    objectFit: 'contain',
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gap: 14 }}>
            <div
              style={{
                fontSize: isMobile ? 22 : 24,
                fontWeight: 900,
                color: '#111827',
                marginBottom: 4,
              }}
            >
              Padrão do PDF
            </div>

            <div>
              <label style={labelStyle}>🎨 Cor principal</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr',
                  gap: 10,
                }}
              >
                <input
                  type="color"
                  value={config.corPrimaria}
                  onChange={(e) => atualizarCampo('corPrimaria', e.target.value)}
                  style={{
                    height: 44,
                    width: '100%',
                    border: `1px solid ${config.corSecundaria || '#e5e7eb'}`,
                    borderRadius: 10,
                    background: '#fff',
                    padding: 4,
                    cursor: 'pointer',
                  }}
                />
                <input
                  style={inputStyle}
                  value={config.corPrimaria}
                  onChange={(e) => atualizarCampo('corPrimaria', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>🧩 Cor secundária</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr',
                  gap: 10,
                }}
              >
                <input
                  type="color"
                  value={config.corSecundaria}
                  onChange={(e) => atualizarCampo('corSecundaria', e.target.value)}
                  style={{
                    height: 44,
                    width: '100%',
                    border: `1px solid ${config.corSecundaria || '#e5e7eb'}`,
                    borderRadius: 10,
                    background: '#fff',
                    padding: 4,
                    cursor: 'pointer',
                  }}
                />
                <input
                  style={inputStyle}
                  value={config.corSecundaria}
                  onChange={(e) => atualizarCampo('corSecundaria', e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${config.corSecundaria || '#e5e7eb'}`,
                borderRadius: 16,
                padding: 16,
                background: '#fffef7',
                display: 'grid',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 18,
                  color: '#111827',
                }}
              >
                Prévia rápida
              </div>

              <div
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: `2px solid ${config.corSecundaria || '#e5e7eb'}`,
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    padding: '12px 14px',
                    background: config.corPrimaria || '#f97316',
                    color: '#fff',
                    fontWeight: 900,
                  }}
                >
                  Cabeçalho do PDF
                </div>

                <div style={{ padding: 14, color: '#111827' }}>
                  Exemplo de documento com as cores escolhidas.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div
            style={{
              fontSize: isMobile ? 22 : 24,
              fontWeight: 900,
              color: '#111827',
              marginBottom: 14,
            }}
          >
            Alterar senha
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>🔑 Senha atual</label>
              <input
                type="password"
                style={inputStyle}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>🔒 Nova senha</label>
              <input
                type="password"
                style={inputStyle}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>🔐 Confirmar nova senha</label>
              <input
                type="password"
                style={inputStyle}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div style={{ color: '#6b7280', lineHeight: 1.5 }}>
              A nova senha será aplicada ao usuário logado no sistema.
            </div>

            <button
              onClick={alterarSenha}
              style={{
                ...buttonBase,
                background: '#2563eb',
                color: '#fff',
                minWidth: 220,
              }}
            >
              {salvandoSenha ? 'Salvando...' : 'Alterar senha'}
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={salvarConfiguracoes}
            style={{
              ...buttonBase,
              background: '#16a34a',
              color: '#fff',
              minWidth: 220,
            }}
          >
            {salvando ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
