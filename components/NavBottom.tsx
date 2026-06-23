'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { User, Search, Bookmark } from 'lucide-react'

function useFoundCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem('mediatheques_wishlists_v2')
        if (!raw) return setCount(0)
        const store = JSON.parse(raw) as { items?: { status: string; match?: { available?: boolean } }[] }
        setCount((store.items ?? []).filter(i => i.status === 'found' && i.match?.available === true).length)
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
  { href: '/compte',    label: 'Prêts',     Icon: User,     badge: false },
  { href: '/catalogue', label: 'Catalogue', Icon: Search,   badge: false },
  { href: '/envies',    label: 'Listes',    Icon: Bookmark, badge: true  },
]

const TAB_HREFS = TABS.map(t => t.href)

export default function NavBottom() {
  const path = usePathname()
  const router = useRouter()
  const foundCount = useFoundCount()

  useEffect(() => {
    let startX = 0
    let startY = 0
    let startedInSwipeable = false
    let startedInHScroll = false
    let startedWithPanelOpen = false

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      const target = e.target as HTMLElement
      // Pills / horizontal scroll zones — never intercept
      startedInHScroll = !!target.closest?.('[data-hscroll]')
      // Swipeable item cards
      const swipeableEl = target.closest?.('[data-swipeable]')
      startedInSwipeable = !!swipeableEl
      startedWithPanelOpen = swipeableEl?.getAttribute('data-panel-open') === 'true'
    }

    function onTouchEnd(e: TouchEvent) {
      // Never intercept touches that started in a horizontal scroll zone
      if (startedInHScroll) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      if (Math.abs(dx) < 55 || dy > 60) return
      // Block left swipe from item cards (opening delete panel)
      // Block any swipe from item cards when the panel was already open (close panel first)
      if (startedInSwipeable && (dx < 0 || startedWithPanelOpen)) return
      const idx = TAB_HREFS.findIndex(h => path.startsWith(h))
      if (idx === -1) return
      if (dx < 0 && idx < TAB_HREFS.length - 1) router.push(TAB_HREFS[idx + 1])
      if (dx > 0 && idx > 0) router.push(TAB_HREFS[idx - 1])
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [path, router])

  const activeIdx = TAB_HREFS.findIndex(h => path.startsWith(h))

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '0.5px solid var(--border)',
      zIndex: 100,
    }}>
      {/* Swipe position dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', paddingTop: '6px' }}>
        {TABS.map((_, i) => (
          <div key={i} style={{
            height: '3px', width: '16px', borderRadius: '2px',
            background: i === activeIdx ? 'var(--color-heading)' : 'var(--border)',
            transform: i === activeIdx ? 'scaleX(1)' : 'scaleX(0.31)',
            transformOrigin: 'center',
            transition: 'transform 0.22s ease, background 0.22s ease',
          }} />
        ))}
      </div>

      {/* Tab items */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '52px' }}>
        {TABS.map(({ href, label, Icon, badge }) => {
          const active = path.startsWith(href)
          const showBadge = badge && foundCount > 0
          return (
            <Link key={href} href={href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '2px', textDecoration: 'none', flex: 1, padding: '4px 0',
              position: 'relative',
            }}>
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 1.8}
                  color={active ? 'var(--color-heading)' : 'var(--text-2)'}
                />
                {showBadge && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-8px',
                    minWidth: '16px', height: '16px',
                    background: 'var(--green)', borderRadius: '8px',
                    fontSize: '9px', fontWeight: 800, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px', fontFamily: 'DM Sans, sans-serif', lineHeight: 1,
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
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>

      {/* iOS safe area */}
      <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
    </nav>
  )
}
