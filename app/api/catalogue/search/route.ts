import { NextRequest, NextResponse } from 'next/server'
import { LIBRARIES } from '@/lib/wishlists'

const BASE = 'https://www.mediatheques.strasbourg.eu'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const FACET_TYPE     = 83   // TypeOfDocument_exact
const FACET_SUBJECT  = 98   // SubjectTopic_exact
const FACET_LOCATION = 93   // LocationSite_exact

export type CatalogueItem = {
  rscId: string
  title: string
  type: string
  subject: string
  publisher: string
  year: string
  desc: string
  url: string
  ean: string | null
  thumbnail?: string        // cover image URL when available
  location?: string
  available?: boolean       // true = copy on shelf; false = all loaned; undefined = not checked
  dueDate?: string | null   // formatted return date when available === false
}

async function getGuestCookies(): Promise<string> {
  const r = await fetch(`${BASE}/`, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
  })
  const setCookie: string[] = typeof (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (r.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [r.headers.get('set-cookie') ?? ''].filter(Boolean)
  return setCookie.map(c => c.split(';')[0]).filter(Boolean).join('; ')
}

async function searchIguana(
  cookieHeader: string,
  queryString: string,
  type: string,
  subject: string,
  location: string,
  page: number,
  size: number,
): Promise<{ total: number; results: CatalogueItem[] }> {
  const filter: Record<string, string> = {}
  if (type)     filter[`_${FACET_TYPE}`]     = type
  if (subject)  filter[`_${FACET_SUBJECT}`]  = subject
  if (location) filter[`_${FACET_LOCATION}`] = location

  const query: Record<string, unknown> = {
    QueryString: queryString || '*:*',
    Page: page,
    ResultSize: size,
    ScenarioCode: 'DEFAULT',
  }
  if (Object.keys(filter).length > 0) query.FacetFilter = JSON.stringify(filter)

  const res = await fetch(`${BASE}/Portal/Recherche/Search.svc/Search?SC=DEFAULT`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Cookie: cookieHeader,
      Referer: `${BASE}/search.aspx?SC=DEFAULT`,
      'User-Agent': UA,
    },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  })

  const json = await res.json() as {
    success: boolean
    errors?: { msg: string }[]
    d?: {
      SearchInfo?: { NBResults?: number }
      HtmlResult?: string
      Results?: {
        FriendlyUrl?: string
        Resource?: Record<string, unknown>
      }[]
    }
  }

  if (!json.success) throw new Error(json.errors?.[0]?.msg ?? 'Recherche impossible')

  const d = json.d ?? {}
  const total = d.SearchInfo?.NBResults ?? 0

  // Extract Syracuse cover URLs from HtmlResult: each notice block is keyed by rscId
  const coverMap: Record<string, string> = {}
  const htmlResult: string = typeof d.HtmlResult === 'string' ? d.HtmlResult : ''
  const blocks = htmlResult.split(/data-id="/)
  for (const block of blocks.slice(1)) {
    const rscIdMatch = block.match(/^(\d+)"/)
    if (!rscIdMatch) continue
    const rscId = rscIdMatch[1]
    const chunk = block.split('data-id="')[0] ?? block.slice(0, 2000)
    const coverMatch = chunk.match(/https:\/\/covers\.syracuse\.cloud\/Cover\/[^\s"'<>]+/)
    if (coverMatch && !coverMap[rscId]) coverMap[rscId] = coverMatch[0]
  }

  const results: CatalogueItem[] = (d.Results ?? []).map(r => {
    const resource = (r.Resource ?? {}) as Record<string, unknown>
    const rscId = String(resource.RscId ?? '')
    return {
      rscId,
      title: String(resource.Ttl ?? ''),
      type: String(resource.Type ?? ''),
      subject: String(resource.Subj ?? ''),
      publisher: String(resource.Pbls ?? ''),
      year: String(resource.Dt ?? ''),
      desc: String(resource.Desc ?? ''),
      url: r.FriendlyUrl ?? '',
      ean: typeof resource.Id === 'string' && resource.Id.startsWith('ean:') ? resource.Id.slice(4) : null,
      thumbnail: coverMap[rscId] ? `/api/cover?url=${encodeURIComponent(coverMap[rscId])}` : undefined,
    }
  }).filter(r => r.title)

  return { total, results }
}

export async function GET(req: NextRequest) {
  const q        = req.nextUrl.searchParams.get('q') ?? ''
  const type     = req.nextUrl.searchParams.get('type') ?? ''
  const subject  = req.nextUrl.searchParams.get('subject') ?? ''
  const query    = req.nextUrl.searchParams.get('query') ?? ''   // extra keyword (e.g. "blu-ray")
  const location = req.nextUrl.searchParams.get('location') ?? '' // library name or "malraux_neudorf"
  const page     = parseInt(req.nextUrl.searchParams.get('page') ?? '0')
  const size     = Math.min(parseInt(req.nextUrl.searchParams.get('size') ?? '20'), 50)

  // Combine q and query (for blu-ray: type=Vidéo, query=blu-ray)
  const queryString = [q.trim(), query.trim()].filter(Boolean).join(' ') || '*:*'

  try {
    const cookieHeader = await getGuestCookies()

    // "malraux_neudorf" = parallel calls to both, merged & deduplicated
    if (location === 'malraux_neudorf') {
      const [m, n] = await Promise.all([
        searchIguana(cookieHeader, queryString, type, subject, LIBRARIES.malraux, 0, 50),
        searchIguana(cookieHeader, queryString, type, subject, LIBRARIES.neudorf, 0, 50),
      ])
      const seen = new Set<string>()
      const merged: CatalogueItem[] = []
      for (const r of [...m.results, ...n.results]) {
        if (!seen.has(r.rscId)) { seen.add(r.rscId); merged.push(r) }
      }
      const sliced = merged.slice(page * size, (page + 1) * size)
      return NextResponse.json({ total: m.total + n.total, page, results: sliced }, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      })
    }

    const { total, results } = await searchIguana(cookieHeader, queryString, type, subject, location, page, size)
    return NextResponse.json({ total, page, results }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
