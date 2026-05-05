"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Download, Move, Zap, Copy, Film } from "lucide-react"
import TradingChart from "@/components/trading-chart"
import TweetOverlay from "@/components/tweet-overlay"
import TokenSearch, { type TokenSearchResult } from "@/components/token-search"
import IntervalSlider, { type IntervalStop } from "@/components/interval-slider"

// Slider stops shown to the user. The `value` is the internal timeframe key
// already understood by /api/codex (resolutionMap, calculateTimeRange) and
// components/trading-chart.tsx (getTimeframeInMs, convertApiDataToChartData),
// so swapping to the slider doesn't require any backend or chart changes.
const INTERVAL_STOPS: IntervalStop[] = [
  { label: "1m",  value: "5m", hint: "1-minute candles · ~3h window" },
  { label: "5m",  value: "1h", hint: "5-minute candles · ~16h window" },
  { label: "6h",  value: "6h", hint: "15-minute candles · ~8d window" },
  { label: "1d",  value: "1d", hint: "1-hour candles · ~30d window" },
  { label: "7d",  value: "1w", hint: "4-hour candles · ~90d window" },
  { label: "1m+", value: "1m", hint: "Daily candles · 2mo+ since tweet" },
]
import html2canvas from "html2canvas"
import { fetchTweetData, fetchChartDataWithHistory, testDexScreenerAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface TweetMedia {
  type: 'photo' | 'video' | 'animated_gif'
  url: string
  width?: number
  height?: number
  videoUrl?: string
}

interface TweetData {
  username: string
  handle: string
  text: string
  timestamp: string
  profileImage?: string
  media?: TweetMedia[]
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
  // When set, the user picked a token from search and we know the exact network.
  // This bypasses URL/chain auto-detection and goes straight to Codex with networkId.
  const [selectedNetwork, setSelectedNetwork] = useState<{
    address: string
    networkId: number
    label: string // e.g. "CLANKER • Base"
  } | null>(null)
  const [timeframe, setTimeframe] = useState("1h")
  const [tweetPosition, setTweetPosition] = useState<Position>({ x: 20, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [isGenerated, setIsGenerated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isExportingVideo, setIsExportingVideo] = useState(false)
  const [chartData, setChartData] = useState<ChartData | undefined>()
  const [apiChartData, setApiChartData] = useState<any>(undefined)
  const [fetchedTweetData, setFetchedTweetData] = useState<TweetData | null>(null)
  const [generationId, setGenerationId] = useState(0)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartCardRef = useRef<HTMLDivElement>(null)

  // Use fetched tweet data or fallback to mock data
  const tweetData: TweetData = fetchedTweetData || {
    username: "alon",
    handle: "@a1lon9",
    text: "fuck it\n\njew mode.",
    timestamp: new Date().toISOString(),
  }

  // Show the MP4 button only when the tweet actually contains a video or animated GIF.
  const hasVideo = tweetData.media?.some((m) => m.type === "video" || m.type === "animated_gif") ?? false

  const handleSearchSelect = async (token: TokenSearchResult) => {
    const network = {
      address: token.address,
      networkId: token.networkId,
      label: `${token.symbol || "TOKEN"} • ${token.networkName}`,
    }
    setSelectedNetwork(network)
    setChartUrl(token.address)

    // Auto-generate if a tweet URL is already filled in.
    if (tweetUrl) {
      console.log(`🚀 Auto-generating chart for ${token.symbol} on ${token.networkName}`)
      await generateChart(token.address, network)
    }
  }

  const generateChart = async (
    urlOverride?: string,
    networkOverride?: { address: string; networkId: number; label?: string } | null
  ) => {
    const targetUrl = urlOverride || chartUrl
    const network = networkOverride !== undefined ? networkOverride : selectedNetwork
    setIsLoading(true)
    setChartData(undefined) // Reset chart data

    let tweetDataResult: any = null // Declare outside try block for error handling access

    try {
      // Test API first if it's a new URL
      if (targetUrl !== "https://dexscreener.com/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933") {
        console.log("Testing DexScreener API...")
        await testDexScreenerAPI()
      }

      // Fetch tweet data first to get the timestamp
      tweetDataResult = await fetchTweetData(tweetUrl)
      console.log("Fetched tweet data:", tweetDataResult)
      
      // Now fetch chart data with real historical data (CoinGecko -> Birdeye -> Generated)
      const chartDataResult = await fetchChartDataWithHistory(
        targetUrl,
        timeframe,
        tweetDataResult.timestamp,
        network ? { address: network.address, networkId: network.networkId } : undefined
      )
      console.log("Fetched chart data with historical API integration:", chartDataResult)
      
      // Debug marketCap data specifically
      if (chartDataResult.marketCap) {
        const marketCap = chartDataResult.marketCap
        let formattedMarketCap: string
        if (marketCap >= 1000000000000) {
          formattedMarketCap = `$${(marketCap / 1000000000000).toFixed(2)}T`
        } else if (marketCap >= 1000000000) {
          formattedMarketCap = `$${(marketCap / 1000000000).toFixed(2)}B`
        } else if (marketCap >= 1000000) {
          formattedMarketCap = `$${(marketCap / 1000000).toFixed(2)}M`
        } else {
          formattedMarketCap = `$${marketCap.toLocaleString()}`
        }
        console.log(`💰 Frontend received MarketCap: ${formattedMarketCap}`)
      } else {
        console.log("⚠️ No marketCap data received from API")
      }
      if (chartDataResult.tokenSupply) {
        console.log(`🪙 Frontend received TokenSupply: ${chartDataResult.tokenSupply.toLocaleString()}`)
      }

      // Store the fetched data
      setApiChartData(chartDataResult)
      setFetchedTweetData(tweetDataResult)
      setGenerationId(prev => prev + 1) // Increment to force chart re-render

      setIsGenerated(true)
    } catch (error) {
      console.error("Error generating chart:", error)
      
      // Check if this is a tweet timestamp validation error (422 status or specific message)
      if (error instanceof Error && (error.message.includes('Tweet Timestamp Issue') || error.message.includes('Tweet was posted before') || error.message.includes('422'))) {
        toast({
          title: "⚠️ Tweet Before Token Creation",
          description: "This tweet was posted before the token existed. Showing chart from token creation date instead.",
          variant: "default",
          duration: 6000,
        })
        
        // For PUMP specifically, ensure we fallback to DexScreener with correct market cap display
        console.log(`🔍 Checking if this is PUMP fallback: targetUrl="${targetUrl}"`)
        if (targetUrl === "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn") {
          console.log("🔧 PUMP fallback: Using DexScreener data with market cap display")
          try {
            const fallbackData = await fetchChartDataWithHistory(
              targetUrl,
              timeframe,
              undefined, // No tweet timestamp to avoid future date issues
              network ? { address: network.address, networkId: network.networkId } : undefined
            )
            setApiChartData({
              ...fallbackData,
              isPopularToken: false // Ensure PUMP shows market cap, not price
            })
            
            // Set tweet data if we have it, otherwise use fallback
            if (tweetDataResult) {
              setFetchedTweetData(tweetDataResult)
            } else {
              // Fallback tweet data if we couldn't fetch it
              setFetchedTweetData({
                username: "alon",
                handle: "@a1lon9", 
                text: "fuck it\n\njew mode.",
                timestamp: new Date().toISOString(),
              })
            }
            setGenerationId(prev => prev + 1)
          } catch (fallbackError) {
            console.error("PUMP fallback also failed:", fallbackError)
          }
        }
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

  const handleGenerate = async () => {
    await generateChart()
  }

  const handleChartReady = useCallback((data: ChartData) => {
    setChartData(data)
  }, [])

  const handleDownload = async () => {
    if (chartCardRef.current && chartContainerRef.current) {
      try {
        // Temporarily constrain tweet position within bounds for capture
        const originalPosition = tweetPosition
        const containerRect = chartContainerRef.current.getBoundingClientRect()
        const isMobile = window.innerWidth < 768
        const tweetWidth = isMobile ? 128 : 288
        const tweetHeight = isMobile ? 80 : 120
        
        // Ensure tweet is fully within container bounds
        const constrainedPosition = {
          x: Math.max(0, Math.min(originalPosition.x, containerRect.width - tweetWidth)),
          y: Math.max(0, Math.min(originalPosition.y, containerRect.height - tweetHeight))
        }
        
        // Temporarily update position for capture
        setTweetPosition(constrainedPosition)
        
        // Wait for position update to render
        await new Promise(resolve => setTimeout(resolve, 150))

        const canvas = await html2canvas(chartCardRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
        })

        // Restore original position
        setTweetPosition(originalPosition)

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
    if (chartCardRef.current && chartContainerRef.current) {
      try {
        // Temporarily constrain tweet position within bounds for capture
        const originalPosition = tweetPosition
        const containerRect = chartContainerRef.current.getBoundingClientRect()
        const isMobile = window.innerWidth < 768
        const tweetWidth = isMobile ? 128 : 288
        const tweetHeight = isMobile ? 80 : 120
        
        // Ensure tweet is fully within container bounds
        const constrainedPosition = {
          x: Math.max(0, Math.min(originalPosition.x, containerRect.width - tweetWidth)),
          y: Math.max(0, Math.min(originalPosition.y, containerRect.height - tweetHeight))
        }
        
        // Temporarily update position for capture
        setTweetPosition(constrainedPosition)
        
        // Wait for position update to render
        await new Promise(resolve => setTimeout(resolve, 150))

        const canvas = await html2canvas(chartCardRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
        })

        // Restore original position
        setTweetPosition(originalPosition)

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

  // Records the chart card with the autoplaying tweet video composited on top
  // and saves it as MP4 (or WebM where MP4 isn't supported).
  //
  // Why a hidden proxied <video> element instead of the visible one:
  // The visible <video> in TweetOverlay loads directly from video.twimg.com
  // (no crossOrigin attribute, so autoplay works). But that means drawing it
  // onto a canvas would taint the canvas and html2canvas/MediaRecorder would
  // reject. We get around this by piping the same source through our
  // /api/video-proxy route as same-origin, on a hidden <video> with
  // crossOrigin="anonymous", and using *that* element as the drawImage source.
  const handleDownloadVideo = async () => {
    if (!chartCardRef.current || !chartContainerRef.current) return

    const visibleVideo = chartCardRef.current.querySelector("video") as HTMLVideoElement | null
    if (!visibleVideo) {
      toast({
        title: "No video in this tweet",
        description: "This tweet doesn't have a video to record.",
        variant: "destructive",
        duration: 4000,
      })
      return
    }

    const sourceUrl =
      visibleVideo.getAttribute("data-video-src") || visibleVideo.currentSrc || visibleVideo.src
    if (!sourceUrl) {
      toast({
        title: "Video source unavailable",
        description: "Couldn't find the video URL on this tweet.",
        variant: "destructive",
        duration: 4000,
      })
      return
    }

    setIsExportingVideo(true)

    // Constrain tweet position so it sits inside the frame for capture.
    const originalPosition = tweetPosition
    const containerRect = chartContainerRef.current.getBoundingClientRect()
    const isMobile = window.innerWidth < 768
    const tweetWidth = isMobile ? 128 : 288
    const tweetHeight = isMobile ? 80 : 120
    const constrainedPosition = {
      x: Math.max(0, Math.min(originalPosition.x, containerRect.width - tweetWidth)),
      y: Math.max(0, Math.min(originalPosition.y, containerRect.height - tweetHeight)),
    }
    setTweetPosition(constrainedPosition)
    await new Promise((r) => setTimeout(r, 200))

    // Build a same-origin URL for the recording-only video element so the
    // composite canvas isn't tainted.
    const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(sourceUrl)}`

    // Off-screen <video> we'll actually draw from. Kept off-DOM-flow with
    // visibility:hidden + position:fixed so layout isn't affected.
    const recVideo = document.createElement("video")
    recVideo.crossOrigin = "anonymous"
    recVideo.muted = true
    recVideo.loop = true
    recVideo.playsInline = true
    recVideo.preload = "auto"
    recVideo.style.position = "fixed"
    recVideo.style.left = "-99999px"
    recVideo.style.top = "0"
    recVideo.style.width = "1px"
    recVideo.style.height = "1px"
    recVideo.style.opacity = "0"
    recVideo.style.pointerEvents = "none"
    recVideo.src = proxyUrl
    document.body.appendChild(recVideo)

    let raf = 0
    let visibleVideoOriginalVisibility: string | null = null
    let audioCtx: AudioContext | null = null

    const cleanupRecVideo = () => {
      try {
        recVideo.pause()
      } catch {}
      try {
        recVideo.removeAttribute("src")
        recVideo.load()
      } catch {}
      if (recVideo.parentNode) recVideo.parentNode.removeChild(recVideo)
      if (audioCtx) {
        audioCtx.close().catch(() => {})
        audioCtx = null
      }
    }

    try {
      // Wait for the proxied video to be ready enough that drawImage will work.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Video proxy load timed out")), 15000)
        const onReady = () => {
          clearTimeout(timer)
          recVideo.removeEventListener("canplay", onReady)
          recVideo.removeEventListener("loadeddata", onReady)
          recVideo.removeEventListener("error", onError)
          resolve()
        }
        const onError = () => {
          clearTimeout(timer)
          recVideo.removeEventListener("canplay", onReady)
          recVideo.removeEventListener("loadeddata", onReady)
          recVideo.removeEventListener("error", onError)
          reject(new Error("Video proxy failed to load"))
        }
        recVideo.addEventListener("canplay", onReady, { once: true })
        recVideo.addEventListener("loadeddata", onReady, { once: true })
        recVideo.addEventListener("error", onError, { once: true })
        // Kick the load explicitly in case the browser hasn't started yet.
        recVideo.load()
      })

      // Hide the visible video during the static snapshot so html2canvas doesn't
      // try to rasterise the cross-origin element (which can throw the
      // unhandled-rejection Event we were seeing).
      visibleVideoOriginalVisibility = visibleVideo.style.visibility
      visibleVideo.style.visibility = "hidden"

      // Static snapshot of the entire chart card. The live video frame will be
      // drawn over the same pixel region every animation frame.
      const staticCanvas = await html2canvas(chartCardRef.current, {
        backgroundColor: "#000000",
        scale: 2,
        useCORS: true,
      })

      // Restore the visible video before measuring, so its rect matches what
      // the user sees when not exporting.
      visibleVideo.style.visibility = visibleVideoOriginalVisibility || ""
      visibleVideoOriginalVisibility = null

      const cardRect = chartCardRef.current.getBoundingClientRect()
      const vidRect = visibleVideo.getBoundingClientRect()
      const scaleFactor = staticCanvas.width / cardRect.width
      const vidX = (vidRect.left - cardRect.left) * scaleFactor
      const vidY = (vidRect.top - cardRect.top) * scaleFactor
      const vidW = vidRect.width * scaleFactor
      const vidH = vidRect.height * scaleFactor

      const composite = document.createElement("canvas")
      composite.width = staticCanvas.width
      composite.height = staticCanvas.height
      const cctx = composite.getContext("2d")
      if (!cctx) throw new Error("Could not create 2D canvas context")

      // We MUST require AAC audio inside MP4 — Chrome's MediaRecorder will
      // happily mux Opus into an .mp4 container, but most players (QuickTime,
      // iOS Photos, Twitter's own preview, etc.) refuse to play that file.
      // If we can't get AAC-in-MP4, fall through to WebM (which natively
      // pairs VP9/VP8 with Opus and is accepted by X, Discord, Telegram).
      const candidates = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4;codecs=h264,aac",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ]
      let mimeType = ""
      if (typeof MediaRecorder !== "undefined") {
        for (const type of candidates) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type
            break
          }
        }
      }
      if (!mimeType) throw new Error("Your browser doesn't support video recording.")

      // Audio routing via Web Audio API. We deliberately do NOT use
      // recVideo.captureStream() for audio because:
      //   - Chrome's behaviour with muted+captureStream is browser-version
      //     dependent (sometimes emits a permanently-muted track).
      //   - We want the user to NOT hear the audio while exporting.
      // Instead: createMediaElementSource → MediaStreamDestination, never
      // connect to ctx.destination. That gives us audio in the recording
      // and silence in the room.
      const stream = composite.captureStream(30)
      try {
        const Ctx =
          (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx) {
          audioCtx = new Ctx()
          // Some browsers start the context suspended until a user gesture;
          // the download click already counts as one, but resume() is safe.
          if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {})
          const source = audioCtx.createMediaElementSource(recVideo)
          const dest = audioCtx.createMediaStreamDestination()
          source.connect(dest)
          // Note: deliberately NOT connecting source to audioCtx.destination,
          // so the user doesn't hear the audio during export.
          for (const track of dest.stream.getAudioTracks()) {
            stream.addTrack(track)
          }
        }
      } catch (audioErr) {
        // Non-fatal — we'll still get a silent video.
        console.warn("Audio capture failed, exporting silent video:", audioErr)
      }

      // Start playback. Once createMediaElementSource has been called above,
      // local playback is rerouted away from the speakers, so even with
      // muted=false there's no audible output here.
      recVideo.muted = false
      try {
        recVideo.currentTime = 0
      } catch {}
      await recVideo.play().catch(() => {})

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
        audioBitsPerSecond: 128_000,
      })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }

      const draw = () => {
        cctx.drawImage(staticCanvas, 0, 0)
        try {
          cctx.drawImage(recVideo, vidX, vidY, vidW, vidH)
        } catch {
          // drawImage can throw if the video is not yet decoded; just skip this frame
        }
        raf = requestAnimationFrame(draw)
      }
      draw()

      recorder.start()

      const rawDur = isFinite(recVideo.duration) && recVideo.duration > 0 ? recVideo.duration : 6
      const dur = Math.max(2, Math.min(rawDur, 10))
      await new Promise((r) => setTimeout(r, dur * 1000))

      cancelAnimationFrame(raf)
      raf = 0
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        recorder.stop()
      })

      setTweetPosition(originalPosition)

      const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm"
      const blob = new Blob(chunks, { type: mimeType })
      if (blob.size === 0) {
        throw new Error("Recording produced no data. The video may be CORS-blocked by Twitter.")
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `recharted.io-${apiChartData?.symbol?.replace("/", "-") || "roast"}-exposed.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: ext === "mp4" ? "MP4 saved" : "WebM saved",
        description:
          ext === "mp4"
            ? "Video receipt saved to your downloads."
            : "Your browser can't record native MP4. Saved as WebM — X, Discord, and Telegram all accept it.",
        duration: 5000,
      })
    } catch (error) {
      console.error("Video export failed:", error)
      setTweetPosition(originalPosition)
      toast({
        title: "Video export failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      if (raf) cancelAnimationFrame(raf)
      if (visibleVideoOriginalVisibility !== null) {
        visibleVideo.style.visibility = visibleVideoOriginalVisibility
      }
      cleanupRecVideo()
      setIsExportingVideo(false)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent | TouchEvent) => {
    if (isDragging && chartContainerRef.current) {
      const rect = chartContainerRef.current.getBoundingClientRect()
      const isMobile = window.innerWidth < 768
      const offsetX = isMobile ? 64 : 144 // Mobile: 128px/2, Desktop: 288px/2
      const offsetY = isMobile ? 40 : 60
      
      let clientX: number, clientY: number
      if ('touches' in e) {
        // Touch event
        clientX = e.touches[0]?.clientX || 0
        clientY = e.touches[0]?.clientY || 0
      } else {
        // Mouse event
        clientX = e.clientX
        clientY = e.clientY
      }
      
      const tweetWidth = isMobile ? 128 : 288
      const tweetHeight = isMobile ? 60 : 120
      
      let x = clientX - rect.left - offsetX
      let y = clientY - rect.top - offsetY
      
      // Constrain position within container bounds
      x = Math.max(0, Math.min(x, rect.width - tweetWidth))
      y = Math.max(0, Math.min(y, rect.height - tweetHeight))
      
      setTweetPosition({ x, y })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    handleMouseMove(e.nativeEvent)
  }

  const handleTouchEnd = () => {
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

      <div className="container mx-auto px-2 sm:px-4 py-4 md:py-8 max-w-7xl">
        {/* Responsive layout - vertical on mobile, horizontal on desktop */}
        <div className="flex flex-col xl:flex-row gap-4 md:gap-6 xl:gap-8 min-h-[calc(100vh-200px)]">
          {/* Left Panel - Inputs */}
          <div className="w-full xl:w-80 space-y-4 md:space-y-6 flex-shrink-0 order-1">
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
                  <Label className="font-bold text-base md:text-lg">
                    Search Token
                  </Label>
                  <TokenSearch
                    onSelect={handleSearchSelect}
                    initialValue={selectedNetwork?.label || ""}
                  />
                  {selectedNetwork && (
                    <div className="text-xs text-gray-600">
                      Selected:{" "}
                      <span className="font-semibold text-black">
                        {selectedNetwork.label}
                      </span>{" "}
                      <button
                        type="button"
                        onClick={() => setSelectedNetwork(null)}
                        className="ml-1 underline hover:no-underline"
                      >
                        clear
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <span className="font-medium">OR PASTE ADDRESS</span>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chartUrl" className="font-bold text-base md:text-lg">
                    Token Address
                  </Label>
                  <Input
                    id="chartUrl"
                    value={chartUrl}
                    onChange={(e) => {
                      setChartUrl(e.target.value)
                      // Manually editing the address invalidates the searched network.
                      if (selectedNetwork) setSelectedNetwork(null)
                    }}
                    className="border-2 border-black font-bold text-base md:text-lg"
                    placeholder="0x... or Solana address"
                  />
                </div>



                <div className="space-y-2">
                  <Label className="font-bold text-base md:text-lg">
                    Chart Interval
                  </Label>
                  <IntervalSlider
                    stops={INTERVAL_STOPS}
                    value={timeframe}
                    disabled={isLoading}
                    onChange={async (newTimeframe) => {
                      setTimeframe(newTimeframe)
                      // Auto-generate when timeframe changes if chart is already generated
                      if (isGenerated && chartUrl && tweetUrl) {
                        console.log(`🔄 Auto-generating chart for new interval: ${newTimeframe}`)
                        await generateChart()
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row xl:flex-col gap-3 sm:gap-4">
              <Button
                onClick={handleGenerate}
                disabled={isLoading}
                className="flex-1 bg-black text-white border-4 border-black hover:bg-white hover:text-black font-black text-sm sm:text-base md:text-lg py-3 sm:py-4 md:py-6 shadow-[2px_2px_0px_0px_#000000] md:shadow-[4px_4px_0px_0px_#000000] hover:shadow-[1px_1px_0px_0px_#000000] md:hover:shadow-[2px_2px_0px_0px_#000000] transition-all disabled:opacity-50 min-h-[48px] sm:min-h-[52px]"
              >
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                {isLoading ? "FETCHING THE RECEIPTS..." : "GENERATE"}
              </Button>

              {isGenerated && (
                <>
                  <Button
                    onClick={handleCopyToClipboard}
                    className="flex-1 bg-blue-500 text-white border-4 border-black hover:bg-blue-600 font-black text-sm sm:text-base md:text-lg py-3 sm:py-4 md:py-6 shadow-[2px_2px_0px_0px_#000000] md:shadow-[4px_4px_0px_0px_#000000] hover:shadow-[1px_1px_0px_0px_#000000] md:hover:shadow-[2px_2px_0px_0px_#000000] transition-all min-h-[48px] sm:min-h-[52px]"
                  >
                    <Copy className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">COPY TO CLIPBOARD</span>
                    <span className="sm:hidden">COPY</span>
                  </Button>

                  <Button
                    onClick={handleDownload}
                    className="flex-1 bg-white text-black border-4 border-black hover:bg-black hover:text-white font-black text-sm sm:text-base md:text-lg py-3 sm:py-4 md:py-6 shadow-[2px_2px_0px_0px_#000000] md:shadow-[4px_4px_0px_0px_#000000] hover:shadow-[1px_1px_0px_0px_#000000] md:hover:shadow-[2px_2px_0px_0px_#000000] transition-all min-h-[48px] sm:min-h-[52px]"
                  >
                    <Download className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                    DOWNLOAD
                  </Button>

                  {hasVideo && (
                    <Button
                      onClick={handleDownloadVideo}
                      disabled={isExportingVideo}
                      className="flex-1 bg-yellow-400 text-black border-4 border-black hover:bg-yellow-300 font-black text-sm sm:text-base md:text-lg py-3 sm:py-4 md:py-6 shadow-[2px_2px_0px_0px_#000000] md:shadow-[4px_4px_0px_0px_#000000] hover:shadow-[1px_1px_0px_0px_#000000] md:hover:shadow-[2px_2px_0px_0px_#000000] transition-all disabled:opacity-50 min-h-[48px] sm:min-h-[52px]"
                    >
                      <Film className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                      {isExportingVideo ? "RECORDING..." : "DOWNLOAD MP4"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Chart Display */}
          <div className="flex-1 relative min-h-[420px] sm:min-h-[480px] md:min-h-[560px] lg:min-h-[640px] order-2">
            <Card ref={chartCardRef} className="border-4 border-black shadow-[4px_4px_0px_0px_#000000] md:shadow-[8px_8px_0px_0px_#000000] h-full rounded-none" style={{backgroundColor: '#000000'}}>
              <CardHeader className="bg-black text-white relative p-3 sm:p-4 md:p-6">
                <CardTitle className="font-black text-lg sm:text-xl md:text-2xl lg:text-4xl">RECHARTED.IO</CardTitle>
                {apiChartData?.symbol && (
                  <div className="absolute top-2 sm:top-3 md:top-4 right-2 sm:right-3 md:right-4 font-black text-lg sm:text-xl md:text-2xl lg:text-4xl">
                    {apiChartData.symbol.split('/')[0]}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-60px)] sm:h-[calc(100%-72px)] md:h-[calc(100%-80px)] lg:h-[calc(100%-100px)]" style={{backgroundColor: '#000000'}}>
                {isGenerated ? (
                  <div
                    ref={chartContainerRef}
                    className="relative w-full h-full bg-black overflow-hidden cursor-crosshair touch-none"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    <TradingChart
                      key={`chart-${apiChartData?.symbol || "default"}-${timeframe}-${generationId}`}
                      tokenPair={apiChartData?.symbol || "Loading..."}
                      chartData={apiChartData}
                      timeframe={timeframe}
                      tweetTimestamp={tweetData.timestamp}
                      onChartReady={handleChartReady}
                      isPopularToken={apiChartData?.isPopularToken || false}
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
