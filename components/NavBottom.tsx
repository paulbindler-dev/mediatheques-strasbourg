'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/compte',    label: 'Compte',    icon: '👤' },
  { href: '/catalogue', label: 'Catalogue', icon: '🔍' },
  { href: '/envies',    label: 'Envies',    icon: '⭐' },
]

export default function NavBottom() {
  const path = usePathname()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'var(--nav-h)',
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 100,
    }}>
      {TABS.map(tab => {
        const active = path.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '3px', textDecoration: 'none', flex: 1, padding: '8px 0',
          }}>
            <span style={{ fontSize: '20px', opacity: active ? 1 : 0.22, lineHeight: 1 }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: '9px',
              fontWeight: active ? 800 : 500,
              color: active ? 'var(--navy)' : 'var(--text-2)',
              fontFamily: 'DM Sans, sans-serif',
              letterSpacing: '0.01em',
            }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
