import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  const sb = getSupabaseServer()
  const { data: { user }, error } = await sb.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  return NextResponse.json({ prefs: user.user_metadata?.cataloguePrefs ?? null })
}

export async function PUT(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user }, error } = await sb.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const body = await req.json() as { prefs?: unknown }
  if (!body.prefs) return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })
  const { error: updateError } = await sb.auth.updateUser({ data: { cataloguePrefs: body.prefs } })
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
