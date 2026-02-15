import { NextResponse } from 'next/server';
import { getShadowTradeStats, getShadowEquityCurve, getShadowTrades, loadShadowPortfolioState, getShadowDecisions } from '@/db';
import { fetchBinanceCandles } from '@/lib/binance';
import { RegimeLabeler } from '@/core/signals/RegimeLabeler';

export async function GET() {
    try {
        const [stats, equity, trades, portfolio, decisions, candles] = await Promise.all([
            getShadowTradeStats(),
            getShadowEquityCurve(),
            getShadowTrades(),
            loadShadowPortfolioState(),
            getShadowDecisions(30),
            fetchBinanceCandles('BTCUSDT', '1h', 100).catch(() => []),
        ]);

        // Compute current regime from latest candles
        const regime = candles.length >= 30
            ? RegimeLabeler.label(candles)
            : { label: 'UNCLEAR', reason: 'No candle data', confidence: 0 };

        const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

        return NextResponse.json({
            stats,
            equity,
            recentTrades: trades.slice(0, 50),
            portfolio,
            decisions,
            regime,
            currentPrice,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
