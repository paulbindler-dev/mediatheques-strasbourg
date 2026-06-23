type Variant = 'red' | 'green' | 'gray'

const STYLES: Record<Variant, { bg: string; color: string; dot: string }> = {
  red:   { bg: 'rgba(239,68,68,0.1)',    color: '#b91c1c', dot: '#EF4444' },
  green: { bg: 'rgba(34,197,94,0.1)',    color: '#15803d', dot: '#22C55E' },
  gray:  { bg: 'var(--tab-inactive-bg)', color: 'var(--text-2)', dot: '#9CA3AF' },
}

export default function StatusBadge({ variant, label }: { variant: Variant; label: string }) {
  const s = STYLES[variant]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      fontSize: '10.5px',
      fontWeight: 700,
      padding: '3px 9px',
      borderRadius: '6px',
      background: s.bg,
      color: s.color,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <span style={{
        width: '5px', height: '5px', borderRadius: '50%',
        background: s.dot, flexShrink: 0, display: 'inline-block',
      }} />
      {label}
    </span>
  )
}
