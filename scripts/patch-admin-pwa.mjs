import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')

function patch(file, fn) {
  const p = path.join(root, file)
  let s = fs.readFileSync(p, 'utf8')
  const n = fn(s)
  if (n !== s) {
    fs.writeFileSync(p, n)
    console.log('ok', file)
  } else console.log('skip', file)
}

patch('lib/verificarAcesso.ts', (s) => {
  if (s.includes('isUsuarioAdmin')) return s
  return s
    .replace("import { ADMIN_EMAILS, acessoBloqueado } from './access'", "import { acessoBloqueado, isUsuarioAdmin } from './access'")
    .replace(
      'if (ADMIN_EMAILS.includes(emailNormalizado))',
      'if (isUsuarioAdmin({ email: emailNormalizado }))'
    )
})

patch('app/(painel)/planos/page.tsx', (s) => {
  if (s.includes('const [admin, setAdmin]')) return s
  s = s.replace(
    "import { supabase } from '@/lib/supabase-browser'",
    "import { supabase } from '@/lib/supabase-browser'\nimport { emailDoUsuarioAuth, isUsuarioAdmin } from '@/lib/access'"
  )
  s = s.replace(
    "const [recorrenciaPadrao, setRecorrenciaPadrao] = useState<RecorrenciaPlano>('mensal')",
    "const [recorrenciaPadrao, setRecorrenciaPadrao] = useState<RecorrenciaPlano>('mensal')\n  const [admin, setAdmin] = useState(false)"
  )
  s = s.replace(
    "if (!data?.session?.user) router.push('/login')",
    "if (!data?.session?.user) router.push('/login')\n      else setAdmin(isUsuarioAdmin({ email: emailDoUsuarioAuth(data.session.user) }))"
  )
  s = s.replace(
    'const diasTrial = snapshot?.diasRestantesTrial',
    'const diasTrial = admin || snapshot?.isAdminMaster ? null : snapshot?.diasRestantesTrial'
  )
  return s
})

patch('app/(painel)/components/painel/PainelShell.tsx', (s) => {
  if (!s.includes('WHATSAPP_FALLBACK_EVENT')) {
    s = s.replace(
      'import ConnectToastProvider from "@/components/ui/ConnectToast";',
      'import ConnectToastProvider from "@/components/ui/ConnectToast";\nimport WhatsAppFallbackBar from "@/components/WhatsAppFallbackBar";\nimport { WHATSAPP_FALLBACK_EVENT } from "@/lib/abrirExterno";'
    )
  }
  if (!s.includes('whatsappFallbackUrl')) {
    s = s.replace(
      'const [demoAtivo, setDemoAtivo] = useState(false);',
      'const [demoAtivo, setDemoAtivo] = useState(false);\n  const [whatsappFallbackUrl, setWhatsappFallbackUrl] = useState<string | null>(null);'
    )
  }
  if (!s.includes('WHATSAPP_FALLBACK_EVENT, handler')) {
    s = s.replace(
      `  }, [pathname]);

  useEffect(() => {
    function atualizarRelogio()`,
      `  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      const url = String((event as CustomEvent<{ url?: string }>).detail?.url || "").trim();
      if (url) setWhatsappFallbackUrl(url);
    };
    window.addEventListener(WHATSAPP_FALLBACK_EVENT, handler);
    return () => window.removeEventListener(WHATSAPP_FALLBACK_EVENT, handler);
  }, []);

  useEffect(() => {
    function atualizarRelogio()`
    )
  }
  if (s.includes('<TrialBanner />') && !s.includes('!adminLogado && <TrialBanner')) {
    s = s.replace('<TrialBanner />', '{!adminLogado && <TrialBanner />}')
  }
  if (!s.includes('<WhatsAppFallbackBar url={whatsappFallbackUrl}')) {
    s = s.replace(
      '<ConnectToastProvider />',
      '<WhatsAppFallbackBar url={whatsappFallbackUrl} onFechar={() => setWhatsappFallbackUrl(null)} />\n      <ConnectToastProvider />'
    )
  }
  return s
})

console.log('done')
