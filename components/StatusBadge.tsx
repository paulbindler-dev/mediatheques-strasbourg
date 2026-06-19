type Variant = 'red' | 'green' | 'gray'

const STYLES: Record<Variant, { bg: string; color: string }> = {
  red:   { bg: '#EF4444', color: 'white' },
  green: { bg: '#22C55E', color: 'white' },
  gray:  { bg: '#E2E8F0', color: '#64748B' },
}

export default function StatusBadge({ variant, label }: { variant: Variant; label: string }) {
  const s = STYLES[variant]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '9px',
      fontWeight: 700,
      padding: '3px 8px',
      borderRadius: '20px',
      background: s.bg,
      color: s.color,
      letterSpacing: '0.02em',
      fontFamily: 'DM Sans, sans-serif',
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  )
}
