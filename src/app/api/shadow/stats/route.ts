import { NextResponse } from 'next/server';
import { getShadowTradeStats, getShadowEquityCurve, getShadowTrades, loadShadowPortfolioState, getShadowDecisions } from '@/db';

export async function GET() {
    try {
        const [stats, equity, trades, portfolio, decisions] = await Promise.all([
            getShadowTradeStats(),
            getShadowEquityCurve(),
            getShadowTrades(),
            loadShadowPortfolioState(),
            getShadowDecisions(30),
        ]);

        return NextResponse.json({
            stats,
            equity,
            recentTrades: trades.slice(0, 20),
            portfolio,
            decisions,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
