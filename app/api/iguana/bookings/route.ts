import { NextResponse } from 'next/server'
import { fetchBookings } from '@/lib/iguana'
import { getIguanaCookies } from '@/lib/get-iguana-cookies'

export async function GET() {
  const cookies = await getIguanaCookies()
  if (!cookies) return NextResponse.json({ error: 'No session' }, { status: 401 })
  try {
    const bookings = await fetchBookings(cookies)
    return NextResponse.json(bookings)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
