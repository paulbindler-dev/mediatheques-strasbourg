'use client'

export type ViewMode = 'images' | 'dots'

const SVG_IMAGES = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const SVG_BADGES = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="4" cy="7" r="1.5" fill="currentColor" stroke="none"/>
    <line x1="9" y1="7" x2="21" y2="7"/>
    <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <line x1="9" y1="12" x2="21" y2="12"/>
    <circle cx="4" cy="17" r="1.5" fill="currentColor" stroke="none"/>
    <line x1="9" y1="17" x2="21" y2="17"/>
  </svg>
)

const MODES: { key: ViewMode; title: string; icon: React.ReactNode }[] = [
  { key: 'images', title: 'Vignette', icon: SVG_IMAGES },
  { key: 'dots',   title: 'Points',   icon: SVG_BADGES },
]

export function ViewModeToggle({ value, onChange }: {
  value: ViewMode
  onChange: (m: ViewMode) => void
}) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--tab-inactive-bg)',
      borderRadius: '8px',
      padding: '2px',
      gap: '1px',
    }}>
      {MODES.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          title={m.title}
          style={{
            width: '28px', height: '24px',
            border: 'none', cursor: 'pointer',
            borderRadius: '6px',
            background: value === m.key ? 'var(--surface)' : 'transparent',
            boxShadow: value === m.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            color: value === m.key ? 'var(--text)' : 'var(--text-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.12s, color 0.12s',
            padding: 0,
          }}
        >
          {m.icon}
        </button>
      ))}
    </div>
  )
}

export const TYPE_CONFIG: Record<string, { emoji: string; bg: string }> = {
  'Jeu vidéo':   { emoji: '🎮', bg: 'rgba(59,130,246,0.12)' },
  'Vidéo':       { emoji: '🎬', bg: 'rgba(249,115,22,0.12)' },
  'Livre':       { emoji: '📖', bg: 'rgba(34,197,94,0.12)' },
  'BD ou manga': { emoji: '📚', bg: 'rgba(20,184,166,0.12)' },
  'Musique':     { emoji: '🎵', bg: 'rgba(236,72,153,0.12)' },
}

export function typeBadge(type: string, subject: string): string {
  if (type === 'Jeu vidéo') {
    if (subject.includes('PS5')) return 'PS5'
    if (subject.includes('PS4')) return 'PS4'
    if (subject.includes('Nintendo Switch') || subject.includes('Switch')) return 'Switch'
    if (subject.includes('Xbox')) return 'Xbox'
    return 'Jeu'
  }
  if (type === 'Vidéo') return 'Film'
  if (type === 'BD ou manga') return 'BD'
  if (type === 'Livre') return 'Livre'
  if (type === 'Musique') return 'CD'
  return type?.split(' ')[0] ?? ''
}
