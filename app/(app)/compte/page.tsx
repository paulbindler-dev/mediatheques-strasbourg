'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import BookingCard from '@/components/BookingCard'
import LoanCard from '@/components/LoanCard'
import { sortBookings, type IguanaBooking, type IguanaLoan } from '@/lib/iguana'

type Tab = 'reservations' | 'prets'

const LOADING_MSGS = ['Connexion à Malraux…', 'Vérification Neudorf…', 'Mise à jour des statuts…']

function SkeletonCard() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
      <div style={{ width: '44px', height: '63px', borderRadius: '6px', background: 'var(--border)', flexShrink: 0, animation: 'skeleton-pulse 1.4s ease-in-out infinite' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ height: '13px', borderRadius: '4px', background: 'var(--border)', width: '65%', animation: 'skeleton-pulse 1.4s ease-in-out infinite' }} />
        <div style={{ height: '11px', borderRadius: '4px', background: 'var(--border)', width: '45%', animation: 'skeleton-pulse 1.4s ease-in-out infinite 0.1s' }} />
        <div style={{ height: '18px', borderRadius: '6px', background: 'var(--border)', width: '80px', animation: 'skeleton-pulse 1.4s ease-in-out infinite 0.2s' }} />
      </div>
    </div>
  )
}

export default function ComptePage() {
  const [tab, setTab] = useState<Tab>('reservations')
  const [bookings, setBookings] = useState<IguanaBooking[]>([])
  const [loans, setLoans] = useState<IguanaLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [noSession, setNoSession] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [userName, setUserName] = useState('Paul')
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MSGS[0])
  const loadedAtRef = useRef<number>(0)
  const loadStartRef = useRef<number>(Date.now())
  const router = useRouter()

  useEffect(() => {
    if (!loading) return
    let i = 0
    const t = setInterval(() => {
      i = (i + 1) % LOADING_MSGS.length
      setLoadingMsg(LOADING_MSGS[i])
    }, 2600)
    return () => clearInterval(t)
  }, [loading])

  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getUser().then(({ data }: { data: { user: { email?: string | null } | null } }) => {
      if (data.user?.email) {
        const part = data.user.email.split('@')[0].split('.')[0]
        setUserName(part.charAt(0).toUpperCase() + part.slice(1))
      }
    })

    Promise.all([
      fetch('/api/iguana/bookings').then(r => r.json()),
      fetch('/api/iguana/loans').then(r => r.json()),
    ]).then(([b, l]) => {
      const finish = () => {
        if (b?.error === 'No session') { setNoSession(true); setLoading(false); return }
        if (b?.error) {
          setApiError(b.error)
          if (b?.needsReconnect) setNeedsReconnect(true)
          setLoading(false)
          return
        }
        setBookings(Array.isArray(b) ? sortBookings(b) : [])
        setLoans(Array.isArray(l) ? l : [])
        loadedAtRef.current = Date.now()
        setLoading(false)
      }
      const elapsed = Date.now() - loadStartRef.current
      const delay = Math.max(0, 650 - elapsed)
      if (delay > 0) { setTimeout(finish, delay) } else { finish() }
    }).catch((e) => { setApiError(String(e)); setLoading(false) })

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

  if (noSession) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '24px', gap: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px' }}>📚</div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-heading)', letterSpacing: '-0.3px' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-heading)', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif' }}>
            Bonjour {userName}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '14px', paddingBottom: '14px' }}>
          {([
            ['reservations', loading ? 'Réservations' : `Réservations (${bookings.length})`],
            ['prets', loading ? 'Prêts' : `Prêts (${loans.length})`],
          ] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontSize: '10.5px', fontWeight: 600,
              padding: '5px 14px',
              borderRadius: '20px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              background: tab === t ? 'var(--navy)' : 'var(--tab-inactive-bg)',
              color: tab === t ? 'white' : 'var(--text-2)',
              transition: 'background 0.12s, color 0.12s',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--content-bg)', minHeight: '100%' }}>
        {apiError && (
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '4px' }}>
              {needsReconnect ? 'Session expirée' : 'Erreur de connexion'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: needsReconnect ? '12px' : 0, lineHeight: 1.5 }}>
              {needsReconnect
                ? 'La session Iguana a expiré et le renouvellement automatique a échoué. Reconnecte tes identifiants.'
                : apiError}
            </div>
            {needsReconnect && (
              <button
                onClick={() => router.push('/compte/onboarding')}
                style={{
                  padding: '8px 18px', background: 'var(--navy)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Reconnecter mes identifiants →
              </button>
            )}
          </div>
        )}

        {loading && (
          <>
            <div className="group-items" style={{ background: 'var(--surface)', borderRadius: '12px', overflow: 'hidden' }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-2)', transition: 'opacity 0.3s ease' }}>
              {loadingMsg}
            </div>
          </>
        )}

        {!loading && tab === 'reservations' && bookings.length === 0 && !apiError && (
          <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '48px' }}>
            Aucune réservation en cours
          </div>
        )}

        {!loading && tab === 'prets' && loans.length === 0 && !apiError && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '48px', gap: '12px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-heading)' }}>Aucun prêt en cours</div>
            <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Vérifié à l&apos;instant</div>
          </div>
        )}

        {!loading && tab === 'reservations' && bookings.length > 0 && (
          <div className="group-items" style={{ background: 'var(--surface)', borderRadius: '12px', overflow: 'hidden' }}>
            {bookings.map((b, i) => (
              <div key={b.Id} style={{ animation: `stagger-fade-in 0.28s ease-out ${i * 55}ms both` }}>
                <BookingCard b={b} />
              </div>
            ))}
          </div>
        )}
        {!loading && tab === 'prets' && loans.length > 0 && (
          <div className="group-items" style={{ background: 'var(--surface)', borderRadius: '12px', overflow: 'hidden' }}>
            {loans.map((l, i) => (
              <div key={l.HoldingId || i} style={{ animation: `stagger-fade-in 0.28s ease-out ${i * 55}ms both` }}>
                <LoanCard l={l} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
