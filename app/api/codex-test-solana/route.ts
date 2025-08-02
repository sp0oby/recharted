import { NextRequest, NextResponse } from 'next/server'

// Test query to find Solana tokens in Codex
const FILTER_TOKENS_QUERY = `
  query filterTokens($filters: TokenFilters, $limit: Int) {
    filterTokens(
      filters: $filters
      limit: $limit
    ) {
      results {
        token {
          address
          name
          symbol
          networkId
        }
      }
    }
  }
`

export async function GET(request: NextRequest) {
  const apiKey = process.env.CODEX_API_KEY
  
  if (!apiKey || apiKey === 'your-codex-api-key-here') {
    return NextResponse.json(
      { error: 'Codex API key not configured' },
      { status: 500 }
    )
  }

  try {
    console.log('🔍 Searching for Solana tokens in Codex...')
    
    const response = await fetch('https://graph.codex.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({
        query: FILTER_TOKENS_QUERY,
        variables: {
          filters: {
            network: [1399811149] // Solana network ID
          },
          limit: 10
        }
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.errors) {
      console.error('GraphQL errors:', data.errors)
      return NextResponse.json(
        { error: 'GraphQL errors', details: data.errors },
        { status: 500 }
      )
    }

    const tokens = data.data?.filterTokens?.results || []
    console.log(`✅ Found ${tokens.length} Solana tokens in Codex`)
    
    // Extract some example addresses for testing
    const examples = tokens.slice(0, 5).map((result: any) => ({
      token: {
        address: result.token.address,
        symbol: result.token.symbol,
        name: result.token.name,
        codexId: `${result.token.address}:${result.token.networkId}`
      }
    }))
    
    return NextResponse.json({
      totalFound: tokens.length,
      examples,
      message: 'These are valid Solana tokens/pairs in Codex database'
    })

  } catch (error) {
    console.error('❌ Solana test API error:', error)
    return NextResponse.json(
      { error: 'Failed to search Solana tokens', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}