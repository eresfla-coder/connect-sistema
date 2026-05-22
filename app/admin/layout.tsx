import AdminGuard from './AdminGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div style={{ width: '100%' }}>{children}</div>
    </AdminGuard>
  )
}
