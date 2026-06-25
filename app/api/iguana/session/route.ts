import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer, getSupabaseAdmin } from '@/lib/supabase-server'
import { encrypt } from '@/lib/crypto'
import { loginAndGetCookies } from '@/lib/iguana-auth'
import { fetchBookings } from '@/lib/iguana'

const SESSION_TTL_MS = 30 * 60 * 1000

export async function POST(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json() as {
    mode?: string
    email?: string; password?: string
    ci?: string; st?: string; extra?: string
  }

  // ── Mode "cookies" : l'utilisateur colle ses cookies depuis le navigateur ──
  if (body.mode === 'cookies') {
    const ci = (body.ci ?? '').trim()
    const st = (body.st ?? '').trim()
    const email = (body.email ?? '').trim()
    const password = (body.password ?? '').trim()
    const extra = (body.extra ?? '').trim() || '{}'
    if (!ci || !st) return NextResponse.json({ error: 'InstanceCI et InstanceST requis' }, { status: 400 })

    // Store cookies — use admin client to bypass RLS on iguana_sessions
    const exp = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    const record = { mode: 'credentials', email, password, ci, st, exp, extra }
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('iguana_sessions').upsert({
      user_id: user.id,
      instance_ci_enc: encrypt(JSON.stringify(record)),
      instance_st_enc: encrypt('sentinel'),
    }, { onConflict: 'user_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, mode: 'cookies' })
  }

  // ── Mode normal : identifiants médiathèque ──
  const email = (body.email ?? '').trim()
  const password = (body.password ?? '').trim()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  let ci: string, st: string, extra: string
  try {
    const result = await loginAndGetCookies(email, password)
    ci = result.ci
    st = result.st
    extra = result.extra
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur de connexion'
    return NextResponse.json({ error: msg, rateLimited: msg.includes('incorrect') }, { status: 400 })
  }

  try {
    await fetchBookings({ ci, st, extra })
  } catch (e) {
    console.error('[session] Fresh cookie test FAILED:', String(e))
  }

  const exp = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const record = { mode: 'credentials', email, password, ci, st, exp, extra }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('iguana_sessions').upsert({
    user_id: user.id,
    instance_ci_enc: encrypt(JSON.stringify(record)),
    instance_st_enc: encrypt('sentinel'),
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
