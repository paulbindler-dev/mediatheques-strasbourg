const BASE = 'https://www.mediatheques.strasbourg.eu'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export type HoldingResult = {
  available: boolean
  availableCount: number
  totalCount: number
  dueDate: string | null
  locations: { site: string; available: boolean; whenBack: string | null }[]
}

type IguanaHolding = { IsAvailable: boolean; WhenBack: string | null; Site: string; Statut: string }
type GetHoldingsResponse = {
  success: boolean
  errors?: { msg: string }[]
  d?: { Holdings?: IguanaHolding[]; ItemHoldingsData?: { Availability: number; HoldingLabel: string | null }; [key: string]: unknown }
}

export function buildCookieHeader(cookies: { ci: string; st: string; extra?: string }): string {
  let h = `InstanceCI=CUSB=${cookies.ci}; InstanceST=CUSB=${cookies.st}`
  if (cookies.extra) {
    try {
      const jar = JSON.parse(cookies.extra) as Record<string, string>
      for (const [k, v] of Object.entries(jar)) h += `; ${k}=${v}`
    } catch { /* ignore */ }
  }
  return h
}

export async function fetchHoldings(
  cookies: { ci: string; st: string; extra?: string },
  rscId: string,
  docbase = 'IGUANA_2',
): Promise<HoldingResult | null> {
  const cookieHeader = buildCookieHeader(cookies)
  const body = { Record: { RscId: rscId, Docbase: docbase } }
  let res: Response
  try {
    res = await fetch(`${BASE}/Portal/Services/ILSClient.svc/GetHoldings`, {
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
  } catch { return null }

  if (!res.ok) return null
  const buffer = await res.arrayBuffer()
  const text = new TextDecoder('utf-8').decode(buffer)
  let json: GetHoldingsResponse
  try { json = JSON.parse(text) as GetHoldingsResponse } catch { return null }

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
