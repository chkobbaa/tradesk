import { NextRequest, NextResponse } from 'next/server';
import { saveTrade, getTrades, getTradeStats, getEquityCurve, getDrawdownData, getSymbolStats, getDailyPnL, getPnLDistribution } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || undefined;
    const view = searchParams.get('view'); // 'stats' | 'equity' | 'drawdown' | 'symbols' | 'daily' | 'distribution'

    try {
        identity = await resolveChatIdentity(req);
        if (view === 'stats') {
            const res = NextResponse.json(await getTradeStats(identity.userId));
            if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
            return res;
        }
        if (view === 'equity') {
            const res = NextResponse.json(await getEquityCurve(identity.userId));
            if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
            return res;
        }
        if (view === 'drawdown') {
            const res = NextResponse.json(await getDrawdownData(identity.userId));
            if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
            return res;
        }
        if (view === 'symbols') {
            const res = NextResponse.json(await getSymbolStats(identity.userId));
            if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
            return res;
        }
        if (view === 'daily') {
            const res = NextResponse.json(await getDailyPnL(identity.userId, 'trades'));
            if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
            return res;
        }
        if (view === 'distribution') {
            const res = NextResponse.json(await getPnLDistribution(identity.userId, 'trades'));
            if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
            return res;
        }

        const trades = await getTrades(identity.userId, symbol);
        const res = NextResponse.json(trades);
        if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
        return res;
    } catch (err) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
        if (identity?.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
        return res;
    }
}

export async function POST(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const body = await req.json();
        const { trade, indicatorSnapshot } = body;

        if (!trade || !trade.id) {
            return NextResponse.json({ error: 'Missing trade data' }, { status: 400 });
        }

        await saveTrade(identity.userId, trade, indicatorSnapshot ? JSON.stringify(indicatorSnapshot) : undefined);
        const res = NextResponse.json({ ok: true });
        if (identity.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
        return res;
    } catch (err) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
        if (identity?.shouldSetCookie) setChatIdentityCookie(res, identity.deviceId);
        return res;
    }
}
