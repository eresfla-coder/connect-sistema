import './globals.css'
import PWAClient from './components/PWAClient'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://appconnectpro.com.br'

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Connect Sistema — Orçamentos, OS e vendas em um só lugar',
    template: '%s | Connect Sistema',
  },
  description:
    'SaaS premium para orçamentos, propostas comerciais, ordens de serviço, aprovação digital, PDF profissional e financeiro integrado. Sync celular e PC.',
  keywords: [
    'orçamento',
    'ordem de serviço',
    'proposta comercial',
    'gestão de vendas',
    'assistência técnica',
    'SaaS',
    'Connect Sistema',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: siteUrl,
    siteName: 'Connect Sistema',
    title: 'Connect Sistema — Controle total de orçamentos, OS e vendas',
    description:
      'Propostas, aprovação online, OS automática, PDF premium e WhatsApp. Teste grátis.',
    images: [{ url: '/icons/icon-512x512.png', width: 512, height: 512, alt: 'Connect Sistema' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Connect Sistema',
    description: 'Orçamentos, OS, clientes e vendas com visual premium.',
    images: ['/icons/icon-512x512.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico?v=89' },
      { url: '/icons/icon-192x192.png?v=89', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png?v=89', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png?v=89', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'Connect',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>
        <PWAClient />
        {children}
      </body>
    </html>
  )
}
