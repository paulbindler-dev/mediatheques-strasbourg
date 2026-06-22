'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

function useFoundCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem('mediatheques_wishlists_v2')
        if (!raw) return setCount(0)
        const store = JSON.parse(raw) as { items?: { status: string }[] }
        setCount((store.items ?? []).filter(i => i.status === 'found').length)
      } catch { setCount(0) }
    }
    read()
    window.addEventListener('storage', read)
    const t = setInterval(read, 5000)
    return () => { window.removeEventListener('storage', read); clearInterval(t) }
  }, [])
  return count
}

const TABS = [
  { href: '/compte',    label: 'Mon compte', icon: '👤', badge: false },
  { href: '/catalogue', label: 'Catalogue',  icon: '🔍', badge: false },
  { href: '/envies',    label: 'Mes listes', icon: '⭐', badge: true  },
]

export default function NavSidebar() {
  const path = usePathname()
  const foundCount = useFoundCount()

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
        const showBadge = tab.badge && foundCount > 0
        return (
          <Link key={tab.href} href={tab.href} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px',
            borderRadius: 'var(--radius-sm)',
            background: active ? 'var(--bg)' : 'transparent',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '15px', opacity: active ? 1 : 0.35, lineHeight: 1, position: 'relative', display: 'inline-block' }}>
              {tab.icon}
              {showBadge && (
                <span style={{
                  position: 'absolute', top: '-3px', right: '-6px',
                  minWidth: '13px', height: '13px',
                  background: 'var(--green)', borderRadius: '7px',
                  fontSize: '7px', fontWeight: 800, color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 2px', fontFamily: 'DM Sans, sans-serif', lineHeight: 1,
                }}>
                  {foundCount > 9 ? '9+' : foundCount}
                </span>
              )}
            </span>
            <span style={{
              fontSize: '13px',
              fontWeight: active ? 700 : 400,
              color: active ? 'var(--color-heading)' : 'var(--text-2)',
              fontFamily: 'DM Sans, sans-serif',
            }}>
              {tab.label}
            </span>
            {showBadge && (
              <span style={{
                marginLeft: 'auto',
                minWidth: '18px', height: '18px',
                background: 'var(--green)', borderRadius: '9px',
                fontSize: '9px', fontWeight: 800, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', fontFamily: 'DM Sans, sans-serif',
              }}>
                {foundCount > 9 ? '9+' : foundCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
