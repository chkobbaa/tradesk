import { NextRequest, NextResponse } from 'next/server';
import { savePortfolioState, loadPortfolioState } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const state = await loadPortfolioState(identity.userId);
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
        const { balance, positions, trades } = body;

        await savePortfolioState(identity.userId, {
            balance: balance ?? 10000,
            positions: positions ?? [],
            trades: trades ?? [],
        });

        const res = NextResponse.json({ ok: true });
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
