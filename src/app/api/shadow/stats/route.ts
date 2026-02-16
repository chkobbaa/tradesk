import { NextResponse } from 'next/server';
import { getShadowTradeStats, getShadowEquityCurve, getShadowTrades, loadShadowPortfolioState, getShadowDecisions } from '@/db';
import { fetchBinanceCandles } from '@/lib/binance';
import { RegimeLabeler } from '@/core/signals/RegimeLabeler';
import { NextRequest } from 'next/server';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);

        const [stats, equity, trades, portfolio, decisions] = await Promise.all([
            getShadowTradeStats(identity.userId),
            getShadowEquityCurve(identity.userId),
            getShadowTrades(identity.userId),
            loadShadowPortfolioState(identity.userId),
            getShadowDecisions(identity.userId, 30),
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

        const res = NextResponse.json({
            stats,
            equity,
            recentTrades: trades.slice(0, 50),
            portfolio,
            decisions,
            regime,
            currentPrice,
            prices,
        });
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    } catch (err) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
        if (identity?.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}
