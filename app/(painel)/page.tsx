'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [menuAberto, setMenuAberto] = useState(false)

  async function sairDoPainel() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 220, background: '#0f172a', color: '#fff' }}>
        <div style={{ padding: 16, fontWeight: 900 }}>
          CONNECT SISTEMA
        </div>

        <Link href="/dashboard"><div style={{ padding: 12 }}>Dashboard</div></Link>
        <Link href="/clientes"><div style={{ padding: 12 }}>Clientes</div></Link>
        <Link href="/produtos"><div style={{ padding: 12 }}>Produtos</div></Link>
        <Link href="/orcamentos"><div style={{ padding: 12 }}>Orçamentos</div></Link>

        <button onClick={sairDoPainel} style={{ width: '100%', padding: 12, background: '#ef4444', color: '#fff' }}>
          Sair
        </button>
      </aside>

      <main style={{ flex: 1, background: '#020617' }}>
        <div style={{ padding: 16 }}>{children}</div>
      </main>
    </div>
  )
}