import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import { loginAndGetCookies } from '@/lib/iguana-auth'

const SECRET = '20789e2fdaabe187d8653dab6ccaccf2'
const BASE = 'https://www.mediatheques.strasbourg.eu'

async function testIguanaApi(cookieHeader: string, label: string) {
  const t = Date.now()
  const url = `${BASE}/Portal/Services/UserAccountService.svc/ListBookings?serviceCode=IGUANA_2&token=${t}&userUniqueIdentifier=&timestamp=${t}`
  try {
    const res = await fetch(url, {
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      cache: 'no-store',
    })
    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = null }
    const j = json as Record<string, unknown> | null
    return { label, status: res.status, success: j?.success, errors: j?.errors, d_keys: j?.d ? Object.keys(j.d as object) : null, raw: text.slice(0, 600) }
  } catch (e) {
    return { label, error: String(e) }
  }
}

async function runTests(email: string, password: string) {
  const results: Record<string, unknown> = {}

  // Fresh login
  results.login_start = new Date().toISOString()
  let freshCi = '', freshSt = '', freshExtra = ''
  try {
    const r = await loginAndGetCookies(email, password)
    freshCi = r.ci
    freshSt = r.st
    freshExtra = r.extra

    const extraJar = JSON.parse(freshExtra) as Record<string, string>
    results.fresh_ci_prefix = freshCi.slice(0, 12)
    results.fresh_st_prefix = freshSt.slice(0, 12)
    results.fresh_extra_keys = Object.keys(extraJar)
    results.fresh_extra_values = Object.fromEntries(
      Object.entries(extraJar).map(([k, v]) => [k, v.slice(0, 50)])
    )
  } catch (e) {
    results.login_error = String(e)
    return results
  }

  // Test 1: only CI+ST
  results.test_only_ci_st = await testIguanaApi(
    `InstanceCI=CUSB=${freshCi}; InstanceST=CUSB=${freshSt}`,
    'only_ci_st'
  )

  // Test 2: all mJar cookies
  const extraJar = JSON.parse(freshExtra) as Record<string, string>
  const allCookies = [
    `InstanceCI=CUSB=${freshCi}`,
    `InstanceST=CUSB=${freshSt}`,
    ...Object.entries(extraJar).map(([k, v]) => `${k}=${v}`),
  ].join('; ')
  results.test_all_cookies = await testIguanaApi(allCookies, 'all_cookies')
  results.all_cookies_preview = allCookies.slice(0, 500)

  // Test 3: CI+ST + _syrSessGuid only
  if (extraJar['_syrSessGuid']) {
    results.test_ci_st_syrSessGuid = await testIguanaApi(
      `InstanceCI=CUSB=${freshCi}; InstanceST=CUSB=${freshSt}; _syrSessGuid=${extraJar['_syrSessGuid']}`,
      'ci_st_plus_syrSessGuid'
    )
  }

  // Test 4: ListLoans with all cookies
  const allCookiesLoans = allCookies
  const tL = Date.now()
  const urlL = `${BASE}/Portal/Services/UserAccountService.svc/ListLoans?serviceCode=IGUANA_2&token=${tL}&userUniqueIdentifier=&timestamp=${tL}`
  try {
    const resL = await fetch(urlL, {
      headers: { Cookie: allCookiesLoans, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01' },
      cache: 'no-store',
    })
    const text = await resL.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = null }
    const j = json as Record<string, unknown> | null
    results.test_loans_all = { status: resL.status, success: j?.success, errors: j?.errors, raw: text.slice(0, 400) }
  } catch (e) {
    results.test_loans_all = { error: String(e) }
  }

  // Test GetHoldings with fresh cookies (rscId for God of War Ragnarök)
  const testRscId = '1123429'
  const allCookiesStr = [
    `InstanceCI=CUSB=${freshCi}`,
    `InstanceST=CUSB=${freshSt}`,
    ...Object.entries(JSON.parse(freshExtra) as Record<string, string>).map(([k, v]) => `${k}=${v}`),
  ].join('; ')
  try {
    const ghRes = await fetch('https://www.mediatheques.strasbourg.eu/Portal/Services/ILSClient.svc/GetHoldings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/plain, */*',
        Cookie: allCookiesStr,
        Referer: `https://www.mediatheques.strasbourg.eu/Default/doc/IGUANA_2/${testRscId}/`,
        'User-Agent': UA,
        Origin: 'https://www.mediatheques.strasbourg.eu',
      },
      body: JSON.stringify({ id: `_${testRscId}`, BaseName: 'IGUANA_2', lang: 'fr' }),
      cache: 'no-store',
    })
    const ghText = await ghRes.text()
    let ghJson: unknown
    try { ghJson = JSON.parse(ghText) } catch { ghJson = null }
    const gh = ghJson as Record<string, unknown> | null
    results.test_get_holdings_ragnarok = {
      rscId: testRscId,
      status: ghRes.status,
      success: gh?.success,
      holdings_count: Array.isArray((gh?.d as Record<string, unknown>)?.Holdings) ? ((gh?.d as Record<string, unknown>).Holdings as unknown[]).length : null,
      availability: (gh?.d as Record<string, unknown>)?.ItemHoldingsData,
      raw: ghText.slice(0, 800),
    }
  } catch (e) {
    results.test_get_holdings_ragnarok = { error: String(e) }
  }

  return results
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: Record<string, unknown> = {
    service_role_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  // Read from DB
  const sb = getSupabaseAdmin()
  const { data: sessions, error: dbError, count } = await sb
    .from('iguana_sessions')
    .select('user_id, instance_ci_enc, updated_at', { count: 'exact' })
    .limit(1)

  results.db_error = dbError ? dbError.message : null
  results.db_count = count
  results.sessions_found = sessions?.length ?? 0

  if (!sessions?.length) {
    results.info = 'No sessions in DB — use POST with {"email":"...","password":"..."} to test directly'
    return NextResponse.json(results)
  }

  const session = sessions[0]
  results.user_id = session.user_id
  results.updated_at = session.updated_at

  let email = '', password = ''
  try {
    const decrypted = decrypt(session.instance_ci_enc)
    const rec = JSON.parse(decrypted) as Record<string, unknown>
    if (rec.mode !== 'credentials') {
      results.error = 'Not credentials mode'
      return NextResponse.json(results)
    }
    email = rec.email as string
    password = rec.password as string
    results.stored_mode = 'credentials'
    results.stored_ci_prefix = typeof rec.ci === 'string' ? rec.ci.slice(0, 12) : null
    results.stored_exp = rec.exp
    results.stored_extra_keys = rec.extra ? Object.keys(JSON.parse(rec.extra as string)) : '(no extra)'
  } catch (e) {
    results.decrypt_error = String(e)
    return NextResponse.json(results)
  }

  const testResults = await runTests(email, password)
  return NextResponse.json({ ...results, ...testResults })
}

// POST: pass credentials directly when DB is empty
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { email?: string; password?: string }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 })
  }

  const testResults = await runTests(body.email, body.password)
  return NextResponse.json(testResults)
}
