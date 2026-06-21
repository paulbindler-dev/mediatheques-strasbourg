import { NextRequest, NextResponse } from 'next/server'
import { getIguanaCookies, forceRefreshIguanaSession } from '@/lib/get-iguana-cookies'

const BASE = 'https://www.mediatheques.strasbourg.eu'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function getGuestCookies(): Promise<string> {
  const r = await fetch(`${BASE}/`, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
  const setCookie: string[] = typeof (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (r.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [r.headers.get('set-cookie') ?? ''].filter(Boolean)
  return setCookie.map(c => c.split(';')[0]).filter(Boolean).join('; ')
}

type IguanaHolding = {
  IsAvailable: boolean
  Statut: string
  WhenBack: string | null
  Site: string
  Localisation: string
  RecordId: string
  HoldingId: string
}

type GetHoldingsResponse = {
  success: boolean
  errors?: { msg: string }[]
  d?: {
    Holdings?: IguanaHolding[]
    ItemHoldingsData?: {
      Availability: number
      HoldingLabel: string | null
      RecordId: string
    }
  }
}

export type HoldingResult = {
  available: boolean
  availableCount: number
  totalCount: number
  dueDate: string | null
  locations: { site: string; available: boolean; whenBack: string | null }[]
}

function buildCookieHeader(cookies: { ci: string; st: string; extra?: string }): string {
  let h = `InstanceCI=CUSB=${cookies.ci}; InstanceST=CUSB=${cookies.st}`
  if (cookies.extra) {
    try {
      const jar = JSON.parse(cookies.extra) as Record<string, string>
      if (jar['_syrSessGuid']) h += `; _syrSessGuid=${jar['_syrSessGuid']}`
    } catch { /* ignore */ }
  }
  return h
}

async function fetchGetHoldings(cookieHeader: string, rscId: string): Promise<GetHoldingsResponse | null> {
  const res = await fetch(`${BASE}/Portal/Services/ILSClient.svc/GetHoldings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/plain, */*',
      Cookie: cookieHeader,
      Referer: `${BASE}/Default/doc/IGUANA_2/${rscId}/`,
      'User-Agent': UA,
      Origin: BASE,
    },
    body: JSON.stringify({ id: `_${rscId}`, BaseName: 'IGUANA_2', lang: 'fr' }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json() as Promise<GetHoldingsResponse>
}

function parseHoldingsResult(json: GetHoldingsResponse): HoldingResult | null {
  if (!json.success || !json.d) return null
  const holdings = json.d.Holdings ?? []
  const itemData = json.d.ItemHoldingsData
  const availableCount = itemData?.Availability ?? holdings.filter(h => h.IsAvailable).length
  const available = availableCount > 0
  const loanedWithDate = holdings.filter(h => !h.IsAvailable && h.WhenBack).map(h => h.WhenBack as string)
  const dueDate = available ? null : (loanedWithDate[0] ?? itemData?.HoldingLabel ?? null)
  const locations = holdings.map(h => ({ site: h.Site, available: h.IsAvailable, whenBack: h.WhenBack ?? null }))
  return { available, availableCount, totalCount: holdings.length, dueDate, locations }
}

export async function GET(req: NextRequest) {
  const rscId = req.nextUrl.searchParams.get('rscId')
  if (!rscId) return NextResponse.json({ error: 'rscId required' }, { status: 400 })

  try {
    const iguanaCookies = await getIguanaCookies()
    console.log(`[holdings] rscId=${rscId} iguanaCookies=${iguanaCookies ? 'ok ci=' + iguanaCookies.ci.slice(0,8) : 'null'}`)
    const cookieHeader = iguanaCookies ? buildCookieHeader(iguanaCookies) : await getGuestCookies()

    let json = await fetchGetHoldings(cookieHeader, rscId)
    let result = json ? parseHoldingsResult(json) : null
    console.log(`[holdings] first attempt success=${json?.success} result=${result ? 'ok available=' + result.available : 'null'}`)

    // Iguana returned success:false (session expired) — force refresh and retry once
    if (!result && iguanaCookies) {
      console.log('[holdings] retrying with forceRefresh...')
      const fresh = await forceRefreshIguanaSession({ bypassBackoff: true })
      if (fresh) {
        json = await fetchGetHoldings(buildCookieHeader(fresh), rscId)
        result = json ? parseHoldingsResult(json) : null
        console.log(`[holdings] retry result=${result ? 'ok available=' + result.available : 'null'}`)
      }
    }

    if (!result) return NextResponse.json({ error: 'Iguana error', available: null }, { status: 200 })

    return NextResponse.json(result satisfies HoldingResult, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('[holdings] caught:', String(e))
    return NextResponse.json({ error: String(e), available: null }, { status: 200 })
  }
}
