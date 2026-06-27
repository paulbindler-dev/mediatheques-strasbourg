import NavBottom from '@/components/NavBottom'
import NavSidebar from '@/components/NavSidebar'
import OrientationGuard from '@/components/OrientationGuard'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout" style={{ display: 'flex', height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <OrientationGuard />
      <div className="sidebar-wrapper">
        <NavSidebar />
      </div>
      <main style={{ flex: 1, paddingBottom: 'var(--nav-h)', minWidth: 0, height: '100%', overflowY: 'auto', viewTransitionName: 'page-content' } as React.CSSProperties} className="app-main">
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
