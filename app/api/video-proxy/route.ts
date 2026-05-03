import { NextRequest, NextResponse } from "next/server"

// Streams a Twitter/X video back to the browser as same-origin so that the
// MP4 export route can drawImage() onto a canvas without tainting it.
// Restricted to twimg's video CDN to prevent the route from being abused as
// an open proxy.
const ALLOWED_HOSTS = new Set(["video.twimg.com", "pbs.twimg.com"])

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url")
  if (!target) {
    return NextResponse.json({ error: "url parameter is required" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 })
  }

  // Pass through the Range header so seeking still works on large files.
  const range = request.headers.get("range")
  const upstreamHeaders: Record<string, string> = {}
  if (range) upstreamHeaders["range"] = range

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), { headers: upstreamHeaders })
  } catch (err) {
    return NextResponse.json(
      { error: "upstream fetch failed", details: err instanceof Error ? err.message : "unknown" },
      { status: 502 }
    )
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: upstream.status })
  }

  const headers = new Headers()
  const passthrough = ["content-type", "content-length", "accept-ranges", "content-range"]
  for (const key of passthrough) {
    const value = upstream.headers.get(key)
    if (value) headers.set(key, value)
  }
  headers.set("cache-control", "public, max-age=3600, immutable")

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
