"use client"

import type React from "react"
import { useState, useEffect } from "react"

// Import Libre Franklin font
import { Libre_Franklin } from 'next/font/google'

const libreFranklin = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  display: 'swap',
})

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
    
    console.log(`📊 Available time data points (first 5):`, chartData.timeData.slice(0, 5).map(d => {
      const date = new Date(d.timestamp)
      return {
        time: d.time,
        timestamp: isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString(),
        localTime: isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString(),
        price: d.price,
        rawTimestamp: d.timestamp
      }
    }))
    console.log(`📊 Available time data points (last 5):`, chartData.timeData.slice(-5).map(d => {
      const date = new Date(d.timestamp)
      return {
        time: d.time,
        timestamp: isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString(),
        localTime: isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString(),
        price: d.price,
        rawTimestamp: d.timestamp
      }
    }))
    // Validate timestamps before logging
    const firstTimestamp = chartData.timeData[0]?.timestamp
    const lastTimestamp = chartData.timeData[chartData.timeData.length - 1]?.timestamp
    
    const firstDate = firstTimestamp ? new Date(firstTimestamp) : null
    const lastDate = lastTimestamp ? new Date(lastTimestamp) : null
    
    if (firstDate && !isNaN(firstDate.getTime()) && lastDate && !isNaN(lastDate.getTime())) {
      console.log(`📅 Chart data range: ${firstDate.toISOString()} to ${lastDate.toISOString()}`)
      console.log(`📅 Chart range local: ${firstDate.toLocaleString()} to ${lastDate.toLocaleString()}`)
    } else {
      console.log('⚠️ Invalid timestamp data detected:', { firstTimestamp, lastTimestamp })
      console.log('📅 Raw timestamp types:', typeof firstTimestamp, typeof lastTimestamp)
    }

    // Find the EARLIEST point of a significant price movement around the tweet time
    let anchorIndex = 0
    let minDifference = Number.POSITIVE_INFINITY
    let usingCenterFallback = false
    let spikeDetected = false

    // First, find the closest time point as a baseline
    let closestIndex = 0
    chartData.timeData.forEach((dataPoint, index) => {
      const dataDateTime = new Date(dataPoint.timestamp)
      
      // Skip invalid timestamps
      if (isNaN(dataDateTime.getTime())) {
        console.warn(`⚠️ Skipping invalid timestamp at index ${index}:`, dataPoint.timestamp)
        return
      }
      
      const difference = Math.abs(dataDateTime.getTime() - inputDateTime.getTime())

      if (difference < minDifference) {
        minDifference = difference
        closestIndex = index
      }
    })

    // Always use exact timestamp match - no spike detection or special rules
    anchorIndex = closestIndex
    spikeDetected = false
    console.log(`🎯 Using exact timestamp match for all timeframes`)
    console.log(`📍 Selected anchor index: ${closestIndex} out of ${chartData.timeData.length} data points`)
    
    // Validate that the selected index has valid data
    const selectedDataPoint = chartData.timeData[closestIndex]
    if (selectedDataPoint && selectedDataPoint.timestamp) {
      const selectedDate = new Date(selectedDataPoint.timestamp)
      if (!isNaN(selectedDate.getTime())) {
        console.log(`📍 Selected timestamp: ${selectedDate.toISOString()}`)
        console.log(`📍 Selected local time: ${selectedDate.toLocaleString()}`)
        console.log(`⏰ Time difference from tweet: ${Math.abs(selectedDate.getTime() - inputDateTime.getTime()) / 1000} seconds`)
      } else {
        console.error('⚠️ Selected data point has invalid timestamp:', selectedDataPoint.timestamp)
      }
    } else {
      console.error('⚠️ Selected data point is undefined or missing timestamp:', { closestIndex, selectedDataPoint })
      // Fallback to first valid data point
      for (let i = 0; i < chartData.timeData.length; i++) {
        const dataPoint = chartData.timeData[i]
        if (dataPoint && dataPoint.timestamp && !isNaN(new Date(dataPoint.timestamp).getTime())) {
          anchorIndex = i
          closestIndex = i
          console.log(`🔄 Using fallback anchor index: ${i}`)
          break
        }
      }
    }
    
    // Check if the tweet timestamp is outside the available data range
    const dataStart = chartData.timeData[0]?.timestamp
    const dataEnd = chartData.timeData[chartData.timeData.length - 1]?.timestamp
    const tweetTime = inputDateTime.getTime()
    
    // Validate data range timestamps
    const dataStartTime = dataStart ? new Date(dataStart).getTime() : null
    const dataEndTime = dataEnd ? new Date(dataEnd).getTime() : null
    
    // Only use center fallback if tweet is WAY outside data range (more than 1 year)
    const oneYearMs = 365 * 24 * 60 * 60 * 1000
    let isWayOutsideRange = false
    
    if (dataStartTime && dataEndTime) {
      isWayOutsideRange = (tweetTime < dataStartTime - oneYearMs) || (tweetTime > dataEndTime + oneYearMs)
      
      if (isWayOutsideRange) {
        anchorIndex = Math.floor(chartData.timeData.length / 2)
        usingCenterFallback = true
        console.log(`⚖️ Tweet WAY outside data range (>1 year), using center of chart at index ${anchorIndex}`)
        console.log(`📊 Data range: ${new Date(dataStartTime).toISOString()} to ${new Date(dataEndTime).toISOString()}`)
        console.log(`🎯 Tweet time: ${inputDateTime.toISOString()} - centering anchor`)
      }
    } else {
      console.warn('⚠️ Cannot validate data range - invalid start or end timestamps')
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
    
    // Calculate exact position using interpolation between data points
    let exactX: number
    let exactY: number
    
    if (!usingCenterFallback && chartData.timeData.length > 1) {
      // Find the two data points to interpolate between
      const tweetTimestamp = inputDateTime.getTime()
      let beforeIndex = -1
      let afterIndex = -1
      
      // Find the data points immediately before and after the tweet time
      for (let i = 0; i < chartData.timeData.length - 1; i++) {
        const currentTime = chartData.timeData[i].timestamp
        const nextTime = chartData.timeData[i + 1].timestamp
        
        if (tweetTimestamp >= currentTime && tweetTimestamp <= nextTime) {
          beforeIndex = i
          afterIndex = i + 1
          break
        }
      }
      
      // If we found bracketing points, interpolate between them
      if (beforeIndex >= 0 && afterIndex >= 0) {
        const beforeTime = chartData.timeData[beforeIndex].timestamp
        const afterTime = chartData.timeData[afterIndex].timestamp
        const beforePrice = chartData.prices[beforeIndex]
        const afterPrice = chartData.prices[afterIndex]
        
        // Calculate interpolation factor (0 = exactly at before point, 1 = exactly at after point)
        const timeFactor = (tweetTimestamp - beforeTime) / (afterTime - beforeTime)
        
        // Get pixel positions for the bracketing points
        const metaData = chart.getDatasetMeta(0)
        if (metaData?.data?.[beforeIndex] && metaData?.data?.[afterIndex]) {
          const beforePoint = metaData.data[beforeIndex]
          const afterPoint = metaData.data[afterIndex]
          
          // Interpolate X position based on time
          exactX = beforePoint.x + (afterPoint.x - beforePoint.x) * timeFactor
          
          // Interpolate Y position based on price
          const interpolatedPrice = beforePrice + (afterPrice - beforePrice) * timeFactor
          const yScale = chart.scales.y
          exactY = yScale.getPixelForValue(interpolatedPrice)
          
          console.log(`🎯 EXACT INTERPOLATION: Tweet at ${new Date(tweetTimestamp).toISOString()}`)
          console.log(`📍 Between points: ${new Date(beforeTime).toISOString()} and ${new Date(afterTime).toISOString()}`)
          console.log(`📊 Time factor: ${timeFactor.toFixed(4)} (0=before, 1=after)`)
          console.log(`💰 Interpolated price: $${interpolatedPrice.toFixed(8)}`)
          console.log(`📍 Exact position: (${exactX.toFixed(2)}, ${exactY.toFixed(2)})`)
          
          const adjustedX = exactX + canvasOffsetX
          const adjustedY = exactY + canvasOffsetY
          
          return { x: adjustedX, y: adjustedY }
        }
      }
    }
    
    // Fallback: Try Chart.js metadata for closest point
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

    // Final fallback: use scale calculations with canvas offset
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
        } select-none transition-transform duration-150 ${libreFranklin.className}`}
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
            <div className="w-4 h-4 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gray-300 rounded-full border-1 sm:border-2 border-black flex items-center justify-center font-semibold text-xs">
              {tweetData.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-xs sm:text-sm md:text-base break-words leading-tight">{tweetData.username}</div>
            <div className="text-gray-600 font-normal text-xs break-words leading-tight">{tweetData.handle}</div>
          </div>
        </div>

        {/* Tweet Content */}
        <div className="mb-1 sm:mb-2 md:mb-3">
          <p className="text-xs sm:text-sm md:text-base font-normal leading-relaxed sm:leading-tight break-words"
             style={{
               wordWrap: 'break-word',
               overflowWrap: 'break-word'
             }}>{tweetData.text}</p>
        </div>

        {/* Tweet Metadata - Hide on mobile to save space */}
        <div className="hidden sm:block text-xs text-gray-600 font-normal mb-1 sm:mb-2">
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
