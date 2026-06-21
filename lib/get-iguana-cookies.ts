import { getSupabaseServer, getSupabaseAdmin } from '@/lib/supabase-server'
import { decrypt, encrypt } from '@/lib/crypto'
import { loginAndGetCookies as loginServerside } from '@/lib/iguana-auth'
import type { IguanaCookies } from '@/lib/iguana'

// Prefer the Edge Runtime endpoint (Cloudflare IPs) to avoid Vercel/AWS IP rate-limiting from Iguana
async function loginViaEdge(card: string, password: string): Promise<{ ci: string; st: string; extra: string }> {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000')
  const res = await fetch(`${base}/api/iguana/login-edge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card, password }),
  })
  const json = await res.json() as { ci?: string; st?: string; extra?: string; error?: string }
  if (!res.ok || !json.ci || !json.st) throw new Error(json.error ?? 'Edge login failed')
  return { ci: json.ci, st: json.st, extra: json.extra ?? '{}' }
}

async function loginWithFallback(card: string, password: string): Promise<{ ci: string; st: string; extra: string }> {
  try {
    return await loginViaEdge(card, password)
  } catch {
    return await loginServerside(card, password)
  }
}

const SESSION_TTL_MS = 30 * 60 * 1000     // 30 min
const CRED_BACKOFF_MS = 2 * 60 * 60 * 1000 // 2h — don't hammer Iguana after a credential failure

type CredRecord = {
  mode: 'credentials'
  email: string
  password: string
  ci: string
  st: string
  exp: string           // ISO — when cached cookies expire
  extra?: string        // JSON-serialized extra cookies (_syrSessGuid etc.)
  lastCredError?: string // ISO — last time login failed with InvalidCredentials
}

function isCredRecord(v: unknown): v is CredRecord {
  return typeof v === 'object' && v !== null && (v as CredRecord).mode === 'credentials'
}

function credErrorIsRecent(rec: CredRecord): boolean {
  if (!rec.lastCredError) return false
  return (Date.now() - new Date(rec.lastCredError).getTime()) < CRED_BACKOFF_MS
}

// For use in API routes (user context) — uses user's own JWT
export async function getIguanaCookies(): Promise<IguanaCookies | null> {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data } = await sb
    .from('iguana_sessions')
    .select('instance_ci_enc, instance_st_enc')
    .eq('user_id', user.id)
    .single()

  if (!data) return null

  let decrypted: string
  try {
    decrypted = decrypt(data.instance_ci_enc)
  } catch {
    return null
  }

  try {
    const parsed = JSON.parse(decrypted)
    if (isCredRecord(parsed)) {
      // Cookies still valid
      if (parsed.ci && parsed.st && new Date(parsed.exp) > new Date()) {
        return { ci: parsed.ci, st: parsed.st, extra: parsed.extra }
      }

      // Backoff: skip re-login if credentials recently failed to prevent IP rate-limiting
      if (credErrorIsRecent(parsed)) {
        if (parsed.ci && parsed.st) return { ci: parsed.ci, st: parsed.st, extra: parsed.extra }
        return null
      }

      // TTL expired — try to refresh silently
      try {
        const { ci, st, extra } = await loginWithFallback(parsed.email, parsed.password)
        const exp = new Date(Date.now() + SESSION_TTL_MS).toISOString()
        const record: CredRecord = { mode: 'credentials', email: parsed.email, password: parsed.password, ci, st, exp, extra }
        await getSupabaseAdmin().from('iguana_sessions').upsert({
          user_id: user.id,
          instance_ci_enc: encrypt(JSON.stringify(record)),
          instance_st_enc: encrypt('sentinel'),
        }, { onConflict: 'user_id' })
        return { ci, st, extra }
      } catch {
        // Return stale cookies — let the API call fail with auth error, which triggers forceRefreshIguanaSession()
        if (parsed.ci && parsed.st) return { ci: parsed.ci, st: parsed.st, extra: parsed.extra }
        return null
      }
    }
  } catch {
    // Not JSON — legacy mode
  }

  try {
    return { ci: decrypted, st: decrypt(data.instance_st_enc) }
  } catch {
    return null
  }
}

// Force re-login from stored credentials — call when Iguana returns an auth error.
// Marks lastCredError on failure to prevent future hammering.
// Pass { bypassBackoff: true } when the caller has proof the session is expired (e.g. GetHoldings returned success:false)
export async function forceRefreshIguanaSession(options?: { bypassBackoff?: boolean }): Promise<IguanaCookies | null> {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data } = await sb
    .from('iguana_sessions')
    .select('instance_ci_enc')
    .eq('user_id', user.id)
    .single()

  if (!data) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(decrypt(data.instance_ci_enc))
  } catch {
    return null
  }

  if (!isCredRecord(parsed)) return null

  // If we already know credentials are bad, don't retry (unless caller explicitly bypasses)
  if (!options?.bypassBackoff && credErrorIsRecent(parsed)) return null

  const admin = getSupabaseAdmin()
  try {
    const { ci, st, extra } = await loginWithFallback(parsed.email, parsed.password)
    const exp = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    const record: CredRecord = { mode: 'credentials', email: parsed.email, password: parsed.password, ci, st, exp, extra }
    await admin.from('iguana_sessions').upsert({
      user_id: user.id,
      instance_ci_enc: encrypt(JSON.stringify(record)),
      instance_st_enc: encrypt('sentinel'),
    }, { onConflict: 'user_id' })
    return { ci, st, extra }
  } catch {
    // Mark the credential failure so we don't retry for 2h
    const failRecord: CredRecord = {
      ...parsed,
      lastCredError: new Date().toISOString(),
    }
    try {
      await admin.from('iguana_sessions').upsert({
        user_id: user.id,
        instance_ci_enc: encrypt(JSON.stringify(failRecord)),
        instance_st_enc: encrypt('sentinel'),
      }, { onConflict: 'user_id' })
    } catch { /* best-effort */ }
    return null
  }
}

// For use in cron job (admin context, no request cookies)
export async function getIguanaCookiesForUser(userId: string): Promise<IguanaCookies | null> {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('iguana_sessions')
    .select('instance_ci_enc, instance_st_enc')
    .eq('user_id', userId)
    .single()

  if (!data) return null

  let decrypted: string
  try {
    decrypted = decrypt(data.instance_ci_enc)
  } catch {
    return null
  }

  try {
    const parsed = JSON.parse(decrypted)
    if (isCredRecord(parsed)) {
      if (parsed.ci && parsed.st && new Date(parsed.exp) > new Date()) {
        return { ci: parsed.ci, st: parsed.st, extra: parsed.extra }
      }
      if (credErrorIsRecent(parsed)) {
        return parsed.ci && parsed.st ? { ci: parsed.ci, st: parsed.st } : null
      }
      // Expired — refresh
      try {
        const { ci, st, extra } = await loginWithFallback(parsed.email, parsed.password)
        const exp = new Date(Date.now() + SESSION_TTL_MS).toISOString()
        const record: CredRecord = { mode: 'credentials', email: parsed.email, password: parsed.password, ci, st, exp, extra }
        await sb.from('iguana_sessions').upsert({
          user_id: userId,
          instance_ci_enc: encrypt(JSON.stringify(record)),
          instance_st_enc: encrypt('sentinel'),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        return { ci, st, extra }
      } catch {
        const failRecord: CredRecord = { ...parsed, lastCredError: new Date().toISOString() }
        try {
          await sb.from('iguana_sessions').upsert({
            user_id: userId,
            instance_ci_enc: encrypt(JSON.stringify(failRecord)),
            instance_st_enc: encrypt('sentinel'),
          }, { onConflict: 'user_id' })
        } catch { /* best-effort */ }
        return parsed.ci && parsed.st ? { ci: parsed.ci, st: parsed.st } : null
      }
    }
  } catch {
    // Not JSON — legacy mode
  }

  try {
    return { ci: decrypted, st: decrypt(data.instance_st_enc) }
  } catch {
    return null
  }
}
