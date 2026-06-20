// MonStrasbourg OIDC login flow — auto-obtain InstanceCI/InstanceST cookies
const CONNEXION_BASE = 'https://connexion.strasbourg.eu'
const MEDIATHEQUE_BASE = 'https://www.mediatheques.strasbourg.eu'
const OIDC_CLIENT_ID = 'bff1584d-df65-4994-8f23-f6d6b5ac0a22'
const OIDC_REDIRECT_URI = `${MEDIATHEQUE_BASE}/monstrasbourg/callback`
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function randHex(n: number): string {
  const arr = new Uint8Array(n)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

// Parse Set-Cookie headers into a name→value map
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

// Extract first <form> action and hidden inputs from HTML
function extractForm(html: string): { action: string; data: URLSearchParams } | null {
  const fa = html.match(/<form[^>]+action\s*=\s*["']([^"']+)["']/i)
  if (!fa) return null

  const action = fa[1].replace(/&amp;/g, '&')
  const data = new URLSearchParams()

  const re = /<input([^>]*?)(?:\/)?>/ as RegExp
  const globalRe = /<input([^>]*?)(?:\/)?>/gi
  let m: RegExpExecArray | null
  while ((m = globalRe.exec(html)) !== null) {
    const attrs = m[1]
    if (!/type\s*=\s*["']?hidden["']?/i.test(attrs)) continue
    const nm = attrs.match(/name\s*=\s*["']([^"']+)["']/i)
    const vm = attrs.match(/value\s*=\s*["']([^"']*)["']/i)
    if (nm) data.set(nm[1], vm ? vm[1] : '')
  }
  void re

  const fullAction = action.startsWith('http') ? action : CONNEXION_BASE + action
  return { action: fullAction, data }
}

// POST a form to the callback URL and collect cookies
async function postCallback(
  html: string,
  mJar: Record<string, string>,
  cxJar: Record<string, string>,
): Promise<void> {
  const form = extractForm(html)
  if (!form) return

  const cbUrl = form.action.startsWith('http')
    ? form.action
    : MEDIATHEQUE_BASE + form.action

  const r = await fetch(cbUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieStr(mJar),
      'User-Agent': UA,
      Origin: CONNEXION_BASE,
      Referer: cbUrl,
    },
    body: form.data.toString(),
  })
  Object.assign(mJar, parseCookies(r.headers))

  if (r.status === 301 || r.status === 302) {
    let loc = r.headers.get('location') || ''
    if (loc && !loc.startsWith('http')) loc = MEDIATHEQUE_BASE + loc
    if (loc) await followChain(loc, cxJar, mJar)
  }
}

// Follow redirect chain, collecting cookies along the way
async function followChain(
  startUrl: string,
  cxJar: Record<string, string>,
  mJar: Record<string, string>,
): Promise<void> {
  let url = startUrl
  for (let i = 0; i < 15 && url; i++) {
    const isM = url.includes('mediatheques.strasbourg.eu')
    const jar = isM ? mJar : cxJar
    const base = isM ? MEDIATHEQUE_BASE : CONNEXION_BASE

    const r = await fetch(url, {
      redirect: 'manual',
      headers: { Cookie: cookieStr(jar), 'User-Agent': UA },
    })
    Object.assign(jar, parseCookies(r.headers))

    if (r.status === 200) {
      // Could be form_post page with auto-submit form targeting the callback
      const html = await r.text()
      if (html.includes('callback') || html.includes('form')) {
        await postCallback(html, mJar, cxJar)
      }
      break
    } else if (r.status === 301 || r.status === 302) {
      let loc = r.headers.get('location') || ''
      if (loc && !loc.startsWith('http')) loc = base + loc
      url = loc
    } else {
      break
    }
  }
}

export async function loginAndGetCookies(
  email: string,
  password: string,
): Promise<{ ci: string; st: string }> {
  const state = randHex(16)
  const nonce = randHex(32)

  const authUrl =
    `${CONNEXION_BASE}/idp/oidc/authorize?` +
    new URLSearchParams({
      response_mode: 'form_post',
      response_type: 'code',
      client_id: OIDC_CLIENT_ID,
      redirect_uri: OIDC_REDIRECT_URI,
      scope: 'openid email profile',
      state,
      nonce,
    })

  const cxJar: Record<string, string> = {}
  const mJar: Record<string, string> = {}

  // Step 1: GET login page
  const r1 = await fetch(authUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
  })
  Object.assign(cxJar, parseCookies(r1.headers))
  const loginHtml = await r1.text()

  const loginForm = extractForm(loginHtml)
  if (!loginForm) {
    throw new Error('Formulaire de connexion introuvable sur connexion.strasbourg.eu')
  }

  // Set credentials — try multiple field name conventions
  loginForm.data.set('username', email)
  loginForm.data.set('email', email)
  loginForm.data.set('j_username', email)
  loginForm.data.set('password', password)
  loginForm.data.set('j_password', password)
  if (!loginForm.data.has('_eventId')) loginForm.data.set('_eventId', 'submit')

  // Step 2: POST credentials
  const r2 = await fetch(loginForm.action, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieStr(cxJar),
      'User-Agent': UA,
      Origin: CONNEXION_BASE,
      Referer: r1.url,
    },
    body: loginForm.data.toString(),
  })
  Object.assign(cxJar, parseCookies(r2.headers))

  if (r2.status === 200) {
    const html = await r2.text()
    // Detect error page
    if (
      /Identifiant.*incorrect|identifiants.*incorrects|invalid.*credential|wrong.*password|mot de passe.*incorrect/i.test(html) &&
      !html.includes('callback')
    ) {
      throw new Error('Identifiants MonStrasbourg incorrects — vérifiez votre email et mot de passe')
    }
    // Handle form_post auto-submit to callback
    await postCallback(html, mJar, cxJar)
  } else if (r2.status === 301 || r2.status === 302) {
    let loc = r2.headers.get('location') || ''
    if (loc && !loc.startsWith('http')) loc = CONNEXION_BASE + loc
    await followChain(loc, cxJar, mJar)
  } else {
    throw new Error(`Erreur HTTP ${r2.status} lors de la connexion MonStrasbourg`)
  }

  // Extract cookie values — strip CUSB= prefix (that's what iguana.ts expects)
  let ci = mJar['InstanceCI'] || ''
  let st = mJar['InstanceST'] || ''
  if (ci.startsWith('CUSB=')) ci = ci.slice(5)
  if (st.startsWith('CUSB=')) st = st.slice(5)

  if (!ci || !st) {
    throw new Error(
      'Connexion réussie mais cookies Iguana non reçus. ' +
      'Vérifiez que votre compte MonStrasbourg est bien lié à une carte médiathèque.'
    )
  }

  return { ci, st }
}
