import { NextResponse } from 'next/server'
import { fetchLoans } from '@/lib/iguana'
import { getIguanaCookies } from '@/lib/get-iguana-cookies'

export async function GET() {
  const cookies = await getIguanaCookies()
  if (!cookies) return NextResponse.json({ error: 'No session' }, { status: 401 })
  try {
    const loans = await fetchLoans(cookies)
    return NextResponse.json(loans)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
