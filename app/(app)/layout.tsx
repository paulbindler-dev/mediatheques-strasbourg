import NavBottom from '@/components/NavBottom'
import NavSidebar from '@/components/NavSidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="sidebar-wrapper">
        <NavSidebar />
      </div>
      <main style={{ flex: 1, paddingBottom: 'var(--nav-h)', minWidth: 0 }} className="app-main">
        {children}
      </main>
      <div className="bottom-nav-wrapper">
        <NavBottom />
      </div>
      <style>{`
        .sidebar-wrapper { display: none; }
        @media (min-width: 768px) {
          .sidebar-wrapper { display: block; }
          .bottom-nav-wrapper { display: none; }
          .app-main { padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  )
}
