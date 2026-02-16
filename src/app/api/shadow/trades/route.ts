
import { NextRequest, NextResponse } from 'next/server';
import { getShadowTrades, saveShadowTrade } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');

    try {
        identity = await resolveChatIdentity(req);
        const trades = await getShadowTrades(identity.userId);
        const payload = limit ? trades.slice(0, Number(limit)) : trades;
        const res = NextResponse.json(payload);
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

export async function POST(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const body = await req.json();
        const { trade, indicatorSnapshot } = body;
        await saveShadowTrade(
            identity.userId,
            trade,
            indicatorSnapshot ? JSON.stringify(indicatorSnapshot) : undefined
        );

        const res = NextResponse.json({ success: true });
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
