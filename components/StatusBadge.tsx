type Variant = 'red' | 'green' | 'gray'

const STYLES: Record<Variant, { bg: string; color: string; dot: string }> = {
  red:   { bg: 'var(--badge-red-bg)',    color: 'var(--badge-red-color)',   dot: 'var(--red)'   },
  green: { bg: 'var(--badge-green-bg)',  color: 'var(--badge-green-color)', dot: 'var(--green)' },
  gray:  { bg: 'var(--tab-inactive-bg)', color: 'var(--text-2)',            dot: 'var(--border)' },
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
