import { NextResponse } from 'next/server'
import { fetchLoans } from '@/lib/iguana'
import { getIguanaCookies, forceRefreshIguanaSession } from '@/lib/get-iguana-cookies'

function isAuthError(e: unknown): boolean {
  const msg = String(e).toLowerCase()
  return msg.includes('autorisation') || msg.includes('success=false') || msg.includes('http 401') || msg.includes('http 403')
}

export async function GET() {
  const cookies = await getIguanaCookies()
  if (!cookies) return NextResponse.json({ error: 'No session' }, { status: 401 })

  try {
    const loans = await fetchLoans(cookies)
    return NextResponse.json(loans)
  } catch (e) {
    if (!isAuthError(e)) {
      return NextResponse.json({ error: String(e) }, { status: 502 })
    }

    // Auth error: force re-login and retry once
    try {
      const fresh = await forceRefreshIguanaSession()
      if (!fresh) return NextResponse.json({ error: 'Session expirée' }, { status: 401 })
      const loans = await fetchLoans(fresh)
      return NextResponse.json(loans)
    } catch (e2) {
      return NextResponse.json({ error: String(e2), needsReconnect: true }, { status: 502 })
    }
  }
}
