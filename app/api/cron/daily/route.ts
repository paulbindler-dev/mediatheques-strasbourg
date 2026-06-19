import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import { fetchBookings, fetchLoans, parseIguanaDate, getDaysUntil } from '@/lib/iguana'
import { sendPush, type PushPayload } from '@/lib/push'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data: sessions } = await sb
    .from('iguana_sessions')
    .select('user_id, instance_ci_enc, instance_st_enc')

  if (!sessions?.length) return NextResponse.json({ processed: 0, notified: 0 })

  let notified = 0

  for (const session of sessions) {
    try {
      const cookies = {
        ci: decrypt(session.instance_ci_enc),
        st: decrypt(session.instance_st_enc),
      }

      const [bookings, loans] = await Promise.all([
        fetchBookings(cookies),
        fetchLoans(cookies),
      ])

      const messages: PushPayload[] = []

      for (const b of bookings) {
        if (!b.IsAvailable) continue
        const until = parseIguanaDate(b.AvailableUntilDate)
        if (!until) continue
        const days = getDaysUntil(until)
        if (days < 0) continue
        if (days === 0) {
          messages.push({ title: '⚠️ Dernier jour !', body: `${b.Title} — à récupérer aujourd'hui à ${b.LocationLabel}`, url: '/compte' })
        } else if (days === 1) {
          messages.push({ title: '📗 À récupérer demain', body: `${b.Title} — ${b.LocationLabel}`, url: '/compte' })
        }
      }

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
            // Remove expired subscription
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
