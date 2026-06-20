import { getSupabaseServer, getSupabaseAdmin } from '@/lib/supabase-server'
import { decrypt, encrypt } from '@/lib/crypto'
import { loginAndGetCookies } from '@/lib/iguana-auth'
import type { IguanaCookies } from '@/lib/iguana'

type CredRecord = {
  mode: 'credentials'
  email: string
  password: string
  ci: string
  st: string
  exp: string // ISO timestamp when cached cookies expire
}

function isCredRecord(v: unknown): v is CredRecord {
  return typeof v === 'object' && v !== null && (v as CredRecord).mode === 'credentials'
}

async function refreshAndStore(userId: string, email: string, password: string): Promise<IguanaCookies> {
  const { ci, st } = await loginAndGetCookies(email, password)
  const exp = new Date(Date.now() + 110 * 60 * 1000).toISOString() // 110 min validity

  const record: CredRecord = { mode: 'credentials', email, password, ci, st, exp }
  const sb = getSupabaseAdmin()
  await sb.from('iguana_sessions').upsert({
    user_id: userId,
    instance_ci_enc: encrypt(JSON.stringify(record)),
    instance_st_enc: encrypt('sentinel'),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  return { ci, st }
}

// For use in API routes (user context)
export async function getIguanaCookies(): Promise<IguanaCookies | null> {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  return getIguanaCookiesForUser(user.id)
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
      // Use cached cookies if still valid
      if (parsed.ci && parsed.st && new Date(parsed.exp) > new Date()) {
        return { ci: parsed.ci, st: parsed.st }
      }
      // Expired — auto-refresh via MonStrasbourg login
      return await refreshAndStore(userId, parsed.email, parsed.password)
    }
  } catch {
    // Not JSON — legacy raw cookie mode (backward compat)
  }

  // Legacy: raw cookie values stored directly
  try {
    return {
      ci: decrypted,
      st: decrypt(data.instance_st_enc),
    }
  } catch {
    return null
  }
}
