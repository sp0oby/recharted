# Codex GraphQL API Integration

This document explains how the Codex GraphQL API has been integrated into the chart application to provide real historical OHLCV data for more accurate charts with wider timeframes.

## Overview

The integration provides a multi-tier data fetching strategy:

1. **Codex GraphQL API** (Primary) - Real historical OHLCV data
2. **DexScreener API** (Fallback) - Current data + generated historical data
3. **Mock Data** (Last resort) - Synthetic data for testing

## Setup

### 1. Get Your Codex API Key

1. Visit [https://dashboard.codex.io](https://dashboard.codex.io)
2. Sign up for an account
3. Generate a **secret API key** (not short-lived)

### 2. Configure Environment Variables

Add your Codex API key to the `.env` file:

```env
# Codex GraphQL API key for historical data
# Get your API key from: https://dashboard.codex.io
CODEX_API_KEY=your-actual-codex-api-key-here
```

### 3. Implementation Details

The integration uses **direct HTTP fetch** to the Codex GraphQL endpoint (`https://graph.codex.io/graphql`) instead of the SDK to avoid WebSocket dependencies that don't work in Next.js API routes.

## API Endpoints

### `/api/codex`

Direct access to Codex GraphQL API with getBars query.

**Parameters:**
- `symbol` (required): Token address with network ID (e.g., `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2:1`)
- `timeframe` (optional): Chart timeframe (`5m`, `15m`, `1h`, `4h`, `6h`, `1d`)
- `tweetTimestamp` (optional): ISO timestamp to center the chart around

**Example:**
```
GET /api/codex?symbol=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2:1&timeframe=1h
```

### `/api/historical-data`

Unified historical data endpoint that automatically tries the best available source.

**Parameters:**
- `chartUrl` (required): DexScreener URL or similar
- `timeframe` (optional): Chart timeframe
- `tweetTimestamp` (optional): Tweet timestamp for centering

**Example:**
```
GET /api/historical-data?chartUrl=https://dexscreener.com/ethereum/0x123...&timeframe=1d
```

## Supported Networks

The integration supports multiple blockchain networks:

| Network  | Network ID | Example |
|----------|------------|---------|
| Ethereum | 1          | `0xtoken:1` |
| BSC      | 56         | `0xtoken:56` |
| Polygon  | 137        | `0xtoken:137` |
| Arbitrum | 42161      | `0xtoken:42161` |
| Optimism | 10         | `0xtoken:10` |
| Solana   | 900        | `tokenaddress:900` |

## Timeframes and Resolutions

| Timeframe | Codex Resolution | Data Coverage |
|-----------|------------------|---------------|
| `5m`      | `5`             | 2 hours total |
| `15m`     | `15`            | 6 hours total |
| `1h`      | `60`            | 24 hours total |
| `4h`      | `240`           | 7 days total |
| `6h`      | `360`           | 10 days total |
| `1d`      | `1D`            | 60 days total |

## Features

### Real Historical Data
- Actual OHLCV bars from Codex GraphQL API
- Accurate timestamps and price movements
- Volume data included

### Smart Fallback System
- Automatically falls back to DexScreener if Codex fails
- Graceful error handling
- Transparent data source indication

### Tweet Timeline Centering
- Centers chart data around tweet timestamps
- Provides context for price movements
- Maintains proper time relationships

### Data Source Transparency
- Visual indicators show data source
- Green indicator: Real Codex data
- Yellow indicator: DexScreener generated data
- Gray indicator: Mock data

## 🔍 Important: Pair vs Token Addresses

**DexScreener URLs contain PAIR addresses, not individual token addresses!**

- **DexScreener URL**: `https://dexscreener.com/ethereum/0xpairaddress123...`
- **Contains**: Liquidity pool (pair) contract address
- **Codex API accepts both**: `pairAddress:networkId` OR `tokenAddress:networkId`
- **Auto-detection**: System detects address type and uses appropriate `symbolType` (POOL/TOKEN)

### How the Integration Works

1. **Extracts pair address** from DexScreener URL
2. **Formats for Codex**: `0xpairaddress:1` (pair address + network ID)
3. **Auto-detects type**: Uses `POOL` symbolType for pair addresses
4. **Fetches real data**: GraphQL `getBars` query with proper parameters
5. **Fallback logic**: Tries `TOKEN` symbolType if `POOL` fails
6. **Graceful degradation**: Falls back to DexScreener if Codex fails

## Usage in Code

### Basic Usage

```typescript
import { fetchChartDataWithHistory } from '@/lib/api'

const chartData = await fetchChartDataWithHistory(
  'https://dexscreener.com/ethereum/0x123...',
  '1h',
  '2024-01-01T12:00:00Z'
)

console.log(`Data source: ${chartData.source}`)
console.log(`Data points: ${chartData.dataPoints}`)
```

### Direct Codex API Access

```typescript
import { fetchCodexChartData } from '@/lib/api'

// Using a pair address from DexScreener (recommended)
const codexData = await fetchCodexChartData(
  '0xpairaddress123...:1', // pair address + network ID
  '1d'
)

// Or using a token address (Codex will find top pair)
const tokenData = await fetchCodexChartData(
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2:1', // WETH token
  '1h'
)
```

## Error Handling

The integration includes comprehensive error handling:

### Common Errors

1. **Invalid API Key**
   - Status: 401
   - Message: "Invalid Codex API key"
   - Solution: Check your CODEX_API_KEY in .env

2. **Symbol Not Found**
   - Status: 404
   - Message: "Symbol not found"
   - Solution: Verify token address and network ID format

3. **No Data Available**
   - Falls back to DexScreener automatically
   - Continues with generated historical data

### Error Response Format

```json
{
  "error": "Error description",
  "details": "Detailed error message",
  "chartUrl": "Original chart URL",
  "timeframe": "Requested timeframe",
  "tweetTimestamp": "Tweet timestamp if provided"
}
```

## Benefits

### Accurate Historical Data
- Real price movements instead of generated data
- Proper volume correlation
- Accurate market cap calculations

### Wider Timeframes
- Support for daily, weekly data
- Historical data going back months
- Proper long-term trend analysis

### Better Chart Quality
- No artificial price movements
- Real market volatility patterns
- Accurate support/resistance levels

## Troubleshooting

### Check API Key Configuration
```bash
# Verify your .env file contains:
CODEX_API_KEY=your-actual-api-key
```

### Test API Connection
The application will log detailed information about data fetching:
- Codex API attempts
- Fallback to DexScreener
- Data source used
- Number of data points retrieved

### Network ID Reference
Make sure you're using the correct network ID for your token:
- Ethereum: `:1`
- BSC: `:56`
- Polygon: `:137`
- etc.

## Future Enhancements

- Support for more blockchain networks
- Real-time data subscriptions via WebSocket
- Advanced chart indicators using historical data
- Performance optimizations for large datasets

## Documentation Links

- [Codex GraphQL API Documentation](https://docs.codex.io/graphql)
- [Codex Dashboard](https://dashboard.codex.io)
- [getBars API Reference](https://docs.codex.io/api-reference/queries/getbars)