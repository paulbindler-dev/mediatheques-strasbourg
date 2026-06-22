import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  const sb = getSupabaseServer()
  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // user_metadata is returned directly by getUser() — no admin client needed
  const wishlists = user.user_metadata?.wishlists ?? null
  return NextResponse.json({ wishlists })
}

export async function PUT(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json() as { wishlists?: unknown }
  if (!body.wishlists) return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })

  const { error } = await sb.auth.updateUser({ data: { wishlists: body.wishlists } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
