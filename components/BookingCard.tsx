import StatusBadge from './StatusBadge'
import { parseIguanaDate, formatDate, getDaysUntil, type IguanaBooking } from '@/lib/iguana'

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
  const isNeudorf = (b.LocationLabel ?? '').toLowerCase().includes('neudorf')

  return (
    <a
      href={b.TitleLink || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', textDecoration: 'none' }}
    >
      <img
        src={thumb}
        onError={e => { (e.target as HTMLImageElement).src = b.DefaultThumbnailUrl }}
        style={{ width: '44px', height: '63px', borderRadius: '6px', objectFit: 'cover', background: 'var(--bg)', flexShrink: 0 }}
        alt=""
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
          {b.Title}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '2px' }}>
          {b.TypeOfDocument}
          {b.LocationLabel && (
            <> · <span style={isNeudorf ? { color: 'var(--neudorf)', fontWeight: 600 } : undefined}>
              {b.LocationLabel}
            </span></>
          )}
        </div>
        <div style={{ marginTop: '7px' }}>
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
