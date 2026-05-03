"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"

export interface TokenSearchResult {
  address: string
  symbol: string
  name: string
  networkId: number
  networkName: string
  imageUrl: string | null
  marketCap: number | null
  priceUSD: number | null
  liquidity: number | null
  volume24: number | null
  txnCount24: number | null
  isNative?: boolean
}

interface TokenSearchProps {
  onSelect: (token: TokenSearchResult) => void
  placeholder?: string
  /** Initial value shown in the input (e.g. last picked symbol). */
  initialValue?: string
}

// Chain options surfaced in the filter dropdown. networkId=0 represents
// "All Chains" (no filter). Order matches typical user priority.
const CHAIN_OPTIONS: Array<{ id: number; label: string }> = [
  { id: 0, label: "All Chains" },
  { id: 1, label: "Ethereum" },
  { id: 1399811149, label: "Solana" },
  { id: 8453, label: "Base" },
  { id: 56, label: "BSC" },
  { id: 42161, label: "Arbitrum" },
  { id: 10, label: "Optimism" },
  { id: 137, label: "Polygon" },
  { id: 43114, label: "Avalanche" },
  { id: 81457, label: "Blast" },
]

function formatUSD(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—"
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function shortAddr(addr: string): string {
  if (!addr) return ""
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function TokenSearch({
  onSelect,
  placeholder = "Search token (e.g. clanker, pepe, bonk)…",
  initialValue = "",
}: TokenSearchProps) {
  const [query, setQuery] = useState(initialValue)
  const [chainId, setChainId] = useState<number>(0) // 0 = All Chains
  const [results, setResults] = useState<TokenSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Debounced fetch — re-runs when query OR chain changes
  useEffect(() => {
    const phrase = query.trim()
    if (phrase.length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const handle = setTimeout(async () => {
      // Cancel any in-flight request
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      try {
        const params = new URLSearchParams({
          q: phrase,
          limit: "15",
        })
        if (chainId > 0) params.set("chain", String(chainId))

        const res = await fetch(`/api/token-search?${params.toString()}`, {
          signal: ac.signal,
        })
        const json = await res.json()
        if (ac.signal.aborted) return
        if (!res.ok) {
          setError(json?.error || `Search failed (${res.status})`)
          setResults([])
        } else {
          setResults(Array.isArray(json.results) ? json.results : [])
          setActiveIndex(0)
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return
        setError(e?.message || "Search failed")
        setResults([])
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    }, 250)

    return () => clearTimeout(handle)
  }, [query, chainId])

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const showDropdown = open && query.trim().length >= 2

  function handleSelect(t: TokenSearchResult) {
    onSelect(t)
    setQuery(`${t.symbol} • ${t.networkName}`)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const t = results[activeIndex]
      if (t) handleSelect(t)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Chain filter + search input — chain dropdown is fixed-width on desktop, full-width on mobile */}
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={chainId}
          onChange={(e) => setChainId(parseInt(e.target.value, 10))}
          className="border-2 border-black rounded bg-white py-2 px-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 sm:w-36"
          aria-label="Filter by chain"
        >
          {CHAIN_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="w-full pl-8 pr-8 py-2 text-sm border-2 border-black rounded bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-500" />
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 mt-1 max-h-80 overflow-auto border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000000] rounded z-50">
          {error ? (
            <div className="p-3 text-sm text-red-600">{error}</div>
          ) : results.length === 0 && !loading ? (
            <div className="p-3 text-sm text-gray-600">
              No tokens found for "{query}"
              {chainId > 0 ? ` on ${CHAIN_OPTIONS.find((c) => c.id === chainId)?.label}` : ""}.
            </div>
          ) : (
            <ul role="listbox">
              {results.map((t, idx) => {
                const isActive = idx === activeIndex
                return (
                  <li
                    key={`${t.networkId}:${t.address}`}
                    role="option"
                    aria-selected={isActive}
                    className={`flex items-center gap-2 p-2 cursor-pointer border-b border-gray-200 last:border-b-0 ${
                      isActive ? "bg-yellow-100" : "hover:bg-gray-100"
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      // mousedown so we beat the input blur
                      e.preventDefault()
                      handleSelect(t)
                    }}
                  >
                    {t.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.imageUrl}
                        alt=""
                        className="w-7 h-7 rounded-full border border-black object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full border border-black bg-gray-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {(t.symbol || "?").slice(0, 3).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-sm truncate">
                          {t.symbol || "?"}
                        </span>
                        <span className="text-xs text-gray-700 truncate">
                          {t.name}
                        </span>
                        {t.isNative && (
                          <span className="text-[10px] font-bold uppercase px-1 py-0.5 bg-yellow-300 border border-black rounded ml-auto">
                            major
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-600">
                        <span className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded">
                          {t.networkName}
                        </span>
                        <span title={t.address}>{shortAddr(t.address)}</span>
                        {!t.isNative && (
                          <span className="ml-auto whitespace-nowrap">
                            MC {formatUSD(t.marketCap)}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
