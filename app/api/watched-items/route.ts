import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET — list of watched rscIds for current user
export async function GET() {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data } = await sb
    .from('watched_items')
    .select('rsc_id')
    .eq('user_id', user.id)

  return NextResponse.json({ rscIds: (data ?? []).map(r => r.rsc_id as string) })
}

// POST — watch an item
export async function POST(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { rscId, title, docbase } = await req.json() as { rscId: string; title: string; docbase?: string }
  if (!rscId || !title) return NextResponse.json({ error: 'rscId et title requis' }, { status: 400 })

  const { error } = await sb.from('watched_items').upsert(
    { user_id: user.id, rsc_id: rscId, title, docbase: docbase ?? 'IGUANA_2' },
    { onConflict: 'user_id,rsc_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — unwatch an item
export async function DELETE(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { rscId } = await req.json() as { rscId: string }
  if (!rscId) return NextResponse.json({ error: 'rscId requis' }, { status: 400 })

  const { error } = await sb.from('watched_items')
    .delete()
    .eq('user_id', user.id)
    .eq('rsc_id', rscId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
