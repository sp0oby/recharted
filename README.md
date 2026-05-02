# Recharted

Next.js app that pairs an **X (Twitter) post** with **token price charts** so you can visualize what someone said relative to price action. Charts prefer **real OHLCV history** from [Codex](https://docs.codex.io/graphql), then fall back to [DexScreener](https://dexscreener.com/) current data with generated series.

Live site: [recharted.io](https://www.recharted.io/) · Source: [github.com/sp0oby/recharted](https://github.com/sp0oby/recharted)

## What it does

- **Main UI** (`app/page.tsx`): Enter a tweet URL, a DexScreener URL or raw token address, and a timeframe. The app loads tweet metadata (via `/api/tweet`), fetches chart series (`lib/api.ts` → `/api/codex` or DexScreener paths), and renders an interactive **Chart.js** candlestick view with a draggable tweet overlay (`components/trading-chart.tsx`, `components/tweet-overlay.tsx`). You can export the composed image with **html2canvas**.
- **Data routing**: `fetchChartDataWithHistory` tries Codex (`address:networkId`) first for historical bars, then DexScreener-driven generation. Popular assets (BTC / ETH / SOL shortcuts) map to representative Dex pairs before Codex lookup.
- **API routes** under `app/api/`:
  - `GET /api/tweet?id=` — Tweet payload from Twitter syndication (token derived from tweet id).
  - `GET /api/codex` — Codex `getBars` + metadata; requires `CODEX_API_KEY`.
  - `GET /api/historical-data` — Same stacking logic as the client helper, returns JSON for `chartUrl`, `timeframe`, optional `tweetTimestamp`.
  - `GET /api/codex-networks`, `GET /api/codex-test-solana` — Codex diagnostics (require API key).

See [CODEX_INTEGRATION.md](./CODEX_INTEGRATION.md) for Codex parameters, network IDs, and timeframe mapping.

## Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **UI**: Tailwind CSS, Radix/shadcn-style components (`components/ui`), Geist fonts, `next-themes`, Sonner toasts
- **Charts**: Chart.js (`components/trading-chart.tsx`); Recharts is also in dependencies
- **Analytics**: `@vercel/analytics` is installed (`app/layout.tsx` imports it; add `<Analytics />` in the body when you want Vercel Analytics enabled)

## Prerequisites

- Node.js 18+ (20+ recommended for Next 15)
- npm, pnpm, or yarn (lockfiles exist for npm and pnpm)

## Environment variables

Copy `.env.example` to `.env` and set at minimum **`CODEX_API_KEY`**. Without it, Codex routes return 500 and the UI relies on DexScreener/mock fallbacks where applicable.

```bash
cp .env.example .env
```

## Install and run the frontend (dev)

From the repository root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run build    # production build
npm run start    # run production server (after build)
npm run lint     # Next.js ESLint
```

## Production build locally

```bash
npm install
npm run build
npm run start
```

## Deploy

Configured for [Vercel](https://vercel.com): set `CODEX_API_KEY` in the project Environment Variables, then deploy from this repo.

## Git and GitHub

This folder is a clone of [github.com/sp0oby/recharted](https://github.com/sp0oby/recharted). Branch **`main`** tracks **`origin/main`**.

Typical loop:

```bash
git pull origin main
# edit code…
git status
git add .
git commit -m "Short imperative description of the change."
git push origin main
```

Never commit `.env` (it stays ignored). Copy [`.env.example`](./.env.example) to `.env` locally for secrets. Use **npm** with `package-lock.json`; `yarn.lock` is ignored.

## Project layout (high level)

| Path | Role |
|------|------|
| `app/page.tsx` | Main client screen: inputs, generate flow, export |
| `app/api/*` | Tweet + Codex + historical JSON endpoints |
| `lib/api.ts` | Client-side fetch helpers, Dex URL parsing, Codex/Dex stacking |
| `components/trading-chart.tsx` | Chart.js rendering |
| `components/tweet-overlay.tsx` | Draggable tweet card |

## License

Add a `LICENSE` file if you want explicit terms; the upstream package metadata currently marks the package as private.
