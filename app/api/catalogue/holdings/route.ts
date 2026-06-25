import { NextRequest, NextResponse } from 'next/server'
import { getIguanaCookies } from '@/lib/get-iguana-cookies'
import { fetchHoldings, type HoldingResult } from '@/lib/iguana-holdings'

export type { HoldingResult }

const BASE = 'https://www.mediatheques.strasbourg.eu'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function getGuestCookies(): Promise<string> {
  const r = await fetch(`${BASE}/`, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
  const setCookies: string[] = typeof (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (r.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [r.headers.get('set-cookie') ?? ''].filter(Boolean)
  return setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')
}

// Two-step warm-up: homepage first, then document page with those cookies.
// This mirrors what a real browser does and ensures the ILS session is initialized.
async function getWarmCookies(rscId: string): Promise<string> {
  const homeCookies = await getGuestCookies()
  const r = await fetch(`${BASE}/Default/doc/IGUANA_2/${rscId}/`, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', Cookie: homeCookies },
    redirect: 'follow',
  })
  const setCookies: string[] = typeof (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (r.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [r.headers.get('set-cookie') ?? ''].filter(Boolean)
  const docCookies = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')
  const merged = new Map<string, string>()
  for (const pair of homeCookies.split('; ')) {
    const eq = pair.indexOf('='); if (eq > 0) merged.set(pair.slice(0, eq), pair.slice(eq + 1))
  }
  for (const pair of docCookies.split('; ')) {
    const eq = pair.indexOf('='); if (eq > 0) merged.set(pair.slice(0, eq), pair.slice(eq + 1))
  }
  const parts: string[] = []
  merged.forEach((v, k) => parts.push(`${k}=${v}`))
  return parts.join('; ')
}

// For the anonymous warm-cookie fallback path (raw cookie string, not patron session object)
async function fetchHoldingsRaw(cookieHeader: string, rscId: string, docbase: string): Promise<HoldingResult | null> {
  const body = { Record: { RscId: rscId, Docbase: docbase } }
  const res = await fetch(`${BASE}/Portal/Services/ILSClient.svc/GetHoldings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Cookie: cookieHeader,
      Referer: `${BASE}/Default/doc/IGUANA_2/${rscId}/`,
      'User-Agent': UA,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const buffer = await res.arrayBuffer()
  const text = new TextDecoder('utf-8').decode(buffer)
  type R = { success: boolean; d?: { Holdings?: { IsAvailable: boolean; WhenBack: string | null; Site: string }[]; ItemHoldingsData?: { Availability: number; HoldingLabel: string | null } } }
  let json: R
  try { json = JSON.parse(text) as R } catch { return null }
  if (!json.success || !json.d) return null
  const holdings = json.d.Holdings ?? []
  const itemData = json.d.ItemHoldingsData
  if (holdings.length === 0 && !itemData) return null
  const availableCount = itemData?.Availability ?? holdings.filter(h => h.IsAvailable).length
  const available = availableCount > 0
  const loanedDates = holdings.filter(h => !h.IsAvailable && h.WhenBack).map(h => h.WhenBack as string)
  const dueDate = available ? null : (loanedDates[0] ?? itemData?.HoldingLabel ?? null)
  const locations = holdings.map(h => ({ site: h.Site, available: h.IsAvailable, whenBack: h.WhenBack ?? null }))
  return { available, availableCount, totalCount: holdings.length, dueDate, locations }
}

export async function GET(req: NextRequest) {
  const rscId = req.nextUrl.searchParams.get('rscId')
  if (!rscId) return NextResponse.json({ error: 'rscId required' }, { status: 400 })
  const docbase = req.nextUrl.searchParams.get('docbase') ?? 'IGUANA_2'

  try {
    // Start warm-up in background immediately (used as fallback if patron fails)
    const warmPromise = getWarmCookies(rscId)

    // Attempt 1: patron session — fast path (1 DB read + 1 GetHoldings), no HTTP warm-up needed
    const patronCookies = await getIguanaCookies()
    if (patronCookies) {
      const result1 = await fetchHoldings(patronCookies, rscId, docbase)
      if (result1) return NextResponse.json(result1 satisfies HoldingResult, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Attempt 2: warm anonymous session (fallback — warm-up was already running in parallel)
    const warmCookies = await warmPromise
    const result2 = await fetchHoldingsRaw(warmCookies, rscId, docbase)
    if (result2) return NextResponse.json(result2 satisfies HoldingResult, { headers: { 'Cache-Control': 'no-store' } })

    return NextResponse.json({ error: 'availability unavailable', available: null }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: String(e), available: null }, { status: 200 })
  }
}
