import { NextRequest, NextResponse } from 'next/server'

// Simple query to get available networks from Codex
const GET_NETWORKS_QUERY = `
  query getNetworks {
    getNetworks {
      id
      name
      networkShortName
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
    console.log('🔍 Fetching available networks from Codex...')
    
    const response = await fetch('https://graph.codex.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({
        query: GET_NETWORKS_QUERY
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

    console.log('✅ Available networks:', data.data.getNetworks)
    
    return NextResponse.json({
      networks: data.data.getNetworks,
      solanaNetwork: data.data.getNetworks.find((n: any) => 
        n.name.toLowerCase().includes('solana') || 
        n.networkShortName?.toLowerCase().includes('solana')
      )
    })

  } catch (error) {
    console.error('❌ Networks API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch networks', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}