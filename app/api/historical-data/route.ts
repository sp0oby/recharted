import { NextRequest, NextResponse } from 'next/server'
import { fetchChartDataWithHistory } from '@/lib/api'

/**
 * Unified Historical Data API Endpoint
 * 
 * This endpoint provides a single interface for fetching historical chart data
 * that automatically tries the best available data source:
 * 1. Codex GraphQL API (real OHLCV data)
 * 2. DexScreener API (current data + generated history)
 * 3. Mock data (fallback)
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Get parameters from query string
  const chartUrl = searchParams.get('chartUrl')
  const timeframe = searchParams.get('timeframe') || '1h'
  const tweetTimestamp = searchParams.get('tweetTimestamp')
  
  if (!chartUrl) {
    return NextResponse.json(
      { error: 'chartUrl parameter is required' },
      { status: 400 }
    )
  }

  try {
    console.log(`🔄 Fetching historical data for: ${chartUrl}`)
    console.log(`⏰ Timeframe: ${timeframe}, Tweet timestamp: ${tweetTimestamp || 'none'}`)
    
    // Use the enhanced chart data fetching that tries Codex first
    const chartData = await fetchChartDataWithHistory(chartUrl, timeframe, tweetTimestamp || undefined)
    
    console.log(`✅ Historical data fetched successfully from ${chartData.source || 'unknown'} source`)
    console.log(`📊 Data points: ${chartData.dataPoints || chartData.prices.length}`)
    
    // Add metadata about the data source and quality
    const response = {
      ...chartData,
      metadata: {
        source: chartData.source || 'unknown',
        dataPoints: chartData.dataPoints || chartData.prices.length,
        timeframe,
        tweetTimestamp: tweetTimestamp || null,
        fetchedAt: new Date().toISOString(),
        isRealData: chartData.source === 'codex',
        isGeneratedData: chartData.source === 'dexscreener'
      }
    }
    
    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ Historical data API error:', error)
    
    // Return error details for debugging
    return NextResponse.json(
      { 
        error: 'Failed to fetch historical data',
        details: error instanceof Error ? error.message : 'Unknown error',
        chartUrl,
        timeframe,
        tweetTimestamp
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET instead.' },
    { status: 405 }
  )
}

// Helper function to validate chart URL format
function isValidChartUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    
    // Support DexScreener URLs
    if (parsedUrl.hostname.includes('dexscreener.com')) {
      return true
    }
    
    // Support other chart platforms as needed
    // Add more validation here for other platforms
    
    return false
  } catch {
    return false
  }
}