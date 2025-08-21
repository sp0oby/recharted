"use client"

import type React from "react"

import { useState, useEffect } from "react"

interface TweetData {
  username: string
  handle: string
  text: string
  timestamp: string
  profileImage?: string
}

interface Position {
  x: number
  y: number
}

interface ChartData {
  labels: string[]
  prices: number[]
  timeData: Array<{ time: string; timestamp: number; price: number }>
  chartInstance: any
}

interface TweetOverlayProps {
  tweetData: TweetData
  position: Position
  tradeTime: string
  chartContainerRef: React.RefObject<HTMLDivElement | null>
  chartData?: ChartData
  onMouseDown: (e: React.MouseEvent) => void
  isDragging: boolean
  timeframe?: string
}

export default function TweetOverlay({
  tweetData,
  position,
  tradeTime,
  chartContainerRef,
  chartData,
  onMouseDown,
  isDragging,
  timeframe,
}: TweetOverlayProps) {
  const [arrowPath, setArrowPath] = useState("")
  const [anchorPoint, setAnchorPoint] = useState({ x: 0, y: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const [isTouch, setIsTouch] = useState(false)
  const [storedTweetTime, setStoredTweetTime] = useState(tradeTime) // Store tweet time and update when tweet changes
  
  // Update stored tweet time when tradeTime changes (new tweet)
  useEffect(() => {
    setStoredTweetTime(tradeTime)
    console.log('📍 Tweet anchor updated to new timestamp:', tradeTime)
  }, [tradeTime])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)

    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    console.log(`🔍 TweetOverlay useEffect triggered - timeframe: ${timeframe}, chartData exists: ${!!chartData}, chartInstance exists: ${!!chartData?.chartInstance}`)
    if (chartContainerRef.current && chartData && chartData.chartInstance) {
      // Use Chart.js internal chart area for precise positioning
      const chart = chartData.chartInstance
      const chartArea = chart.chartArea

      if (chartArea && chart.canvas) {
        // Always use the stored tweet time to maintain anchor position
        const timeAnchor = calculateTimeAnchorOnLine(storedTweetTime, chartArea, chartData, chart)
        setAnchorPoint(timeAnchor)

        // Calculate tweet center - adjust for mobile
        const tweetWidth = isMobile ? 128 : 288
        const tweetHeight = isMobile ? 80 : 120
        const tweetCenterX = position.x + tweetWidth / 2
        const tweetCenterY = position.y + tweetHeight / 2

        // Create dynamic curved arrow from time anchor to tweet
        const deltaX = tweetCenterX - timeAnchor.x
        const deltaY = tweetCenterY - timeAnchor.y

        // Control point for curve (creates a nice arc)
        const controlX = timeAnchor.x + deltaX * 0.5
        const controlY = timeAnchor.y + deltaY * 0.3 - (isMobile ? 30 : 50) // Smaller curve on mobile

        const path = `M ${timeAnchor.x} ${timeAnchor.y} Q ${controlX} ${controlY} ${tweetCenterX} ${tweetCenterY}`
        setArrowPath(path)
      }
    }
  }, [position, chartContainerRef, chartData, isMobile, storedTweetTime]) // Use storedTweetTime

  const calculateTimeAnchorOnLine = (time: string, chartArea: any, chartData: ChartData, chart: any) => {
    // Parse the time input - can be "HH:MM" or "YYYY-MM-DD HH:MM" format
    let inputDateTime: Date
    
    if (time.includes('-')) {
      // Full date and time format: "2024-12-15 14:30"
      inputDateTime = new Date(time)
    } else {
      // Time only format: "14:30" - assume today's date
      const [hours, minutes] = time.split(":").map(Number)
      inputDateTime = new Date()
      inputDateTime.setHours(hours, minutes, 0, 0)
    }

    console.log(`🎯 Looking for anchor point for: ${time} -> ${inputDateTime.toISOString()}`)
    console.log(`🕐 Tweet time in local: ${inputDateTime.toLocaleString()}`)
    console.log(`🕐 Tweet time in UTC: ${inputDateTime.toISOString()}`)
    
    console.log(`📊 Available time data points (first 5):`, chartData.timeData.slice(0, 5).map(d => ({
      time: d.time,
      timestamp: new Date(d.timestamp).toISOString(),
      localTime: new Date(d.timestamp).toLocaleString(),
      price: d.price
    })))
    console.log(`📊 Available time data points (last 5):`, chartData.timeData.slice(-5).map(d => ({
      time: d.time,
      timestamp: new Date(d.timestamp).toISOString(),
      localTime: new Date(d.timestamp).toLocaleString(),
      price: d.price
    })))
    console.log(`📅 Chart data range: ${new Date(chartData.timeData[0]?.timestamp).toISOString()} to ${new Date(chartData.timeData[chartData.timeData.length - 1]?.timestamp).toISOString()}`)
    console.log(`📅 Chart range local: ${new Date(chartData.timeData[0]?.timestamp).toLocaleString()} to ${new Date(chartData.timeData[chartData.timeData.length - 1]?.timestamp).toLocaleString()}`)

    // Find the EARLIEST point of a significant price movement around the tweet time
    let anchorIndex = 0
    let minDifference = Number.POSITIVE_INFINITY
    let usingCenterFallback = false
    let spikeDetected = false

    // First, find the closest time point as a baseline
    let closestIndex = 0
    chartData.timeData.forEach((dataPoint, index) => {
      const dataDateTime = new Date(dataPoint.timestamp)
      const difference = Math.abs(dataDateTime.getTime() - inputDateTime.getTime())

      if (difference < minDifference) {
        minDifference = difference
        closestIndex = index
      }
    })

    // For monthly interval, skip spike detection and use exact timestamp match
    if (timeframe === '1m') {
      anchorIndex = closestIndex
      spikeDetected = false // Monthly never has spike detection
      console.log(`📅 Monthly interval: using exact timestamp match, skipping spike detection`)
      console.log(`📍 Selected anchor index: ${closestIndex} out of ${chartData.timeData.length} data points`)
      console.log(`📍 Selected timestamp: ${new Date(chartData.timeData[closestIndex].timestamp).toISOString()}`)
      console.log(`📍 Selected local time: ${new Date(chartData.timeData[closestIndex].timestamp).toLocaleString()}`)
      console.log(`⏰ Time difference from tweet: ${Math.abs(new Date(chartData.timeData[closestIndex].timestamp).getTime() - inputDateTime.getTime()) / (1000 * 60 * 60)} hours`)
    } else {
      // Now look for the EARLIEST point of a significant price movement around the tweet time
      // Search in a larger window, especially forward (since spikes often happen AFTER tweets)
      const backwardWindow = Math.min(5, Math.floor(chartData.timeData.length / 8)) // Look back 5 points
      const forwardWindow = Math.min(20, Math.floor(chartData.timeData.length / 3)) // Look forward 20 points or 33% of data
      const searchStart = Math.max(0, closestIndex - backwardWindow)
      const searchEnd = Math.min(chartData.timeData.length - 1, closestIndex + forwardWindow)
      
      console.log(`🔍 Searching for spike start from index ${searchStart} to ${searchEnd} (around tweet index ${closestIndex})`)
      
      // Debug: Show price range in search window and full dataset
      const searchWindowPrices = chartData.prices.slice(searchStart, searchEnd + 1)
      const minInWindow = Math.min(...searchWindowPrices.filter(p => p > 0))
      const maxInWindow = Math.max(...searchWindowPrices)
      const maxInFullDataset = Math.max(...chartData.prices)
      
      console.log(`🔍 Search window price range: $${minInWindow.toFixed(8)} - $${maxInWindow.toFixed(8)}`)
      console.log(`🔍 Full dataset max price: $${maxInFullDataset.toFixed(8)}`)
      console.log(`⚠️ Is max in search window? ${maxInWindow === maxInFullDataset ? 'YES' : 'NO - spike might be outside window!'}`)
      
      // Look for significant price movements (spikes up or down) in the search window
      let maxPriceChange = 0
      let spikeStartIndex = closestIndex
      
      for (let i = searchStart; i < searchEnd - 1; i++) {
        const currentPrice = chartData.prices[i]
        const nextPrice = chartData.prices[i + 1]
        
        if (currentPrice && nextPrice) {
          const priceChange = Math.abs((nextPrice - currentPrice) / currentPrice)
          
          // Look for significant movements (>5% for high sensitivity to capture more spikes)
          if (priceChange > 0.05 && priceChange > maxPriceChange) {
            maxPriceChange = priceChange
            spikeStartIndex = i // This is the START of the movement (before the change)
            spikeDetected = true
          }
        }
      }
      
      // Use spike start if detected, otherwise use closest time
      anchorIndex = spikeDetected ? spikeStartIndex : closestIndex
      
      // Log results for non-monthly intervals
      if (spikeDetected) {
        console.log(`🚀 Spike detected! ${(maxPriceChange * 100).toFixed(1)}% movement starting at index ${spikeStartIndex}`)
        console.log(`📍 Anchoring at SPIKE START: ${new Date(chartData.timeData[spikeStartIndex].timestamp).toISOString()}`)
        console.log(`📍 Spike start local time: ${new Date(chartData.timeData[spikeStartIndex].timestamp).toLocaleString()}`)
        console.log(`💰 Price at spike start: $${chartData.prices[spikeStartIndex]?.toFixed(8)}`)
        console.log(`💰 Price after movement: $${chartData.prices[spikeStartIndex + 1]?.toFixed(8)}`)
      } else {
        console.log(`📍 No significant spike detected, using closest time match at index ${closestIndex}`)
        console.log(`📍 Closest match timestamp: ${new Date(chartData.timeData[closestIndex].timestamp).toISOString()}`)
        console.log(`📍 Closest match local time: ${new Date(chartData.timeData[closestIndex].timestamp).toLocaleString()}`)
        console.log(`⏰ Time difference: ${minDifference / (1000 * 60)} minutes`)
      }
    }
    
    // Check if the tweet timestamp is outside the available data range
    const dataStart = chartData.timeData[0]?.timestamp
    const dataEnd = chartData.timeData[chartData.timeData.length - 1]?.timestamp
    const tweetTime = inputDateTime.getTime()
    
    // Adjust tolerance based on timeframe - weekly needs much larger tolerance due to sparse data
    const isShortTimeframe = timeframe && ['5m', '15m', '1h'].includes(timeframe)
    const isWeeklyTimeframe = timeframe === '1w'
    const isMonthlyTimeframe = timeframe === '1m'
    
    let toleranceMs: number
    if (isShortTimeframe) {
      toleranceMs = 15 * 60 * 1000 // 15 minutes for short timeframes
    } else if (isWeeklyTimeframe) {
      toleranceMs = 7 * 24 * 60 * 60 * 1000 // 7 days for weekly timeframe (much larger tolerance)
    } else if (isMonthlyTimeframe) {
      toleranceMs = 30 * 24 * 60 * 60 * 1000 // 30 days for monthly timeframe (largest tolerance)
    } else {
      toleranceMs = 30 * 60 * 1000 // 30 minutes for medium timeframes (4h, 6h, 1d)
    }
    
    // For monthly interval, if tweet is within the same day as the last data point, don't treat it as outside range
    let isOutsideRange: boolean
    if (isMonthlyTimeframe) {
      const dataEndDate = new Date(dataEnd)
      const tweetDate = new Date(tweetTime)
      const sameDay = dataEndDate.toDateString() === tweetDate.toDateString()
      
      if (sameDay && tweetTime > dataEnd) {
        // Tweet is on the same day as last data point but later in the day - this is fine for monthly
        isOutsideRange = false
        console.log(`📅 Monthly: Tweet is on same day as last data point (${dataEndDate.toDateString()}), treating as in-range`)
      } else {
        isOutsideRange = tweetTime < dataStart || tweetTime > dataEnd
      }
    } else {
      isOutsideRange = tweetTime < dataStart || tweetTime > dataEnd
    }
    
    const isLargeDifference = minDifference > toleranceMs
    
    // Center anchor if tweet is outside data range or time difference exceeds tolerance
    // Tolerance: 15min (short), 30min (medium), 7 days (weekly)
    if (isOutsideRange || isLargeDifference) {
      anchorIndex = Math.floor(chartData.timeData.length / 2)
      usingCenterFallback = true
      
      if (isOutsideRange) {
        console.log(`⚖️ Tweet outside data range, using center of chart at index ${anchorIndex}`)
        console.log(`📊 Data range: ${new Date(dataStart).toISOString()} to ${new Date(dataEnd).toISOString()}`)
        console.log(`🎯 Tweet time: ${inputDateTime.toISOString()} - centering anchor`)
      } else {
        const timeDiffHours = Math.round(minDifference / (60 * 60 * 1000))
        const timeDiffMinutes = Math.round(minDifference / (60 * 1000))
        const displayDiff = timeDiffHours > 1 ? `${timeDiffHours}h` : `${timeDiffMinutes}min`
        console.log(`⚖️ Large time difference detected (${displayDiff}) for ${timeframe}, using center at index ${anchorIndex}`)
        console.log(`📏 Tolerance for ${timeframe}: ${isWeeklyTimeframe ? '7 days' : isShortTimeframe ? '15min' : '30min'}`)
      }
    }
    
    // For debugging: always show the time difference
    console.log(`⏰ Time difference: ${Math.round(minDifference / (60 * 1000))} minutes from tweet to closest data point`)

    // Validate that we have valid chart data before accessing it
    if (chartData.timeData && chartData.timeData[anchorIndex]) {
      if (usingCenterFallback) {
        console.log(`Using center fallback at index ${anchorIndex}: ${new Date(chartData.timeData[anchorIndex].timestamp).toISOString()}`)
      } else if (spikeDetected) {
        console.log(`Final anchor at SPIKE START index ${anchorIndex}: ${new Date(chartData.timeData[anchorIndex].timestamp).toISOString()}`)
      } else {
        console.log(`Final anchor at closest time index ${anchorIndex}: ${new Date(chartData.timeData[anchorIndex].timestamp).toISOString()}`)
        console.log(`Time difference: ${minDifference}ms (${Math.round(minDifference / 1000 / 60)} minutes)`)
      }
    } else {
      console.warn('No valid chart data available for time anchor calculation')
    }

    // Get the canvas element and its position
    const canvas = chart.canvas
    if (!canvas) {
      console.error('Canvas element not available')
      return { x: 0, y: 0 }
    }
    
    const canvasRect = canvas.getBoundingClientRect()
    const containerRect = chartContainerRef.current?.getBoundingClientRect()
    
    if (!containerRect) {
      console.error('Container ref not available')
      return { x: 0, y: 0 }
    }
    
    // Calculate offset between canvas and container
    const canvasOffsetX = canvasRect.left - containerRect.left
    const canvasOffsetY = canvasRect.top - containerRect.top
    
    console.log(`Canvas offset: (${canvasOffsetX}, ${canvasOffsetY})`)
    console.log(`Chart area: left=${chartArea.left}, top=${chartArea.top}, right=${chartArea.right}, bottom=${chartArea.bottom}`)
    
    // Try Chart.js metadata first
    const metaData = chart.getDatasetMeta(0)
    if (metaData && metaData.data && metaData.data[anchorIndex]) {
      const point = metaData.data[anchorIndex]
      if (point && typeof point.x === 'number' && typeof point.y === 'number') {
        const adjustedX = point.x + canvasOffsetX
        const adjustedY = point.y + canvasOffsetY
        console.log(`✅ Using Chart.js line point: (${point.x}, ${point.y}) -> adjusted: (${adjustedX}, ${adjustedY})`)
        return { x: adjustedX, y: adjustedY }
      }
    }

    // Fallback: use scale calculations with canvas offset
    const xScale = chart.scales.x
    const yScale = chart.scales.y
    const scaleX = xScale.getPixelForValue(anchorIndex)
    const priceAtTime = chartData.prices[anchorIndex] || 0.000001
    const scaleY = yScale.getPixelForValue(priceAtTime)
    
    const anchorX = scaleX + canvasOffsetX
    const anchorY = scaleY + canvasOffsetY
    
    console.log(`⚠️ Using scale calculation: (${scaleX}, ${scaleY}) -> adjusted: (${anchorX}, ${anchorY})`)
    console.log(`Price at time: ${priceAtTime}, Index: ${anchorIndex}`)
    
    return { x: anchorX, y: anchorY }
  }

  const findClosestTimeIndex = (time: string, chartData: ChartData) => {
    // Parse the time input - can be "HH:MM" or "YYYY-MM-DD HH:MM" format
    let inputDateTime: Date
    
    if (time.includes('-')) {
      // Full date and time format: "2024-12-15 14:30"
      inputDateTime = new Date(time)
    } else {
      // Time only format: "14:30" - assume today's date
      const [hours, minutes] = time.split(":").map(Number)
      inputDateTime = new Date()
      inputDateTime.setHours(hours, minutes, 0, 0)
    }

    let closestIndex = 0
    let minDifference = Number.POSITIVE_INFINITY

    chartData.timeData.forEach((dataPoint, index) => {
      const dataDateTime = new Date(dataPoint.timestamp)
      const difference = Math.abs(dataDateTime.getTime() - inputDateTime.getTime())

      if (difference < minDifference) {
        minDifference = difference
        closestIndex = index
      }
    })

    return closestIndex
  }

  // Responsive tweet card dimensions
  const tweetWidth = isMobile ? "w-32" : "w-72"
  const anchorSize = isMobile ? "w-4 h-4" : "w-5 h-5"
  const anchorOffset = isMobile ? 8 : 10

  // Use stored tweet time for labels to maintain consistency
  const timeLabel = storedTweetTime.includes('-') ? 
    new Date(storedTweetTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + 
    new Date(storedTweetTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) :
    storedTweetTime

  const priceAtStoredTime = chartData ? chartData.prices[findClosestTimeIndex(storedTweetTime, chartData)]?.toFixed(6) : "0.000000"

  return (
    <>
      {/* Anchor Point Indicator */}
      <div
        className={`absolute ${anchorSize} bg-yellow-400 border-2 border-black rounded-full pointer-events-none animate-pulse shadow-lg`}
        style={{
          left: anchorPoint.x - anchorOffset,
          top: anchorPoint.y - anchorOffset,
          zIndex: 15,
          boxShadow: "0 0 10px rgba(255, 255, 0, 0.8)",
        }}
      />

      {/* Small line marker to show anchor is on the green line */}
      <div
        className="absolute w-1 h-6 bg-yellow-400 border border-black pointer-events-none"
        style={{
          left: anchorPoint.x - 0.5,
          top: anchorPoint.y - 12,
          zIndex: 14,
        }}
      />

      {/* Debug: Small yellow dot at exact calculated position */}
      <div
        className="absolute w-1 h-1 bg-yellow-500 pointer-events-none"
        style={{
          left: anchorPoint.x - 0.5,
          top: anchorPoint.y - 0.5,
          zIndex: 25,
        }}
      />



      {/* Dynamic Arrow SVG */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
        <defs>
          <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <polygon points="0 0, 12 4, 0 8" fill="#ffff00" stroke="#000000" strokeWidth="1" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={arrowPath}
          stroke="#ffff00"
          strokeWidth={isMobile ? "3" : "4"}
          fill="none"
          markerEnd="url(#arrowhead)"
          filter="url(#glow)"
          strokeDasharray={isDragging ? "10,5" : "none"}
        />
      </svg>

      {/* Tweet Card - Responsive */}
      <div
        className={`absolute bg-white border-1 sm:border-4 border-black rounded p-1 sm:p-2 md:p-3 ${tweetWidth} min-h-fit shadow-[1px_1px_0px_0px_#000000] sm:shadow-[4px_4px_0px_0px_#000000] md:shadow-[6px_6px_0px_0px_#000000] ${
          isDragging ? "cursor-grabbing scale-105" : "cursor-grab"
        } select-none transition-transform duration-150`}
        style={{
          left: position.x,
          top: position.y,
          zIndex: 20,
        }}
        onMouseDown={onMouseDown}
        onTouchStart={isTouch ? (e) => {
          e.preventDefault()
          const touch = e.touches[0]
          const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true
          })
          onMouseDown(mouseEvent as any)
        } : undefined}
      >
        {/* Tweet Header */}
        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
          {tweetData.profileImage ? (
            <img 
              src={tweetData.profileImage} 
              alt={tweetData.username}
              className="w-4 h-4 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full border-1 sm:border-2 border-black object-cover"
            />
          ) : (
            <div className="w-4 h-4 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gray-300 rounded-full border-1 sm:border-2 border-black flex items-center justify-center font-black text-xs">
              {tweetData.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-black text-xs sm:text-sm md:text-base break-words leading-tight">{tweetData.username}</div>
            <div className="text-gray-600 font-bold text-xs break-words leading-tight">{tweetData.handle}</div>
          </div>
        </div>

        {/* Tweet Content */}
        <div className="mb-1 sm:mb-2 md:mb-3">
          <p className="text-xs sm:text-sm md:text-base font-bold leading-relaxed sm:leading-tight break-words"
             style={{
               wordWrap: 'break-word',
               overflowWrap: 'break-word'
             }}>{tweetData.text}</p>
        </div>

        {/* Tweet Metadata - Hide on mobile to save space */}
        <div className="hidden sm:block text-xs text-gray-600 font-bold mb-1 sm:mb-2">
          {new Date(tweetData.timestamp).toLocaleDateString("en-US", { 
            month: "short", 
            day: "numeric", 
            year: "numeric" 
          })} · {new Date(tweetData.timestamp).toLocaleTimeString("en-US", { 
            hour: "2-digit", 
            minute: "2-digit", 
            hour12: true 
          })}
        </div>
      </div>
    </>
  )
}
