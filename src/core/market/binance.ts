/**
 * Binance public API client.
 * No API key required for public market data endpoints.
 */

import { Candle, CandleRequest, MarketError, MarketSymbol, Timeframe } from './types';

const BINANCE_BASE = 'https://api.binance.us';

// Top symbols to show by default (curated for relevance)
const TOP_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
    'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT',
    'APTUSDT', 'ARBUSDT', 'OPUSDT', 'FILUSDT', 'INJUSDT',
];

/**
 * Map our canonical timeframes to Binance interval strings.
 */
const TIMEFRAME_MAP: Record<Timeframe, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
};

/**
 * Binance kline array format:
 * [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
 */
type BinanceKline = [
    number, string, string, string, string, string,
    number, string, number, string, string, string,
];

/**
 * Fetch OHLCV candles from Binance.
 */
export async function fetchCandles(req: CandleRequest): Promise<Candle[]> {
    const { symbol, timeframe, limit = 100 } = req;
    const interval = TIMEFRAME_MAP[timeframe];

    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;

    const res = await fetch(url);

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new MarketError(
            `Binance API error: ${res.status} ${res.statusText} — ${body}`,
            res.status,
            'binance',
        );
    }

    const data: BinanceKline[] = await res.json();

    return data.map(normalizeBinanceKline);
}

/**
 * Normalize a raw Binance kline into our Candle type.
 */
function normalizeBinanceKline(kline: BinanceKline): Candle {
    return {
        time: Math.floor(kline[0] / 1000), // ms → seconds
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
    };
}

/**
 * Fetch available trading symbols from Binance (filtered to USDT pairs).
 */
export async function fetchSymbols(): Promise<MarketSymbol[]> {
    const url = `${BINANCE_BASE}/api/v3/exchangeInfo`;

    const res = await fetch(url);

    if (!res.ok) {
        throw new MarketError(
            `Binance exchangeInfo error: ${res.status}`,
            res.status,
            'binance',
        );
    }

    interface BinanceSymbolInfo {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        status: string;
    }

    const data: { symbols: BinanceSymbolInfo[] } = await res.json();

    // Filter to USDT pairs that are actively trading, prioritize top symbols
    const usdtPairs = data.symbols
        .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map(s => ({
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
        }));

    // Sort: top symbols first, then alphabetical
    return usdtPairs.sort((a, b) => {
        const aIdx = TOP_SYMBOLS.indexOf(a.symbol);
        const bIdx = TOP_SYMBOLS.indexOf(b.symbol);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.symbol.localeCompare(b.symbol);
    });
}
