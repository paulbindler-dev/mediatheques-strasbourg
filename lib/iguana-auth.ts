// Direct login via the médiathèque's own form endpoint (logon.svc/logon)
// Uses library card number + password — no OIDC/MonStrasbourg needed
const BASE = 'https://www.mediatheques.strasbourg.eu'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function parseCookies(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  const lines: string[] = typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [headers.get('set-cookie') || ''].filter(Boolean)

  for (const l of lines) {
    const semi = l.indexOf(';')
    const kv = semi >= 0 ? l.slice(0, semi) : l
    const eq = kv.indexOf('=')
    if (eq > 0) {
      out[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim()
    }
  }
  return out
}

function cookieStr(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

export async function loginAndGetCookies(
  cardNumber: string,
  password: string,
): Promise<{ ci: string; st: string; extra: string }> {
  const jar: Record<string, string> = {}

  // Step 1: Visit homepage to establish a guest session (InstanceCI, InstanceST, _syrSessGuid)
  const r0 = await fetch(`${BASE}/`, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
  })
  Object.assign(jar, parseCookies(r0.headers))

  if (!jar['InstanceCI'] || !jar['InstanceST']) {
    throw new Error('Impossible d\'établir une session avec le site médiathèque')
  }

  // Step 2: POST library card + password (JSON, `login` field — finds patron account in Iguana)
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

  Object.assign(jar, parseCookies(loginRes.headers))

  if (!loginRes.ok) {
    throw new Error(`Erreur HTTP ${loginRes.status} lors de la connexion`)
  }

  const json = await loginRes.json() as { success: boolean; d?: string; errors?: { msg?: string; type?: string }[] }

  if (!json.success || json.d === 'Anonymous') {
    const errType = json.errors?.[0]?.type
    if (errType === 'InvalidCredentials') {
      throw new Error('Numéro de carte ou mot de passe incorrect')
    }
    const errMsg = json.errors?.[0]?.msg?.replace(/<[^>]+>/g, '') ?? 'Échec de connexion'
    throw new Error(errMsg)
  }

  // Step 3: Fetch the account page to fully activate the patron session
  const accRes = await fetch(`${BASE}/iguana/www.main.cls?surl=MonStrasbourg%2FMonCompte%2FMesPrets`, {
    redirect: 'manual',
    headers: {
      Cookie: cookieStr(jar),
      'User-Agent': UA,
      Accept: 'text/html,*/*',
      Referer: `${BASE}/`,
    },
  })
  Object.assign(jar, parseCookies(accRes.headers))

  let ci = jar['InstanceCI'] || ''
  let st = jar['InstanceST'] || ''
  if (ci.startsWith('CUSB=')) ci = ci.slice(5)
  if (st.startsWith('CUSB=')) st = st.slice(5)

  if (!ci || !st) {
    throw new Error('Session établie mais cookies Iguana non reçus')
  }

  // Serialize extra session cookies (_syrSessGuid etc.) for API calls
  const extraJar: Record<string, string> = {}
  for (const [k, v] of Object.entries(jar)) {
    if (k !== 'InstanceCI' && k !== 'InstanceST') extraJar[k] = v
  }

  return { ci, st, extra: JSON.stringify(extraJar) }
}
