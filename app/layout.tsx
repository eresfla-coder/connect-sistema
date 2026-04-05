import './globals.css'

export const metadata = {
  title: 'Connect Sistema',
  description: 'Sistema premium',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}