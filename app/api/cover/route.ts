import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse(null, { status: 400 })

  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return new NextResponse(null, { status: 404 })

    // If redirected away from syracuse.cloud → it's the Strasbourg fallback doctype icon
    if (!res.url.includes('covers.syracuse.cloud')) {
      return new NextResponse(null, { status: 404 })
    }

    const buf = await res.arrayBuffer()
    // 1×1 transparent PNG sentinel (68 bytes) — shouldn't appear with ?fallback= but guard anyway
    if (buf.byteLength < 200) return new NextResponse(null, { status: 404 })

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
