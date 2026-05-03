import { NextRequest, NextResponse } from 'next/server'

// Codex filterTokens query — see https://docs.codex.io/reference/filtertokens
// `filters.network` accepts an array of int networkIds (1=Ethereum, 56=BSC,
// 8453=Base, 1399811149=Solana, etc.).
const FILTER_TOKENS_QUERY = `
  query FilterTokens($phrase: String, $rankings: [TokenRanking], $limit: Int, $filters: TokenFilters) {
    filterTokens(phrase: $phrase, rankings: $rankings, limit: $limit, filters: $filters) {
      results {
        liquidity
        marketCap
        priceUSD
        volume24
        txnCount24
        token {
          address
          name
          symbol
          networkId
          info {
            imageThumbUrl
          }
        }
      }
    }
  }
`

// Map Codex networkIds to friendly chain names.
const NETWORK_NAMES: Record<number, string> = {
  1: 'Ethereum',
  56: 'BSC',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
  43114: 'Avalanche',
  250: 'Fantom',
  100: 'Gnosis',
  324: 'zkSync',
  59144: 'Linea',
  534352: 'Scroll',
  5000: 'Mantle',
  81457: 'Blast',
  1399811149: 'Solana',
}

function networkName(id: number): string {
  return NETWORK_NAMES[id] || `Network ${id}`
}

// Curated "majors" — when the user types one of these aliases, prepend the
// canonical wrapped/native token to the results so it surfaces above any
// memecoin clones with similar tickers. Keys are lowercase aliases.
type Preset = {
  address: string
  symbol: string
  name: string
  networkId: number
  imageUrl: string | null
  aliases: string[]
}

const NATIVE_PRESETS: Preset[] = [
  {
    // Wrapped Bitcoin on Ethereum
    address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    networkId: 1,
    imageUrl: 'https://assets.coingecko.com/coins/images/7598/thumb/wrapped_bitcoin_wbtc.png',
    aliases: ['btc', 'bitcoin', 'wbtc'],
  },
  {
    // Wrapped Ether on Ethereum
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    networkId: 1,
    imageUrl: 'https://assets.coingecko.com/coins/images/2518/thumb/weth.png',
    aliases: ['eth', 'ether', 'ethereum', 'weth'],
  },
  {
    // Wrapped SOL on Solana
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    networkId: 1399811149,
    imageUrl: 'https://assets.coingecko.com/coins/images/4128/thumb/solana.png',
    aliases: ['sol', 'solana', 'wsol'],
  },
  {
    // Wrapped BNB on BSC
    address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    networkId: 56,
    imageUrl: 'https://assets.coingecko.com/coins/images/12591/thumb/binance-coin-logo.png',
    aliases: ['bnb', 'binance', 'wbnb'],
  },
  {
    // USDC on Ethereum
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    symbol: 'USDC',
    name: 'USD Coin',
    networkId: 1,
    imageUrl: 'https://assets.coingecko.com/coins/images/6319/thumb/usdc.png',
    aliases: ['usdc'],
  },
  {
    // USDT on Ethereum
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    networkId: 1,
    imageUrl: 'https://assets.coingecko.com/coins/images/325/thumb/Tether.png',
    aliases: ['usdt', 'tether'],
  },
]

function presetToResult(p: Preset) {
  return {
    address: p.address,
    symbol: p.symbol,
    name: p.name,
    networkId: p.networkId,
    networkName: networkName(p.networkId),
    imageUrl: p.imageUrl,
    marketCap: null as number | null,
    priceUSD: null as number | null,
    liquidity: null as number | null,
    volume24: null as number | null,
    txnCount24: null as number | null,
    isNative: true,
  }
}

/**
 * Pick presets that match the search phrase. Match is alias-prefix (e.g.
 * "btc" matches WBTC; "eth" matches WETH; "sol" matches SOL). Filter by
 * chainId when one is selected.
 */
function matchingPresets(phrase: string, chainId: number | null): Preset[] {
  const p = phrase.toLowerCase().trim()
  if (!p) return []
  return NATIVE_PRESETS.filter((preset) => {
    if (chainId != null && preset.networkId !== chainId) return false
    return preset.aliases.some((a) => a === p || a.startsWith(p) || p.startsWith(a))
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phrase = (searchParams.get('q') || '').trim()
  const limit = Math.min(parseInt(searchParams.get('limit') || '15', 10) || 15, 50)
  const chainParam = searchParams.get('chain')
  const chainId = chainParam && /^\d+$/.test(chainParam) ? parseInt(chainParam, 10) : null

  if (!phrase || phrase.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const apiKey = process.env.CODEX_API_KEY
  if (!apiKey || apiKey === 'your-codex-api-key' || apiKey === 'your-codex-api-key-here') {
    return NextResponse.json(
      { error: 'Codex API key not configured. Add CODEX_API_KEY to .env.' },
      { status: 500 }
    )
  }

  // Native/major-token presets matched purely by alias — independent of
  // Codex's volume-based ranking so BTC/ETH/SOL/USDC/USDT always surface.
  const presetMatches = matchingPresets(phrase, chainId).map(presetToResult)

  try {
    // Build filters object — only include `network` when the user picked a chain.
    const filters: Record<string, unknown> = {}
    if (chainId != null) filters.network = [chainId]

    const response = await fetch('https://graph.codex.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey, // Secret key format (not Bearer)
      },
      body: JSON.stringify({
        query: FILTER_TOKENS_QUERY,
        variables: {
          phrase,
          // When the user picked "All Chains" we rank by 24h volume so high-cap
          // tokens (ETH, BTC, SOL pairs) compete with Solana memecoins instead
          // of being drowned out by raw txnCount24. When they picked a specific
          // chain, txnCount24 is fine since the chain bias is gone.
          rankings: chainId != null
            ? [{ attribute: 'txnCount24', direction: 'DESC' }]
            : [{ attribute: 'volume24', direction: 'DESC' }],
          limit,
          filters: Object.keys(filters).length ? filters : undefined,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Codex HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    if (data.errors) {
      console.error('Codex filterTokens errors:', data.errors)
    }

    const rawResults: any[] = data?.data?.filterTokens?.results || []

    const codexResults = rawResults
      .filter((r) => r?.token?.address && r?.token?.networkId)
      .map((r) => {
        const t = r.token
        const networkId: number = t.networkId
        return {
          address: t.address,
          symbol: t.symbol || '',
          name: t.name || '',
          networkId,
          networkName: networkName(networkId),
          imageUrl: t.info?.imageThumbUrl || null,
          marketCap: r.marketCap != null ? Number(r.marketCap) : null,
          priceUSD: r.priceUSD != null ? Number(r.priceUSD) : null,
          liquidity: r.liquidity != null ? Number(r.liquidity) : null,
          volume24: r.volume24 != null ? Number(r.volume24) : null,
          txnCount24: r.txnCount24 != null ? Number(r.txnCount24) : null,
          isNative: false,
        }
      })

    // De-dup: if a preset and a Codex result both reference the same address, drop the Codex copy.
    const presetKeys = new Set(presetMatches.map((p) => `${p.networkId}:${p.address.toLowerCase()}`))
    const dedupedCodex = codexResults.filter(
      (r) => !presetKeys.has(`${r.networkId}:${r.address.toLowerCase()}`)
    )

    const results = [...presetMatches, ...dedupedCodex].slice(0, limit)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Token search failed:', error)
    return NextResponse.json(
      {
        error: 'Token search failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
