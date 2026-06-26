'use client'

export type ViewMode = 'dots' | 'list' | 'grid3'

const SVG_DOTS = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="4" cy="8" r="1.5" fill="currentColor" stroke="none"/>
    <line x1="9" y1="8" x2="21" y2="8"/>
    <circle cx="4" cy="16" r="1.5" fill="currentColor" stroke="none"/>
    <line x1="9" y1="16" x2="21" y2="16"/>
  </svg>
)

const SVG_LIST = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)

const SVG_GRID3 = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="2" y="2" width="6" height="9" rx="1"/>
    <rect x="9" y="2" width="6" height="9" rx="1"/>
    <rect x="16" y="2" width="6" height="9" rx="1"/>
    <rect x="2" y="13" width="6" height="9" rx="1"/>
    <rect x="9" y="13" width="6" height="9" rx="1"/>
    <rect x="16" y="13" width="6" height="9" rx="1"/>
  </svg>
)

const MODES: { key: ViewMode; title: string; icon: React.ReactNode }[] = [
  { key: 'dots',  title: 'Points', icon: SVG_DOTS },
  { key: 'list',  title: 'Liste',  icon: SVG_LIST },
  { key: 'grid3', title: '3×3',    icon: SVG_GRID3 },
]

export function ViewModeToggle({ value, onChange }: {
  value: ViewMode
  onChange: (m: ViewMode) => void
}) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--tab-inactive-bg)',
      borderRadius: '10px',
      padding: '3px',
      gap: '2px',
    }}>
      {MODES.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          title={m.title}
          style={{
            height: '30px', flex: 1, minWidth: '30px',
            border: 'none', cursor: 'pointer',
            borderRadius: '7px',
            background: value === m.key ? 'var(--surface)' : 'transparent',
            boxShadow: value === m.key ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
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
  'Jeu vidéo':             { emoji: '🎮', bg: 'rgba(59,130,246,0.12)' },
  'Vidéo':                 { emoji: '🎬', bg: 'rgba(249,115,22,0.12)' },
  'Livre':                 { emoji: '📖', bg: 'rgba(34,197,94,0.12)' },
  'BD ou manga':           { emoji: '📚', bg: 'rgba(20,184,166,0.12)' },
  'Musique':               { emoji: '🎵', bg: 'rgba(236,72,153,0.12)' },
  'Livre audio numérique': { emoji: '🎧', bg: 'rgba(168,85,247,0.12)' },
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
  if (type === 'Livre audio numérique') return 'Audio'
  return type?.split(' ')[0] ?? ''
}
