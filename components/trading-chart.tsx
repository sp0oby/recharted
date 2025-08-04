"use client"

import { useEffect, useRef } from "react"
import { Chart, registerables } from "chart.js"

Chart.register(...registerables)

// Zoom plugin completely removed to prevent scrolling issues

interface TradingChartProps {
  tokenPair: string
  onChartReady?: (chartData: any) => void
  chartData?: {
    prices: number[]
    volumes: number[]
    timestamps: string[]
    currentPrice: number
    priceChange24h: number
    source?: string // Track data source (codex, dexscreener, etc.)
    dataPoints?: number // Number of data points
  }
  timeframe?: string
  tweetTimestamp?: string
}

export default function TradingChart({ tokenPair, onChartReady, chartData, timeframe = "1h", tweetTimestamp }: TradingChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<Chart | null>(null)
  const hasCalledReady = useRef(false)

  useEffect(() => {
    if (chartRef.current) {
      const ctx = chartRef.current.getContext("2d")
      if (ctx) {
        // Destroy existing chart more thoroughly
        if (chartInstance.current) {
          console.log(`🧹 Destroying previous chart instance for cleanup`)
          chartInstance.current.destroy()
          chartInstance.current = null
        }

        // Clear canvas to prevent visual artifacts
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

        // Reset the ready flag
        hasCalledReady.current = false

        console.log(`📊 Rendering chart for timeframe: ${timeframe} with tweet timestamp: ${tweetTimestamp}`)

        // Use real chart data if available, otherwise fall back to mock data
        const dataToUse = chartData ? convertApiDataToChartData(chartData) : generateMockCandlestickData(tweetTimestamp)

        // Prepare chart options
        const chartOptions: any = {
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 0,
          layout: {
            padding: 0
          },
          plugins: {
            legend: {
              display: false,
            },
            title: {
              display: false,
            },
          },
          scales: {
            x: {
              display: true,
              grid: {
                color: "#333333",
              },
              ticks: {
                color: "#ffffff",
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                  weight: "bold",
                },
                maxTicksLimit: window.innerWidth < 768 ? 4 : 8,
                callback: function(value: any, index: number): string {
                  // Use the properly formatted labels from our data
                  const labels = dataToUse.labels
                  if (labels && labels[index]) {
                    // Show fewer labels for cleaner display
                    if (timeframe === "1d") {
                      return index % 3 === 0 ? labels[index] : ""
                    } else if (timeframe === "4h" || timeframe === "6h") {
                      return index % 2 === 0 ? labels[index] : ""
                    } else {
                      return index % 3 === 0 ? labels[index] : ""
                    }
                  }
                  return ""
                }
              },
            },
            y: {
              type: "linear",
              display: true,
              position: "right",
              grid: {
                color: "#333333",
              },
              ticks: {
                color: "#ffffff",
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                  weight: "bold",
                },
                // Format as market cap - use real marketcap but scale proportionally with price
                callback: function(value: any): string {
                  const realMarketCap = (chartData as any)?.marketCap
                  const tokenSupply = (chartData as any)?.tokenSupply
                  const currentPrice = (chartData as any)?.currentPrice
                  
                  let marketCap: number
                  
                  if (realMarketCap && currentPrice) {
                    // Use real marketcap as baseline, scale proportionally with current price level
                    // Formula: realMarketCap * (currentPriceLevel / actualCurrentPrice)
                    marketCap = realMarketCap * (value / currentPrice)
                  } else if (tokenSupply) {
                    // Fallback: calculate from token supply
                    marketCap = value * tokenSupply
                  } else {
                    // Last resort: assume 1B supply for display purposes
                    marketCap = value * 1000000000
                  }
                  
                  if (marketCap >= 1000000000) {
                    return `$${(marketCap / 1000000000).toFixed(1)}B`
                  } else if (marketCap >= 1000000) {
                    return `$${(marketCap / 1000000).toFixed(1)}M`
                  } else if (marketCap >= 1000) {
                    return `$${(marketCap / 1000).toFixed(1)}K`
                  } else {
                    return `$${marketCap.toFixed(0)}`
                  }
                }
              },
              title: {
                display: true,
                text: 'Market Cap',
                color: '#ffffff',
                font: {
                  size: 14,
                  weight: 'bold'
                }
              }
            },
          },
          interaction: {
            intersect: false,
            mode: "index",
          },
          events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
          animation: false,
        }

        // Zoom functionality completely removed

        chartInstance.current = new Chart(ctx, {
          type: "line",
          data: {
            labels: dataToUse.labels,
            datasets: [
              {
                label: tokenPair,
                data: dataToUse.prices,
                borderColor: "#00ff00",
                backgroundColor: "rgba(0, 255, 0, 0.1)",
                borderWidth: window.innerWidth < 768 ? 2 : 3,
                fill: false,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: window.innerWidth < 768 ? 4 : 6,
              },
            ],
          },
          options: chartOptions,
          plugins: [{
            id: 'background',
            beforeDraw: (chart: any) => {
              const ctx = chart.canvas.getContext('2d');
              ctx.save();
              ctx.globalCompositeOperation = 'destination-over';
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, chart.width, chart.height);
              ctx.restore();
            }
          }]
        })

        // Call onChartReady immediately after chart creation
        if (onChartReady && !hasCalledReady.current) {
          hasCalledReady.current = true
          onChartReady({
            labels: dataToUse.labels,
            prices: dataToUse.prices,
            timeData: dataToUse.timeData,
            chartInstance: chartInstance.current,
          })
        }
      }
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy()
        chartInstance.current = null
      }
    }
  }, [tokenPair, timeframe, tweetTimestamp, chartData]) // Include all dependencies that should trigger re-render

  const convertApiDataToChartData = (apiData: any) => {
    const labels: string[] = []
    const prices = apiData.prices
    const volumes = apiData.volumes
    const timeData: Array<{ time: string; timestamp: number; price: number }> = []

    console.log(`Converting ${apiData.timestamps.length} timestamps for timeframe: ${timeframe}`)
    console.log("First few timestamps:", apiData.timestamps.slice(0, 5))
    console.log(`Data lengths - timestamps: ${apiData.timestamps.length}, prices: ${prices.length}, volumes: ${volumes.length}`)
    
    // Validate data arrays have matching lengths
    if (apiData.timestamps.length !== prices.length) {
      console.error(`Data length mismatch! Timestamps: ${apiData.timestamps.length}, Prices: ${prices.length}`)
    }

    // Convert timestamps to time labels based on timeframe
    apiData.timestamps.forEach((timestamp: string, index: number) => {
      const date = new Date(timestamp)
      let timeString: string

      // Format time based on timeframe - consistent formatting across all timeframes
      if (timeframe === "1w") {
        // For weekly, show date only (no time, no year for consistency)
        timeString = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      } else if (timeframe === "1d") {
        // For daily, show date only (no time, no year for consistency)
        timeString = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      } else if (timeframe === "4h" || timeframe === "6h") {
        // For 4h and 6h, show date and time (consistent with shorter timeframes)
        timeString = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      } else {
        // For shorter timeframes, show date and time
        timeString = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      }

      // Log first few conversions for debugging
      if (index <= 3) {
        console.log(`Converting ${timestamp} -> ${date.toISOString()} -> ${timeString}`)
      }

      labels.push(timeString)
      // Validate price data to prevent NaN
      const price = prices[index]
      const validPrice = (typeof price === 'number' && !isNaN(price)) ? price : 0.000001
      
      if (typeof price !== 'number' || isNaN(price)) {
        console.warn(`Invalid price at index ${index}:`, price, 'using fallback:', validPrice)
      }
      
      timeData.push({
        time: timeString,
        timestamp: date.getTime(),
        price: validPrice,
      })
    })

    console.log(`Generated ${labels.length} labels, first few:`, labels.slice(0, 5))
    return { labels, prices, volumes, timeData }
  }

  const generateMockCandlestickData = (tweetTimestamp?: string) => {
    const labels: string[] = []
    const prices: number[] = []
    const volumes: number[] = []
    const timeData: Array<{ time: string; timestamp: number; price: number }> = []

    let currentPrice = 0.008

    // Get interval based on timeframe
    const getIntervalMs = (tf: string): number => {
      switch (tf) {
        case "5m": return 5 * 60 * 1000
        case "15m": return 15 * 60 * 1000
        case "1h": return 60 * 60 * 1000
        case "4h": return 4 * 60 * 60 * 1000
        case "6h": return 6 * 60 * 60 * 1000
        case "1d": return 24 * 60 * 60 * 1000
        case "1w": return 7 * 24 * 60 * 60 * 1000
        default: return 60 * 60 * 1000
      }
    }

    const getTimeframeInMs = (tf: string): number => {
      switch (tf) {
        case "5m": return 4 * 60 * 60 * 1000    // 4 hours total for 5min candles
        case "15m": return 24 * 60 * 60 * 1000   // 24 hours total for 15min candles
        case "1h": return 24 * 60 * 60 * 1000    // 24 hours total for 1h candles
        case "4h": return 7 * 24 * 60 * 60 * 1000  // 7 days total for 4h candles
        case "6h": return 7 * 24 * 60 * 60 * 1000  // 7 days total for 6h candles
        case "1d": return 30 * 24 * 60 * 60 * 1000 // 30 days total for daily candles
        case "1w": return 90 * 24 * 60 * 60 * 1000 // 90 days total for weekly candles
        default: return 24 * 60 * 60 * 1000
      }
    }

    const intervalMs = getIntervalMs(timeframe)

    // Center around tweet time if provided
    let centerTime: Date
    if (tweetTimestamp) {
      centerTime = new Date(tweetTimestamp)
      console.log(`Centering mock chart data around tweet: ${centerTime.toISOString()}`)
    } else {
      centerTime = new Date()
    }

    // Calculate timeline to center the tweet in the middle of the visible timeframe
    const timeframeMs = getTimeframeInMs(timeframe)
    const halfTimeframe = timeframeMs / 2
    const startTime = new Date(centerTime.getTime() - halfTimeframe)
    const endTime = new Date(centerTime.getTime() + halfTimeframe)

    console.log(`Mock chart timeline: ${startTime.toISOString()} to ${endTime.toISOString()}`)

    const totalTimespan = endTime.getTime() - startTime.getTime()
    const totalDataPoints = Math.ceil(totalTimespan / intervalMs)

    // Generate data points with correct intervals
    for (let i = 0; i <= totalDataPoints; i++) {
      const time = new Date(startTime.getTime() + i * intervalMs)
      let timeString: string

      // Format time based on timeframe
      if (timeframe === "1d") {
        timeString = time.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      } else if (timeframe === "4h" || timeframe === "6h") {
        timeString = time.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          hour12: false,
        })
      } else {
        timeString = time.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      }

      labels.push(timeString)
      timeData.push({
        time: timeString,
        timestamp: time.getTime(),
        price: currentPrice,
      })

      // Simulate more realistic price movement with trends
      const trendFactor = Math.sin(i * 0.2) * 0.0002 // Add some trending
      const randomFactor = (Math.random() - 0.5) * 0.0003
      const change = trendFactor + randomFactor

      currentPrice += change
      currentPrice = Math.max(0.001, currentPrice) // Prevent negative prices
      prices.push(currentPrice)

      // Random volume
      volumes.push(Math.random() * 1000000)
    }

    return { labels, prices, volumes, timeData }
  }

  return (
    <div className="w-full h-full p-2 md:p-4 bg-black relative" style={{ maxHeight: '100%', overflow: 'hidden' }}>
      <canvas 
        ref={chartRef} 
        className="w-full h-full" 
        onWheel={(e) => e.preventDefault()}
        style={{ touchAction: 'none', maxHeight: '100%', maxWidth: '100%', backgroundColor: '#000000' }}
      />

    </div>
  )
}
