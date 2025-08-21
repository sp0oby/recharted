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
    marketCap?: number // Market cap for scaling calculations
    tokenSupply?: number // Token supply for fallback calculations
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
        
        // Helper function for timeframe calculations - MUCH more restrictive windows
        const getTimeframeInMs = (tf: string): number => {
          switch (tf) {
            case "5m": return 4 * 60 * 60 * 1000      // 4 hours total for 5min candles
            case "15m": return 12 * 60 * 60 * 1000    // 12 hours total for 15min candles  
            case "1h": return 24 * 60 * 60 * 1000     // 24 hours total for 1h candles
            case "4h": return 4 * 24 * 60 * 60 * 1000 // 4 days total for 4h candles
            case "6h": return 5 * 24 * 60 * 60 * 1000 // 5 days total for 6h candles
            case "1d": return 14 * 24 * 60 * 60 * 1000 // 14 days total for daily candles
            case "1w": return 14 * 24 * 60 * 60 * 1000 // 14 days total for weekly candles (2 weeks centered)
            case "1m": return 90 * 24 * 60 * 60 * 1000 // 90 days total for monthly candles (3 months: 2 before tweet + 1 current)
            default: return 24 * 60 * 60 * 1000
          }
        }
        
        // Calculate price range from the actual filtered timeframe data (not full dataset)
        let timeframeMinPrice: number | undefined = undefined
        let timeframeMaxPrice: number | undefined = undefined
        
        if (chartData?.prices && chartData?.timestamps && tweetTimestamp) {
          // Filter data to only include points within a reasonable window around the tweet
          const tweetTime = new Date(tweetTimestamp).getTime()
          const timeframeMs = getTimeframeInMs(timeframe)
          const windowStart = tweetTime - (timeframeMs / 2)
          const windowEnd = tweetTime + (timeframeMs / 2)
          
          // Filter ALL chart data to only include data within the display window
          const filteredPrices: number[] = []
          const filteredTimestamps: string[] = []
          const filteredVolumes: number[] = []
          
          chartData.timestamps.forEach((timestamp, index) => {
            const dataTime = new Date(timestamp).getTime()
            const price = chartData!.prices[index]
            const volume = chartData!.volumes?.[index] || 0
            const isInWindow = dataTime >= windowStart && dataTime <= windowEnd
            const isValidPrice = price > 0
            
            if (isInWindow && isValidPrice) {
              filteredPrices.push(price)
              filteredTimestamps.push(timestamp)
              filteredVolumes.push(volume)
            }
            
            // Debug: Log first few data points to see what's happening
            if (index < 5) {
              console.log(`📊 Data point ${index}: ${timestamp} (${new Date(timestamp).toLocaleDateString()}) -> $${price.toFixed(8)} | inWindow: ${isInWindow}, validPrice: ${isValidPrice}`)
            }
          })
          
          console.log(`📊 Filtering data: ${chartData.prices.length} total points -> ${filteredPrices.length} points within ${timeframe} window`)
          console.log(`📊 Time window: ${new Date(windowStart).toISOString()} to ${new Date(windowEnd).toISOString()}`)
          
          if (filteredPrices.length > 0) {
            // Replace the original chartData with filtered data so Chart.js only displays the filtered points
            chartData = {
              ...chartData,
              prices: filteredPrices,
              timestamps: filteredTimestamps,
              volumes: filteredVolumes
            }
            
            timeframeMinPrice = Math.min(...filteredPrices)
            timeframeMaxPrice = Math.max(...filteredPrices)
            console.log(`📊 Price range (window filtered): $${timeframeMinPrice.toFixed(8)} to $${timeframeMaxPrice.toFixed(8)} (${((timeframeMaxPrice/timeframeMinPrice - 1) * 100).toFixed(1)}% range)`)
            console.log(`📊 Filtered data points: ${filteredPrices.length}`)
            console.log(`🔄 Replaced chartData with filtered data - Chart.js will now only display ${filteredPrices.length} points`)
            
            // Debug: Show the actual minimum price found and when it occurred
            const minIndex = filteredPrices.indexOf(timeframeMinPrice)
            const minTimestamp = filteredTimestamps[minIndex]
            console.log(`📊 Minimum price $${timeframeMinPrice.toFixed(8)} found at: ${minTimestamp} (${new Date(minTimestamp).toLocaleDateString()})`)
            
            // Debug: Show a few of the lowest prices to understand the range
            const sortedPrices = [...filteredPrices].sort((a, b) => a - b)
            console.log(`📊 Lowest 3 prices in filtered data: $${sortedPrices[0]?.toFixed(8)}, $${sortedPrices[1]?.toFixed(8)}, $${sortedPrices[2]?.toFixed(8)}`)
            
            // Use token supply for more accurate historical market cap calculation
            if (chartData.tokenSupply) {
              const minMarketCap = timeframeMinPrice * chartData.tokenSupply
              const maxMarketCap = timeframeMaxPrice * chartData.tokenSupply
              console.log(`💰 Market cap range (window filtered): $${minMarketCap.toLocaleString()} to $${maxMarketCap.toLocaleString()}`)
            } else if (chartData.marketCap && chartData.currentPrice) {
              const minMarketCap = chartData.marketCap * (timeframeMinPrice / chartData.currentPrice)
              const maxMarketCap = chartData.marketCap * (timeframeMaxPrice / chartData.currentPrice)
              console.log(`💰 Market cap range (window filtered): $${minMarketCap.toLocaleString()} to $${maxMarketCap.toLocaleString()}`)
            }
          } else {
            // Fallback to original data if filtering results in no data
            timeframeMinPrice = Math.min(...chartData.prices)
            timeframeMaxPrice = Math.max(...chartData.prices)
            console.warn(`⚠️ No data within time window, using full dataset range`)
            console.log(`📊 Price range (fallback): $${timeframeMinPrice.toFixed(8)} to $${timeframeMaxPrice.toFixed(8)}`)
          }
          
          // Log market cap data check
          console.log(`🔍 Market cap data check: marketCap=${chartData.marketCap ? '$' + chartData.marketCap.toLocaleString() : 'undefined'}, currentPrice=${chartData.currentPrice ? '$' + chartData.currentPrice.toFixed(8) : 'undefined'}, tokenSupply=${chartData.tokenSupply ? chartData.tokenSupply.toLocaleString() : 'undefined'}`)
        }

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
            } else if (timeframe === "1m") {
              // For monthly, show first label, month changes, and last label
              if (index === 0) return labels[index]
              
              const currentLabel = labels[index]
              const prevLabel = labels[index - 1]
              
              // Show label if it's different from the previous one (month changed)
              if (currentLabel && prevLabel && currentLabel !== prevLabel) {
                return currentLabel
              }
              
              // Also show the last label to ensure current month is visible
              if (index === labels.length - 1) {
                return labels[index]
              }
              
              return ""
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
              // Add better scaling for extreme variance
              beginAtZero: false, // Don't force zero to allow better range utilization
              // Use pre-calculated timeframe-filtered min/max (not full dataset)
              min: timeframeMinPrice ? (() => {
                const buffer = timeframeMinPrice * 0.05 // 5% buffer
                const result = Math.max(timeframeMinPrice - buffer, timeframeMinPrice * 0.9) // Don't go below 90% of min
                console.log(`📊 Y-axis min (PRE-CALCULATED from filtered data): $${result.toFixed(8)} (filtered min: $${timeframeMinPrice.toFixed(8)})`)
                return result
              })() : function(context: any) {
                // Fallback if no filtered data available
                console.warn(`⚠️ Using Chart.js dataset fallback for Y-axis min`)
                const data = context.chart.data.datasets[0].data
                if (!data || data.length === 0) return undefined
                const minPrice = Math.min(...data.filter((val: number) => val > 0))
                const buffer = minPrice * 0.05
                const result = Math.max(minPrice - buffer, minPrice * 0.9)
                console.log(`📊 Y-axis min (FALLBACK): $${result.toFixed(8)} (dataset min: $${minPrice.toFixed(8)})`)
                return result
              },
              max: timeframeMaxPrice ? (() => {
                const buffer = timeframeMaxPrice * 0.05 // 5% buffer
                const result = timeframeMaxPrice + buffer
                console.log(`📊 Y-axis max (PRE-CALCULATED from filtered data): $${result.toFixed(8)} (filtered max: $${timeframeMaxPrice.toFixed(8)})`)
                return result
              })() : function(context: any) {
                // Fallback if no filtered data available
                console.warn(`⚠️ Using Chart.js dataset fallback for Y-axis max`)
                const data = context.chart.data.datasets[0].data
                if (!data || data.length === 0) return undefined
                const maxPrice = Math.max(...data)
                const buffer = maxPrice * 0.05
                const result = maxPrice + buffer
                console.log(`📊 Y-axis max (FALLBACK): $${result.toFixed(8)} (dataset max: $${maxPrice.toFixed(8)})`)
                return result
              },
              grid: {
                color: "#333333",
              },
              ticks: {
                color: "#ffffff",
                font: {
                  size: window.innerWidth < 768 ? 10 : 12,
                  weight: "bold",
                },
                // Increase tick count for better granularity with extreme variance
                maxTicksLimit: window.innerWidth < 768 ? 8 : 12,
                stepSize: undefined, // Let Chart.js auto-calculate for optimal spacing
                // Format as market cap - use real marketcap but scale proportionally with price
                callback: function(value: any): string {
                  const realMarketCap = (chartData as any)?.marketCap
                  const tokenSupply = (chartData as any)?.tokenSupply
                  const currentPrice = (chartData as any)?.currentPrice
                  
                  // Debug: Log what data we have for market cap calculation
                  if (!realMarketCap && !tokenSupply) {
                    console.warn(`⚠️ Y-axis callback missing data: marketCap=${realMarketCap}, tokenSupply=${tokenSupply}, currentPrice=${currentPrice}, value=${value}`)
                  }
                  
                  let marketCap: number
                  
                  // Prioritize token supply method for accurate historical market caps
                  if (tokenSupply) {
                    // Primary method: calculate from token supply (most reliable for historical spikes)
                    marketCap = value * tokenSupply
                    
                    // Debug: Log token supply calculation for high values
                    if (marketCap > 10000000) { // Log if calculated MC > $10M
                      console.log(`💰 HIGH Market Cap (token supply): $${marketCap.toLocaleString()} (price: $${value.toFixed(8)}, supply: ${tokenSupply.toLocaleString()})`)
                    }
                  } else if (realMarketCap && currentPrice) {
                    // Fallback: Use real marketcap as baseline, scale proportionally with current price level
                    // Formula: realMarketCap * (currentPriceLevel / actualCurrentPrice)
                    marketCap = realMarketCap * (value / currentPrice)
                    
                    // Debug: Log the calculation for extreme values
                    if (marketCap > realMarketCap * 10) { // Log if calculated MC is >10x the baseline
                      console.log(`💰 HIGH Market Cap (scaled): $${marketCap.toLocaleString()} (price: $${value.toFixed(8)}, baseline MC: $${realMarketCap.toLocaleString()}, current price: $${currentPrice.toFixed(8)})`)
                    }
                  } else {
                    // Last resort: assume 1B supply for display purposes
                    marketCap = value * 1000000000
                    
                    // Debug: Log fallback calculation for high values
                    if (marketCap > 10000000) { // Log if calculated MC > $10M
                      console.log(`💰 HIGH Market Cap (1B fallback): $${marketCap.toLocaleString()} (price: $${value.toFixed(8)})`)
                    }
                  }
                  
                  // Enhanced formatting for extreme variance - more granular display
                  if (marketCap >= 1000000000) {
                    return `$${(marketCap / 1000000000).toFixed(2)}B`
                  } else if (marketCap >= 100000000) {
                    // 100M+ - show one decimal
                    return `$${(marketCap / 1000000).toFixed(1)}M`
                  } else if (marketCap >= 10000000) {
                    // 10M+ - show one decimal
                    return `$${(marketCap / 1000000).toFixed(1)}M`
                  } else if (marketCap >= 1000000) {
                    // 1M+ - show two decimals for more precision
                    return `$${(marketCap / 1000000).toFixed(2)}M`
                  } else if (marketCap >= 100000) {
                    // 100K+ - show one decimal
                    return `$${(marketCap / 1000).toFixed(1)}K`
                  } else if (marketCap >= 10000) {
                    // 10K+ - show one decimal
                    return `$${(marketCap / 1000).toFixed(1)}K`
                  } else if (marketCap >= 1000) {
                    // 1K+ - show two decimals for precision
                    return `$${(marketCap / 1000).toFixed(2)}K`
                  } else if (marketCap >= 100) {
                    // $100+ - show whole dollars
                    return `$${marketCap.toFixed(0)}`
                  } else if (marketCap >= 1) {
                    // $1+ - show two decimals
                    return `$${marketCap.toFixed(2)}`
                  } else {
                    // Under $1 - show more decimals
                    return `$${marketCap.toFixed(4)}`
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
      } else if (timeframe === "1m") {
        // For monthly, show month and year
        timeString = date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
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

  // Helper function for timeframe calculations - MUCH more restrictive windows
  const getTimeframeInMsHelper = (tf: string): number => {
    switch (tf) {
      case "5m": return 4 * 60 * 60 * 1000      // 4 hours total for 5min candles
      case "15m": return 12 * 60 * 60 * 1000    // 12 hours total for 15min candles  
      case "1h": return 24 * 60 * 60 * 1000     // 24 hours total for 1h candles
      case "4h": return 4 * 24 * 60 * 60 * 1000 // 4 days total for 4h candles
      case "6h": return 5 * 24 * 60 * 60 * 1000 // 5 days total for 6h candles
      case "1d": return 14 * 24 * 60 * 60 * 1000 // 14 days total for daily candles
      case "1w": return 14 * 24 * 60 * 60 * 1000 // 14 days total for weekly candles (2 weeks centered)
      case "1m": return 90 * 24 * 60 * 60 * 1000 // 90 days total for monthly candles (3 months: 2 before tweet + 1 current)
      default: return 24 * 60 * 60 * 1000
    }
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
        case "1m": return 7 * 24 * 60 * 60 * 1000
        default: return 60 * 60 * 1000
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
    const timeframeMs = getTimeframeInMsHelper(timeframe)
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
      } else if (timeframe === "1m") {
        timeString = time.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
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
