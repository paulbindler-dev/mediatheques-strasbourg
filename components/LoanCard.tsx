import StatusBadge from './StatusBadge'
import { parseIguanaDate, formatDate, getDaysUntil, type IguanaLoan } from '@/lib/iguana'
import { typeBadge } from './ViewModeToggle'

function shortLoc(loc: string | undefined | null): string {
  const l = (loc ?? '').toLowerCase()
  if (l.includes('neudorf')) return 'Neudorf'
  if (l.includes('malraux')) return 'Malraux'
  return loc ?? ''
}

export default function LoanCard({ l }: { l: IguanaLoan }) {
  const dueDate = parseIguanaDate(l.WhenBack)
  const daysLeft = dueDate ? getDaysUntil(dueDate) : null

  let variant: 'red' | 'green' | 'gray' = 'green'
  let label = dueDate ? `À rendre le ${formatDate(dueDate)}` : 'En cours'

  if (daysLeft !== null) {
    if (daysLeft < 0)      { variant = 'red'; label = 'En retard' }
    else if (daysLeft === 0) { variant = 'red'; label = "Aujourd'hui" }
    else if (daysLeft === 1) { variant = 'red'; label = 'Demain' }
    else if (daysLeft === 2) { variant = 'red'; label = 'Dans 2 jours' }
  }

  const thumb = l.ThumbnailUrl || l.DefaultThumbnailUrl
  const locLabel = shortLoc(l.Location)
  const isNeudorf = locLabel === 'Neudorf'
  const dotColor = variant === 'green' ? 'var(--green)' : variant === 'red' ? 'var(--red)' : 'var(--border)'
  const typeLabel = typeBadge(l.TypeOfDocument ?? '', '')

  return (
    <div className="card-tap" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: dotColor }} />
      <img
        src={thumb}
        onError={e => { (e.target as HTMLImageElement).src = l.DefaultThumbnailUrl }}
        style={{ width: '44px', height: '63px', borderRadius: '6px', objectFit: 'cover', background: 'var(--tab-inactive-bg)', flexShrink: 0 }}
        alt=""
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
          {l.Title}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {typeLabel}
          {l.Author && <> · {l.Author}</>}
          {locLabel && (
            <> · <span style={{ color: isNeudorf ? 'var(--neudorf)' : 'var(--text-2)', fontWeight: isNeudorf ? 700 : 400 }}>{locLabel}</span></>
          )}
        </div>
        <div style={{ marginTop: '6px' }}>
          <StatusBadge variant={variant} label={label} pulse={variant === 'red'} />
        </div>
      </div>
    </div>
  )
}
