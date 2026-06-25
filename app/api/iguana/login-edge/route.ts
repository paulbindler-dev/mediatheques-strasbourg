// Edge Runtime — runs on Cloudflare IPs (not AWS/Vercel serverless IPs)
// Used as fallback when the normal serverless login is rate-limited by Iguana
export const runtime = 'edge'

const BASE = 'https://www.mediatheques.strasbourg.eu'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function parseCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  // Edge Runtime: getSetCookie() is available on Headers
  const cookies: string[] = typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [res.headers.get('set-cookie') ?? ''].filter(Boolean)

  for (const c of cookies) {
    const semi = c.indexOf(';')
    const kv = semi >= 0 ? c.slice(0, semi) : c
    const eq = kv.indexOf('=')
    if (eq > 0) out[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim()
  }
  return out
}

function cookieStr(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function loginFromEdge(cardNumber: string, password: string) {
  const jar: Record<string, string> = {}

  // Step 1: guest session — follow redirects manually so we capture cookies from every hop
  // (Web Fetch API with redirect:'follow' only returns cookies from the FINAL response)
  let url = `${BASE}/`
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*', ...(i > 0 ? { Cookie: cookieStr(jar) } : {}) },
    })
    Object.assign(jar, parseCookies(r))
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location')
      if (!loc) break
      url = loc.startsWith('http') ? loc : `${BASE}${loc}`
    } else break
  }

  if (!jar['InstanceCI'] || !jar['InstanceST']) {
    throw new Error('Impossible d\'établir une session avec le site médiathèque')
  }


  // Step 2: JSON login
  const loginRes = await fetch(`${BASE}/Portal/Recherche/logon.svc/logon`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Cookie: cookieStr(jar),
      Referer: `${BASE}/`,
      'User-Agent': UA,
    },
    body: new URLSearchParams({ username: cardNumber.trim(), password, rememberMe: 'true' }).toString(),
  })
  Object.assign(jar, parseCookies(loginRes))

  if (!loginRes.ok) throw new Error(`Erreur HTTP ${loginRes.status}`)

  const json = await loginRes.json() as { success: boolean; d?: string; errors?: { type?: string; msg?: string }[] }
  if (!json.success || json.d === 'Anonymous') {
    const errType = json.errors?.[0]?.type
    if (errType === 'InvalidCredentials') throw new Error('Numéro de carte ou mot de passe incorrect')
    throw new Error(json.errors?.[0]?.msg?.replace(/<[^>]+>/g, '') ?? 'Échec de connexion')
  }

  // Step 3: activate patron session
  const accRes = await fetch(`${BASE}/iguana/www.main.cls?surl=MonStrasbourg%2FMonCompte%2FMesPrets`, {
    redirect: 'manual',
    headers: { Cookie: cookieStr(jar), 'User-Agent': UA, Accept: 'text/html,*/*', Referer: `${BASE}/` },
  })
  Object.assign(jar, parseCookies(accRes))

  let ci = jar['InstanceCI'] ?? ''
  let st = jar['InstanceST'] ?? ''
  if (ci.startsWith('CUSB=')) ci = ci.slice(5)
  if (st.startsWith('CUSB=')) st = st.slice(5)
  if (!ci || !st) throw new Error('Session établie mais cookies Iguana non reçus')

  const extraJar: Record<string, string> = {}
  for (const [k, v] of Object.entries(jar)) {
    if (k !== 'InstanceCI' && k !== 'InstanceST') extraJar[k] = v
  }

  return { ci, st, extra: JSON.stringify(extraJar) }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { card?: string; password?: string }
    const card = (body.card ?? '').trim()
    const password = (body.password ?? '').trim()
    if (!card || !password) {
      return Response.json({ error: 'Carte et mot de passe requis' }, { status: 400 })
    }
    const result = await loginFromEdge(card, password)
    return Response.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return Response.json({ error: msg }, { status: 400 })
  }
}
