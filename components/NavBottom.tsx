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
        setCount((store.items ?? []).filter(i => i.status === 'found' && (i as {match?: {available?: boolean}}).match?.available === true).length)
      } catch { setCount(0) }
    }
    read()
    window.addEventListener('storage', read)
    // Poll lightly so badge updates after a check-all on the Envies page
    const t = setInterval(read, 5000)
    return () => { window.removeEventListener('storage', read); clearInterval(t) }
  }, [])
  return count
}

const TABS = [
  { href: '/compte',    label: 'Compte',    icon: '👤', badge: false },
  { href: '/catalogue', label: 'Catalogue', icon: '🔍', badge: false },
  { href: '/envies',    label: 'Listes',    icon: '⭐', badge: true  },
]

export default function NavBottom() {
  const path = usePathname()
  const foundCount = useFoundCount()

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
        const showBadge = tab.badge && foundCount > 0
        return (
          <Link key={tab.href} href={tab.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '3px', textDecoration: 'none', flex: 1, padding: '8px 0',
          }}>
            <span style={{ fontSize: '20px', opacity: active ? 1 : 0.22, lineHeight: 1, position: 'relative', display: 'inline-block' }}>
              {tab.icon}
              {showBadge && (
                <span style={{
                  position: 'absolute', top: '-3px', right: '-6px',
                  minWidth: '14px', height: '14px',
                  background: 'var(--green)',
                  borderRadius: '7px',
                  fontSize: '8px', fontWeight: 800,
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                  fontFamily: 'DM Sans, sans-serif',
                  lineHeight: 1,
                }}>
                  {foundCount}
                </span>
              )}
            </span>
            <span style={{
              fontSize: '9px',
              fontWeight: active ? 800 : 500,
              color: active ? 'var(--color-heading)' : 'var(--text-2)',
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
