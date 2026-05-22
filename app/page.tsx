import dynamic from 'next/dynamic'

const LandingGrowthPage = dynamic(
  () => import('@/app/components/landing/LandingGrowthPage'),
  {
    loading: () => (
      <div
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        Carregando Connect Sistema...
      </div>
    ),
    ssr: true,
  },
)

export default function HomePage() {
  return <LandingGrowthPage />
}
