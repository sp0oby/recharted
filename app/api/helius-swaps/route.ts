import { NextRequest, NextResponse } from 'next/server'

/**
 * Helius-backed sub-minute candle endpoint for Solana tokens.
 *
 * Used as a fallback / augmentation to Codex when:
 *  - The token is on Solana (network 1399811149)
 *  - The user requested a sub-minute resolution (1S/5S/15S/30S)
 *  - Codex returned no_data or sparse data
 *
 * It fetches parsed swap transactions from Helius's Enhanced Transactions API,
 * computes a per-swap USD price for the token (using SOL pair or stable pair),
 * and aggregates into OHLCV candles at the requested resolution.
 *
 * Limitations:
 *  - Only swaps paired with SOL or USDC/USDT/DAI are priced. Multi-hop swaps not
 *    paired with these are skipped.
 *  - SOL/USD price is fetched once at the start of the request (good enough for
 *    short sub-minute windows; not for long ranges).
 *  - Pagination caps at 500 swaps per request to keep latency bounded.
 *
 * Response shape mirrors the relevant subset of Codex `getBars` so callers can
 * treat it interchangeably.
 */

const HELIUS_BASE = 'https://api.helius.xyz'

// Stable mints we treat as $1
const STABLE_MINTS: Record<string, true> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: true, // USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: true, // USDT (legacy)
  DEhAasscXF4kEGxFgJ3bq4PpVGp5wyUxMRvn6TzGVHaw: true, // UXD (rare)
  EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o: true, // DAI (sollet)
}
const SOL_MINT_NATIVE = 'So11111111111111111111111111111111111111112' // wSOL

interface HeliusToken {
  mint: string
  rawTokenAmount?: { tokenAmount?: string; decimals?: number }
  tokenAmount?: number | string
  decimals?: number
}

interface HeliusSwap {
  timestamp: number
  type: string
  events?: {
    swap?: {
      nativeInput?: { amount?: string | number } | null
      nativeOutput?: { amount?: string | number } | null
      tokenInputs?: HeliusToken[]
      tokenOutputs?: HeliusToken[]
      innerSwaps?: any[]
    }
  }
  signature?: string
}

interface Candle {
  t: number // unix seconds (bucket start)
  o: number
  h: number
  l: number
  c: number
  v: number // USD volume
}

function resolutionToSeconds(res: string): number {
  switch (res) {
    case '1S': return 1
    case '5S': return 5
    case '15S': return 15
    case '30S': return 30
    case '1':  return 60
    case '5':  return 300
    case '15': return 900
    case '30': return 1800
    case '60': return 3600
    case '240': return 14400
    default: return 60
  }
}

function tokenAmount(t: HeliusToken): number {
  if (t.rawTokenAmount && t.rawTokenAmount.tokenAmount != null) {
    const raw = Number(t.rawTokenAmount.tokenAmount)
    const dec = t.rawTokenAmount.decimals ?? 0
    return raw / Math.pow(10, dec)
  }
  if (t.tokenAmount != null) return Number(t.tokenAmount)
  return 0
}

async function getSolUsdPrice(): Promise<number | null> {
  try {
    // Jupiter Price API (no key, very fast). Falls back to CoinGecko if it fails.
    const r = await fetch('https://price.jup.ag/v6/price?ids=SOL', {
      // Short timeout via AbortSignal would be nice but keep simple
    })
    if (r.ok) {
      const j = await r.json()
      const p = Number(j?.data?.SOL?.price)
      if (p > 0) return p
    }
  } catch {}
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
    if (r.ok) {
      const j = await r.json()
      const p = Number(j?.solana?.usd)
      if (p > 0) return p
    }
  } catch {}
  return null
}

/**
 * Compute the USD price of `targetMint` from a single Helius swap event,
 * by finding the side that is targetMint and the side that is SOL or stable.
 * Returns { priceUsd, volumeUsd } or null if pair not priceable.
 */
function priceFromSwap(
  swap: HeliusSwap,
  targetMint: string,
  solUsd: number | null
): { priceUsd: number; volumeUsd: number } | null {
  const ev = swap.events?.swap
  if (!ev) return null

  const inputs = ev.tokenInputs || []
  const outputs = ev.tokenOutputs || []
  const nativeInRaw = ev.nativeInput?.amount ? Number(ev.nativeInput.amount) : 0
  const nativeOutRaw = ev.nativeOutput?.amount ? Number(ev.nativeOutput.amount) : 0
  const nativeInSol = nativeInRaw / 1e9
  const nativeOutSol = nativeOutRaw / 1e9

  // Find target token side (could be input or output)
  const allTokens = [...inputs, ...outputs]
  const targetEntry = allTokens.find((t) => t.mint === targetMint)
  if (!targetEntry) return null

  const targetAmount = tokenAmount(targetEntry)
  if (!(targetAmount > 0)) return null

  // Look for a stable on the opposite side
  const counterStable = allTokens.find(
    (t) => t.mint !== targetMint && STABLE_MINTS[t.mint]
  )
  if (counterStable) {
    const stableAmount = tokenAmount(counterStable)
    if (stableAmount > 0) {
      const priceUsd = stableAmount / targetAmount
      return { priceUsd, volumeUsd: stableAmount }
    }
  }

  // Or wSOL token side
  const counterWSol = allTokens.find(
    (t) => t.mint !== targetMint && t.mint === SOL_MINT_NATIVE
  )
  if (counterWSol && solUsd) {
    const wSolAmount = tokenAmount(counterWSol)
    if (wSolAmount > 0) {
      const priceUsd = (wSolAmount * solUsd) / targetAmount
      return { priceUsd, volumeUsd: wSolAmount * solUsd }
    }
  }

  // Or native SOL transfers as the counter side
  const totalNativeSol = nativeInSol + nativeOutSol
  if (totalNativeSol > 0 && solUsd) {
    const priceUsd = (totalNativeSol * solUsd) / targetAmount
    return { priceUsd, volumeUsd: totalNativeSol * solUsd }
  }

  return null
}

async function fetchHeliusSwaps(
  address: string,
  apiKey: string,
  fromSec: number,
  maxSwaps = 500
): Promise<HeliusSwap[]> {
  const all: HeliusSwap[] = []
  let before: string | undefined = undefined
  // Helius caps `limit` at 100; loop until we go past `fromSec` or hit max.
  for (let i = 0; i < Math.ceil(maxSwaps / 100); i++) {
    const url = new URL(`${HELIUS_BASE}/v0/addresses/${address}/transactions`)
    url.searchParams.set('api-key', apiKey)
    url.searchParams.set('type', 'SWAP')
    url.searchParams.set('limit', '100')
    if (before) url.searchParams.set('before', before)

    const r = await fetch(url.toString())
    if (!r.ok) {
      throw new Error(`Helius HTTP ${r.status}: ${r.statusText}`)
    }
    const batch = (await r.json()) as HeliusSwap[]
    if (!Array.isArray(batch) || batch.length === 0) break

    for (const tx of batch) {
      if (typeof tx.timestamp === 'number' && tx.timestamp >= fromSec) {
        all.push(tx)
      }
    }
    const last = batch[batch.length - 1]
    // Stop when the oldest tx in this batch is already older than our window
    if (last && typeof last.timestamp === 'number' && last.timestamp < fromSec) break
    before = (last as any)?.signature
    if (!before) break
  }
  return all
}

function aggregateToCandles(
  swaps: Array<{ t: number; price: number; volumeUsd: number }>,
  fromSec: number,
  toSec: number,
  bucketSec: number
): Candle[] {
  if (bucketSec <= 0) bucketSec = 1
  const buckets = new Map<number, Candle>()

  for (const s of swaps) {
    if (s.t < fromSec || s.t > toSec) continue
    const bucketStart = Math.floor(s.t / bucketSec) * bucketSec
    let c = buckets.get(bucketStart)
    if (!c) {
      c = { t: bucketStart, o: s.price, h: s.price, l: s.price, c: s.price, v: 0 }
      buckets.set(bucketStart, c)
    }
    if (s.price > c.h) c.h = s.price
    if (s.price < c.l) c.l = s.price
    c.c = s.price // last in time order; sort caller
    c.v += s.volumeUsd
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address') || ''
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  const resolution = (searchParams.get('resolution') || '5S').toUpperCase()

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }
  const fromSec = fromStr ? parseInt(fromStr, 10) : Math.floor(Date.now() / 1000) - 5 * 60
  const toSec = toStr ? parseInt(toStr, 10) : Math.floor(Date.now() / 1000)
  if (!isFinite(fromSec) || !isFinite(toSec) || fromSec >= toSec) {
    return NextResponse.json({ error: 'invalid from/to' }, { status: 400 })
  }

  const apiKey = process.env.HELIUS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'HELIUS_API_KEY not configured. Add it to .env to enable Solana sub-minute fallback.' },
      { status: 500 }
    )
  }

  try {
    const [solUsd, swaps] = await Promise.all([
      getSolUsdPrice(),
      fetchHeliusSwaps(address, apiKey, fromSec, 500),
    ])

    // Sort swaps by time ascending so close-of-bucket is the latest swap
    swaps.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    const priced: Array<{ t: number; price: number; volumeUsd: number }> = []
    for (const s of swaps) {
      const r = priceFromSwap(s, address, solUsd)
      if (!r || !isFinite(r.priceUsd) || r.priceUsd <= 0) continue
      priced.push({ t: s.timestamp, price: r.priceUsd, volumeUsd: r.volumeUsd })
    }

    const bucketSec = resolutionToSeconds(resolution)
    const candles = aggregateToCandles(priced, fromSec, toSec, bucketSec)

    return NextResponse.json({
      source: 'helius',
      address,
      from: fromSec,
      to: toSec,
      resolution,
      bucketSec,
      solUsdPriceUsed: solUsd,
      swapCount: swaps.length,
      pricedSwapCount: priced.length,
      candles, // [{ t, o, h, l, c, v }]
    })
  } catch (error) {
    console.error('Helius swaps fetch failed:', error)
    return NextResponse.json(
      {
        error: 'Helius fetch failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
