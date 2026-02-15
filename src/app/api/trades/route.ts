import { NextRequest, NextResponse } from 'next/server';
import { saveTrade, getTrades, getTradeStats, getEquityCurve, getDrawdownData, getSymbolStats, getDailyPnL, getPnLDistribution } from '@/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || undefined;
    const view = searchParams.get('view'); // 'stats' | 'equity' | 'drawdown' | 'symbols' | 'daily' | 'distribution'

    try {
        if (view === 'stats') {
            return NextResponse.json(await getTradeStats());
        }
        if (view === 'equity') {
            return NextResponse.json(await getEquityCurve());
        }
        if (view === 'drawdown') {
            return NextResponse.json(await getDrawdownData());
        }
        if (view === 'symbols') {
            return NextResponse.json(await getSymbolStats());
        }
        if (view === 'daily') {
            return NextResponse.json(await getDailyPnL('trades'));
        }
        if (view === 'distribution') {
            return NextResponse.json(await getPnLDistribution('trades'));
        }

        const trades = await getTrades(symbol);
        return NextResponse.json(trades);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { trade, indicatorSnapshot } = body;

        if (!trade || !trade.id) {
            return NextResponse.json({ error: 'Missing trade data' }, { status: 400 });
        }

        await saveTrade(trade, indicatorSnapshot ? JSON.stringify(indicatorSnapshot) : undefined);
        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
