'use client'

type Props = {
  linhas?: number
  altura?: number
}

export default function ConnectSkeleton({ linhas = 3, altura = 14 }: Props) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: linhas }).map((_, i) => (
        <div
          key={i}
          className="connect-skeleton-bar"
          style={{
            height: altura,
            width: i === linhas - 1 ? '72%' : '100%',
            borderRadius: 10,
            background: 'linear-gradient(90deg,#e2e8f0 0%,#f1f5f9 50%,#e2e8f0 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      ))}
      <style jsx global>{`
        .connect-skeleton-bar {
          animation: connect-skeleton-shimmer 1.2s ease-in-out infinite;
        }
        @keyframes connect-skeleton-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  )
}
