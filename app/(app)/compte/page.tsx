'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import BookingCard from '@/components/BookingCard'
import LoanCard from '@/components/LoanCard'
import { sortBookings, type IguanaBooking, type IguanaLoan } from '@/lib/iguana'

type Tab = 'reservations' | 'prets'

export default function ComptePage() {
  const [tab, setTab] = useState<Tab>('reservations')
  const [bookings, setBookings] = useState<IguanaBooking[]>([])
  const [loans, setLoans] = useState<IguanaLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [noSession, setNoSession] = useState(false)
  const [userName, setUserName] = useState('Paul')
  const router = useRouter()

  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getUser().then(({ data }: { data: { user: { email?: string | null } | null } }) => {
      if (data.user?.email) {
        setUserName(data.user.email.split('@')[0])
      }
    })

    Promise.all([
      fetch('/api/iguana/bookings').then(r => r.json()),
      fetch('/api/iguana/loans').then(r => r.json()),
    ]).then(([b, l]) => {
      if (b?.error === 'No session') { setNoSession(true); setLoading(false); return }
      setBookings(Array.isArray(b) ? sortBookings(b) : [])
      setLoans(Array.isArray(l) ? l : [])
      setLoading(false)
    }).catch(() => setLoading(false))

    // Request push permission once data loads
    if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async reg => {
        if (Notification.permission !== 'default') return
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') return
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        })
      }).catch(() => {})
    }
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const dateLabel = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)

  if (noSession) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '24px', gap: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px' }}>📚</div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.3px' }}>
          Connecte ta médiathèque
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', maxWidth: '280px', lineHeight: 1.7 }}>
          Configure ta session une seule fois pour voir tes prêts et réservations.
        </p>
        <button
          onClick={() => router.push('/compte/onboarding')}
          style={{ padding: '12px 28px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
        >
          Configurer
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'var(--surface)', padding: '20px 18px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-2)', marginBottom: '2px' }}>
          {dateLabel}
        </div>
        <div style={{ fontSize: '21px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.5px' }}>
          Bonjour, {userName}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
          {([
            ['reservations', `Réservations (${bookings.length})`],
            ['prets', `Prêts (${loans.length})`],
          ] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontSize: '10.5px', fontWeight: 600,
              padding: '5px 14px',
              borderRadius: '20px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              background: tab === t ? 'var(--navy)' : '#EDEEF0',
              color: tab === t ? 'white' : 'var(--text-2)',
              transition: 'background 0.12s, color 0.12s',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {loading && (
          <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '48px', fontFamily: 'DM Mono, monospace' }}>
            Chargement…
          </div>
        )}
        {!loading && tab === 'reservations' && bookings.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '48px' }}>
            Aucune réservation en cours
          </div>
        )}
        {!loading && tab === 'prets' && loans.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '48px' }}>
            Aucun prêt en cours
          </div>
        )}
        {!loading && tab === 'reservations' && bookings.map(b => (
          <BookingCard key={b.Id} b={b} />
        ))}
        {!loading && tab === 'prets' && loans.map((l, i) => (
          <LoanCard key={l.HoldingId || i} l={l} />
        ))}
      </div>
    </div>
  )
}
