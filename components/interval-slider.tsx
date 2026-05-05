"use client"

import type React from "react"

export interface IntervalStop {
  // What the user sees on the slider (e.g. "1m", "1m+").
  label: string
  // The internal timeframe key the rest of the app understands
  // (matches keys in /api/codex resolutionMap and trading-chart's
  // getTimeframeInMs / convertApiDataToChartData).
  value: string
  // Optional tooltip shown on hover.
  hint?: string
}

interface IntervalSliderProps {
  stops: IntervalStop[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function IntervalSlider({ stops, value, onChange, disabled }: IntervalSliderProps) {
  const idx = stops.findIndex((s) => s.value === value)
  const activeIndex = idx >= 0 ? idx : 0

  const select = (next: string) => {
    if (disabled || next === value) return
    onChange(next)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === "ArrowLeft" && activeIndex > 0) {
      e.preventDefault()
      select(stops[activeIndex - 1].value)
    } else if (e.key === "ArrowRight" && activeIndex < stops.length - 1) {
      e.preventDefault()
      select(stops[activeIndex + 1].value)
    } else if (e.key === "Home") {
      e.preventDefault()
      select(stops[0].value)
    } else if (e.key === "End") {
      e.preventDefault()
      select(stops[stops.length - 1].value)
    }
  }

  return (
    <div
      className="w-full select-none"
      role="radiogroup"
      aria-label="Chart interval"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      <div className="relative px-2 sm:px-3">
        {/* Track */}
        <div
          className="absolute left-2 right-2 sm:left-3 sm:right-3 top-1/2 -translate-y-1/2 h-[3px] bg-black"
          aria-hidden
        />
        {/* Stops */}
        <div className="relative flex items-center justify-between py-2">
          {stops.map((stop, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={stop.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={`Interval ${stop.label}`}
                title={stop.hint || stop.label}
                onClick={() => select(stop.value)}
                disabled={disabled}
                className={`relative z-10 rounded-full border-[3px] border-black transition-all ${
                  isActive
                    ? "bg-yellow-400 w-6 h-6 sm:w-7 sm:h-7 shadow-[2px_2px_0_0_#000]"
                    : "bg-black hover:bg-neutral-700 w-5 h-5 sm:w-6 sm:h-6"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              />
            )
          })}
        </div>
      </div>
      {/* Labels */}
      <div className="flex items-center justify-between px-2 sm:px-3 mt-1">
        {stops.map((stop, i) => {
          const isActive = i === activeIndex
          return (
            <button
              key={stop.value}
              type="button"
              tabIndex={-1}
              onClick={() => select(stop.value)}
              disabled={disabled}
              className={`text-[11px] sm:text-sm font-black tabular-nums tracking-tight transition-colors ${
                isActive ? "text-black" : "text-neutral-500 hover:text-black"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {stop.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
