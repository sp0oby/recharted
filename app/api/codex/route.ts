import { NextRequest, NextResponse } from 'next/server'

// Codex API interfaces based on their documentation
interface CodexBarsInput {
  symbol: string // tokenAddress:networkId or pairAddress:networkId
  from: number // unix timestamp
  to: number // unix timestamp
  resolution: string // 1S, 5S, 15S, 30S, 1, 5, 15, 30, 60, 240, 720, 1D, 7D
  currencyCode?: string // USD or TOKEN
  removeLeadingNullValues?: boolean
  removeEmptyBars?: boolean
  quoteToken?: 'token0' | 'token1'
  statsType?: 'FILTERED' | 'UNFILTERED'
  countback?: number // max 1500
  symbolType?: 'TOKEN' | 'POOL'
}

// BarsResponse structure from GraphQL schema
interface CodexBarsResponse {
  o: number[] // opening prices array
  h: number[] // high prices array
  l: number[] // low prices array
  c: number[] // closing prices array
  volume: string[] // volume array (strings for precision)
  t: number[] // timestamps array
  s: string // status: 'ok' or 'no_data'
}

interface CodexApiResponse {
  getBars: CodexBarsResponse
}

// GraphQL query for getBars - following the exact documentation format
const GET_BARS_QUERY = `
  query getBars(
    $symbol: String!
    $from: Int!
    $to: Int!
    $resolution: String!
    $currencyCode: String
    $removeLeadingNullValues: Boolean
    $removeEmptyBars: Boolean
    $quoteToken: QuoteToken
    $statsType: TokenPairStatisticsType
    $countback: Int
    $symbolType: SymbolType
  ) {
    getBars(
      symbol: $symbol
      from: $from
      to: $to
      resolution: $resolution
      currencyCode: $currencyCode
      removeLeadingNullValues: $removeLeadingNullValues
      removeEmptyBars: $removeEmptyBars
      quoteToken: $quoteToken
      statsType: $statsType
      countback: $countback
      symbolType: $symbolType
    ) {
      o
      h
      l
      c
      volume
      t
      s
    }
  }
`

// Query to get token information (symbol, name, marketcap, supply, etc.)
const GET_TOKEN_INFO_QUERY = `
  query getTokenInfo($input: TokenInput!) {
    token(input: $input) {
      symbol
      name
      address
      networkId
      info {
        symbol
        name
        description
        totalSupply
        marketCap
        circulatingSupply
      }
    }
  }
`

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Get parameters from query string
  const symbol = searchParams.get('symbol')
  const timeframe = searchParams.get('timeframe') || '1h'
  const tweetTimestamp = searchParams.get('tweetTimestamp')
  
  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    )
  }

  const apiKey = process.env.CODEX_API_KEY
  if (!apiKey || apiKey === 'your-codex-api-key-here') {
    return NextResponse.json(
      { error: 'Codex API key not configured. Please add CODEX_API_KEY to your .env file.' },
      { status: 500 }
    )
  }

  try {
    console.log(`🔄 Fetching Codex data for symbol: ${symbol}, timeframe: ${timeframe}`)
    
    // Parse address and networkId from symbol
    const [address, networkId] = symbol.split(':')
    
    // Try to fetch token information from Codex (optional - don't let this block the main functionality)
    let tokenInfo = null
    try {
      tokenInfo = await getTokenInfo(address, networkId, apiKey)
      if (tokenInfo) {
        console.log(`✅ Codex token info found: ${tokenInfo.symbol} (${tokenInfo.name})`)
        if (tokenInfo.marketCap) console.log(`💰 Real Market Cap: $${(tokenInfo.marketCap / 1000000).toFixed(2)}M`)
      }
    } catch (error) {
      console.log(`⚠️ Codex token info fetch failed (non-blocking): ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
    
    // Always try DexScreener for marketcap data (even if Codex provides symbol)
    let fallbackSymbol: string | undefined = undefined
    let fallbackMarketCap: number | undefined = undefined
    let fallbackTokenSupply: number | undefined = undefined
    
    try {
      console.log(`🔄 Fetching DexScreener data for marketcap (always for accuracy)...`)
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${address}`
      const dexResponse = await fetch(dexScreenerUrl)
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json()
        if (dexData.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0]
          fallbackSymbol = pair.baseToken?.symbol
          fallbackMarketCap = pair.fdv || undefined // Fully diluted valuation from DexScreener
          fallbackTokenSupply = pair.fdv && pair.priceUsd ? pair.fdv / parseFloat(pair.priceUsd) : undefined
          console.log(`✅ DexScreener data found: ${fallbackSymbol}, MarketCap: $${fallbackMarketCap ? (fallbackMarketCap / 1000000).toFixed(2) + 'M' : 'N/A'}`)
        }
      }
    } catch (error) {
      console.log(`⚠️ DexScreener fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
    
    const displaySymbol = tokenInfo?.symbol || fallbackSymbol || 'TOKEN'
    const tokenName = tokenInfo?.name || 'Unknown Token'
    const marketCap = tokenInfo?.marketCap || fallbackMarketCap
    const tokenSupply = tokenInfo?.circulatingSupply || tokenInfo?.totalSupply || fallbackTokenSupply
    
    console.log(`🏷️ Using symbol: ${displaySymbol} (${tokenName})`)
    console.log(`💰 MarketCap sources: Codex=${tokenInfo?.marketCap ? (tokenInfo.marketCap / 1000000).toFixed(2) + 'M' : 'null'}, DexScreener=${fallbackMarketCap ? (fallbackMarketCap / 1000000).toFixed(2) + 'M' : 'null'}`)
    console.log(`🪙 TokenSupply sources: Codex=${tokenInfo?.circulatingSupply || tokenInfo?.totalSupply || 'null'}, DexScreener=${fallbackTokenSupply ? fallbackTokenSupply.toLocaleString() : 'null'}`)
    console.log(`✅ Final values: MarketCap=${marketCap ? (marketCap / 1000000).toFixed(2) + 'M' : 'null'}, Supply=${tokenSupply ? tokenSupply.toLocaleString() : 'null'}`)
    
    // Calculate time range based on timeframe and tweet timestamp
    const { from, to, resolution, resolutionConfig } = calculateTimeRange(timeframe, tweetTimestamp)
    
    console.log(`📊 Query params: symbol=${symbol}, from=${from}, to=${to}, resolution=${resolution}`)
    
    // Determine if this looks like a pair address (from DexScreener URL)
    // DexScreener URLs typically contain pair addresses, not individual token addresses
    const isProbablyPairAddress = symbol.split(':')[0].length > 30 // Long addresses are likely pairs
    
    // Use calculated time range to center data around tweet timestamp
    // Don't use countback when we have specific from/to times as it overrides the time range
    const variables: CodexBarsInput = {
      symbol,
      from, // Use calculated start time
      to,   // Use calculated end time
      resolution,
      currencyCode: 'USD',
      removeLeadingNullValues: true, // Remove leading nulls as recommended
      removeEmptyBars: true, // Remove gaps for low-activity tokens
      statsType: 'UNFILTERED', // Use UNFILTERED to capture extreme spikes and outliers
      // Note: Not using countback here as it would override our time range
      symbolType: isProbablyPairAddress ? 'POOL' : 'TOKEN'
    }
    
    console.log(`🎯 Using time-centered approach: from=${from}, to=${to}, resolution=${resolution}`)
    console.log(`📅 Requesting data from ${new Date(from * 1000).toISOString()} to ${new Date(to * 1000).toISOString()}`)

    console.log(`🎯 Using symbolType: ${variables.symbolType} (address length: ${symbol.split(':')[0].length})`)

    // Execute GraphQL query using direct HTTP fetch (as per Codex docs)
    const response = await executeCodexQuery(GET_BARS_QUERY, variables, apiKey)
    
    const barsData = response?.data?.getBars
    console.log(`✅ Codex response received:`, barsData?.s || 'no status', 'status:', barsData?.o?.length || 0, 'data points')
    
    if (!barsData || barsData.s !== 'ok' || !barsData.o || barsData.o.length === 0) {
      console.log('❌ No bars found with time range, trying alternatives...')
      
      // First try: opposite symbolType with same time range
      const fallbackSymbolType = variables.symbolType === 'POOL' ? 'TOKEN' : 'POOL'
      console.log(`🔄 Retrying with ${fallbackSymbolType} symbolType and same time range...`)
      variables.symbolType = fallbackSymbolType
      const retryResponse = await executeCodexQuery(GET_BARS_QUERY, variables, apiKey)
      
      const retryBarsData = retryResponse?.data?.getBars
      console.log(`🔍 Retry response: ${retryBarsData?.s || 'no status'}, ${retryBarsData?.o?.length || 0} data points`)
      
      if (!retryBarsData || retryBarsData.s !== 'ok' || !retryBarsData.o || retryBarsData.o.length === 0) {
        // Try with recent data (countback approach) if time range doesn't work
        console.log(`🔄 Time range failed, trying recent data with countback...`)
        const recentDataVariables = {
          ...variables,
          from: 0, // Use from: 0 for recent data
          to: Math.floor(Date.now() / 1000), // Current time
          countback: 1500 // Get recent data points
        }
        const recentResponse = await executeCodexQuery(GET_BARS_QUERY, recentDataVariables, apiKey)
        const recentBarsData = recentResponse?.data?.getBars
        console.log(`🔍 Recent data response: ${recentBarsData?.s || 'no status'}, ${recentBarsData?.o?.length || 0} data points`)
        
        if (recentBarsData && recentBarsData.s === 'ok' && recentBarsData.o && recentBarsData.o.length > 0) {
          console.log(`✅ Success with recent data approach`)
          
          // Check if tweet timestamp is before available data
          if (tweetTimestamp && recentBarsData.t && recentBarsData.t.length > 0) {
            const tweetTime = new Date(tweetTimestamp).getTime() / 1000
            const earliestDataTime = recentBarsData.t[0]
            
            if (tweetTime < earliestDataTime) {
              console.log(`⚠️ Tweet posted before chart data exists. Tweet: ${new Date(tweetTime * 1000).toISOString()}, Earliest data: ${new Date(earliestDataTime * 1000).toISOString()}`)
              return NextResponse.json(
                { 
                  error: `Tweet was posted before chart data exists for ${displaySymbol}`,
                  tweetTime: new Date(tweetTime * 1000).toISOString(),
                  earliestDataTime: new Date(earliestDataTime * 1000).toISOString(),
                  warning: 'The tweet timestamp is before any available price data for this token'
                },
                { status: 422 }
              )
            }
          }
          
          return NextResponse.json(formatCodexResponse(recentBarsData, displaySymbol, marketCap, tokenSupply))
        }
        
        // Try fallback resolution if recent data also failed
        console.log(`🔄 Trying fallback resolution: ${resolutionConfig.fallback}`)
        const fallbackVariables = { ...variables, resolution: resolutionConfig.fallback }
        const fallbackResponse = await executeCodexQuery(GET_BARS_QUERY, fallbackVariables, apiKey)
        
        const fallbackBarsData = fallbackResponse?.data?.getBars
        console.log(`🔍 Fallback resolution response: ${fallbackBarsData?.s || 'no status'}, ${fallbackBarsData?.o?.length || 0} data points`)
        
        if (fallbackBarsData && fallbackBarsData.s === 'ok' && fallbackBarsData.o && fallbackBarsData.o.length > 0) {
          console.log(`✅ Success with fallback resolution: ${resolutionConfig.fallback}`)
          
          // Check if tweet timestamp is before available data
          if (tweetTimestamp && fallbackBarsData.t && fallbackBarsData.t.length > 0) {
            const tweetTime = new Date(tweetTimestamp).getTime() / 1000
            const earliestDataTime = fallbackBarsData.t[0]
            
            if (tweetTime < earliestDataTime) {
              console.log(`⚠️ Tweet posted before chart data exists. Tweet: ${new Date(tweetTime * 1000).toISOString()}, Earliest data: ${new Date(earliestDataTime * 1000).toISOString()}`)
              return NextResponse.json(
                { 
                  error: `Tweet was posted before chart data exists for ${displaySymbol}`,
                  tweetTime: new Date(tweetTime * 1000).toISOString(),
                  earliestDataTime: new Date(earliestDataTime * 1000).toISOString(),
                  warning: 'The tweet timestamp is before any available price data for this token'
                },
                { status: 422 }
              )
            }
          }
          
          return NextResponse.json(formatCodexResponse(fallbackBarsData, displaySymbol, marketCap, tokenSupply))
        }
        
        // If this is Solana, try different network IDs
        const addressPart = symbol.split(':')[0]
        const currentNetworkId = symbol.split(':')[1]
        
        if (currentNetworkId === '1399811149') {
          console.log('🔄 Trying alternative Solana network IDs...')
          
          // Try other possible Solana network IDs (though 1399811149 should be correct)
          // Note: Only trying Solana-compatible network IDs, not Ethereum (1)
          const solanaNetworkIds = ['101', '900']
          
          for (const networkId of solanaNetworkIds) {
            if (networkId === currentNetworkId) continue // Skip the one we already tried
            
            const testSymbol = `${addressPart}:${networkId}`
            console.log(`🔍 Trying Solana network ID: ${networkId} (${testSymbol})`)
            
            const testVariables = { ...variables, symbol: testSymbol }
            const testResponse = await executeCodexQuery(GET_BARS_QUERY, testVariables, apiKey)
            
            const testBarsData = testResponse?.data?.getBars
            if (testBarsData && testBarsData.s === 'ok' && testBarsData.o && testBarsData.o.length > 0) {
              console.log(`✅ Success with Solana network ID: ${networkId}`)
              return NextResponse.json(formatCodexResponse(testBarsData, displaySymbol))
            }
          }
        }
        
        return NextResponse.json(
          { 
            error: 'No historical data available for this token/pair in Codex database.', 
            symbolTried: symbol,
            symbolTypesTried: [isProbablyPairAddress ? 'POOL' : 'TOKEN', fallbackSymbolType],
            codexErrors: response?.errors || retryResponse?.errors,
            suggestion: 'This token/pair may be too new, low-volume, or not indexed by Codex. The system will fall back to DexScreener data.',
            fallbackAvailable: true
          },
          { status: 404 }
        )
      }
      
      // Check if tweet timestamp is before available data
      if (tweetTimestamp && retryBarsData.t && retryBarsData.t.length > 0) {
        const tweetTime = new Date(tweetTimestamp).getTime() / 1000
        const earliestDataTime = retryBarsData.t[0]
        
        if (tweetTime < earliestDataTime) {
          console.log(`⚠️ Tweet posted before chart data exists. Tweet: ${new Date(tweetTime * 1000).toISOString()}, Earliest data: ${new Date(earliestDataTime * 1000).toISOString()}`)
          
          // For PUMP specifically, we'll return the available data instead of erroring
          // This allows us to show the actual chart from when PUMP started trading
          if (displaySymbol.includes('PUMP')) {
            console.log('🔧 PUMP special case: Returning available data despite tweet being before earliest data')
            return NextResponse.json(formatCodexResponse(retryBarsData, displaySymbol, marketCap, tokenSupply))
          }
          
          return NextResponse.json(
            { 
              error: `Tweet was posted before chart data exists for ${displaySymbol}`,
              tweetTime: new Date(tweetTime * 1000).toISOString(),
              earliestDataTime: new Date(earliestDataTime * 1000).toISOString(),
              warning: 'The tweet timestamp is before any available price data for this token'
            },
            { status: 422 }
          )
        }
      }
      
      return NextResponse.json(formatCodexResponse(retryBarsData, displaySymbol, marketCap, tokenSupply))
    }

    // Check if tweet timestamp is before available data (main success path)
    if (tweetTimestamp && barsData.t && barsData.t.length > 0) {
      const tweetTime = new Date(tweetTimestamp).getTime() / 1000
      const earliestDataTime = barsData.t[0]
      
      if (tweetTime < earliestDataTime) {
        console.log(`⚠️ Tweet posted before chart data exists. Tweet: ${new Date(tweetTime * 1000).toISOString()}, Earliest data: ${new Date(earliestDataTime * 1000).toISOString()}`)
        
        // For PUMP specifically, we'll return the available data instead of erroring
        // This allows us to show the actual chart from when PUMP started trading
        if (displaySymbol.includes('PUMP')) {
          console.log('🔧 PUMP special case: Returning available data despite tweet being before earliest data')
          return NextResponse.json(formatCodexResponse(barsData, displaySymbol, marketCap, tokenSupply))
        }
        
        return NextResponse.json(
          { 
            error: `Tweet was posted before chart data exists for ${displaySymbol}`,
            tweetTime: new Date(tweetTime * 1000).toISOString(),
            earliestDataTime: new Date(earliestDataTime * 1000).toISOString(),
            warning: 'The tweet timestamp is before any available price data for this token'
          },
          { status: 422 }
        )
      }
    }

    // Format and return the response
    const formattedData = formatCodexResponse(barsData, displaySymbol, marketCap, tokenSupply)
    return NextResponse.json(formattedData)

  } catch (error) {
    console.error('❌ Codex API error:', error)
    
    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        return NextResponse.json(
          { error: 'Invalid Codex API key. Please check your CODEX_API_KEY in .env file.' },
          { status: 401 }
        )
      }
      
      if (error.message.includes('Not Found') || error.message.includes('404')) {
        return NextResponse.json(
          { error: 'Symbol not found. Please check the symbol format (tokenAddress:networkId).' },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch data from Codex API', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper function to calculate time range based on timeframe and tweet timestamp
function calculateTimeRange(timeframe: string, tweetTimestamp?: string | null) {
  const now = Date.now()
  const tweetTime = tweetTimestamp ? new Date(tweetTimestamp).getTime() : now
  
  // Debug timestamp conversion
  if (tweetTimestamp) {
    console.log(`🕐 Tweet timestamp: ${tweetTimestamp}`)
    console.log(`🕐 Parsed tweet time: ${new Date(tweetTime).toISOString()}`)
    console.log(`🕐 Current time: ${new Date(now).toISOString()}`)
  }
  
  // Resolution mapping for Codex API with fallbacks for unsupported resolutions
  // Using highest resolution possible to capture ALL spikes across all intervals
  const resolutionMap: Record<string, { primary: string; fallback: string }> = {
    '5m': { primary: '1', fallback: '5' },       // 1 minute for maximum spike capture
    '15m': { primary: '1', fallback: '5' },      // 1 minute for maximum spike capture  
    '1h': { primary: '5', fallback: '15' },      // 5 minutes for high resolution
    '4h': { primary: '15', fallback: '60' },     // 15 minutes for detailed capture
    '6h': { primary: '15', fallback: '60' },     // 15 minutes for detailed capture
    '1d': { primary: '60', fallback: '240' },    // 1 hour for comprehensive coverage
    '1w': { primary: '240', fallback: '1D' },    // 4 hours for weekly view with spike capture
    '1m': { primary: '1D', fallback: '7D' }      // 1 day for monthly view with comprehensive coverage
  }
  
  const resolutionConfig = resolutionMap[timeframe] || { primary: '60', fallback: '240' }
  const resolution = resolutionConfig.primary
  
  console.log(`📊 Using HIGH-RESOLUTION: ${resolution} for timeframe: ${timeframe} (fallback: ${resolutionConfig.fallback})`)
  console.log(`🎯 Spike capture mode: UNFILTERED stats + HIGH prices + ${resolution}-minute resolution`)
  
  // Time range calculation - center around tweet time or use recent data
  let from: number, to: number
  
  if (tweetTimestamp) {
    // For monthly interval, show 2 months before tweet timestamp up to present
    if (timeframe === '1m') {
      const monthsBeforeTweet = 60 * 24 * 60 * 60 * 1000 // 2 months before tweet
      from = Math.floor((tweetTime - monthsBeforeTweet) / 1000)
      to = Math.floor(now / 1000)
      console.log(`📅 Monthly chart: showing 2 months before tweet (${new Date(tweetTime).toISOString()}) up to present`)
      console.log(`📅 Time range: ${new Date(from * 1000).toISOString()} to ${new Date(to * 1000).toISOString()}`)
    } else {
      // Center the chart around the tweet time with improved ranges for better anchor visibility
      const timeRanges: Record<string, number> = {
        '5m': 3 * 60 * 60 * 1000,      // 3 hours total (1.5h before/after tweet)
        '15m': 8 * 60 * 60 * 1000,     // 8 hours total (4h before/after tweet)
        '1h': 16 * 60 * 60 * 1000,     // 16 hours total (8h before/after tweet)
        '4h': 5 * 24 * 60 * 60 * 1000, // 5 days total (2.5d before/after tweet)
        '6h': 8 * 24 * 60 * 60 * 1000, // 8 days total (4d before/after tweet)
        '1d': 30 * 24 * 60 * 60 * 1000, // 30 days total (15d before/after tweet)
        '1w': 90 * 24 * 60 * 60 * 1000  // 90 days total (45d before/after tweet)
      }
      
      const totalRange = timeRanges[timeframe] || 16 * 60 * 60 * 1000
      const halfRange = totalRange / 2
      
      // Ensure exact centering around tweet time
      from = Math.floor((tweetTime - halfRange) / 1000)
      to = Math.floor((tweetTime + halfRange) / 1000)
      
      console.log(`⚖️ Centering chart: tweet at ${new Date(tweetTime).toISOString()}, range: ${totalRange/1000/60/60}h total`)
      console.log(`📅 Time range: ${new Date(from * 1000).toISOString()} to ${new Date(to * 1000).toISOString()}`)
    }
  } else {
    // Use recent data ending at current time
    const timeRanges: Record<string, number> = {
      '5m': 4 * 60 * 60 * 1000,      // Last 4 hours
      '15m': 24 * 60 * 60 * 1000,    // Last 24 hours
      '1h': 7 * 24 * 60 * 60 * 1000, // Last 7 days
      '4h': 30 * 24 * 60 * 60 * 1000, // Last 30 days
      '6h': 30 * 24 * 60 * 60 * 1000, // Last 30 days
      '1d': 90 * 24 * 60 * 60 * 1000, // Last 90 days
      '1w': 365 * 24 * 60 * 60 * 1000, // Last 365 days (1 year)
      '1m': 365 * 24 * 60 * 60 * 1000 // Last 365 days (1 year)
    }
    
    const range = timeRanges[timeframe] || 24 * 60 * 60 * 1000
    from = Math.floor((now - range) / 1000)
    to = Math.floor(now / 1000)
  }
  
  return { from, to, resolution, resolutionConfig }
}

// Helper function to format Codex BarsResponse for our chart component
function formatCodexResponse(barsData: CodexBarsResponse, displaySymbol: string = 'TOKEN', marketCap?: number, tokenSupply?: number) {
  const prices: number[] = []
  const volumes: number[] = []
  const timestamps: string[] = []
  
  // Validate BarsResponse data
  if (!barsData || barsData.s !== 'ok' || !barsData.o || barsData.o.length === 0) {
    console.warn('Invalid or empty BarsResponse provided to formatCodexResponse')
    return {
      symbol: `${displaySymbol}/USD`,
      prices: [],
      volumes: [],
      timestamps: [],
      currentPrice: 0,
      priceChange24h: 0,
      source: 'codex',
      dataPoints: 0
    }
  }
  
  // Process each data point (arrays are parallel)
  const dataLength = barsData.o.length
  
  for (let i = 0; i < dataLength; i++) {
    // Use high price to capture spikes, fallback to close, then open
    // This ensures we capture the peak of any brief spikes that might be missed with close prices
    const highPrice = barsData.h[i] || barsData.c[i] || barsData.o[i] || 0
    prices.push(highPrice)
    
    // Convert volume from string to number
    const volumeStr = barsData.volume?.[i] || '0'
    volumes.push(parseFloat(volumeStr))
    
    // Convert timestamp from Unix seconds to ISO string
    const timestamp = barsData.t[i] * 1000 // Convert to milliseconds
    const date = new Date(timestamp)
    timestamps.push(date.toISOString())
  }
  
  // Calculate current price and 24h change
  const currentPrice = prices[prices.length - 1] || 0
  const price24hAgo = prices.length > 24 ? prices[prices.length - 24] : prices[0]
  const priceChange24h = price24hAgo ? ((currentPrice - price24hAgo) / price24hAgo) * 100 : 0
  
  // Enhanced debugging for price range analysis
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceVariance = ((maxPrice / minPrice - 1) * 100).toFixed(1)
  
  console.log(`📈 Formatted ${dataLength} bars: price range $${minPrice.toFixed(8)} - $${maxPrice.toFixed(8)} (${priceVariance}% variance)`)
  console.log(`📊 High prices array (first 10):`, barsData.h?.slice(0, 10)?.map(h => `$${h.toFixed(8)}`))
  console.log(`🔥 Maximum high price in dataset: $${Math.max(...(barsData.h || []))?.toFixed(8)}`)
  
  const finalMarketCap = marketCap || (currentPrice && tokenSupply ? currentPrice * tokenSupply : undefined)
  const response = {
    symbol: `${displaySymbol}/USD`,
    prices,
    volumes,
    timestamps,
    currentPrice,
    priceChange24h,
    marketCap: finalMarketCap,
    tokenSupply,
    source: 'codex',
    dataPoints: dataLength
  }
  
  console.log(`📤 API Response: marketCap=${finalMarketCap ? '$' + finalMarketCap.toLocaleString() : 'undefined'}, currentPrice=$${currentPrice.toFixed(8)}, tokenSupply=${tokenSupply ? tokenSupply.toLocaleString() : 'undefined'}`)
  
  return response
}

// Helper function to execute GraphQL query using direct HTTP fetch (as per Codex docs)
async function executeCodexQuery(query: string, variables: any, apiKey: string) {
  const response = await fetch('https://graph.codex.io/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey, // Secret key format (not Bearer)
    },
    body: JSON.stringify({
      query,
      variables
    })
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()
  
  // Check for GraphQL errors
  if (data.errors) {
    console.error('GraphQL errors:', data.errors)
    // Don't throw immediately for generic errors - let the caller handle them
    // throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`)
  }

  return data
}

// Function to get token information (symbol, name, marketcap, supply, etc.)
async function getTokenInfo(address: string, networkId: string, apiKey: string): Promise<{ 
  symbol?: string; 
  name?: string; 
  marketCap?: number; 
  totalSupply?: number; 
  circulatingSupply?: number 
} | null> {
  try {
    console.log(`🔍 Fetching token info for ${address}:${networkId}`)
    
    const response = await fetch('https://graph.codex.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({
        query: GET_TOKEN_INFO_QUERY,
        variables: {
          input: {
            address: address,
            networkId: parseInt(networkId)
          }
        }
      })
    })

    if (!response.ok) {
      console.log(`⚠️ Token info request failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()
    
    if (data.errors) {
      console.log('⚠️ Token info errors:', data.errors)
      return null
    }

    const token = data.data?.token
    if (token) {
      const symbol = token.symbol || token.info?.symbol
      const name = token.name || token.info?.name
      const marketCap = token.info?.marketCap ? parseFloat(token.info.marketCap) : undefined
      const totalSupply = token.info?.totalSupply ? parseFloat(token.info.totalSupply) : undefined
      const circulatingSupply = token.info?.circulatingSupply ? parseFloat(token.info.circulatingSupply) : undefined
      
      console.log(`✅ Token info found: ${symbol} (${name})`)
      if (marketCap) console.log(`💰 Market Cap: $${(marketCap / 1000000).toFixed(2)}M`)
      if (totalSupply) console.log(`🪙 Total Supply: ${totalSupply.toLocaleString()}`)
      
      return { symbol, name, marketCap, totalSupply, circulatingSupply }
    }

    console.log('⚠️ No token info found')
    return null
  } catch (error) {
    console.log('❌ Token info fetch error:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET instead.' },
    { status: 405 }
  )
}
