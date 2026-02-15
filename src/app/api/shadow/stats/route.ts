import { NextResponse } from 'next/server';
import { getShadowTradeStats, getShadowEquityCurve, getShadowTrades, loadShadowPortfolioState } from '@/db';

export async function GET() {
    try {
        const [stats, equity, trades, portfolio] = await Promise.all([
            getShadowTradeStats(),
            getShadowEquityCurve(),
            getShadowTrades(),
            loadShadowPortfolioState(),
        ]);

        return NextResponse.json({
            stats,
            equity,
            recentTrades: trades.slice(0, 20),
            portfolio,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
