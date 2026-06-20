import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer, getSupabaseAdmin } from '@/lib/supabase-server'
import { encrypt } from '@/lib/crypto'
import { loginAndGetCookies } from '@/lib/iguana-auth'

export async function POST(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json() as { email?: string; password?: string }
  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  // Validate credentials by actually logging in
  let ci: string, st: string
  try {
    const result = await loginAndGetCookies(email.trim(), password)
    ci = result.ci
    st = result.st
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur de connexion MonStrasbourg'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const exp = new Date(Date.now() + 110 * 60 * 1000).toISOString()
  const record = { mode: 'credentials', email: email.trim(), password, ci, st, exp }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('iguana_sessions').upsert({
    user_id: user.id,
    instance_ci_enc: encrypt(JSON.stringify(record)),
    instance_st_enc: encrypt('sentinel'),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
