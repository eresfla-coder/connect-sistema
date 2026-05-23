'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function TransicaoSuave({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [visivel, setVisivel] = useState(true)

  useEffect(() => {
    setVisivel(false)
    const id = window.requestAnimationFrame(() => setVisivel(true))
    return () => window.cancelAnimationFrame(id)
  }, [pathname])

  return (
    <div
      style={{
        opacity: visivel ? 1 : 0.4,
        transform: visivel ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 0.22s ease, transform 0.22s ease',
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}
