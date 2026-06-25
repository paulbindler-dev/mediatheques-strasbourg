import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getIguanaCookiesForUser } from '@/lib/get-iguana-cookies'
import { fetchBookings, fetchLoans, parseIguanaDate, getDaysUntil } from '@/lib/iguana'
import { fetchHoldings } from '@/lib/iguana-holdings'
import { sendPush, type PushPayload } from '@/lib/push'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data: sessions } = await sb
    .from('iguana_sessions')
    .select('user_id')

  if (!sessions?.length) return NextResponse.json({ processed: 0, notified: 0 })

  let notified = 0

  for (const session of sessions) {
    try {
      const cookies = await getIguanaCookiesForUser(session.user_id)
      if (!cookies) continue

      const [bookings, loans] = await Promise.all([
        fetchBookings(cookies),
        fetchLoans(cookies),
      ])

      // Load previous availability states from DB
      const { data: prevRows } = await sb
        .from('booking_states')
        .select('booking_id, is_available')
        .eq('user_id', session.user_id)

      const prevMap = new Map<string, boolean>(
        prevRows?.map(r => [r.booking_id as string, r.is_available as boolean]) ?? []
      )
      // On the very first run for this user (empty DB), seed states without notifying
      const isFirstRun = (prevRows?.length ?? 0) === 0 && bookings.length > 0

      const messages: PushPayload[] = []

      // ── Bookings ──────────────────────────────────────────────────────────
      for (const b of bookings) {
        const wasAvailable = prevMap.get(b.Id) ?? false
        const justBecameAvailable = !isFirstRun && !wasAvailable && b.IsAvailable

        if (justBecameAvailable) {
          // Priority notification: fires exactly once when reservation becomes available
          messages.push({
            title: '📗 Réservation disponible !',
            body: `${b.Title} est prêt à récupérer — ${b.LocationLabel}`,
            url: '/compte',
          })
        } else if (b.IsAvailable) {
          // Expiry reminders — only if we didn't just fire the "disponible" alert
          const until = parseIguanaDate(b.AvailableUntilDate)
          if (until) {
            const days = getDaysUntil(until)
            if (days === 0) {
              messages.push({ title: '⚠️ Dernier jour !', body: `${b.Title} — à récupérer aujourd'hui à ${b.LocationLabel}`, url: '/compte' })
            } else if (days === 1) {
              messages.push({ title: '⏰ À récupérer demain', body: `${b.Title} — ${b.LocationLabel}`, url: '/compte' })
            }
          }
        }
      }

      // ── Loans ─────────────────────────────────────────────────────────────
      for (const l of loans) {
        const due = parseIguanaDate(l.WhenBack)
        if (!due) continue
        const days = getDaysUntil(due)
        if (days === 2) {
          messages.push({ title: '📅 À rendre bientôt', body: `${l.Title} — dans 2 jours`, url: '/compte' })
        } else if (days < 0) {
          messages.push({ title: '⚠️ En retard', body: `${l.Title} — à rendre dès que possible`, url: '/compte' })
        }
      }

      // ── Persist new states ────────────────────────────────────────────────
      if (bookings.length > 0) {
        await sb.from('booking_states').upsert(
          bookings.map(b => ({
            user_id: session.user_id,
            booking_id: b.Id,
            is_available: b.IsAvailable,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'user_id,booking_id' }
        )

        // Remove stale entries for cancelled/expired reservations
        const currentIds = new Set(bookings.map(b => b.Id))
        const staleIds = (prevRows ?? [])
          .filter(r => !currentIds.has(r.booking_id as string))
          .map(r => r.booking_id as string)
        if (staleIds.length > 0) {
          await sb.from('booking_states')
            .delete()
            .eq('user_id', session.user_id)
            .in('booking_id', staleIds)
        }
      }

      // ── Watched items — notify once when available, then remove ───────────
      const { data: watchedRows } = await sb
        .from('watched_items')
        .select('rsc_id, docbase, title')
        .eq('user_id', session.user_id)

      if (watchedRows?.length) {
        const toDelete: string[] = []

        await Promise.all(
          watchedRows.map(async (w) => {
            try {
              const result = await fetchHoldings(cookies, w.rsc_id as string, (w.docbase as string) ?? 'IGUANA_2')
              if (result?.available) {
                messages.push({
                  title: '🔔 Disponible maintenant !',
                  body: w.title as string,
                  url: '/envies',
                })
                toDelete.push(w.rsc_id as string)
              }
            } catch { /* ignore individual failures */ }
          })
        )

        if (toDelete.length > 0) {
          await sb.from('watched_items')
            .delete()
            .eq('user_id', session.user_id)
            .in('rsc_id', toDelete)
        }
      }

      // ── Send push notifications ───────────────────────────────────────────
      if (!messages.length) continue

      const { data: subs } = await sb
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth_key')
        .eq('user_id', session.user_id)

      if (!subs?.length) continue

      for (const msg of messages) {
        for (const sub of subs) {
          try {
            await sendPush(sub.endpoint, sub.p256dh, sub.auth_key, msg)
            notified++
          } catch (e: unknown) {
            if (typeof e === 'object' && e !== null && 'statusCode' in e && (e as { statusCode: number }).statusCode === 410) {
              await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
          }
        }
      }
    } catch (e) {
      console.error(`Cron failed for user ${session.user_id}:`, e)
    }
  }

  return NextResponse.json({ processed: sessions.length, notified })
}
