import { getSupabaseServer } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import type { IguanaCookies } from '@/lib/iguana'

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
  return {
    ci: decrypt(data.instance_ci_enc),
    st: decrypt(data.instance_st_enc),
  }
}
