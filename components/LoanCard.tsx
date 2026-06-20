import StatusBadge from './StatusBadge'
import { parseIguanaDate, formatDate, getDaysUntil, type IguanaLoan } from '@/lib/iguana'

export default function LoanCard({ l }: { l: IguanaLoan }) {
  const dueDate = parseIguanaDate(l.WhenBack)
  const daysLeft = dueDate ? getDaysUntil(dueDate) : null

  let variant: 'red' | 'green' | 'gray' = 'green'
  let label = dueDate ? `À rendre le ${formatDate(dueDate)}` : 'En cours'

  if (daysLeft !== null) {
    if (daysLeft < 0) { variant = 'red'; label = 'En retard' }
    else if (daysLeft <= 2) { variant = 'red'; label = `Dans ${daysLeft}j` }
  }

  const thumb = l.ThumbnailUrl || l.DefaultThumbnailUrl

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px',
      borderRadius: 'var(--radius)',
      background: 'var(--surface)',
      boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
    }}>
      <img
        src={thumb}
        onError={e => { (e.target as HTMLImageElement).src = l.DefaultThumbnailUrl }}
        style={{ width: '44px', height: '63px', borderRadius: '6px', objectFit: 'cover', background: 'var(--bg)', flexShrink: 0 }}
        alt=""
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
          {l.Title}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '2px' }}>
          {l.TypeOfDocument}{l.Location ? ` · ${l.Location}` : ''}
        </div>
        <div style={{ marginTop: '7px' }}>
          <StatusBadge variant={variant} label={label} />
        </div>
      </div>
    </div>
  )
}
