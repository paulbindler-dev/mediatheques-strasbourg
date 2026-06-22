export type IguanaBooking = {
  Id: string
  Title: string
  Author: string | null
  ThumbnailUrl: string
  DefaultThumbnailUrl: string
  TypeOfDocument: string
  IsAvailable: boolean
  AvailabilityDate: string | null
  AvailableUntilDate: string | null
  BookingDate: string
  Rank: string
  RankSort: number
  LocationLabel: string
  CanCancel: boolean
  TitleLink: string
  Cote: string
}

export type IguanaLoan = {
  Title: string
  Author: string | null
  ThumbnailUrl: string
  DefaultThumbnailUrl: string
  TypeOfDocument: string
  Location: string
  WhenBack: string | null
  State: string
  HoldingId: string
}

export type IguanaCookies = { ci: string; st: string; extra?: string }

// Iguana dates: "/Date(1781733600000+0200)/"
export function parseIguanaDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const m = raw.match(/\/Date\((\d+)/)
  return m ? new Date(parseInt(m[1])) : null
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function getDaysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000)
}

const BASE = 'https://www.mediatheques.strasbourg.eu'

async function iguanaGet(path: string, cookies: IguanaCookies) {
  const t = Date.now()
  const url = `${BASE}/Portal/Services/UserAccountService.svc/${path}?serviceCode=IGUANA_2&token=${t}&userUniqueIdentifier=&timestamp=${t}`

  // Build cookie header — _syrSessGuid links the CI/ST tokens to the backend session
  let cookieHeader = `InstanceCI=CUSB=${cookies.ci}; InstanceST=CUSB=${cookies.st}`
  if (cookies.extra) {
    try {
      const jar = JSON.parse(cookies.extra) as Record<string, string>
      if (jar['_syrSessGuid']) cookieHeader += `; _syrSessGuid=${jar['_syrSessGuid']}`
    } catch { /* ignore */ }
  }

  const res = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: `${BASE}/default/accueil-portal.aspx`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Iguana HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) {
    const errs = (json.errors || []).map((e: { msg: string }) => e.msg).join(' | ')
    throw new Error(`Iguana: success=false — ${errs || 'no detail'}`)
  }
  return json.d
}

export async function fetchLoans(cookies: IguanaCookies): Promise<IguanaLoan[]> {
  const d = await iguanaGet('ListLoans', cookies)
  return (d.Loans ?? []) as IguanaLoan[]
}

export async function fetchBookings(cookies: IguanaCookies): Promise<IguanaBooking[]> {
  const d = await iguanaGet('ListBookings', cookies)
  return (d.Bookings ?? []) as IguanaBooking[]
}

export function sortBookings(bookings: IguanaBooking[]): IguanaBooking[] {
  return [...bookings].sort((a, b) => {
    const aUrgent = a.IsAvailable && isExpiringSoon(a, 1)
    const bUrgent = b.IsAvailable && isExpiringSoon(b, 1)
    if (aUrgent && !bUrgent) return -1
    if (bUrgent && !aUrgent) return 1
    if (a.IsAvailable && !b.IsAvailable) return -1
    if (b.IsAvailable && !a.IsAvailable) return 1
    return a.RankSort - b.RankSort
  })
}

function isExpiringSoon(b: IguanaBooking, days: number): boolean {
  const d = parseIguanaDate(b.AvailableUntilDate)
  return d ? getDaysUntil(d) <= days : false
}
