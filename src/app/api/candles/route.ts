/**
 * GET /api/candles
 * Fetches OHLCV candle data from Binance.
 *
 * Query params:
 *   - symbol:    e.g. "BTCUSDT" (required)
 *   - timeframe: "1m"|"5m"|"15m"|"1h"|"4h"|"1d" (default: "1h")
 *   - limit:     number, 1-1000 (default: 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles, marketCache, CANDLE_TTL, TIMEFRAMES, Timeframe } from '@/core/market';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;

    const symbol = searchParams.get('symbol')?.toUpperCase();
    const timeframe = (searchParams.get('timeframe') || '1h') as Timeframe;
    const limitStr = searchParams.get('limit') || '100';
    const limit = Math.max(1, Math.min(1000, parseInt(limitStr, 10) || 100));

    // Validation
    if (!symbol) {
        return NextResponse.json(
            { error: 'Missing required parameter: symbol' },
            { status: 400 },
        );
    }

    if (!TIMEFRAMES.includes(timeframe)) {
        return NextResponse.json(
            { error: `Invalid timeframe. Must be one of: ${TIMEFRAMES.join(', ')}` },
            { status: 400 },
        );
    }

    try {
        const cacheKey = `candles:${symbol}:${timeframe}:${limit}`;
        const candles = await marketCache.getOrFetch(
            cacheKey,
            () => fetchCandles({ symbol, timeframe, limit }),
            CANDLE_TTL,
        );

        return NextResponse.json(candles, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[/api/candles] Error fetching ${symbol} ${timeframe}:`, message);
        return NextResponse.json(
            { error: message },
            { status: 502 },
        );
    }
}
