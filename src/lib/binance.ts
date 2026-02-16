
import { Candle, Timeframe } from '@/core/market/types';

const BINANCE_API_URL = 'https://api.binance.us/api/v3';

export async function fetchBinanceCandles(
    symbol: string,
    interval: Timeframe,
    limit: number = 100
): Promise<Candle[]> {
    try {
        const url = `${BINANCE_API_URL}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Binance API Error: ${res.statusText}`);

        const data = await res.json() as [number, string, string, string, string, string, ...unknown[]][];

        // Data format: [ [openTime, open, high, low, close, volume, closeTime, ...], ... ]
        return data.map((d) => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
        })).sort((a: Candle, b: Candle) => a.time - b.time);
    } catch (err) {
        console.error('Failed to fetch Binance candles:', err);
        return [];
    }
}
