import './globals.css'

export const metadata = {
  title: 'Connect Sistema',
  description: 'Sistema premium para orçamento, OS, financeiro, CRM e automações por WhatsApp.',
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
        {children}
      </body>
    </html>
  )
}
