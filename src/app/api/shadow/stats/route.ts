import { NextResponse } from 'next/server';
import { getShadowTradeStats, getShadowEquityCurve, getShadowTrades, loadShadowPortfolioState, getShadowDecisions } from '@/db';
import { fetchBinanceCandles } from '@/lib/binance';
import { RegimeLabeler } from '@/core/signals/RegimeLabeler';

export async function GET() {
    try {
        const [stats, equity, trades, portfolio, decisions] = await Promise.all([
            getShadowTradeStats(),
            getShadowEquityCurve(),
            getShadowTrades(),
            loadShadowPortfolioState(),
            getShadowDecisions(30),
        ]);

        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        const candlesMap = await Promise.all(
            symbols.map(sym => fetchBinanceCandles(sym, '1h', 2).then(c => ({ symbol: sym, candle: c[c.length - 1] })).catch(() => null))
        );

        const prices: Record<string, number> = {};
        candlesMap.forEach(item => {
            if (item && item.candle) {
                prices[item.symbol] = item.candle.close;
            }
        });

        // For backward compatibility, keep currentPrice as BTC price
        const currentPrice = prices['BTCUSDT'] || 0;

        // Compute regime using BTC candles (default)
        // We could expand this to be per-symbol in future
        const btcCandles = await fetchBinanceCandles('BTCUSDT', '1h', 100).catch(() => []);
        const regime = btcCandles.length >= 30
            ? RegimeLabeler.label(btcCandles)
            : { label: 'UNCLEAR', reason: 'No candle data', confidence: 0 };

        return NextResponse.json({
            stats,
            equity,
            recentTrades: trades.slice(0, 50),
            portfolio,
            decisions,
            regime,
            currentPrice,
            prices,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
