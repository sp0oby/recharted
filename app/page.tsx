"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Download, Move, Zap, Copy } from "lucide-react"
import TradingChart from "@/components/trading-chart"
import TweetOverlay from "@/components/tweet-overlay"
import html2canvas from "html2canvas"
import { fetchTweetData, fetchChartDataWithHistory, testDexScreenerAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

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

export default function TweetChartAnchor() {
  const { toast } = useToast()
  const [tweetUrl, setTweetUrl] = useState("https://x.com/a1lon9/status/1945238123908067530")
  const [chartUrl, setChartUrl] = useState("pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn")
  const [timeframe, setTimeframe] = useState("1h")
  const [tweetPosition, setTweetPosition] = useState<Position>({ x: 20, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [isGenerated, setIsGenerated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [chartData, setChartData] = useState<ChartData | undefined>()
  const [apiChartData, setApiChartData] = useState<any>(undefined)
  const [fetchedTweetData, setFetchedTweetData] = useState<TweetData | null>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartCardRef = useRef<HTMLDivElement>(null)

  // Use fetched tweet data or fallback to mock data
  const tweetData: TweetData = fetchedTweetData || {
    username: "alon",
    handle: "@a1lon9",
    text: "fuck it\n\njew mode.",
    timestamp: new Date().toISOString(),
  }

  const handleGenerate = async () => {
    setIsLoading(true)
    setChartData(undefined) // Reset chart data

    try {
      // Test API first if it's a new URL
      if (chartUrl !== "https://dexscreener.com/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933") {
        console.log("Testing DexScreener API...")
        await testDexScreenerAPI()
      }

      // Fetch tweet data first to get the timestamp
      const tweetDataResult = await fetchTweetData(tweetUrl)
      console.log("Fetched tweet data:", tweetDataResult)
      
      // Now fetch chart data with real historical data (CoinGecko -> Birdeye -> Generated)
      const chartDataResult = await fetchChartDataWithHistory(chartUrl, timeframe, tweetDataResult.timestamp)
      console.log("Fetched chart data with historical API integration:", chartDataResult)
      
      // Debug marketCap data specifically
      if (chartDataResult.marketCap) {
        console.log(`💰 Frontend received MarketCap: $${(chartDataResult.marketCap / 1000000).toFixed(2)}M`)
      } else {
        console.log("⚠️ No marketCap data received from API")
      }
      if (chartDataResult.tokenSupply) {
        console.log(`🪙 Frontend received TokenSupply: ${chartDataResult.tokenSupply.toLocaleString()}`)
      }

      // Store the fetched data
      setApiChartData(chartDataResult)
      setFetchedTweetData(tweetDataResult)

      setIsGenerated(true)
    } catch (error) {
      console.error("Error generating chart:", error)
      
      // Check if this is a tweet timestamp validation error
      if (error instanceof Error && error.message.includes('Tweet Timestamp Issue')) {
        toast({
          title: "⚠️ Tweet Timestamp Issue",
          description: error.message.replace('⚠️ Tweet Timestamp Issue: ', ''),
          variant: "destructive",
          duration: 8000,
        })
      } else {
        toast({
          title: "Chart Generation Error",
          description: "There was an issue generating the chart, but fallback data will be used.",
          variant: "destructive",
          duration: 5000,
        })
      }
      
      // Still set as generated so user can see the chart with fallback data
      setIsGenerated(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChartReady = useCallback((data: ChartData) => {
    setChartData(data)
  }, [])

  const handleDownload = async () => {
    if (chartCardRef.current) {
      try {
        const canvas = await html2canvas(chartCardRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
        })

        const link = document.createElement("a")
        link.download = `recharted.io-${apiChartData?.symbol?.replace("/", "-") || "roast"}-exposed.png`
        link.href = canvas.toDataURL()
        link.click()
      } catch (error) {
        console.error("Error generating image:", error)
      }
    }
  }

  const handleCopyToClipboard = async () => {
    if (chartCardRef.current) {
      try {
        const canvas = await html2canvas(chartCardRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
        })

        // Convert canvas to blob
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              // Use the Clipboard API to copy the image
              await navigator.clipboard.write([
                new ClipboardItem({
                  [blob.type]: blob
                })
              ])
              console.log("Image copied to clipboard successfully!")
              toast({
                title: "Success!",
                description: "Image copied to clipboard. You can now paste it anywhere!",
                duration: 3000,
              })
            } catch (error) {
              console.error("Error copying to clipboard:", error)
              toast({
                title: "Copy Failed",
                description: "Copy to clipboard failed. Please try downloading the image instead.",
                variant: "destructive",
                duration: 5000,
              })
            }
          }
        }, "image/png")
      } catch (error) {
        console.error("Error copying chart to clipboard:", error)
        toast({
          title: "Error",
          description: "Failed to generate image for clipboard. Please try again.",
          variant: "destructive",
          duration: 5000,
        })
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && chartContainerRef.current) {
      const rect = chartContainerRef.current.getBoundingClientRect()
      const isMobile = window.innerWidth < 768
      const offsetX = isMobile ? 112 : 144 // Mobile: 224px/2, Desktop: 288px/2
      const offsetY = isMobile ? 50 : 60
      setTweetPosition({
        x: e.clientX - rect.left - offsetX,
        y: e.clientY - rect.top - offsetY,
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div className="min-h-screen bg-white text-black font-mono">
      {/* Comic Book Header */}
      <div className="border-b-4 border-black bg-white">
        <div className="container mx-auto px-4 py-4 md:py-6">
          <h1 className="text-2xl md:text-4xl font-black tracking-wider transform -skew-x-12 inline-block border-4 border-black bg-white px-3 md:px-4 py-2">
            RECHARTED.IO
          </h1>
          <p className="mt-2 text-sm md:text-lg font-bold">don't get caught being recharted • roast bad predictions • celebrate rare wins</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 md:py-8">
        {/* Responsive layout - vertical on mobile, horizontal on desktop */}
        <div className="flex flex-col lg:flex-row gap-4 md:gap-8 min-h-[calc(100vh-200px)]">
          {/* Left Panel - Inputs */}
          <div className="w-full lg:w-80 space-y-4 md:space-y-6 flex-shrink-0">
            <Card className="border-4 border-black shadow-[4px_4px_0px_0px_#000000] md:shadow-[8px_8px_0px_0px_#000000]">
              <CardHeader className="bg-black text-white">
                <CardTitle className="flex items-center gap-2 font-black text-lg md:text-xl">
                  <Zap className="w-5 h-5 md:w-6 md:h-6" />
                  TWEET INPUT
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tweetUrl" className="font-bold text-base md:text-lg">
                    Tweet URL
                  </Label>
                  <Input
                    id="tweetUrl"
                    value={tweetUrl}
                    onChange={(e) => setTweetUrl(e.target.value)}
                    className="border-2 border-black font-bold text-base md:text-lg"
                    placeholder="https://twitter.com/username/status/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chartUrl" className="font-bold text-base md:text-lg">
                    Token Address or Chart URL
                  </Label>
                  <Input
                    id="chartUrl"
                    value={chartUrl}
                    onChange={(e) => setChartUrl(e.target.value)}
                    className="border-2 border-black font-bold text-base md:text-lg"
                    placeholder="pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn (best) or https://dexscreener.com/..."
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    💡 <strong>Tip:</strong> Token addresses work better than DexScreener URLs for accurate data
                  </p>
                </div>



                <div className="space-y-2">
                  <Label htmlFor="timeframe" className="font-bold text-base md:text-lg">
                    Chart Timeframe
                  </Label>
                  <select
                    id="timeframe"
                    value={timeframe}
                    onChange={(e) => {
                      setTimeframe(e.target.value)
                      // Auto-generate when timeframe changes if chart is already generated
                      if (isGenerated) {
                        handleGenerate()
                      }
                    }}
                    className="w-full border-2 border-black font-bold text-base md:text-lg p-3 bg-white"
                  >
                    <option value="5m">5 Minutes</option>
                    <option value="15m">15 Minutes</option>
                    <option value="1h">1 Hour</option>
                    <option value="4h">4 Hours</option>
                    <option value="6h">6 Hours</option>
                    <option value="1d">1 Day</option>
                    <option value="1w">1 Week</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-4">
              <Button
                onClick={handleGenerate}
                disabled={isLoading}
                className="flex-1 bg-black text-white border-4 border-black hover:bg-white hover:text-black font-black text-base md:text-lg py-4 md:py-6 shadow-[2px_2px_0px_0px_#000000] md:shadow-[4px_4px_0px_0px_#000000] hover:shadow-[1px_1px_0px_0px_#000000] md:hover:shadow-[2px_2px_0px_0px_#000000] transition-all disabled:opacity-50"
              >
                <Zap className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                {isLoading ? "FETCHING THE RECEIPTS..." : "GENERATE"}
              </Button>

              {isGenerated && (
                <>
                  <Button
                    onClick={handleCopyToClipboard}
                    className="flex-1 bg-blue-500 text-white border-4 border-black hover:bg-blue-600 font-black text-base md:text-lg py-4 md:py-6 shadow-[2px_2px_0px_0px_#000000] md:shadow-[4px_4px_0px_0px_#000000] hover:shadow-[1px_1px_0px_0px_#000000] md:hover:shadow-[2px_2px_0px_0px_#000000] transition-all"
                  >
                    <Copy className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                    COPY TO CLIPBOARD
                  </Button>

                  <Button
                    onClick={handleDownload}
                    className="flex-1 bg-white text-black border-4 border-black hover:bg-black hover:text-white font-black text-base md:text-lg py-4 md:py-6 shadow-[2px_2px_0px_0px_#000000] md:shadow-[4px_4px_0px_0px_#000000] hover:shadow-[1px_1px_0px_0px_#000000] md:hover:shadow-[2px_2px_0px_0px_#000000] transition-all"
                  >
                    <Download className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                    DOWNLOAD
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Chart Display */}
          <div className="flex-1 relative min-h-[400px] md:min-h-[500px]">
            <Card ref={chartCardRef} className="border-4 border-black shadow-[4px_4px_0px_0px_#000000] md:shadow-[8px_8px_0px_0px_#000000] h-full rounded-none" style={{backgroundColor: '#000000'}}>
              <CardHeader className="bg-black text-white relative">
                <CardTitle className="font-black text-2xl md:text-4xl">RECHARTED.IO</CardTitle>
                {apiChartData?.symbol && (
                  <div className="absolute top-2 right-2 font-black text-2xl md:text-4xl">
                    {apiChartData.symbol.split('/')[0]}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-80px)] md:h-[calc(100%-100px)]" style={{backgroundColor: '#000000'}}>
                {isGenerated ? (
                  <div
                    ref={chartContainerRef}
                    className="relative w-full h-full bg-black overflow-hidden cursor-crosshair"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <TradingChart
                      key={`chart-${apiChartData?.symbol || "default"}-${timeframe}-${tweetData.timestamp}`}
                      tokenPair={apiChartData?.symbol || "Loading..."}
                      chartData={apiChartData}
                      timeframe={timeframe}
                      tweetTimestamp={tweetData.timestamp}
                      onChartReady={handleChartReady}
                    />
                    <TweetOverlay
                      tweetData={tweetData}
                      position={tweetPosition}
                      tradeTime={tweetData.timestamp}
                      chartContainerRef={chartContainerRef}
                      chartData={chartData}
                      onMouseDown={handleMouseDown}
                      isDragging={isDragging}
                      timeframe={timeframe}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full bg-gray-100">
                    <div className="text-center px-4">
                      <p className="text-lg md:text-2xl font-bold">Ready to expose some terrible takes?</p>
                      <p className="text-sm md:text-lg font-medium mt-2 text-gray-600">Drop a tweet URL and watch predictions get REKT</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Instructions below chart - centered under graph */}
        {isGenerated && (
          <div className="mt-2 md:mt-3 flex flex-col lg:flex-row gap-4 md:gap-8">
            <div className="w-full lg:w-80 flex-shrink-0"></div>
            <div className="flex-1 text-center">
                               <p className="text-xs md:text-sm font-medium text-gray-700 leading-relaxed">
                   <Move className="w-3 h-3 md:w-4 md:h-4 inline mr-1" />
                   Drag the tweet to the perfect roasting position!
                   <span className="hidden sm:inline mx-2">•</span>
                   The anchor shows exactly where their prediction landed at tweet time.
                 </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
