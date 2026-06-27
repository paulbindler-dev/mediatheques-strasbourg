'use client'
import { useEffect, useState } from 'react'

export default function OrientationGuard() {
  const [landscape, setLandscape] = useState(false)

  useEffect(() => {
    const check = () => setLandscape(window.innerWidth > window.innerHeight)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!landscape) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '20px',
    }}>
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
        {/* Phone outline rotated 90° */}
        <rect x="14" y="8" width="24" height="36" rx="4" stroke="var(--color-heading)" strokeWidth="2.5" fill="none" />
        <circle cx="26" cy="38" r="2" fill="var(--color-heading)" />
        {/* Rotation arrow */}
        <path d="M6 26 C6 14 16 6 26 6" stroke="var(--text-2)" strokeWidth="2" fill="none" strokeLinecap="round" />
        <polyline points="22,2 26,6 22,10" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '6px' }}>
          Tourne ton téléphone
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>
          L&apos;app est optimisée en portrait
        </div>
      </div>
    </div>
  )
}
