'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/compte',    label: 'Mon compte', icon: '👤' },
  { href: '/catalogue', label: 'Catalogue',  icon: '🔍' },
  { href: '/envies',    label: 'Mes envies', icon: '⭐' },
]

export default function NavSidebar() {
  const path = usePathname()
  return (
    <nav style={{
      width: 'var(--sidebar-w)',
      minHeight: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      padding: '32px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      flexShrink: 0,
    }}>
      <div style={{
        fontFamily: 'DM Mono, monospace',
        fontSize: '9px',
        color: 'var(--text-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        marginBottom: '20px',
        paddingLeft: '12px',
      }}>
        Médiathèques
      </div>
      {TABS.map(tab => {
        const active = path.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px',
            borderRadius: 'var(--radius-sm)',
            background: active ? 'var(--bg)' : 'transparent',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '15px', opacity: active ? 1 : 0.35, lineHeight: 1 }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: '13px',
              fontWeight: active ? 700 : 400,
              color: active ? 'var(--navy)' : 'var(--text-2)',
              fontFamily: 'DM Sans, sans-serif',
            }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
