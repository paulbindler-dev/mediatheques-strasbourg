import StatusBadge from './StatusBadge'
import { parseIguanaDate, formatDate, getDaysUntil, type IguanaBooking } from '@/lib/iguana'
import { typeBadge } from './ViewModeToggle'

function shortLoc(loc: string | undefined | null): string {
  const l = (loc ?? '').toLowerCase()
  if (l.includes('neudorf')) return 'Neudorf'
  if (l.includes('malraux')) return 'Malraux'
  return loc ?? ''
}

export default function BookingCard({ b }: { b: IguanaBooking }) {
  const until = parseIguanaDate(b.AvailableUntilDate)
  const daysLeft = until ? getDaysUntil(until) : null

  let variant: 'red' | 'green' | 'gray' = 'gray'
  let badgeLabel = b.Rank ? `Rang ${b.Rank}` : 'En attente'

  if (b.IsAvailable) {
    const urgent = daysLeft !== null && daysLeft <= 0
    variant = urgent ? 'red' : 'green'
    badgeLabel = urgent ? 'Expire aujourd\'hui' : 'À récupérer'
  }

  const showUntil = b.IsAvailable && until && daysLeft !== null && daysLeft > 0
  const thumb = b.ThumbnailUrl || b.DefaultThumbnailUrl
  const locLabel = shortLoc(b.LocationLabel)
  const isNeudorf = locLabel === 'Neudorf'
  const dotColor = variant === 'green' ? 'var(--green)' : variant === 'red' ? 'var(--red)' : 'var(--border)'
  const typeLabel = typeBadge(b.TypeOfDocument ?? '', '')

  return (
    <a
      href={b.TitleLink || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', textDecoration: 'none' }}
    >
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: dotColor }} />
      <img
        src={thumb}
        onError={e => { (e.target as HTMLImageElement).src = b.DefaultThumbnailUrl }}
        style={{ width: '44px', height: '63px', borderRadius: '6px', objectFit: 'cover', background: 'var(--tab-inactive-bg)', flexShrink: 0 }}
        alt=""
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
          {b.Title}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {typeLabel}
          {b.Author && <> · {b.Author}</>}
          {locLabel && (
            <> · <span style={{ color: isNeudorf ? 'var(--neudorf)' : 'var(--text-2)', fontWeight: isNeudorf ? 700 : 400 }}>{locLabel}</span></>
          )}
        </div>
        <div style={{ marginTop: '6px' }}>
          <StatusBadge variant={variant} label={badgeLabel} />
        </div>
        {showUntil && (
          <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: 500, marginTop: '4px' }}>
            Jusqu&apos;au {formatDate(until!)}
          </div>
        )}
      </div>
    </a>
  )
}
