import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { encrypt } from '@/lib/crypto'
import { fetchBookings } from '@/lib/iguana'

export async function POST(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { ci, st } = await req.json() as { ci: string; st: string }
  if (!ci || !st) return NextResponse.json({ error: 'Valeurs manquantes' }, { status: 400 })

  // Verify cookies work before saving
  try {
    await fetchBookings({ ci, st })
  } catch {
    return NextResponse.json({ error: 'Cookies invalides — vérifie les valeurs copiées' }, { status: 400 })
  }

  const { error } = await sb.from('iguana_sessions').upsert({
    user_id: user.id,
    instance_ci_enc: encrypt(ci),
    instance_st_enc: encrypt(st),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
