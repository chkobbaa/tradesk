
import { NextRequest, NextResponse } from 'next/server';
import { loadShadowPortfolioState, saveShadowPortfolioState } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const state = await loadShadowPortfolioState(identity.userId);
        const res = NextResponse.json(state);
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

export async function PUT(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const body = await req.json();
        await saveShadowPortfolioState(identity.userId, {
            balance: body.balance,
            positions: body.positions,
            trades: body.trades || []
        });

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
