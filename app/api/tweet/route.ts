import { NextRequest, NextResponse } from 'next/server'

// Generate token for the free react-tweet API
function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tweetId = searchParams.get('id')
  const tweetUrl = searchParams.get('url') // Add URL parameter for fallback
  
  if (!tweetId) {
    return NextResponse.json({ error: 'Tweet ID is required' }, { status: 400 })
  }

  try {
    const token = getToken(tweetId)
    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`
    
    console.log(`Fetching tweet from: ${apiUrl}`)
    
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('Tweet API response:', data)
    
    // Parse the created_at timestamp properly
    let parsedTimestamp = new Date().toISOString()
    console.log('Raw created_at from Twitter API:', data.created_at)
    
    if (data.created_at) {
      try {
        // Twitter API returns timestamps like "Wed Oct 10 20:19:24 +0000 2018"
        const twitterDate = new Date(data.created_at)
        console.log('Parsed Twitter date:', twitterDate.toString())
        
        if (!isNaN(twitterDate.getTime())) {
          // Use the Twitter API timestamp as-is (it's reliable)
          parsedTimestamp = twitterDate.toISOString()
          console.log('Successfully parsed created_at:', parsedTimestamp)
        } else {
          console.warn('Invalid created_at timestamp:', data.created_at)
        }
      } catch (error) {
        console.error('Error parsing created_at timestamp:', error)
      }
    } else {
      console.log('No created_at field in Twitter API response')
    }
    
    // Fallback: Extract timestamp from Twitter ID only if created_at is completely missing or invalid
    // Twitter IDs contain embedded timestamps (Twitter Snowflake format)
    if (!data.created_at || isNaN(new Date(parsedTimestamp).getTime())) {
      try {
        console.log('Twitter API created_at missing or invalid, trying Snowflake extraction...')
        // Twitter Snowflake ID format: timestamp is in the first 41 bits
        // Twitter epoch started at 1288834974657 (Nov 4, 2010 01:42:54 UTC)
        const twitterEpoch = 1288834974657
        const tweetIdBigInt = BigInt(tweetId)
        const timestampMs = Number(tweetIdBigInt >> BigInt(22)) + twitterEpoch
        const extractedDate = new Date(timestampMs)
        
        if (!isNaN(extractedDate.getTime()) && extractedDate.getFullYear() >= 2006 && extractedDate.getFullYear() <= new Date().getFullYear()) {
          parsedTimestamp = extractedDate.toISOString()
          console.log('Used tweet ID to extract timestamp:', parsedTimestamp)
        } else {
          console.log('Snowflake extraction gave invalid date:', extractedDate)
        }
      } catch (error) {
        console.error('Error extracting timestamp from tweet ID:', error)
      }
    } else {
      console.log('Using Twitter API created_at timestamp:', parsedTimestamp)
    }
    
    console.log('Parsed timestamp:', parsedTimestamp)
    
    // Extract username from URL as fallback if API doesn't provide user data
    let fallbackUsername = "unknown"
    if (tweetUrl && (!data.user?.screen_name && !data.user?.name)) {
      const urlMatch = tweetUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/)
      if (urlMatch) {
        fallbackUsername = urlMatch[1]
        console.log(`Using URL fallback username: ${fallbackUsername}`)
      }
    }
    
    const username = data.user?.screen_name || data.user?.name || fallbackUsername
    
    return NextResponse.json({
      username: username,
      handle: `@${data.user?.screen_name || fallbackUsername}`,
      text: data.text || "Tweet content unavailable",
      timestamp: parsedTimestamp,
      profileImage: data.user?.profile_image_url_https || data.user?.profile_image_url || null,
      // Remove engagement stats completely
    })
  } catch (error) {
    console.error('Error fetching tweet:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch tweet data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 
