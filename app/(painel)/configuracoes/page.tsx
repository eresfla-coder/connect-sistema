'use client'

import {
  buscarConfiguracao,
  salvarConfiguracao as salvarConfigApi,
  ConfiguracaoEmpresa,
  CONFIG_PADRAO as CONFIG_LIB_PADRAO,
} from '@/lib/configuracaoEmpresa'
import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { Camera, Check, CheckCircle2, ChevronLeft, Lock, Palette, Type, X } from 'lucide-react'
import BackupSegurancaPanel from '@/components/configuracoes/BackupSegurancaPanel'

type AbaConfig = 'empresa' | 'visual' | 'pdf' | 'cadastros' | 'seguranca'

type ConfiguracaoSistema = {
  nomeEmpresa: string
  telefone: string
  celularEmpresa: string
  email: string
  endereco: string
  cidadeUf: string
  responsavel: string
  logoUrl: string
  corPrimaria: string
  corSecundaria: string
  corTabela: string
  tituloPdf: string
  rodapePdf: string
  validadePadrao: string
  prazoEntregaPadrao: string
  formaPagamentoPadrao: string
  mostrarQuantidade: boolean
}

const CONFIG_KEY = 'connect_configuracoes'
const CATEGORIAS_KEY = 'connect_categorias'
const FORMAS_KEY = 'connect_formas_pagamento'

const CONFIG_PADRAO: ConfiguracaoSistema = {
  nomeEmpresa: '',
  telefone: '',
  celularEmpresa: '',
  email: '',
  endereco: '',
  cidadeUf: '',
  responsavel: '',
  logoUrl: '/logo-connect.png',
  corPrimaria: '#16a34a',
  corSecundaria: '#f5f1e8',
  corTabela: '#ef4444',
  tituloPdf: 'Orçamento Comercial',
  rodapePdf: 'Obrigado pela preferência.',
  validadePadrao: '7 dias',
  prazoEntregaPadrao: '3 dias',
  formaPagamentoPadrao: 'PIX',
  mostrarQuantidade: true,
}

const PALETAS = [
  { nome: 'Connect', primaria: '#16a34a', secundaria: '#f5f1e8', tabela: '#ef4444' },
  { nome: 'Azul Premium', primaria: '#2563eb', secundaria: '#eff6ff', tabela: '#0ea5e9' },
  { nome: 'Grafite', primaria: '#111827', secundaria: '#f8fafc', tabela: '#334155' },
  { nome: 'Dourado', primaria: '#d97706', secundaria: '#fffbeb', tabela: '#f59e0b' },
  { nome: 'Roxo SaaS', primaria: '#7c3aed', secundaria: '#f5f3ff', tabela: '#a855f7' },
]

function textoSeguro(valor: unknown) {
  return String(valor || '').trim()
}


type CampoTextoRapidoProps = {
  label: string
  value: string
  placeholder: string
  autoComplete?: string
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
  onCommit: (value: string) => void
}

function CampoTextoRapido({
  label,
  value,
  placeholder,
  autoComplete,
  labelStyle,
  inputStyle,
  onCommit,
}: CampoTextoRapidoProps) {
  return (
    <label>
      <span style={labelStyle}>{label}</span>
      <input
        style={inputStyle}
        defaultValue={value}
        onBlur={(event) => {
          const novoValor = event.currentTarget.value
          if (novoValor !== value) onCommit(novoValor)
        }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
      />
    </label>
  )
}

function normalizarLista(lista: unknown[]) {
  return lista
    .map((item) => (typeof item === 'string' ? item : String((item as any)?.nome || '')))
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index)
}

async function obterTokenSessao() {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  } catch {
    return ''
  }
}

async function carregarConfigDaNuvem() {
  const token = await obterTokenSessao()
  if (!token) return null

  const resposta = await fetch('/api/connect-storage', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!resposta.ok) return null
  const json = await resposta.json().catch(() => null)
  if (!json?.ok || !json?.data) return null
  return json.data as Record<string, unknown>
}

async function salvarConfigNaNuvem(config: ConfiguracaoSistema, categorias: string[], formasPagamento: string[]) {
  const token = await obterTokenSessao()
  if (!token) return false

  const resposta = await fetch('/api/connect-storage', {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        [CONFIG_KEY]: config,
        [CATEGORIAS_KEY]: categorias,
        [FORMAS_KEY]: formasPagamento,
      },
    }),
  })

  return resposta.ok
}

export default function ConfiguracoesPage() {
  const [aba, setAba] = useState<AbaConfig>('empresa')
  const [isMobile, setIsMobile] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novaFormaPagamento, setNovaFormaPagamento] = useState('')
  const [categorias, setCategorias] = useState<string[]>(['GERAL', 'PRODUTOS', 'SERVIÇOS'])
  const [formasPagamento, setFormasPagamento] = useState<string[]>(['PIX', 'DINHEIRO', 'CARTÃO 1X'])
  const [config, setConfig] = useState<ConfiguracaoSistema>(CONFIG_PADRAO)

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth <= 760)
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    let ativo = true

    async function carregarConfiguracoes() {
      // 1. Tentar Supabase primeiro (fonte de verdade)
      try {
        const cfgSupabase = await buscarConfiguracao()
        if (!ativo) return

        const mapeada: ConfiguracaoSistema = {
          nomeEmpresa: cfgSupabase.nomeEmpresa || '',
          telefone: cfgSupabase.telefone || cfgSupabase.whatsappEmpresa || '',
          celularEmpresa: cfgSupabase.celularEmpresa || cfgSupabase.whatsappEmpresa || cfgSupabase.telefone || '',
          email: cfgSupabase.email || '',
          endereco: cfgSupabase.endereco || '',
          cidadeUf: cfgSupabase.cidadeUf || '',
          responsavel: cfgSupabase.responsavel || '',
          logoUrl: cfgSupabase.logoUrl || '/logo-connect.png',
          corPrimaria: cfgSupabase.corPrimaria || '#16a34a',
          corSecundaria: cfgSupabase.corSecundaria || '#dcfce7',
          corTabela: '#f3f4f6',
          tituloPdf: cfgSupabase.tituloPdf || 'Orçamento Comercial',
          rodapePdf: cfgSupabase.rodapePdf || 'Obrigado pela preferência.',
          validadePadrao: cfgSupabase.validadePadrao ?? '7 dias',
          prazoEntregaPadrao: cfgSupabase.prazoEntregaPadrao ?? '3 dias',
          formaPagamentoPadrao: cfgSupabase.formaPagamentoPadrao ?? 'PIX',
          mostrarQuantidade: cfgSupabase.mostrarQuantidade ?? true,
        }
        setConfig(mapeada)

        // Sincronizar localStorage como cache
        localStorage.setItem(CONFIG_KEY, JSON.stringify(mapeada))

        // Carregar categorias e formas de pagamento do localStorage
        const cats = localStorage.getItem(CATEGORIAS_KEY)
        if (cats && ativo) {
          const lista = JSON.parse(cats)
          if (Array.isArray(lista)) setCategorias(normalizarLista(lista))
        }

        const formas = localStorage.getItem(FORMAS_KEY)
        if (formas && ativo) {
          const lista = JSON.parse(formas)
          if (Array.isArray(lista)) setFormasPagamento(normalizarLista(lista))
        }

        return // Sucesso no Supabase — não precisa fallback
      } catch (e) {
        console.warn('[config] Erro ao carregar do Supabase:', e)
      }

      // 2. Fallback: localStorage + nuvem legada
      try {
        const raw = localStorage.getItem(CONFIG_KEY)
        if (raw && ativo) setConfig({ ...CONFIG_PADRAO, ...JSON.parse(raw) })

        const cats = localStorage.getItem(CATEGORIAS_KEY)
        if (cats && ativo) {
          const lista = JSON.parse(cats)
          if (Array.isArray(lista)) setCategorias(normalizarLista(lista))
        }

        const formas = localStorage.getItem(FORMAS_KEY)
        if (formas && ativo) {
          const lista = JSON.parse(formas)
          if (Array.isArray(lista)) setFormasPagamento(normalizarLista(lista))
        }
      } catch {}

      try {
        const nuvem = await carregarConfigDaNuvem()
        if (!ativo || !nuvem) return

        const configNuvem = nuvem[CONFIG_KEY]
        const categoriasNuvem = nuvem[CATEGORIAS_KEY]
        const formasNuvem = nuvem[FORMAS_KEY]

        if (configNuvem && typeof configNuvem === 'object' && !Array.isArray(configNuvem)) {
          const proxima = { ...CONFIG_PADRAO, ...(configNuvem as Partial<ConfiguracaoSistema>) }
          setConfig(proxima)
          localStorage.setItem(CONFIG_KEY, JSON.stringify(proxima))
        }

        if (Array.isArray(categoriasNuvem)) {
          const lista = normalizarLista(categoriasNuvem)
          setCategorias(lista)
          localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(lista))
        }

        if (Array.isArray(formasNuvem)) {
          const lista = normalizarLista(formasNuvem)
          setFormasPagamento(lista)
          localStorage.setItem(FORMAS_KEY, JSON.stringify(lista))
        }
      } catch {}
    }

    carregarConfiguracoes()

    return () => {
      ativo = false
    }
  }, [])

  const previewLogo = useMemo(() => {
    const logo = textoSeguro(config.logoUrl)
    if (!logo) return '/logo-connect.png'
    return logo
  }, [config.logoUrl])

  function atualizar<K extends keyof ConfiguracaoSistema>(campo: K, valor: ConfiguracaoSistema[K]) {
    setConfig((old) => ({ ...old, [campo]: valor }))
  }

  function aplicarPaleta(paleta: (typeof PALETAS)[number]) {
    setConfig((old) => ({
      ...old,
      corPrimaria: paleta.primaria,
      corSecundaria: paleta.secundaria,
      corTabela: paleta.tabela,
    }))
  }

  function limparDadosEmpresa() {
    setConfig((old) => ({
      ...old,
      nomeEmpresa: '',
      telefone: '',
      email: '',
      endereco: '',
      cidadeUf: '',
      responsavel: '',
    }))
    setMensagem('Campos da empresa limpos. Clique em Salvar configurações para gravar.')
  }

  function salvarListaCategorias(lista: string[]) {
    const limpa = normalizarLista(lista)
    setCategorias(limpa)
    localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(limpa))
    window.dispatchEvent(new Event('connect-data-change'))
  }

  function salvarListaFormas(lista: string[]) {
    const limpa = normalizarLista(lista)
    setFormasPagamento(limpa)
    localStorage.setItem(FORMAS_KEY, JSON.stringify(limpa))
    window.dispatchEvent(new Event('connect-data-change'))
  }

  function adicionarCategoria() {
    const nome = novaCategoria.trim()
    if (!nome) return
    salvarListaCategorias([...categorias, nome])
    setNovaCategoria('')
  }

  function adicionarFormaPagamento() {
    const nome = novaFormaPagamento.trim()
    if (!nome) return
    salvarListaFormas([...formasPagamento, nome])
    setNovaFormaPagamento('')
  }

  function removerCategoria(nome: string) {
    salvarListaCategorias(categorias.filter((item) => item !== nome))
  }

  function removerFormaPagamento(nome: string) {
    salvarListaFormas(formasPagamento.filter((item) => item !== nome))
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      atualizar('logoUrl', String(reader.result || ''))
    }
    reader.readAsDataURL(file)
  }

  async function salvarConfiguracoes() {
    setSalvando(true)
    setMensagem('')

    try {
      // 1. Salvar no Supabase (fonte de verdade)
      const cfgParaApi: ConfiguracaoEmpresa = {
        nomeEmpresa: config.nomeEmpresa,
        telefone: config.telefone || config.celularEmpresa || '',
        celularEmpresa: config.celularEmpresa || config.telefone || '',
        whatsappEmpresa: config.celularEmpresa || config.telefone || '',
        email: config.email,
        endereco: config.endereco,
        cidadeUf: config.cidadeUf,
        responsavel: config.responsavel,
        logoUrl: config.logoUrl,
        corPrimaria: config.corPrimaria,
        corSecundaria: config.corSecundaria,
        tituloPdf: config.tituloPdf,
        rodapePdf: config.rodapePdf,
        validadePadrao: config.validadePadrao,
        prazoEntregaPadrao: config.prazoEntregaPadrao,
        formaPagamentoPadrao: config.formaPagamentoPadrao,
        mostrarQuantidade: config.mostrarQuantidade,
      }
      await salvarConfigApi(cfgParaApi)

      // 2. Salvar localStorage (cache temporário)
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
      localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(categorias))
      localStorage.setItem(FORMAS_KEY, JSON.stringify(formasPagamento))
      window.dispatchEvent(new Event('connect-data-change'))

      // 3. Também salvar na nuvem legacy (compatibilidade)
      await salvarConfigNaNuvem(config, categorias, formasPagamento)

      setMensagem('Configurações salvas e sincronizadas com sucesso!')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar as configurações.'
      setMensagem(msg)
    }

    setTimeout(() => setSalvando(false), 500)
  }

  async function alterarSenha() {
    setMensagem('')

    if (!novaSenha || novaSenha.length < 6) {
      setMensagem('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setMensagem('As senhas não conferem.')
      return
    }

    setSalvandoSenha(true)

    const { error } = await supabase.auth.updateUser({ password: novaSenha })

    if (error) {
      setMensagem(error.message)
      setSalvandoSenha(false)
      return
    }

    setSenhaAtual('')
    setNovaSenha('')
    setConfirmarSenha('')
    setMensagem('Senha alterada com sucesso.')
    setSalvandoSenha(false)
  }

  const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    padding: isMobile ? 12 : 24,
    background: 'radial-gradient(circle at top left, rgba(22,163,74,.10), transparent 28%), linear-gradient(180deg,#eef4ff 0%,#f8fbff 100%)',
    color: '#0f172a',
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,.92)',
    border: '1px solid rgba(148,163,184,.28)',
    borderRadius: 24,
    padding: isMobile ? 14 : 20,
    boxShadow: '0 22px 60px rgba(15,23,42,.10)',
  }

  const darkCard: React.CSSProperties = {
    background: 'linear-gradient(180deg,#111827 0%,#172033 100%)',
    border: '1px solid rgba(255,255,255,.10)',
    borderRadius: 24,
    padding: isMobile ? 14 : 18,
    boxShadow: '0 20px 50px rgba(15,23,42,.22)',
    color: '#ffffff',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 900,
    color: '#64748b',
    marginBottom: 7,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 42,
    borderRadius: 13,
    border: '1px solid #dbe3ef',
    background: '#ffffff',
    color: '#0f172a',
    padding: '10px 12px',
    outline: 'none',
    boxSizing: 'border-box',
    fontWeight: 700,
  }

  const tabStyle = (ativo: boolean): React.CSSProperties => ({
    minHeight: 42,
    borderRadius: 14,
    border: ativo ? '1px solid rgba(37,99,235,.45)' : '1px solid rgba(148,163,184,.28)',
    background: ativo ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#ffffff',
    color: ativo ? '#ffffff' : '#334155',
    fontWeight: 900,
    padding: '0 16px',
    cursor: 'pointer',
    boxShadow: ativo ? '0 12px 24px rgba(37,99,235,.22)' : '0 8px 18px rgba(15,23,42,.04)',
  })

  const buttonPrimary: React.CSSProperties = {
    minHeight: 44,
    borderRadius: 15,
    border: 'none',
    background: 'linear-gradient(135deg,#16a34a,#047857)',
    color: '#ffffff',
    fontWeight: 950,
    padding: '0 18px',
    cursor: 'pointer',
    boxShadow: '0 14px 28px rgba(22,163,74,.24)',
  }

  function Campo({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <label>
        <span style={labelStyle}>{label}</span>
        {children}
      </label>
    )
  }

  function CampoTexto({
    label,
    campo,
    placeholder,
    autoComplete,
  }: {
    label: string
    campo: keyof ConfiguracaoSistema
    placeholder: string
    autoComplete?: string
  }) {
    return (
      <CampoTextoRapido
        label={label}
        value={String(config[campo] ?? '')}
        placeholder={placeholder}
        autoComplete={autoComplete}
        labelStyle={labelStyle}
        inputStyle={inputStyle}
        onCommit={(valor) => atualizar(campo, valor as any)}
      />
    )
  }

  function Tag({ item, onRemove }: { item: string; onRemove: () => void }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '8px 11px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #dbe3ef', fontWeight: 900, fontSize: 12 }}>
        {item}
        <button onClick={onRemove} style={{ width: 20, height: 20, borderRadius: 999, border: 0, background: '#ef4444', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>×</button>
      </span>
    )
  }

  return (
    <div style={shellStyle}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#2563eb', fontWeight: 950, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>Painel premium</div>
            <h1 style={{ margin: '6px 0 6px', fontSize: isMobile ? 30 : 44, lineHeight: 1, color: '#0f172a' }}>Central de Configuração</h1>
            <p style={{ margin: 0, color: '#64748b', fontWeight: 700 }}>Configure empresa, visual, PDF, categorias, pagamentos e segurança em um só lugar.</p>
          </div>

          <div style={{ ...cardStyle, padding: 12, minWidth: 260, display: 'flex', gap: 12, alignItems: 'center' }}>
            <img src={previewLogo} alt="Logo" style={{ width: 54, height: 54, objectFit: 'contain', borderRadius: 14, border: '1px solid #dbe3ef', background: '#fff' }} />
            <div>
              <div style={{ fontWeight: 950 }}>{config.nomeEmpresa || 'Sua empresa'}</div>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>Preview ativo do sistema</div>
            </div>
          </div>
        </header>

        {mensagem ? (
          <div style={{ ...cardStyle, padding: '12px 16px', color: mensagem.includes('sucesso') ? '#047857' : '#b91c1c', fontWeight: 900 }}>
            {mensagem}
          </div>
        ) : null}

        <nav style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={tabStyle(aba === 'empresa')} onClick={() => setAba('empresa')}>🏪 Empresa</button>
          <button style={tabStyle(aba === 'visual')} onClick={() => setAba('visual')}>🎨 Visual</button>
          <button style={tabStyle(aba === 'pdf')} onClick={() => setAba('pdf')}>📄 PDF</button>
          <button style={tabStyle(aba === 'cadastros')} onClick={() => setAba('cadastros')}>⚡ Cadastros</button>
          <button style={tabStyle(aba === 'seguranca')} onClick={() => setAba('seguranca')}>🔐 Backup e Segurança</button>
        </nav>

        {aba === 'empresa' ? (
          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr .9fr', gap: 18 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 24 }}>Identidade da empresa</h2>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 700, fontSize: 12 }}>Campos livres para o cliente personalizar. Sem dados fixos da Connect.</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <CampoTexto label="Nome da empresa" campo="nomeEmpresa" placeholder="Nome da empresa do cliente" autoComplete="organization" />
                <CampoTexto label="WhatsApp da empresa" campo="celularEmpresa" placeholder="Celular/WhatsApp para notificações" autoComplete="tel" />
                <CampoTexto label="Telefone fixo" campo="telefone" placeholder="Telefone fixo (opcional)" autoComplete="tel" />
                <CampoTexto label="E-mail" campo="email" placeholder="email@empresa.com" autoComplete="email" />
                <CampoTexto label="Responsável" campo="responsavel" placeholder="Responsável" autoComplete="name" />
                <CampoTexto label="Endereço" campo="endereco" placeholder="Endereço completo" autoComplete="street-address" />
                <CampoTexto label="Cidade / UF" campo="cidadeUf" placeholder="Cidade / UF" />
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Logo da empresa</h2>
              <div style={{ border: '1px dashed #94a3b8', borderRadius: 20, padding: 18, textAlign: 'center', background: '#f8fafc' }}>
                <img src={previewLogo} alt="Preview logo" style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 18, background: '#fff', border: '1px solid #dbe3ef' }} />
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ marginTop: 14, width: '100%' }} />
              </div>
            </div>
          </section>
        ) : null}

        {aba === 'visual' ? (
          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr .9fr', gap: 18 }}>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Paletas premium</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {PALETAS.map((paleta) => (
                  <button key={paleta.nome} onClick={() => aplicarPaleta(paleta)} style={{ minHeight: 56, borderRadius: 18, border: config.corPrimaria === paleta.primaria ? '2px solid #2563eb' : '1px solid #dbe3ef', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 14px', cursor: 'pointer', fontWeight: 900 }}>
                    <span>{paleta.nome}</span>
                    <span style={{ display: 'flex', gap: 7 }}>
                      <i style={{ width: 24, height: 24, borderRadius: 999, background: paleta.primaria }} />
                      <i style={{ width: 24, height: 24, borderRadius: 999, background: paleta.secundaria, border: '1px solid #dbe3ef' }} />
                      <i style={{ width: 24, height: 24, borderRadius: 999, background: paleta.tabela }} />
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div style={darkCard}>
              <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Cores manuais</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <Campo label="Cor principal"><input type="color" value={config.corPrimaria} onChange={(e) => atualizar('corPrimaria', e.target.value)} style={{ ...inputStyle, padding: 4 }} /></Campo>
                <Campo label="Cor secundária"><input type="color" value={config.corSecundaria} onChange={(e) => atualizar('corSecundaria', e.target.value)} style={{ ...inputStyle, padding: 4 }} /></Campo>
                <Campo label="Cor da tabela/PDF"><input type="color" value={config.corTabela} onChange={(e) => atualizar('corTabela', e.target.value)} style={{ ...inputStyle, padding: 4 }} /></Campo>
              </div>
            </div>
          </section>
        ) : null}

        {aba === 'pdf' ? (
          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr .9fr', gap: 18 }}>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Configurações do orçamento e PDF</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <CampoTexto label="Título padrão" campo="tituloPdf" placeholder="Orçamento Comercial" />
                <CampoTexto label="Pagamento padrão" campo="formaPagamentoPadrao" placeholder="PIX" />
                <CampoTexto label="Validade padrão" campo="validadePadrao" placeholder="7 dias (use 0 para ocultar)" />
                <CampoTexto label="Prazo de entrega padrão" campo="prazoEntregaPadrao" placeholder="3 dias" />
              </div>
              <div style={{ marginTop: 14 }}>
                <Campo label="Rodapé / observação padrão">
                  <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }} defaultValue={config.rodapePdf} onBlur={(e) => atualizar('rodapePdf', e.currentTarget.value)} />
                </Campo>
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Preview em tempo real</h2>
              <div style={{ borderRadius: 22, border: '1px solid #dbe3ef', padding: 18, background: config.corSecundaria, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.4)' }}>
                <div style={{ background: '#fff', borderRadius: 18, padding: 14, borderTop: `5px solid ${config.corPrimaria}` }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <img src={previewLogo} alt="Logo" style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 12 }} />
                    <div>
                      <div style={{ fontWeight: 950 }}>{config.nomeEmpresa}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{config.telefone}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, height: 28, borderRadius: 10, background: config.corTabela, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>Cabeçalho do PDF</div>
                  <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>{config.rodapePdf}</div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {aba === 'cadastros' ? (
          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 6px', fontSize: 24 }}>Categorias</h2>
              <p style={{ margin: '0 0 14px', color: '#64748b', fontWeight: 700 }}>Cadastro centralizado para produtos, serviços e orçamentos.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 14 }}>
                <input style={inputStyle} value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarCategoria()} placeholder="Nova categoria" />
                <button style={buttonPrimary} onClick={adicionarCategoria}>Adicionar</button>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {categorias.map((item) => <Tag key={item} item={item} onRemove={() => removerCategoria(item)} />)}
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 6px', fontSize: 24 }}>Formas de pagamento</h2>
              <p style={{ margin: '0 0 14px', color: '#64748b', fontWeight: 700 }}>Use em orçamento, OS, recibos e financeiro.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 14 }}>
                <input style={inputStyle} value={novaFormaPagamento} onChange={(e) => setNovaFormaPagamento(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarFormaPagamento()} placeholder="Nova forma" />
                <button style={buttonPrimary} onClick={adicionarFormaPagamento}>Adicionar</button>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {formasPagamento.map((item) => <Tag key={item} item={item} onRemove={() => removerFormaPagamento(item)} />)}
              </div>
            </div>
          </section>
        ) : null}

        {aba === 'seguranca' ? (
          <>
          <BackupSegurancaPanel
            cardStyle={cardStyle}
            buttonPrimary={buttonPrimary}
            labelStyle={labelStyle}
            isMobile={isMobile}
          />
          <section style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Alterar senha</h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <span style={labelStyle}>Senha atual</span>
                <input type="password" style={inputStyle} value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
              </div>
              <div>
                <span style={labelStyle}>Nova senha</span>
                <input type="password" style={inputStyle} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
              </div>
              <div>
                <span style={labelStyle}>Confirmar nova senha</span>
                <input type="password" style={inputStyle} value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
              </div>
            </div>
            <button onClick={alterarSenha} disabled={salvandoSenha} style={{ ...buttonPrimary, marginTop: 16 }}>
              {salvandoSenha ? 'Alterando...' : 'Alterar senha'}
            </button>
          </section>
          </>
        ) : null}

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => window.location.href = '/dashboard'} style={{ minHeight: 44, borderRadius: 15, border: '1px solid #dbe3ef', background: '#fff', color: '#0f172a', fontWeight: 900, padding: '0 18px', cursor: 'pointer' }}>Voltar</button>
          <button onClick={salvarConfiguracoes} disabled={salvando} style={buttonPrimary}>
            {salvando ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </footer>
      </div>
    </div>
  )
}
