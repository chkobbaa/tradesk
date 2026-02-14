/**
 * GET /api/symbols
 * Fetches available trading symbols from Binance.
 */

import { NextResponse } from 'next/server';
import { fetchSymbols, marketCache, SYMBOLS_TTL } from '@/core/market';

export async function GET() {
    try {
        const symbols = await marketCache.getOrFetch(
            'symbols:usdt',
            fetchSymbols,
            SYMBOLS_TTL,
        );

        return NextResponse.json(symbols, {
            headers: {
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[/api/symbols] Error:', message);
        return NextResponse.json(
            { error: message },
            { status: 502 },
        );
    }
}
